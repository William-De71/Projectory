const ITEMS = 'SELECT i.*, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id'
const OPEN = "i.status IN ('todo', 'in_progress')"
const PRIORITY_ORDER = "CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END"
export const REVIEW_REASONS = ['review_requested', 'approval_requested']

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

// "Today" view: the handful of items picked for the day, what is due, what
// could be picked next and the reviews waiting on the user. `date` is the
// browser's local day, so the server time zone does not matter.
export function todayView(db, date) {
  const day = isDate(date) ? date : new Date().toISOString().slice(0, 10)
  return {
    date: day,
    // Unfinished items stay until done or removed; finished ones only on their day.
    focus: db.prepare(
      `${ITEMS} WHERE i.focus_date IS NOT NULL AND i.focus_date <= ? AND (${OPEN} OR i.focus_date = ?)
       ORDER BY ${OPEN} DESC, ${PRIORITY_ORDER}, i.focus_date, i.id`
    ).all(day, day),
    due: db.prepare(
      `${ITEMS} WHERE ${OPEN} AND i.due_date IS NOT NULL AND i.due_date <= ? AND (i.focus_date IS NULL OR i.focus_date > ?)
       ORDER BY i.due_date, ${PRIORITY_ORDER}`
    ).all(day, day),
    suggestions: db.prepare(
      `${ITEMS} WHERE ${OPEN} AND i.focus_date IS NULL AND (i.status = 'in_progress' OR i.priority IN ('high', 'critical'))
         AND (i.due_date IS NULL OR i.due_date > ?)
       ORDER BY i.status = 'in_progress' DESC, ${PRIORITY_ORDER}, i.updated_at DESC LIMIT 8`
    ).all(day),
    reviews: db.prepare(
      `SELECT x.*, p.name AS project_name FROM inbox x LEFT JOIN projects p ON p.id = x.project_id
       WHERE x.kind = 'gh_notification' AND x.reason IN (${REVIEW_REASONS.map(() => '?').join(', ')}) AND x.read_at IS NULL
       ORDER BY x.created_at DESC LIMIT 10`
    ).all(...REVIEW_REASONS),
    minutes: db.prepare('SELECT coalesce(sum(minutes), 0) AS n FROM time_entries WHERE date = ?').get(day).n,
  }
}
