import { fetchJson } from '../http.js'
import { FAILED, cachedLogin, ciConclusion, paginate } from './common.js'
import { tr } from '../../i18n.js'

const CODE_EVENTS = ['push', 'merge_group']

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
      // Requested reviewers are only listed on the pulls endpoint.
      const reviewers = new Map()
      if (open.some((it) => it.pull_request)) {
        const pulls = await paginate((page) => gh(`/repos/${repo}/pulls?state=open&per_page=100&page=${page}`), 100, 5).catch(() => [])
        for (const pr of pulls) reviewers.set(pr.number, (pr.requested_reviewers || []).map((u) => u.login))
      }
      return {
        info: mapRepo(info),
        items: open.map((it) => ({
          type: it.pull_request ? 'pr' : 'issue',
          number: it.number,
          title: it.title,
          author: it.user?.login || '',
          assignees: (it.assignees || []).map((u) => u.login),
          reviewers: reviewers.get(it.number) || [],
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

    whoami: () => (token ? cachedLogin(`github|${api}|${token}`, async () => (await gh('/user')).login) : Promise.resolve(null)),

    // Numbers of the open issues / PRs that mention the user (search API).
    async fetchMentions(repo, login) {
      const q = encodeURIComponent(`repo:${repo} is:open mentions:${login}`)
      const res = await gh(`/search/issues?q=${q}&per_page=100`)
      return new Set((res.items || []).map((it) => it.number))
    },

    // Review decision, checks of the head commit and merge conflicts of one PR.
    async fetchPrState(repo, number) {
      const pr = await gh(`/repos/${repo}/pulls/${number}`)
      const reviews = await gh(`/repos/${repo}/pulls/${number}/reviews?per_page=100`)
      const { check_runs: runs = [] } = await gh(`/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`).catch(() => ({}))
      // Latest decisive review of each reviewer; a later comment does not cancel it.
      const latest = new Map()
      for (const r of reviews) if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) latest.set(r.user?.login, r.state)
      const decisions = [...latest.values()]
      let ci = null
      if (runs.some((r) => r.status === 'completed' && FAILED.includes(r.conclusion))) ci = 'failure'
      else if (runs.some((r) => r.status !== 'completed')) ci = 'pending'
      else if (runs.length) ci = 'success'
      return {
        review: decisions.includes('CHANGES_REQUESTED') ? 'changes_requested' : decisions.includes('APPROVED') ? 'approved' : (pr.requested_reviewers || []).length ? 'pending' : null,
        approvals: decisions.filter((d) => d === 'APPROVED').length,
        ci,
        conflict: pr.mergeable === false || pr.mergeable_state === 'dirty',
      }
    },

    // What became of a PR that is no longer open: merged or just closed.
    async fetchPrOutcome(repo, number) {
      const pr = await gh(`/repos/${repo}/pulls/${number}`)
      return pr.merged ? 'merged' : pr.state === 'open' ? 'open' : 'closed'
    },

    // Squash first, then the other methods the repository may allow instead.
    async mergePr(repo, number) {
      let lastError
      for (const method of ['squash', 'merge', 'rebase']) {
        try {
          return await gh(`/repos/${repo}/pulls/${number}/merge`, { method: 'PUT', body: { merge_method: method } })
        } catch (err) {
          lastError = err
          if (!(err.status === 405 && /not allowed/i.test(err.message))) throw err
        }
      }
      throw lastError
    },

    // Latest GitHub Actions run of each workflow on the default branch.
    async fetchCi(repo, branch) {
      const data = await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=50&exclude_pull_requests=true`)
      const latest = new Map()
      for (const r of data.workflow_runs || []) {
        // Only runs triggered by the code: scheduled jobs and manual workflows
        // (release, autofix…) say nothing about the state of the branch.
        if (!CODE_EVENTS.includes(r.event)) continue
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

    // Commits and issues / PRs active since `since` (ISO date), for statistics.
    async fetchActivity(repo, since) {
      const commits = await paginate((page) => gh(`/repos/${repo}/commits?since=${since}&per_page=100&page=${page}`), 100)
      const issues = await paginate((page) => gh(`/repos/${repo}/issues?state=all&since=${since}&per_page=100&page=${page}`), 100)
      return {
        commits: commits.map((c) => c.commit?.author?.date || c.commit?.committer?.date).filter(Boolean),
        issues: issues.map((it) => ({ type: it.pull_request ? 'pr' : 'issue', created_at: it.created_at, closed_at: it.closed_at })),
      }
    },

    // Creates the tag on `target` too when it does not exist yet.
    async createRelease(repo, { tag, name, body, target, draft, prerelease }) {
      const rel = await gh(`/repos/${repo}/releases`, { method: 'POST', body: { tag_name: tag, name, body, target_commitish: target, draft: !!draft, prerelease: !!prerelease } })
      return { url: rel.html_url }
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
      if (!owner) throw new Error(tr('Indique un utilisateur ou une organisation (ou configure un token)'))
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
