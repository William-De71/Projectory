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
