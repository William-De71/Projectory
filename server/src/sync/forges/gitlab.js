import { fetchJson } from '../http.js'
import { cachedLogin, ciConclusion, paginate } from './common.js'
import { tr } from '../../i18n.js'

const PIPELINE_STATE = {
  success: ['completed', 'success'],
  failed: ['completed', 'failure'],
  canceled: ['completed', 'cancelled'],
  skipped: ['completed', 'skipped'],
  manual: ['completed', 'skipped'],
}

// GitLab (gitlab.com or self-hosted), API v4. Projects are addressed by their full path.
export default function gitlab({ url = 'https://gitlab.com', token }) {
  const base = url.replace(/\/+$/, '')
  const headers = token ? { 'PRIVATE-TOKEN': token } : {}
  const api = (path, options = {}) => fetchJson(`${base}/api/v4${path}`, { ...options, headers })
  const pid = (repo) => encodeURIComponent(repo)

  const mapRepo = (p) => ({
    full_name: p.path_with_namespace,
    name: p.path,
    html_url: p.web_url,
    description: p.description || '',
    homepage: '',
    topics: p.topics || p.tag_list || [],
    stars: p.star_count,
    forks: p.forks_count,
    default_branch: p.default_branch,
    pushed_at: p.last_activity_at,
    archived: p.archived,
    fork: !!p.forked_from_project,
    private: p.visibility === 'private',
    language: null,
  })

  const mapItem = (type) => (it) => ({
    type,
    number: it.iid,
    title: it.title,
    author: it.author?.username || '',
    assignees: (it.assignees || []).map((u) => u.username),
    reviewers: (it.reviewers || []).map((u) => u.username),
    url: it.web_url,
    labels: (it.labels || []).map((name) => ({ name, color: '#8c8c8c' })),
    draft: !!(it.draft || it.work_in_progress),
    comments: it.user_notes_count || 0,
    created_at: it.created_at,
    updated_at: it.updated_at,
    excerpt: (it.description || '').slice(0, 300),
  })

  return {
    type: 'gitlab',
    webUrl: (repo) => `${base}/${repo}`,

    async fetchRepo(repo) {
      const info = await api(`/projects/${pid(repo)}`)
      const issues = await paginate((page) => api(`/projects/${pid(repo)}/issues?state=opened&per_page=100&page=${page}`), 100, 5)
      const mrs = await paginate((page) => api(`/projects/${pid(repo)}/merge_requests?state=opened&per_page=100&page=${page}`), 100, 5)
      return { info: mapRepo(info), items: [...issues.map(mapItem('issue')), ...mrs.map(mapItem('pr'))] }
    },

    whoami: () => (token ? cachedLogin(`gitlab|${base}|${token}`, async () => (await api('/user')).username) : Promise.resolve(null)),

    async fetchCi(repo, branch) {
      // Scheduled pipelines say nothing about the state of the branch.
      const pipelines = await api(`/projects/${pid(repo)}/pipelines?ref=${encodeURIComponent(branch)}&per_page=10`)
      const p = pipelines.find((x) => x.source !== 'schedule')
      if (!p) return null
      const [status, conclusion] = PIPELINE_STATE[p.status] || ['in_progress', null]
      return ciConclusion([{ id: p.id, name: 'Pipeline', status, conclusion, url: p.web_url, updated_at: p.updated_at, sha: p.sha?.slice(0, 7) }])
    },

    async latestRelease(repo) {
      const [rel] = await api(`/projects/${pid(repo)}/releases?per_page=1`)
      if (rel) return { version: rel.tag_name, url: rel._links?.self || `${base}/${repo}/-/releases`, published_at: rel.released_at }
      const [tag] = await api(`/projects/${pid(repo)}/repository/tags?per_page=1`)
      return tag ? { version: tag.name, url: `${base}/${repo}/-/tags/${encodeURIComponent(tag.name)}` } : null
    },

    async fetchActivity(repo, since) {
      const page = (path) => paginate((n) => api(`/projects/${pid(repo)}${path}&per_page=100&page=${n}`), 100)
      const [commits, issues, mrs] = await Promise.all([
        page(`/repository/commits?since=${since}`),
        page(`/issues?updated_after=${since}`),
        page(`/merge_requests?updated_after=${since}`),
      ])
      return {
        commits: commits.map((c) => c.committed_date || c.created_at),
        issues: [
          ...issues.map((it) => ({ type: 'issue', created_at: it.created_at, closed_at: it.closed_at })),
          ...mrs.map((it) => ({ type: 'pr', created_at: it.created_at, closed_at: it.merged_at || it.closed_at })),
        ],
      }
    },

    // GitLab has no draft releases; `ref` creates the tag when missing.
    async createRelease(repo, { tag, name, body, target }) {
      const rel = await api(`/projects/${pid(repo)}/releases`, { method: 'POST', body: { tag_name: tag, name, description: body, ref: target } })
      return { url: rel._links?.self || `${base}/${repo}/-/releases/${encodeURIComponent(tag)}` }
    },

    async createIssue(repo, { title, body, labels }) {
      const it = await api(`/projects/${pid(repo)}/issues`, { method: 'POST', body: { title, description: body, ...(labels?.length ? { labels: labels.join(',') } : {}) } })
      return { number: it.iid, url: it.web_url }
    },

    // A group (subgroups included) or a user; empty owner = projects the token owns.
    async listOwnerRepos(owner) {
      const page = (path) => paginate((n) => api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${n}`), 100)
      let projects
      if (!owner) {
        if (!token) throw new Error(tr('Indique un utilisateur ou un groupe (ou configure un token)'))
        projects = await page('/projects?owned=true&order_by=last_activity_at')
        owner = projects[0]?.namespace?.full_path || ''
      } else {
        try {
          projects = await page(`/groups/${encodeURIComponent(owner)}/projects?include_subgroups=true&order_by=last_activity_at`)
        } catch (err) {
          if (err.status !== 404) throw err
          projects = await page(`/users/${encodeURIComponent(owner)}/projects?order_by=last_activity_at`)
        }
      }
      return { owner, repos: projects.map(mapRepo) }
    },
  }
}
