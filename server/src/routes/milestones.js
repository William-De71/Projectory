import { decode, getConfig, insertRow, setConfig, updateRow } from '../db.js'
import { compareVersions } from '../sync/http.js'
import { forgeFor, normalizeRepo } from '../sync/forges/index.js'
import { tr } from '../i18n.js'
import { unblockDependents } from '../items.js'
import { remindForumReply } from '../sync/index.js'

const FIELDS = ['project_id', 'version', 'title', 'description', 'due_date', 'status', 'released_at', 'checklist']
const DONE = ['done', 'wontfix']
const SECTIONS = [
  { title: '✨ Nouveautés', kinds: ['feature'] },
  { title: '🐛 Corrections', kinds: ['bug'] },
  { title: '🔧 Autres changements', kinds: ['task', 'question'] },
] // titles translated with tr() when rendered

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
    lines.push('', `### ${tr(section.title)}`, '')
    for (const it of list) {
      const link = it.issue_url ? ` ([#${it.issue_number ?? 'issue'}](${it.issue_url}))` : it.pr_url ? ` ([PR](${it.pr_url}))` : it.external_url ? ` ([${tr('lien')}](${it.external_url}))` : ''
      lines.push(`- ${it.title}${link}`)
    }
  }
  if (!items.length) lines.push('', `_${tr('Aucun élément terminé pour cette version.')}_`)
  return lines.join('\n')
}

// Default steps before publishing a version; translated when used.
const DEFAULT_CHECKLIST = ['Tests verts', 'Changelog relu', 'Version mise à jour', 'Documentation à jour', 'Image Docker / paquet publié', 'Annonce sur le forum']

// The user's template, or the default one in the current language.
export function checklistTemplate(db) {
  const stored = getConfig(db, 'release_checklist')
  return stored.items?.length ? stored.items : DEFAULT_CHECKLIST.map((label) => tr(label))
}

// Forum announcement of a released version: Discourse Markdown, ready to post.
export function announcement(db, projectId, version) {
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId)
  const milestone = db.prepare('SELECT * FROM milestones WHERE project_id = ? AND version = ?').get(projectId, version)
  const name = project?.name || ''
  // The changelog without its "## version — date" heading.
  const notes = changelog(db, projectId, version).split('\n').slice(2).join('\n').trim()
  const body = [
    tr('Bonjour à tous,'),
    tr('La version **{v}** de **{project}** est disponible 🎉', { v: version, project: name }),
    notes,
    milestone?.release_url && tr('Notes complètes et téléchargement : {url}', { url: milestone.release_url }),
    tr('Merci pour vos retours, n’hésitez pas à signaler ici le moindre souci !'),
  ].filter(Boolean).join('\n\n')
  return { title: tr('{project} {v} est disponible', { project: name, v: version }), markdown: body }
}

