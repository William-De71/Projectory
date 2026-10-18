import { insertRow, updateRow } from '../db.js'
import { compareVersions } from '../sync/http.js'

const FIELDS = ['project_id', 'version', 'title', 'description', 'due_date', 'status', 'released_at']
const DONE = ['done', 'wontfix']
const SECTIONS = [
  { title: '✨ Nouveautés', kinds: ['feature'] },
  { title: '🐛 Corrections', kinds: ['bug'] },
  { title: '🔧 Autres changements', kinds: ['task', 'question'] },
]

// Markdown changelog of one version: finished items grouped by kind.
export function changelog(db, projectId, version) {
  const milestone = db.prepare('SELECT * FROM milestones WHERE project_id = ? AND version = ?').get(projectId, version)
  const items = db.prepare("SELECT * FROM items WHERE project_id = ? AND target_version = ? AND status = 'done' ORDER BY kind, id").all(projectId, version)
  const date = milestone?.released_at?.slice(0, 10)
  const lines = [`## ${version}${date ? ` — ${date}` : ''}`]
  if (milestone?.title) lines.push('', milestone.title)
  if (milestone?.description) lines.push('', milestone.description)
  for (const section of SECTIONS) {
    const list = items.filter((it) => section.kinds.includes(it.kind))
    if (!list.length) continue
    lines.push('', `### ${section.title}`, '')
    for (const it of list) {
      const link = it.issue_url ? ` ([#${it.issue_number ?? 'issue'}](${it.issue_url}))` : it.external_url ? ` ([lien](${it.external_url}))` : ''
      lines.push(`- ${it.title}${link}`)
    }
  }
  if (!items.length) lines.push('', '_Aucun élément terminé pour cette version._')
  return lines.join('\n')
}

export default async function milestoneRoutes(app, { db }) {
  // Versions with their items; versions only referenced by items appear too.
  app.get('/projects/:id/roadmap', async (req) => {
    const projectId = Number(req.params.id)
    const milestones = db.prepare('SELECT * FROM milestones WHERE project_id = ?').all(projectId)
    const items = db.prepare('SELECT * FROM items WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
    const byVersion = new Map(milestones.map((m) => [m.version, { ...m, items: [] }]))
    const unplanned = []
    for (const it of items) {
      if (!it.target_version) {
        if (!DONE.includes(it.status)) unplanned.push(it)
        continue
      }
      if (!byVersion.has(it.target_version)) byVersion.set(it.target_version, { id: null, project_id: projectId, version: it.target_version, title: '', status: 'planned', items: [] })
      byVersion.get(it.target_version).items.push(it)
    }
    const versions = [...byVersion.values()].map((m) => ({
      ...m,
      total: m.items.length,
      done: m.items.filter((it) => DONE.includes(it.status)).length,
    }))
    versions.sort((a, b) => (a.status === b.status ? compareVersions(b.version, a.version) : a.status === 'planned' ? -1 : 1))
    return { versions, unplanned }
  })

  app.get('/projects/:id/changelog', async (req) => {
    const projectId = Number(req.params.id)
    if (req.query.version) return { markdown: changelog(db, projectId, String(req.query.version)) }
    // Whole file: every released version, newest first.
    const released = db.prepare("SELECT version FROM milestones WHERE project_id = ? AND status = 'released'").all(projectId)
      .map((m) => m.version).sort((a, b) => compareVersions(b, a))
    return { markdown: ['# Changelog', ...released.map((v) => changelog(db, projectId, v))].join('\n\n') }
  })

  app.post('/milestones', async (req, reply) => {
    const { project_id, version } = req.body || {}
    if (!project_id || !version?.trim()) return reply.code(400).send({ error: 'Projet et version obligatoires' })
    if (db.prepare('SELECT 1 FROM milestones WHERE project_id = ? AND version = ?').get(project_id, version.trim())) {
      return reply.code(409).send({ error: `La version ${version} existe déjà` })
    }
    const id = insertRow(db, 'milestones', { ...req.body, version: version.trim() }, FIELDS)
    return reply.code(201).send(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id))
  })

  app.put('/milestones/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const before = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id)
    if (!before) return reply.code(404).send({ error: 'Version introuvable' })
    const body = { ...req.body }
    if (body.version !== undefined) body.version = body.version.trim()
    if (body.status === 'released' && !before.released_at && !body.released_at) body.released_at = new Date().toISOString().slice(0, 10)
    if (body.status === 'planned') body.released_at = null
    db.exec('BEGIN')
    try {
      updateRow(db, 'milestones', id, body, FIELDS)
      // Renaming a version carries its items along.
      if (body.version && body.version !== before.version) {
        db.prepare('UPDATE items SET target_version = ? WHERE project_id = ? AND target_version = ?').run(body.version, before.project_id, before.version)
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      if (String(err.message).includes('UNIQUE')) return reply.code(409).send({ error: `La version ${body.version} existe déjà` })
      throw err
    }
    return db.prepare('SELECT * FROM milestones WHERE id = ?').get(id)
  })

  app.delete('/milestones/:id', async (req) => {
    db.prepare('DELETE FROM milestones WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })

  // Marks a version as released (creating it if only items referenced it) and
  // optionally keeps its changelog as a project note.
  app.post('/projects/:id/release', async (req, reply) => {
    const projectId = Number(req.params.id)
    const version = String(req.body?.version || '').trim()
    if (!version) return reply.code(400).send({ error: 'Version obligatoire' })
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(
      `INSERT INTO milestones (project_id, version, status, released_at) VALUES (?, ?, 'released', ?)
       ON CONFLICT(project_id, version) DO UPDATE SET status = 'released', released_at = coalesce(released_at, excluded.released_at), updated_at = datetime('now')`
    ).run(projectId, version, today)
    if (req.body?.close_items) {
      db.prepare("UPDATE items SET status = 'done', updated_at = datetime('now') WHERE project_id = ? AND target_version = ? AND status = 'in_progress'").run(projectId, version)
    }
    const markdown = changelog(db, projectId, version)
    let doc = null
    if (req.body?.save_note) {
      const docId = insertRow(db, 'docs', { project_id: projectId, type: 'note', title: `Changelog ${version}`, content: markdown }, ['project_id', 'type', 'title', 'content'])
      doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(docId)
    }
    return { milestone: db.prepare('SELECT * FROM milestones WHERE project_id = ? AND version = ?').get(projectId, version), markdown, doc }
  })
}
