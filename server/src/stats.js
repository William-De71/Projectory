import { decode } from './db.js'
import { forgeFor, normalizeRepo } from './sync/forges/index.js'

const DAY = 24 * 3600 * 1000
const cache = new Map()
const TTL = 3600 * 1000

// Monday 00:00 UTC of the week containing `date`.
function weekStart(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d
}

const median = (values) => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Weekly activity of a project: forge activity (commits, issues, PRs/MRs) plus
// local data (time spent, bugs & tasks created / done).
export function aggregate({ activity, timeEntries, items, since, now = new Date() }) {
  const weeks = []
  for (let w = weekStart(since); w <= now; w = new Date(w.getTime() + 7 * DAY)) {
    weeks.push({ week: w.toISOString().slice(0, 10), commits: 0, issues_opened: 0, issues_closed: 0, prs_opened: 0, prs_closed: 0, minutes: 0, items_created: 0, items_done: 0 })
  }
  const byWeek = new Map(weeks.map((w) => [w.week, w]))
  const bump = (date, key, n = 1) => {
    if (!date || new Date(date) < since) return
    const w = byWeek.get(weekStart(date).toISOString().slice(0, 10))
    if (w) w[key] += n
  }
  const sqlDate = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s)

  for (const c of activity?.commits || []) bump(c, 'commits')
  const resolution = { issue: [], pr: [] }
  for (const it of activity?.issues || []) {
    const prefix = it.type === 'pr' ? 'prs' : 'issues'
    bump(it.created_at, `${prefix}_opened`)
    bump(it.closed_at, `${prefix}_closed`)
    if (it.closed_at && new Date(it.closed_at) >= since) resolution[it.type].push((new Date(it.closed_at) - new Date(it.created_at)) / DAY)
  }
  for (const t of timeEntries) bump(`${t.date}T12:00:00Z`, 'minutes', t.minutes)
  for (const i of items) {
    bump(sqlDate(i.created_at), 'items_created')
    if (i.status === 'done') bump(sqlDate(i.updated_at), 'items_done')
  }

  const sum = (key) => weeks.reduce((s, w) => s + w[key], 0)
  const round = (v) => (v == null ? null : Math.round(v * 10) / 10)
  return {
    weeks,
    totals: {
      commits: sum('commits'),
      issues_opened: sum('issues_opened'),
      issues_closed: sum('issues_closed'),
      prs_opened: sum('prs_opened'),
      prs_closed: sum('prs_closed'),
      minutes: sum('minutes'),
      items_created: sum('items_created'),
      items_done: sum('items_done'),
      issue_resolution_days: round(median(resolution.issue)),
      pr_resolution_days: round(median(resolution.pr)),
    },
  }
}

export async function projectStats(db, projectId, { months = 3, refresh = false, now = new Date() } = {}) {
  const project = decode(db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId))
  if (!project) return null
  const key = `${projectId}:${months}`
  const hit = cache.get(key)
  if (!refresh && hit && now - hit.at < TTL) return hit.data

  const since = new Date(now)
  since.setUTCMonth(since.getUTCMonth() - months)
  let activity = null
  let error = null
  if (project.repo) {
    try {
      activity = await forgeFor(db, project).fetchActivity(normalizeRepo(project.repo), since.toISOString())
    } catch (err) {
      error = err.message
    }
  }
  const timeEntries = db.prepare('SELECT date, minutes FROM time_entries WHERE project_id = ? AND date >= ?').all(projectId, since.toISOString().slice(0, 10))
  const items = db.prepare('SELECT status, created_at, updated_at FROM items WHERE project_id = ?').all(projectId)
  const data = { months, since: since.toISOString(), has_repo: !!project.repo, error, computed_at: now.toISOString(), ...aggregate({ activity, timeEntries, items, since, now }) }
  if (!error) cache.set(key, { at: now, data })
  return data
}
