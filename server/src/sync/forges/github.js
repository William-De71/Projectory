import { fetchJson } from '../http.js'
import { ciConclusion } from './common.js'

// GitHub (github.com, or GitHub Enterprise through GITHUB_API_URL).
export default function github({ token }) {
  const api = process.env.GITHUB_API_URL || 'https://api.github.com'
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const gh = (path, options = {}) => fetchJson(`${api}${path}`, { ...options, headers })

  const mapRepo = (r) => ({
    full_name: r.full_name,
    name: r.name,
    html_url: r.html_url,
    description: r.description || '',
    homepage: r.homepage || '',
    topics: r.topics || [],
    stars: r.stargazers_count,
    forks: r.forks_count,
    default_branch: r.default_branch,
    pushed_at: r.pushed_at,
    archived: r.archived,
    fork: r.fork,
    private: r.private,
    language: r.language,
  })

  return {
    type: 'github',
    webUrl: (repo) => `https://github.com/${repo}`,

    // Repo metadata plus every open issue and PR (GitHub lists PRs as issues).
    async fetchRepo(repo) {
      const info = await gh(`/repos/${repo}`)
      const open = []
      for (let page = 1; page <= 5; page++) {
        const batch = await gh(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`)
        open.push(...batch)
        if (batch.length < 100) break
      }
      return {
        info: mapRepo(info),
        items: open.map((it) => ({
          type: it.pull_request ? 'pr' : 'issue',
          number: it.number,
          title: it.title,
          author: it.user?.login || '',
          url: it.html_url,
          labels: (it.labels || []).map((l) => ({ name: l.name, color: `#${l.color}` })),
          draft: !!it.draft,
          comments: it.comments || 0,
          created_at: it.created_at,
          updated_at: it.updated_at,
          excerpt: (it.body || '').slice(0, 300),
        })),
      }
    },

    // Latest GitHub Actions run of each workflow on the default branch.
    async fetchCi(repo, branch) {
      const data = await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=30&exclude_pull_requests=true`)
      const latest = new Map()
      for (const r of data.workflow_runs || []) {
        if (!latest.has(r.workflow_id)) {
          latest.set(r.workflow_id, { id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url, updated_at: r.updated_at, sha: r.head_sha?.slice(0, 7) })
        }
      }
      return ciConclusion([...latest.values()])
    },

    async latestRelease(repo) {
      try {
        const rel = await gh(`/repos/${repo}/releases/latest`)
        return { version: rel.tag_name, url: rel.html_url, published_at: rel.published_at }
      } catch (err) {
        if (err.status !== 404) throw err
      }
      const tags = await gh(`/repos/${repo}/tags?per_page=1`)
      if (!tags.length) return null
      return { version: tags[0].name, url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tags[0].name)}` }
    },

    async createIssue(repo, { title, body, labels }) {
      const it = await gh(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, ...(labels?.length ? { labels } : {}) } })
      return { number: it.number, url: it.html_url }
    },

    // Repositories of a user or organisation; the token owner's private ones are included.
    async listOwnerRepos(owner) {
      let path
      if (token) {
        const me = await gh('/user').catch(() => null)
        if (me?.login && (!owner || owner.toLowerCase() === me.login.toLowerCase())) {
          owner = me.login
          path = '/user/repos?affiliation=owner&sort=pushed'
        }
      }
      if (!owner) throw new Error('Indique un utilisateur ou une organisation (ou configure un token)')
      path ??= `/users/${encodeURIComponent(owner)}/repos?type=owner&sort=pushed`
      const repos = []
      for (let page = 1; page <= 10; page++) {
        const batch = await gh(`${path}&per_page=100&page=${page}`)
        repos.push(...batch)
        if (batch.length < 100) break
      }
      return { owner, repos: repos.map(mapRepo) }
    },

    // Personal notification threads (review requests, mentions…). Needs a classic token.
    async fetchNotifications() {
      const threads = await gh('/notifications?per_page=50')
      return threads.map((t) => ({
        id: t.id,
        reason: t.reason,
        type: t.subject?.type,
        title: t.subject?.title,
        repo: t.repository?.full_name,
        url: notificationUrl(t),
        updated_at: t.updated_at,
      }))
    },
  }
}

// API subject URLs ("/repos/o/r/pulls/12") to the page a human opens.
function notificationUrl(t) {
  const api = t.subject?.url
  const repoUrl = t.repository?.html_url || `https://github.com/${t.repository?.full_name}`
  if (!api) return `${repoUrl}/notifications`
  const m = api.match(/\/repos\/[^/]+\/[^/]+\/(pulls|issues|releases|commits|discussions)\/([^/]+)$/)
  if (!m) return repoUrl
  const kind = m[1] === 'pulls' ? 'pull' : m[1] === 'commits' ? 'commit' : m[1]
  return m[1] === 'releases' ? `${repoUrl}/releases` : `${repoUrl}/${kind}/${m[2]}`
}
