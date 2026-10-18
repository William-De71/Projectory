import { decode, insertRow, updateRow } from '../db.js'
import { compareVersions } from '../sync/http.js'
import { normalizeRepo } from '../sync/forges/index.js'
import { syncProject } from '../sync/index.js'

const FIELDS = [
  'name', 'description', 'category_id', 'status', 'tags', 'client', 'repo', 'homepage', 'links',
  'deployed_version', 'version_sources', 'forum_sources', 'pinned', 'notify', 'forge', 'forge_url',
]

const LIST_SQL = `
  SELECT p.*, c.name AS category_name, c.color AS category_color,
    (SELECT count(*) FROM items i WHERE i.project_id = p.id AND i.status IN ('todo', 'in_progress')) AS open_items,
    (SELECT count(*) FROM items i WHERE i.project_id = p.id AND i.status IN ('todo', 'in_progress') AND i.kind = 'bug') AS open_bugs,
    (SELECT count(*) FROM github_items g WHERE g.project_id = p.id AND g.type = 'issue') AS open_issues,
    (SELECT count(*) FROM github_items g WHERE g.project_id = p.id AND g.type = 'pr') AS open_prs,
    (SELECT count(*) FROM inbox x WHERE x.project_id = p.id AND x.read_at IS NULL) AS unread
  FROM projects p LEFT JOIN categories c ON c.id = p.category_id
`

export function withComputed(row) {
  const p = decode(row)
  // Outdated when an upstream version is newer than the one noted as deployed.
  p.ci = p.github?.ci?.conclusion || null
  p.outdated = !!p.deployed_version && (p.versions || []).some((v) => v.version && compareVersions(v.version, p.deployed_version) > 0)
  return p
}

export function listProjects(db, { where = [], params = [] } = {}) {
  const sql = `${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.pinned DESC, CASE p.status WHEN 'active' THEN 0 WHEN 'maintenance' THEN 1 WHEN 'idea' THEN 2 WHEN 'paused' THEN 3 ELSE 4 END, p.updated_at DESC`
  return db.prepare(sql).all(...params).map(withComputed)
}

function clean(body) {
  const out = { ...body }
  if ('repo' in out) out.repo = normalizeRepo(out.repo)
  if (out.category_id === undefined && 'category_id' in out) out.category_id = null
  return out
}

export default async function projectRoutes(app, { db }) {
  app.get('/projects', async (req) => {
    const { category_id, status, q } = req.query
    const where = []
    const params = []
    if (category_id) { where.push('p.category_id = ?'); params.push(Number(category_id)) }
    if (status) { where.push('p.status = ?'); params.push(status) }
    else where.push("p.status != 'archived'")
    if (q) {
      where.push("(p.name LIKE ? OR p.description LIKE ? OR p.client LIKE ? OR p.tags LIKE ?)")
      params.push(...Array(4).fill(`%${q}%`))
    }
    return listProjects(db, { where, params })
  })

  app.get('/projects/:id', async (req, reply) => {
    const [p] = listProjects(db, { where: ['p.id = ?'], params: [Number(req.params.id)] })
    if (!p) return reply.code(404).send({ error: 'Projet introuvable' })
    return p
  })

  app.post('/projects', async (req, reply) => {
    if (!req.body?.name?.trim()) return reply.code(400).send({ error: 'Le nom est obligatoire' })
    const id = insertRow(db, 'projects', clean(req.body), FIELDS)
    return reply.code(201).send(listProjects(db, { where: ['p.id = ?'], params: [id] })[0])
  })

  app.put('/projects/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!updateRow(db, 'projects', id, clean(req.body || {}), FIELDS)) return reply.code(404).send({ error: 'Projet introuvable' })
    return listProjects(db, { where: ['p.id = ?'], params: [id] })[0]
  })

  app.delete('/projects/:id', async (req) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(Number(req.params.id))
    return { ok: true }
  })

  app.post('/projects/:id/sync', async (req) => {
    const res = await syncProject(db, Number(req.params.id))
    return { ...res, project: listProjects(db, { where: ['p.id = ?'], params: [res.id] })[0] }
  })

  app.get('/github-items', async (req) => {
    const { project_id, type } = req.query
    const where = ['1 = 1']
    const params = []
    if (project_id) { where.push('g.project_id = ?'); params.push(Number(project_id)) }
    if (type) { where.push('g.type = ?'); params.push(type) }
    return db.prepare(
      `SELECT g.*, p.name AS project_name FROM github_items g JOIN projects p ON p.id = g.project_id
       WHERE ${where.join(' AND ')} ORDER BY g.updated_at DESC`
    ).all(...params).map(decode)
  })
}
