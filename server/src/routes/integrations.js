import { getConfig, insertRow, setConfig } from '../db.js'
import { listOwnerRepos, normalizeRepo } from '../sync/github.js'
import { NOTIFY_EVENTS, ntfyConfig, sendNtfy } from '../sync/notify.js'
import { syncAll } from '../sync/index.js'

// GitHub bulk import and ntfy notification settings.
export default async function integrationRoutes(app, { db }) {
  app.get('/github/repos', async (req, reply) => {
    const owner = String(req.query.owner || '').trim() || getConfig(db, 'import').owner || ''
    let result
    try {
      result = await listOwnerRepos(owner)
    } catch (err) {
      const hint = {
        401: 'GitHub refuse le token (invalide ou expiré)',
        403: "GitHub refuse l'accès (droits du token insuffisants ou limite de requêtes atteinte — configure GITHUB_TOKEN)",
        404: `Utilisateur ou organisation « ${owner} » introuvable sur GitHub`,
      }[err.status]
      return reply.code(502).send({ error: hint ? `${hint}. Détail : ${err.message}` : err.message })
    }
    setConfig(db, 'import', { owner: result.owner })
    const tracked = new Set(db.prepare("SELECT lower(repo) AS repo FROM projects WHERE repo != ''").all().map((r) => r.repo))
    return { ...result, repos: result.repos.map((r) => ({ ...r, tracked: tracked.has(r.full_name.toLowerCase()) })) }
  })

  app.post('/github/import', async (req, reply) => {
    const { repos = [], category_id = null, status = 'active', track_releases = true, extra_tags = [] } = req.body || {}
    if (!repos.length) return reply.code(400).send({ error: 'Aucun dépôt sélectionné' })
    const tracked = new Set(db.prepare("SELECT lower(repo) AS repo FROM projects WHERE repo != ''").all().map((r) => r.repo))
    const created = []
    let skipped = 0
    db.exec('BEGIN')
    try {
      for (const r of repos) {
        const repo = normalizeRepo(r.full_name)
        if (!repo || tracked.has(repo.toLowerCase())) { skipped++; continue }
        tracked.add(repo.toLowerCase())
        created.push(insertRow(db, 'projects', {
          name: r.name || repo.split('/')[1],
          description: r.description || '',
          homepage: r.homepage || '',
          tags: [...new Set([...(r.topics || []), ...extra_tags])],
          repo,
          category_id,
          status: r.archived ? 'archived' : status,
          version_sources: track_releases ? [{ type: 'github', ref: '' }] : [],
        }, ['name', 'description', 'homepage', 'tags', 'repo', 'category_id', 'status', 'version_sources']))
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
