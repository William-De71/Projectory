import { OPEN_STATUSES, decode, insertRow, updateRow } from '../db.js'
import { unblockDependents } from '../items.js'
import { tr } from '../i18n.js'

const ITEM_FIELDS = ['project_id', 'kind', 'title', 'body', 'status', 'priority', 'source', 'external_url', 'target_version', 'due_date', 'issue_number', 'issue_url', 'focus_date', 'forum_replied_at', 'pr_url', 'checklist']
// Fields a bulk edit may change.
const BULK_FIELDS = ['status', 'priority', 'kind', 'target_version']
export const LINK_TYPES = ['blocked_by', 'duplicate_of', 'relates_to']
const DOC_FIELDS = ['project_id', 'type', 'title', 'content', 'status', 'pinned']
const CATEGORY_FIELDS = ['name', 'color', 'position']

const PRIORITY_ORDER = "CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END"

// Open items that `blocked_by` points to, per item (for the "blocked" hint in lists).
const OPEN_BLOCKERS = `(SELECT count(*) FROM item_links l JOIN items b ON b.id = l.target_id
  WHERE l.item_id = i.id AND l.type = 'blocked_by' AND b.status IN ${OPEN_STATUSES}) AS open_blockers`

const isFinished = (status) => status === 'done' || status === 'wontfix'

