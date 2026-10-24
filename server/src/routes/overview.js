import { OPEN_STATUSES, decode } from '../db.js'
import { listProjects } from './projects.js'
import { syncAll, syncState } from '../sync/index.js'
import { forgeContext } from '../sync/forges/index.js'
import { tr } from '../i18n.js'
import { findStale } from '../insights.js'
import { todayView } from '../today.js'
import { VISIBLE_ITEM } from '../visibility.js'

const REPO_SOURCES = "'github', 'gitlab', 'gitea'"
const INBOX_SQL = `SELECT x.*, p.name AS project_name FROM inbox x LEFT JOIN projects p ON p.id = x.project_id`

// ~200 characters of `text` around the first occurrence of `q`, on one line;
// Markdown links and images are reduced to their text (attachment names).
export function excerptAround(text, q, size = 200) {
  const flat = String(text || '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0 || flat.length <= size) return flat.slice(0, size)
  const start = Math.max(0, Math.min(at - Math.floor(size / 3), flat.length - size))
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + size)}${start + size < flat.length ? '…' : ''}`
}

// Inbox, dashboard, search, sync control and export.
export default async function overviewRoutes(app, { db }) {
  app.get('/inbox', async (req) => {
    const { unread, project_id, source, limit = 200 } = req.query
    const where = ['1 = 1']
    const params = []
    if (unread) where.push('x.read_at IS NULL')
    if (project_id) { where.push('x.project_id = ?'); params.push(Number(project_id)) }
    if (source === 'repo') where.push(`x.source IN (${REPO_SOURCES})`)
    else if (source) { where.push('x.source = ?'); params.push(source) }
    return db.prepare(`${INBOX_SQL} WHERE ${where.join(' AND ')} ORDER BY x.created_at DESC, x.id DESC LIMIT ?`).all(...params, Number(limit))
  })

  app.post('/inbox/:id/read', async (req) => {
    const read = req.body?.read !== false
    db.prepare(`UPDATE inbox SET read_at = ${read ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(Number(req.params.id))
    return { ok: true }
  })

  app.post('/inbox/read-all', async (req) => {
    const { project_id, source } = req.body || {}
    const where = ['read_at IS NULL']
    const params = []
    if (project_id) { where.push('project_id = ?'); params.push(Number(project_id)) }
    if (source === 'repo') where.push(`source IN (${REPO_SOURCES})`)
    else if (source) { where.push('source = ?'); params.push(source) }
    const { changes } = db.prepare(`UPDATE inbox SET read_at = datetime('now') WHERE ${where.join(' AND ')}`).run(...params)
    return { changes: Number(changes) }
  })

  // Turns a notification (forum topic, issue...) into a tracked item.
  app.post('/inbox/:id/to-item', async (req, reply) => {
    const entry = db.prepare('SELECT * FROM inbox WHERE id = ?').get(Number(req.params.id))
    if (!entry) return reply.code(404).send({ error: tr('Notification introuvable') })
    const projectId = req.body?.project_id || entry.project_id
    if (!projectId) return reply.code(400).send({ error: tr('Choisis un projet') })
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO items (project_id, kind, title, body, priority, source, external_url) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(projectId, req.body?.kind || 'bug', entry.title, entry.excerpt, req.body?.priority || 'normal', entry.source, entry.url)
    db.prepare("UPDATE inbox SET item_id = ?, read_at = coalesce(read_at, datetime('now')) WHERE id = ?").run(lastInsertRowid, entry.id)
    return db.prepare('SELECT * FROM items WHERE id = ?').get(lastInsertRowid)
  })

  app.get('/dashboard', async () => {
    const projects = listProjects(db, { where: ["p.status != 'archived'"] })
    const count = (sql, ...p) => db.prepare(sql).get(...p).n
    return {
      stats: {
        projects: projects.length,
        active: projects.filter((p) => p.status === 'active').length,
        open_issues: count(`SELECT count(*) n FROM github_items g JOIN projects p ON p.id = g.project_id WHERE g.type = 'issue' AND p.status != 'archived' AND ${VISIBLE_ITEM}`),
        open_prs: count(`SELECT count(*) n FROM github_items g JOIN projects p ON p.id = g.project_id WHERE g.type = 'pr' AND p.status != 'archived' AND ${VISIBLE_ITEM}`),
        ci_failing: projects.filter((p) => p.ci === 'failure').length,
        stale: findStale(db).length,
        open_bugs: count(`SELECT count(*) n FROM items WHERE kind = 'bug' AND status IN ${OPEN_STATUSES}`),
        unread: count('SELECT count(*) n FROM inbox WHERE read_at IS NULL'),
        minutes_this_month: count("SELECT coalesce(sum(minutes), 0) n FROM time_entries WHERE date >= date('now', 'start of month')"),
      },
      pinned: projects.filter((p) => p.pinned),
      outdated: projects.filter((p) => p.outdated),
      ci_failing: projects.filter((p) => p.ci === 'failure').map(({ id, name, github }) => ({ id, name, run: github.ci.runs.find((r) => r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'skipped') })),
      with_errors: projects.filter((p) => p.sync_error).map(({ id, name, sync_error }) => ({ id, name, sync_error })),
      urgent: db.prepare(
        `SELECT i.*, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id
         WHERE i.status IN ${OPEN_STATUSES} AND (i.priority IN ('high', 'critical') OR (i.due_date IS NOT NULL AND i.due_date <= date('now', '+7 days')))
         ORDER BY CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, i.due_date LIMIT 15`
      ).all(),
      inbox: db.prepare(`${INBOX_SQL} WHERE x.read_at IS NULL ORDER BY x.created_at DESC LIMIT 10`).all(),
      stale: findStale(db).slice(0, 8),
      recent_prs: db.prepare(
        `SELECT g.*, p.name AS project_name FROM github_items g JOIN projects p ON p.id = g.project_id
         WHERE g.type = 'pr' AND ${VISIBLE_ITEM} ORDER BY g.updated_at DESC LIMIT 8`
      ).all().map(decode),
      sync: syncState,
    }
  })

  app.get('/today', async (req) => {
    const view = todayView(db, req.query.date)
    const ci_failing = listProjects(db, { where: ["p.status != 'archived'"] }).filter((p) => p.ci === 'failure').map(({ id, name }) => ({ id, name }))
    return { ...view, ci_failing }
  })

  // Full-text search; `excerpt` is cut around the first match (attachment names
  // are part of the Markdown, so they are found too). limit: per type.
  app.get('/search', async (req) => {
    const q = String(req.query.q || '').trim()
    if (q.length < 2) return []
    const like = `%${q}%`
    const limit = Math.min(Number(req.query.limit) || 15, 100)
    const around = (r) => ({ ...r, excerpt: excerptAround(r.excerpt, q) })
    const results = [
      ...db.prepare('SELECT id, name AS title, description AS excerpt FROM projects WHERE name LIKE ? OR description LIKE ? OR client LIKE ? LIMIT ?')
        .all(like, like, like, limit).map((r) => ({ ...around(r), type: 'project', project_id: r.id })),
      ...db.prepare(`SELECT i.id, i.title, i.body AS excerpt, i.project_id, i.kind, i.status, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id WHERE i.title LIKE ? OR i.body LIKE ? ORDER BY i.updated_at DESC LIMIT ?`)
        .all(like, like, limit).map((r) => ({ ...around(r), type: 'item' })),
      ...db.prepare(`SELECT d.id, d.title, d.content AS excerpt, d.project_id, d.type AS kind, p.name AS project_name FROM docs d LEFT JOIN projects p ON p.id = d.project_id WHERE d.title LIKE ? OR d.content LIKE ? ORDER BY d.updated_at DESC LIMIT ?`)
        .all(like, like, limit).map((r) => ({ ...around(r), type: 'doc' })),
      ...db.prepare(`SELECT g.id, '#' || g.number || ' ' || g.title AS title, g.url, g.project_id, g.type AS kind, p.name AS project_name FROM github_items g JOIN projects p ON p.id = g.project_id WHERE g.title LIKE ? LIMIT ?`)
        .all(like, limit).map((r) => ({ ...r, type: 'github' })),
    ]
    return results
  })

  app.get('/sync/status', async () => ({ ...syncState, github_token: !!forgeContext(db, 'github').token, interval_minutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 30) }))

  app.post('/sync', async () => syncAll(db, app.log))

  app.get('/export', async (req, reply) => {
    const tables = ['categories', 'projects', 'items', 'docs', 'time_entries', 'inbox']
    const data = Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all().map(decode)]))
    reply.header('Content-Disposition', `attachment; filename="projectory-${new Date().toISOString().slice(0, 10)}.json"`)
    return { exported_at: new Date().toISOString(), ...data }
  })
}
