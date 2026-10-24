import { fetchJson, fetchText } from '../http.js'
import { cachedLogin, ciConclusion, paginate } from './common.js'
import { tr } from '../../i18n.js'

const STATUS_STATE = {
  success: ['completed', 'success'],
  failure: ['completed', 'failure'],
  error: ['completed', 'failure'],
  warning: ['completed', 'neutral'],
}

// Gitea and Forgejo (same API, v1). CI comes from commit statuses, which
// Gitea/Forgejo Actions, Woodpecker and Drone all report.
export default function gitea({ url, token }) {
  if (!url) throw new Error(tr("Adresse de l'instance Gitea / Forgejo manquante"))
  const base = url.replace(/\/+$/, '')
  const headers = token ? { Authorization: `token ${token}` } : {}
  const api = (path, options = {}) => fetchJson(`${base}/api/v1${path}`, { ...options, headers })
  const LIMIT = 50

  const mapRepo = (r) => ({
    full_name: r.full_name,
    name: r.name,
    html_url: r.html_url,
    description: r.description || '',
    homepage: r.website || '',
    topics: r.topics || [],
    stars: r.stars_count,
    forks: r.forks_count,
    default_branch: r.default_branch,
    pushed_at: r.updated_at,
    archived: r.archived,
    fork: r.fork,
    private: r.private,
    language: r.language || null,
  })

  return {
    type: 'gitea',
    webUrl: (repo) => `${base}/${repo}`,

    async fetchRepo(repo) {
      const info = await api(`/repos/${repo}`)
      const open = await paginate((page) => api(`/repos/${repo}/issues?state=open&limit=${LIMIT}&page=${page}`), LIMIT, 5)
      return {
        info: mapRepo(info),
        items: open.map((it) => ({
          type: it.pull_request ? 'pr' : 'issue',
          number: it.number,
          title: it.title,
          author: it.user?.login || '',
          assignees: (it.assignees || []).map((u) => u.login),
          url: it.html_url,
          labels: (it.labels || []).map((l) => ({ name: l.name, color: l.color?.startsWith('#') ? l.color : `#${l.color}` })),
          draft: !!it.pull_request?.draft,
          comments: it.comments || 0,
          created_at: it.created_at,
          updated_at: it.updated_at,
          excerpt: (it.body || '').slice(0, 300),
        })),
      }
    },

    whoami: () => (token ? cachedLogin(`gitea|${base}|${token}`, async () => (await api('/user')).login) : Promise.resolve(null)),

    async fetchCi(repo, branch) {
      const combined = await api(`/repos/${repo}/commits/${encodeURIComponent(branch)}/status`)
      const latest = new Map()
      for (const s of combined.statuses || []) {
        const prev = latest.get(s.context)
        if (!prev || s.id > prev.id) latest.set(s.context, s)
      }
      const runs = [...latest.values()].map((s) => {
        const [status, conclusion] = STATUS_STATE[s.status] || ['in_progress', null]
        return { id: s.id, name: s.context, status, conclusion, url: s.target_url || `${base}/${repo}`, updated_at: s.updated_at, sha: combined.sha?.slice(0, 7) }
      })
      return ciConclusion(runs)
    },

    async fetchPrOutcome(repo, number) {
      const pr = await api(`/repos/${repo}/pulls/${number}`)
      return pr.merged ? 'merged' : pr.state === 'open' ? 'open' : 'closed'
    },

    // The merge endpoint answers with an empty body; 405 = style not allowed (or not mergeable).
    async mergePr(repo, number) {
      let lastError
      for (const style of ['squash', 'merge', 'rebase']) {
        try {
          return await fetchText(`${base}/api/v1/repos/${repo}/pulls/${number}/merge`, { method: 'POST', headers, body: { Do: style } })
        } catch (err) {
          lastError = err
          if (err.status !== 405) throw err
        }
      }
      throw lastError
    },

    async latestRelease(repo) {
      const releases = await api(`/repos/${repo}/releases?limit=5`)
      const rel = releases.find((r) => !r.draft && !r.prerelease) || releases.find((r) => !r.draft)
      if (rel) return { version: rel.tag_name, url: rel.html_url, published_at: rel.published_at }
      const [tag] = await api(`/repos/${repo}/tags?limit=1`)
      return tag ? { version: tag.name, url: `${base}/${repo}/src/tag/${encodeURIComponent(tag.name)}` } : null
    },

    async fetchActivity(repo, since) {
      const page = (path) => paginate((n) => api(`/repos/${repo}${path}&limit=${LIMIT}&page=${n}`), LIMIT)
      const [commits, issues] = await Promise.all([
        page(`/commits?since=${since}&stat=false&verification=false&files=false`),
        page(`/issues?state=all&since=${since}`),
      ])
      return {
        commits: commits.map((c) => c.commit?.author?.date || c.created),
        issues: issues.map((it) => ({ type: it.pull_request ? 'pr' : 'issue', created_at: it.created_at, closed_at: it.closed_at })),
      }
    },

    async createRelease(repo, { tag, name, body, target, draft, prerelease }) {
      const rel = await api(`/repos/${repo}/releases`, { method: 'POST', body: { tag_name: tag, name, body, target_commitish: target, draft: !!draft, prerelease: !!prerelease } })
      return { url: rel.html_url }
    },

    async createIssue(repo, { title, body }) {
      const it = await api(`/repos/${repo}/issues`, { method: 'POST', body: { title, body } })
      return { number: it.number, url: it.html_url }
    },

    async listOwnerRepos(owner) {
      let path
      if (!owner) {
        if (!token) throw new Error(tr('Indique un utilisateur ou une organisation (ou configure un token)'))
        const me = await api('/user')
        owner = me.login
        path = '/user/repos'
      } else {
        path = `/users/${encodeURIComponent(owner)}/repos`
      }
      let repos
      try {
        repos = await paginate((page) => api(`${path}?limit=${LIMIT}&page=${page}`), LIMIT)
      } catch (err) {
        if (err.status !== 404) throw err
        repos = await paginate((page) => api(`/orgs/${encodeURIComponent(owner)}/repos?limit=${LIMIT}&page=${page}`), LIMIT)
      }
      return { owner, repos: repos.filter((r) => r.owner?.login?.toLowerCase() === owner.toLowerCase()).map(mapRepo) }
    },
  }
}
