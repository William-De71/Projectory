import { randomUUID } from 'node:crypto'
import { getConfig, insertRow, setConfig } from '../db.js'
import { FORGE_LABELS, forgeAccounts, forgeContext, forgeFor, normalizeRepo } from '../sync/forges/index.js'
import { NOTIFY_EVENTS, ntfyConfig, sendNtfy } from '../sync/notify.js'
import { GH_NOTIFICATION_REASONS, ghNotificationConfig, syncAll } from '../sync/index.js'

function forgeError(err, owner) {
  const hint = {
    401: 'La forge refuse le token (invalide ou expiré)',
    403: "La forge refuse l'accès (droits du token insuffisants ou limite de requêtes atteinte)",
    404: owner ? `Utilisateur, organisation ou groupe « ${owner} » introuvable` : 'Ressource introuvable',
  }[err.status]
  return hint ? `${hint}. Détail : ${err.message}` : err.message
}

const publicAccounts = (db) => forgeAccounts(db).map(({ token, ...a }) => ({ ...a, token_set: !!token }))

// Forge import / issues / accounts, ntfy and GitHub notification settings.
export default async function integrationRoutes(app, { db }) {
  const trackedRepos = (forge, url) => new Set(
    db.prepare("SELECT lower(repo) AS repo FROM projects WHERE repo != '' AND forge = ? AND (forge = 'github' OR forge_url = ?)")
      .all(forge, url || '').map((r) => r.repo)
  )

  app.get('/forges/repos', async (req, reply) => {
    const forge = req.query.forge || 'github'
    const url = forge === 'github' ? '' : String(req.query.url || '').trim()
    const owner = String(req.query.owner || '').trim()
    let result
    try {
      result = await forgeFor(db, { forge, forge_url: url }).listOwnerRepos(owner)
    } catch (err) {
      return reply.code(502).send({ error: forgeError(err, owner) })
    }
    setConfig(db, 'import', { forge, url, owner: result.owner })
    const tracked = trackedRepos(forge, url)
    return { ...result, repos: result.repos.map((r) => ({ ...r, tracked: tracked.has(r.full_name.toLowerCase()) })) }
  })

  app.get('/forges/last-import', async () => getConfig(db, 'import', {}))

  app.post('/forges/import', async (req, reply) => {
    const { forge = 'github', repos = [], category_id = null, status = 'active', track_releases = true, extra_tags = [] } = req.body || {}
    const forgeUrl = forge === 'github' ? '' : String(req.body?.forge_url || '').replace(/\/+$/, '')
    if (!repos.length) return reply.code(400).send({ error: 'Aucun dépôt sélectionné' })
    const tracked = trackedRepos(forge, forgeUrl)
    const created = []
    let skipped = 0
    db.exec('BEGIN')
    try {
      for (const r of repos) {
        const repo = normalizeRepo(r.full_name)
        if (!repo || tracked.has(repo.toLowerCase())) { skipped++; continue }
        tracked.add(repo.toLowerCase())
        created.push(insertRow(db, 'projects', {
          name: r.name || repo.split('/').at(-1),
          description: r.description || '',
          homepage: r.homepage || '',
          tags: [...new Set([...(r.topics || []), ...extra_tags])],
          repo,
          forge,
          forge_url: forgeUrl,
          category_id,
          status: r.archived ? 'archived' : status,
          version_sources: track_releases ? [{ type: 'repo', ref: '' }] : [],
        }, ['name', 'description', 'homepage', 'tags', 'repo', 'forge', 'forge_url', 'category_id', 'status', 'version_sources']))
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    // First sync in the background; it baselines everything as read, so no notification storm.
    if (created.length && req.body?.sync !== false) syncAll(db, app.log).catch((err) => app.log.error(err))
    return { created: created.length, skipped, ids: created }
  })

  // Opens an issue on the project's forge from a tracked item and links both.
  app.post('/items/:id/issue', async (req, reply) => {
    const item = db.prepare('SELECT i.*, p.repo, p.forge, p.forge_url FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = ?').get(Number(req.params.id))
    if (!item) return reply.code(404).send({ error: 'Élément introuvable' })
    if (!item.repo) return reply.code(400).send({ error: "Ce projet n'a pas de dépôt configuré" })
    if (item.issue_url) return reply.code(409).send({ error: `Une issue existe déjà : ${item.issue_url}` })
    const body = [
      item.body,
      item.external_url && `Signalé ici : ${item.external_url}`,
      item.target_version && `Version cible : ${item.target_version}`,
    ].filter(Boolean).join('\n\n')
    let issue
    try {
      issue = await forgeFor(db, item).createIssue(normalizeRepo(item.repo), { title: item.title, body, labels: req.body?.labels })
    } catch (err) {
      return reply.code(502).send({ error: forgeError(err) })
    }
    db.prepare("UPDATE items SET issue_number = ?, issue_url = ?, updated_at = datetime('now') WHERE id = ?").run(issue.number, issue.url, item.id)
    return db.prepare('SELECT * FROM items WHERE id = ?').get(item.id)
  })

  // The other way round: follow an existing forge issue / PR as a tracked item.
  app.post('/github-items/:id/track', async (req, reply) => {
    const g = db.prepare('SELECT * FROM github_items WHERE id = ?').get(Number(req.params.id))
    if (!g) return reply.code(404).send({ error: 'Issue introuvable' })
    const existing = db.prepare('SELECT * FROM items WHERE project_id = ? AND issue_url = ?').get(g.project_id, g.url)
    if (existing) return existing
    const id = insertRow(db, 'items', {
      project_id: g.project_id,
      kind: req.body?.kind || (g.type === 'pr' ? 'task' : 'bug'),
      priority: req.body?.priority || 'normal',
      title: g.title,
      source: 'github',
      issue_number: g.type === 'issue' ? g.number : null,
      issue_url: g.url,
    }, ['project_id', 'kind', 'priority', 'title', 'source', 'issue_number', 'issue_url'])
    return reply.code(201).send(db.prepare('SELECT * FROM items WHERE id = ?').get(id))
  })

  // ---- Forge accounts (tokens are write-only) ----
  app.get('/settings/forges', async () => ({ accounts: publicAccounts(db), labels: FORGE_LABELS }))

  app.put('/settings/forges', async (req, reply) => {
    const previous = new Map(forgeAccounts(db).map((a) => [a.id, a]))
    const accounts = []
    for (const a of req.body?.accounts || []) {
      if (!FORGE_LABELS[a.type]) return reply.code(400).send({ error: `Forge inconnue : ${a.type}` })
      if (a.type !== 'github' && !/^https?:\/\//.test(a.url || '')) return reply.code(400).send({ error: `Adresse manquante pour ${FORGE_LABELS[a.type]}` })
      const id = a.id || randomUUID()
      accounts.push({
        id,
        type: a.type,
        url: a.type === 'github' ? '' : a.url.replace(/\/+$/, ''),
        label: a.label || '',
        token: a.token || previous.get(id)?.token || '',
      })
    }
    setConfig(db, 'forges', { accounts })
    return { accounts: publicAccounts(db), labels: FORGE_LABELS }
  })

  // ---- Personal GitHub notifications ----
  app.get('/settings/github-notifications', async () => ({ ...ghNotificationConfig(db), available_reasons: GH_NOTIFICATION_REASONS, token_set: !!forgeContext(db, 'github').token }))

  app.put('/settings/github-notifications', async (req) => {
    const next = { ...getConfig(db, 'github_notifications') }
    for (const key of ['enabled', 'reasons']) if (key in (req.body || {})) next[key] = req.body[key]
    setConfig(db, 'github_notifications', next)
    return { ...ghNotificationConfig(db), available_reasons: GH_NOTIFICATION_REASONS, token_set: !!forgeContext(db, 'github').token }
  })

  // ---- ntfy ----
  app.get('/settings/ntfy', async () => {
    const { token, ...config } = ntfyConfig(db)
    return { ...config, token_set: !!token, available_events: NOTIFY_EVENTS }
  })

  app.put('/settings/ntfy', async (req) => {
    const current = getConfig(db, 'ntfy')
    const body = req.body || {}
    const next = { ...current }
    for (const key of ['enabled', 'server', 'topic', 'events', 'app_url']) if (key in body) next[key] = body[key]
    // The token is write-only: an empty field keeps it, clear_token removes it.
    if (body.token) next.token = body.token
    if (body.clear_token) delete next.token
    setConfig(db, 'ntfy', next)
    const { token, ...config } = ntfyConfig(db)
    return { ...config, token_set: !!token, available_events: NOTIFY_EVENTS }
  })

  app.post('/settings/ntfy/test', async (req, reply) => {
    try {
      await sendNtfy(ntfyConfig(db), {
        title: 'Projectory',
        message: 'Notification de test : tout fonctionne 🎉',
        tags: ['white_check_mark'],
      })
      return { ok: true }
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })
}
