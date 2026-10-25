import { OPEN_STATUSES, decode, getConfig, setConfig } from './db.js'
import { findStale } from './insights.js'

// How long an item may sit untouched before the weekly review brings it up.
export const REVIEW_DAYS = { todo: 21, in_progress: 7, testing: 7 }
// The home page suggests the review once this many days have passed since the last one.
export const REVIEW_EVERY_DAYS = 7

const DAY = 24 * 3600 * 1000
const sqlDate = (d) => d.toISOString().replace('T', ' ').slice(0, 19)
const ageDays = (stamp, now) => Math.floor((now - new Date(`${stamp.replace(' ', 'T')}Z`)) / DAY)

const ITEMS = `SELECT i.*, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id WHERE p.status != 'archived'`

// What deserves a decision this week: overdue items, work left in progress or
// in test, todo items nobody touched for weeks, versions past their date.
// Each item shows up in one section only.
export function buildReview(db, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const before = (days) => sqlDate(new Date(now - days * DAY))
  const withAge = (rows) => rows.map((r) => ({ ...decode(r), idle_days: ageDays(r.updated_at, now) }))

  const overdue = withAge(db.prepare(`${ITEMS} AND i.status IN ${OPEN_STATUSES} AND i.due_date IS NOT NULL AND i.due_date < ? ORDER BY i.due_date`).all(today))
  const seen = new Set(overdue.map((i) => i.id))
  const idle = (statuses, days) => withAge(db.prepare(
    `${ITEMS} AND i.status IN (${statuses.map(() => '?').join(', ')}) AND i.updated_at <= ? ORDER BY i.updated_at`
  ).all(...statuses, before(days))).filter((i) => !seen.has(i.id))

  const sections = {
    overdue,
    testing: idle(['testing'], REVIEW_DAYS.testing),
    in_progress: idle(['in_progress'], REVIEW_DAYS.in_progress),
    stale: idle(['todo', 'blocked'], REVIEW_DAYS.todo),
    milestones: db.prepare(
      `SELECT m.*, p.name AS project_name FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE p.status != 'archived' AND m.status = 'planned' AND m.due_date IS NOT NULL AND m.due_date < ? ORDER BY m.due_date`
    ).all(today).map(decode),
  }
  const count = Object.values(sections).reduce((n, list) => n + list.length, 0)
  const last = getConfig(db, 'review').last_done_at || null
  return {
    sections,
    count,
    github_waiting: findStale(db, now).length,
    last_done_at: last,
    due: count > 0 && (!last || now - new Date(last) >= REVIEW_EVERY_DAYS * DAY),
  }
}

export function markReviewDone(db, now = new Date()) {
  setConfig(db, 'review', { ...getConfig(db, 'review'), last_done_at: now.toISOString() })
}
