import { tr } from '../i18n.js'

// Quick to-do lists: one general list (no project) and one per project.
export default async function todoRoutes(app, { db }) {
  const getTodo = (id) => db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
  const cleanText = (value) => (typeof value === 'string' ? value.trim() : '')
  // project_id=none is the general list, a number is that project's list.
  const listFilter = (value) => {
    if (value === 'none') return { sql: 't.project_id IS NULL', params: [] }
    const id = Number(value)
    return Number.isInteger(id) && id > 0 ? { sql: 't.project_id = ?', params: [id] } : null
  }

  // Without project_id: every list. Open first (oldest on top), then latest done.
  app.get('/todos', async (req, reply) => {
    const filter = req.query.project_id === undefined ? { sql: '1', params: [] } : listFilter(req.query.project_id)
    if (!filter) return reply.code(400).send({ error: tr('Liste de todo inconnue') })
    return db.prepare(
      `SELECT t.*, p.name AS project_name FROM todos t LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${filter.sql}
       ORDER BY t.done_at IS NOT NULL, CASE WHEN t.done_at IS NULL THEN t.id END, t.done_at DESC, t.id`
    ).all(...filter.params)
  })

  app.post('/todos', async (req, reply) => {
    const text = cleanText(req.body?.text)
    if (!text) return reply.code(400).send({ error: tr('Texte obligatoire') })
    const projectId = req.body?.project_id ?? null
    if (projectId !== null && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
      return reply.code(404).send({ error: tr('Projet introuvable') })
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO todos (project_id, text) VALUES (?, ?)').run(projectId, text)
    return reply.code(201).send(getTodo(Number(lastInsertRowid)))
  })

  // Cleared per list, so a click never empties the other lists.
  app.delete('/todos/done', async (req, reply) => {
    const filter = listFilter(req.query.project_id)
    if (!filter) return reply.code(400).send({ error: tr('Liste de todo inconnue') })
    const { changes } = db.prepare(`DELETE FROM todos AS t WHERE t.done_at IS NOT NULL AND ${filter.sql}`).run(...filter.params)
    return { deleted: Number(changes) }
  })

  app.put('/todos/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!getTodo(id)) return reply.code(404).send({ error: tr('Todo introuvable') })
    if ('text' in (req.body || {})) {
      const text = cleanText(req.body.text)
      if (!text) return reply.code(400).send({ error: tr('Texte obligatoire') })
      db.prepare('UPDATE todos SET text = ? WHERE id = ?').run(text, id)
    }
    if ('done' in (req.body || {})) {
      db.prepare('UPDATE todos SET done_at = ? WHERE id = ?').run(req.body.done ? new Date().toISOString() : null, id)
    }
    return getTodo(id)
  })

  app.delete('/todos/:id', async (req, reply) => {
    const { changes } = db.prepare('DELETE FROM todos WHERE id = ?').run(Number(req.params.id))
    if (!changes) return reply.code(404).send({ error: tr('Todo introuvable') })
    return { ok: true }
  })
}