// Items (bugs / features / tasks), docs (specs / notes), categories and time entries.
export default async function contentRoutes(app, { db }) {
  const getItem = (id) => decode(db.prepare('SELECT * FROM items WHERE id = ?').get(id))

  // ---- Items ----
  app.get('/items', async (req) => {
    const { project_id, status, kind, open } = req.query
    const where = ['1 = 1']
    const params = []
    if (project_id) { where.push('i.project_id = ?'); params.push(Number(project_id)) }
    if (status) { where.push('i.status = ?'); params.push(status) }
    if (kind) { where.push('i.kind = ?'); params.push(kind) }
    if (open) where.push(`i.status IN ${OPEN_STATUSES}`)
    return db.prepare(
      `SELECT i.*, p.name AS project_name, ${OPEN_BLOCKERS} FROM items i JOIN projects p ON p.id = i.project_id
       WHERE ${where.join(' AND ')} ORDER BY ${PRIORITY_ORDER}, i.updated_at DESC`
    ).all(...params).map(decode)
  })

  app.get('/items/:id', async (req, reply) => {
    const item = db.prepare('SELECT i.*, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = ?').get(Number(req.params.id))
    return item ? decode(item) : reply.code(404).send({ error: tr('Élément introuvable') })
  })

  app.post('/items', async (req, reply) => {
    if (!req.body?.title?.trim() || !req.body?.project_id) return reply.code(400).send({ error: tr('Titre et projet obligatoires') })
    const id = insertRow(db, 'items', req.body, ITEM_FIELDS)
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.body.project_id)
    return reply.code(201).send(getItem(id))
  })

  app.put('/items/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!updateRow(db, 'items', id, req.body || {}, ITEM_FIELDS)) return reply.code(404).send({ error: tr('Élément introuvable') })
    if (isFinished(req.body?.status)) unblockDependents(db, id)
    return getItem(id)
  })

  // Same change on several items at once (status, priority, kind, version), or deletion.
  app.post('/items/bulk', async (req, reply) => {
    const ids = (req.body?.ids || []).map(Number).filter(Boolean)
    if (!ids.length) return reply.code(400).send({ error: tr('Aucun élément sélectionné') })
    const changes = Object.fromEntries(Object.entries(req.body?.changes || {}).filter(([k]) => BULK_FIELDS.includes(k)))
    db.exec('BEGIN')
    try {
      if (req.body?.delete) {
        const del = db.prepare('DELETE FROM items WHERE id = ?')
        for (const id of ids) del.run(id)
      } else {
        if (!Object.keys(changes).length) throw Object.assign(new Error(tr('Rien à modifier')), { statusCode: 400 })
        for (const id of ids) {
          updateRow(db, 'items', id, changes, BULK_FIELDS)
          if (isFinished(changes.status)) unblockDependents(db, id)
        }
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return { updated: ids.length }
  })

  // Relations of an item, both ways: what it points to and what points to it.
  app.get('/items/:id/links', async (req) => {
    const id = Number(req.params.id)
    const cols = 'l.id, l.type, i.id AS item_id, i.title, i.status, i.kind, i.project_id, p.name AS project_name'
    return [
      ...db.prepare(`SELECT ${cols}, 'out' AS direction FROM item_links l JOIN items i ON i.id = l.target_id JOIN projects p ON p.id = i.project_id WHERE l.item_id = ?`).all(id),
      ...db.prepare(`SELECT ${cols}, 'in' AS direction FROM item_links l JOIN items i ON i.id = l.item_id JOIN projects p ON p.id = i.project_id WHERE l.target_id = ?`).all(id),
    ]
  })

  app.post('/items/:id/links', async (req, reply) => {
    const id = Number(req.params.id)
    const target = Number(req.body?.target_id)
    const type = req.body?.type
    if (!LINK_TYPES.includes(type)) return reply.code(400).send({ error: tr('Type de lien inconnu') })
    if (!target || target === id) return reply.code(400).send({ error: tr('Choisis un autre élément') })
    if (!getItem(id) || !getItem(target)) return reply.code(404).send({ error: tr('Élément introuvable') })
    db.prepare('INSERT OR IGNORE INTO item_links (item_id, target_id, type) VALUES (?, ?, ?)').run(id, target, type)
    return reply.code(201).send({ ok: true })
  })

  app.delete('/item-links/:id', async (req) => {
    db.prepare('DELETE FROM item_links WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })

  app.delete('/items/:id', async (req) => {
    db.prepare('DELETE FROM items WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })

  // ---- Docs ----
  app.get('/docs', async (req) => {
    const { project_id, type, global: onlyGlobal } = req.query
    const where = ['1 = 1']
    const params = []
    if (project_id) { where.push('d.project_id = ?'); params.push(Number(project_id)) }
    if (onlyGlobal) where.push('d.project_id IS NULL')
    if (type) { where.push('d.type = ?'); params.push(type) }
    return db.prepare(
      `SELECT d.*, p.name AS project_name FROM docs d LEFT JOIN projects p ON p.id = d.project_id
       WHERE ${where.join(' AND ')} ORDER BY d.pinned DESC, d.updated_at DESC`
    ).all(...params).map(decode)
  })

  app.get('/docs/:id', async (req, reply) => {
    const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(Number(req.params.id))
    return doc ? decode(doc) : reply.code(404).send({ error: tr('Document introuvable') })
  })

  app.post('/docs', async (req, reply) => {
    if (!req.body?.title?.trim()) return reply.code(400).send({ error: tr('Le titre est obligatoire') })
    const id = insertRow(db, 'docs', req.body, DOC_FIELDS)
    return reply.code(201).send(decode(db.prepare('SELECT * FROM docs WHERE id = ?').get(id)))
  })

  app.put('/docs/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!updateRow(db, 'docs', id, req.body || {}, DOC_FIELDS)) return reply.code(404).send({ error: tr('Document introuvable') })
    return decode(db.prepare('SELECT * FROM docs WHERE id = ?').get(id))
  })

  app.delete('/docs/:id', async (req) => {
    db.prepare('DELETE FROM docs WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })

  // ---- Categories ----
  app.get('/categories', async () =>
    db.prepare(
      `SELECT c.*, (SELECT count(*) FROM projects p WHERE p.category_id = c.id AND p.status != 'archived') AS project_count
       FROM categories c ORDER BY c.position, c.name`
    ).all()
  )

  app.post('/categories', async (req, reply) => {
    if (!req.body?.name?.trim()) return reply.code(400).send({ error: tr('Le nom est obligatoire') })
    const id = insertRow(db, 'categories', req.body, CATEGORY_FIELDS)
    return reply.code(201).send(db.prepare('SELECT * FROM categories WHERE id = ?').get(id))
  })

  app.put('/categories/:id', async (req) => {
    const id = Number(req.params.id)
    updateRow(db, 'categories', id, req.body || {}, CATEGORY_FIELDS, { touch: false })
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
  })

  app.delete('/categories/:id', async (req) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })

  // ---- Time entries ----
  app.get('/time', async (req) => {
    const { project_id, from, to } = req.query
    const where = ['1 = 1']
    const params = []
    if (project_id) { where.push('t.project_id = ?'); params.push(Number(project_id)) }
    if (from) { where.push('t.date >= ?'); params.push(from) }
    if (to) { where.push('t.date <= ?'); params.push(to) }
    return db.prepare(
      `SELECT t.*, p.name AS project_name FROM time_entries t JOIN projects p ON p.id = t.project_id
       WHERE ${where.join(' AND ')} ORDER BY t.date DESC, t.id DESC`
    ).all(...params)
  })

  app.post('/time', async (req, reply) => {
    const { project_id, date, minutes } = req.body || {}
    if (!project_id || !date || !(minutes > 0)) return reply.code(400).send({ error: tr('Projet, date et durée obligatoires') })
    const id = insertRow(db, 'time_entries', req.body, ['project_id', 'date', 'minutes', 'note'])
    return reply.code(201).send(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id))
  })

  app.delete('/time/:id', async (req) => {
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })
}