// Creates the release (and its tag) on the project's forge with the version's changelog.
async function publishOnForge(db, projectId, version, { tag, draft, prerelease } = {}) {
  const project = decode(db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId))
  if (!project?.repo) throw Object.assign(new Error(tr("Ce projet n'a pas de dépôt configuré")), { statusCode: 400 })
  const tagName = String(tag || (/^v/i.test(version) ? version : `v${version}`)).trim()
  // The forge shows the release name as title: drop the changelog heading.
  const body = changelog(db, projectId, version).split('\n').slice(2).join('\n')
  const { url } = await forgeFor(db, project).createRelease(normalizeRepo(project.repo), {
    tag: tagName,
    name: tagName,
    body,
    target: project.github?.default_branch || 'main',
    draft,
    prerelease,
  })
  db.prepare("UPDATE milestones SET release_url = ?, updated_at = datetime('now') WHERE project_id = ? AND version = ?").run(url, projectId, version)
  return url
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
    const template = checklistTemplate(db)
    const versions = [...byVersion.values()].map((m) => ({
      ...m,
      // Not stored until the first box is ticked: follows the template until then.
      checklist: m.id ? (m.checklist ? JSON.parse(m.checklist) : template.map((label) => ({ label, done: false }))) : null,
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

  app.get('/projects/:id/announcement', async (req, reply) => {
    const version = String(req.query.version || '').trim()
    if (!version) return reply.code(400).send({ error: tr('Version obligatoire') })
    // Where to post: Discourse forums of the project and its followed topics.
    const project = decode(db.prepare('SELECT forum_sources FROM projects WHERE id = ?').get(Number(req.params.id)))
    const forums = [...new Set((project?.forum_sources || []).filter((s) => s.type?.startsWith('discourse')).map((s) => s.url.replace(/\/+$/, '')))]
    const topics = db.prepare('SELECT id, title, url FROM forum_watches WHERE project_id = ? ORDER BY created_at DESC').all(Number(req.params.id))
    return { ...announcement(db, Number(req.params.id), version), forums, topics }
  })

  app.get('/settings/release-checklist', async () => ({ items: checklistTemplate(db), custom: !!getConfig(db, 'release_checklist').items?.length }))

  app.put('/settings/release-checklist', async (req) => {
    const items = (req.body?.items || []).map((s) => String(s).trim()).filter(Boolean)
    // An empty list goes back to the default steps.
    setConfig(db, 'release_checklist', items.length ? { items } : {})
    return { items: checklistTemplate(db), custom: items.length > 0 }
  })

  app.post('/milestones', async (req, reply) => {
    const { project_id, version } = req.body || {}
    if (!project_id || !version?.trim()) return reply.code(400).send({ error: tr('Projet et version obligatoires') })
    if (db.prepare('SELECT 1 FROM milestones WHERE project_id = ? AND version = ?').get(project_id, version.trim())) {
      return reply.code(409).send({ error: tr('La version {v} existe déjà', { v: version }) })
    }
    const id = insertRow(db, 'milestones', { ...req.body, version: version.trim() }, FIELDS)
    return reply.code(201).send(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id))
  })

  app.put('/milestones/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const before = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id)
    if (!before) return reply.code(404).send({ error: tr('Version introuvable') })
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
      if (String(err.message).includes('UNIQUE')) return reply.code(409).send({ error: tr('La version {v} existe déjà', { v: body.version }) })
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
    if (!version) return reply.code(400).send({ error: tr('Version obligatoire') })
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(
      `INSERT INTO milestones (project_id, version, status, released_at) VALUES (?, ?, 'released', ?)
       ON CONFLICT(project_id, version) DO UPDATE SET status = 'released', released_at = coalesce(released_at, excluded.released_at), updated_at = datetime('now')`
    ).run(projectId, version, today)
    if (req.body?.close_items) {
      const closing = db.prepare("SELECT id FROM items WHERE project_id = ? AND target_version = ? AND status IN ('in_progress', 'testing')").all(projectId, version)
      const close = db.prepare("UPDATE items SET status = 'done', updated_at = datetime('now') WHERE id = ?")
      for (const { id } of closing) {
        close.run(id)
        unblockDependents(db, id)
      }
    }
    // Bugs reported on the forum and shipped in this version: time to tell the reporters.
    for (const item of db.prepare("SELECT * FROM items WHERE project_id = ? AND target_version = ? AND status = 'done'").all(projectId, version)) {
      remindForumReply(db, item, { asRead: false })
    }
    const markdown = changelog(db, projectId, version)
    let doc = null
    if (req.body?.save_note) {
      const docId = insertRow(db, 'docs', { project_id: projectId, type: 'note', title: `Changelog ${version}`, content: markdown }, ['project_id', 'type', 'title', 'content'])
      doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(docId)
    }
    // The local release stands even if the forge refuses: it can be retried from the version card.
    let forge_error = null
    if (req.body?.forge) {
      try {
        await publishOnForge(db, projectId, version, req.body.forge)
      } catch (err) {
        forge_error = err.message
      }
    }
    return { milestone: db.prepare('SELECT * FROM milestones WHERE project_id = ? AND version = ?').get(projectId, version), markdown, doc, forge_error }
  })

  app.post('/milestones/:id/forge-release', async (req, reply) => {
    const m = db.prepare('SELECT * FROM milestones WHERE id = ?').get(Number(req.params.id))
    if (!m) return reply.code(404).send({ error: tr('Version introuvable') })
    if (m.status !== 'released') return reply.code(400).send({ error: tr("Publie d'abord la version dans Projectory") })
    if (m.release_url) return reply.code(409).send({ error: tr('Release déjà créée : {url}', { url: m.release_url }) })
    try {
      await publishOnForge(db, m.project_id, m.version, req.body || {})
    } catch (err) {
      return reply.code(err.statusCode || 502).send({ error: err.message })
    }
    return db.prepare('SELECT * FROM milestones WHERE id = ?').get(m.id)
  })
}
