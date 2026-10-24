import { OPEN_STATUSES } from './db.js'

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
  const reopen = db.prepare("UPDATE items SET status = 'todo', updated_at = datetime('now') WHERE id = ?")
  for (const { id: waitingId } of waiting) if (!stillBlocked.get(waitingId)) reopen.run(waitingId)
}
