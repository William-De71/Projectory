import { forgeContext } from '../sync/forges/index.js'
import { compareVersions, fetchJson, fetchText, looksLikeVersion } from '../sync/http.js'
import { tr } from '../i18n.js'

const REPO = 'William-De71/Projectory'
const CACHE_MS = 60 * 60 * 1000

// A fixed image tag (1.2.3) never moves: pulling it again brings nothing new.
const followsReleases = (tag) => !/^v?\d+\.\d+\.\d+/.test(tag)

// New Projectory releases, and the "update now" button backed by Watchtower's
// HTTP API (UPDATER_TOKEN, UPDATER_URL): it pulls the image and recreates the container.
export default async function updateRoutes(app, { db, version }) {
  let cache = null

  const latestRelease = async () => {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.release
    const { token } = forgeContext(db, 'github')
    const r = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const release = { version: r.tag_name.replace(/^v/, ''), url: r.html_url, notes: r.body || '', published_at: r.published_at }
    cache = { at: Date.now(), release }
    return release
  }

  app.get('/update', async (req) => {
    if (req.query.refresh) cache = null
    const imageTag = process.env.IMAGE_TAG || 'latest'
    const status = {
      current: version,
      can_update: !!process.env.UPDATER_TOKEN && followsReleases(imageTag),
      image_tag: imageTag,
    }
    try {
      const latest = await latestRelease()
      // Dev builds (dev-<sha>) are not compared with releases.
      return { ...status, latest, available: looksLikeVersion(version) && compareVersions(latest.version, version) > 0 }
    } catch (err) {
      return { ...status, latest: null, available: false, error: err.message }
    }
  })

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
