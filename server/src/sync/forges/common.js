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
