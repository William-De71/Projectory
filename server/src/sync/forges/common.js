export const FAILED = ['failure', 'timed_out', 'startup_failure']

// Aggregates normalized runs ({ status, conclusion, … }) into one CI state.
export function ciConclusion(runs) {
  if (!runs.length) return null
  let conclusion = 'success'
  if (runs.some((r) => r.status === 'completed' && FAILED.includes(r.conclusion))) conclusion = 'failure'
  else if (runs.some((r) => r.status !== 'completed')) conclusion = 'pending'
  else if (runs.some((r) => r.conclusion !== 'success' && r.conclusion !== 'skipped')) conclusion = 'neutral'
  return { conclusion, runs, checked_at: new Date().toISOString() }
}

export const failedRun = (ci) => ci?.runs.find((r) => r.status === 'completed' && FAILED.includes(r.conclusion))

export async function paginate(fetchPage, pageSize, maxPages = 10) {
  const all = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchPage(page)
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

// Login of the token's owner, cached per forge account for an hour.
const logins = new Map()
export async function cachedLogin(key, fetchLogin) {
  const hit = logins.get(key)
  if (hit && Date.now() - hit.at < 3600e3) return hit.login
  const login = await fetchLogin().catch(() => null)
  logins.set(key, { login, at: Date.now() })
  return login
}

// Why an open issue / PR concerns the user: author, assignee, review, mention.
export function involvement(item, login, mentioned = new Set()) {
  if (!login) return []
  const me = login.toLowerCase()
  const has = (list) => (list || []).some((u) => u.toLowerCase() === me)
  const reasons = []
  if (item.author?.toLowerCase() === me) reasons.push('author')
  if (has(item.assignees)) reasons.push('assignee')
  if (has(item.reviewers)) reasons.push('review')
  if (mentioned.has(item.number) && !reasons.includes('author')) reasons.push('mention')
  return reasons
}
