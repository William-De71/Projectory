import { fetchJson } from './http.js'

const API = process.env.GITHUB_API_URL || 'https://api.github.com'

export function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

export const gh = (path) => fetchJson(`${API}${path}`, { headers: githubHeaders() })

export function normalizeRepo(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
}

// Returns repo metadata plus every open issue and PR (GitHub lists PRs as issues).
export async function fetchRepo(repo) {
  const info = await gh(`/repos/${repo}`)
  const open = []
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`)
    open.push(...batch)
    if (batch.length < 100) break
  }
  return {
    info: {
      full_name: info.full_name,
      html_url: info.html_url,
      description: info.description,
      stars: info.stargazers_count,
      forks: info.forks_count,
      default_branch: info.default_branch,
      pushed_at: info.pushed_at,
      archived: info.archived,
      language: info.language,
    },
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
}

export async function latestGithubVersion(repo) {
  try {
    const rel = await gh(`/repos/${repo}/releases/latest`)
    return { version: rel.tag_name, url: rel.html_url, published_at: rel.published_at }
  } catch (err) {
    if (err.status !== 404) throw err
  }
  const tags = await gh(`/repos/${repo}/tags?per_page=1`)
  if (!tags.length) return null
  return { version: tags[0].name, url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tags[0].name)}` }
}

const FAILED = ['failure', 'timed_out', 'startup_failure']

// Latest GitHub Actions run of each workflow on the default branch.
export async function fetchCi(repo, branch) {
  const data = await gh(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=30&exclude_pull_requests=true`)
  const latest = new Map()
  for (const r of data.workflow_runs || []) {
    if (!latest.has(r.workflow_id)) {
      latest.set(r.workflow_id, { id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url, updated_at: r.updated_at, sha: r.head_sha?.slice(0, 7) })
    }
  }
  const runs = [...latest.values()]
  if (!runs.length) return null
  let conclusion = 'success'
  if (runs.some((r) => r.status === 'completed' && FAILED.includes(r.conclusion))) conclusion = 'failure'
  else if (runs.some((r) => r.status !== 'completed')) conclusion = 'pending'
  else if (runs.some((r) => r.conclusion !== 'success' && r.conclusion !== 'skipped')) conclusion = 'neutral'
  return { conclusion, runs, checked_at: new Date().toISOString() }
}

export const failedRun = (ci) => ci?.runs.find((r) => r.status === 'completed' && FAILED.includes(r.conclusion))

// Repositories of a user or organisation. With a token, the token owner's
// private repositories are included.
export async function listOwnerRepos(owner) {
  let path
  if (process.env.GITHUB_TOKEN) {
    const me = await gh('/user').catch(() => null)
    if (me?.login && (!owner || owner.toLowerCase() === me.login.toLowerCase())) {
      owner = me.login
      path = '/user/repos?affiliation=owner&sort=pushed'
    }
  }
  if (!owner) throw new Error('Indique un utilisateur ou une organisation GitHub (ou configure GITHUB_TOKEN)')
  path ??= `/users/${encodeURIComponent(owner)}/repos?type=owner&sort=pushed`
  const repos = []
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`${path}&per_page=100&page=${page}`)
    repos.push(...batch)
    if (batch.length < 100) break
  }
  return {
    owner,
    repos: repos.map((r) => ({
      full_name: r.full_name,
      name: r.name,
      description: r.description || '',
      homepage: r.homepage || '',
      topics: r.topics || [],
      language: r.language,
      fork: r.fork,
      archived: r.archived,
      private: r.private,
      stars: r.stargazers_count,
      pushed_at: r.pushed_at,
    })),
  }
}
