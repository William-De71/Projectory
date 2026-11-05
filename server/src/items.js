import { OPEN_STATUSES } from './db.js'

// Fields whose changes appear in an item's history.
const TRACKED_FIELDS = ['status', 'priority', 'kind', 'target_version', 'due_date', 'title']

// Records what `changes` alters on `before` (the item's row before the update).
export function logItemChanges(db, before, changes, source = 'user') {
  if (!before) return
  const insert = db.prepare('INSERT INTO item_events (item_id, field, old_value, new_value, source) VALUES (?, ?, ?, ?, ?)')
  for (const field of TRACKED_FIELDS) {
    if (!(field in changes)) continue
    const from = before[field] ?? ''
    const to = changes[field] ?? ''
    if (String(from) !== String(to)) insert.run(before.id, field, String(from), String(to), source)
  }
}

// Status change made by the app itself (sync, release, unblocking), kept in the history.
export function setItemStatus(db, id, status, source) {
  const before = db.prepare('SELECT * FROM items WHERE id = ?').get(id)
  db.prepare("UPDATE items SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
  logItemChanges(db, before, { status }, source)
}

// An item that was only waiting for `id` goes back to "to do" once it is finished.
export function unblockDependents(db, id) {
  const waiting = db.prepare(
    `SELECT i.id FROM item_links l JOIN items i ON i.id = l.item_id
     WHERE l.target_id = ? AND l.type = 'blocked_by' AND i.status = 'blocked'`
  ).all(id)
  const stillBlocked = db.prepare(
    `SELECT 1 FROM item_links l JOIN items b ON b.id = l.target_id
     WHERE l.item_id = ? AND l.type = 'blocked_by' AND b.status IN ${OPEN_STATUSES}`
  )
  for (const { id: waitingId } of waiting) if (!stillBlocked.get(waitingId)) setItemStatus(db, waitingId, 'todo', 'dependency')
}
