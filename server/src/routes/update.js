import { fetchText } from '../sync/http.js'
import { tr } from '../i18n.js'
import { updateStatus } from '../update.js'

// New Projectory releases, and the "update now" button backed by Watchtower's
// HTTP API (UPDATER_TOKEN, UPDATER_URL): it pulls the image and recreates the container.
export default async function updateRoutes(app, { db, version }) {
  app.get('/update', async (req) => updateStatus(db, version, { refresh: !!req.query.refresh }))

  app.post('/update', async (req, reply) => {
    const token = process.env.UPDATER_TOKEN
    if (!token) return reply.code(400).send({ error: tr('Mise à jour automatique non configurée (UPDATER_TOKEN)') })
    const base = (process.env.UPDATER_URL || 'http://watchtower:8080').replace(/\/+$/, '')
    try {
      // async: Watchtower answers right away, then replaces this very container.
      await fetchText(`${base}/v1/update?async=true`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch (err) {
      return reply.code(502).send({ error: tr('Watchtower injoignable : {error}', { error: err.message }) })
    }
    return { ok: true }
  })
}
