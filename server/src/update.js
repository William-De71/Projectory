import { getConfig, setConfig } from './db.js'
import { tr } from './i18n.js'
import { forgeContext } from './sync/forges/index.js'
import { HttpError, compareVersions, fetchJson, looksLikeVersion } from './sync/http.js'
import { ntfyConfig, sendNtfy } from './sync/notify.js'

const LATEST_URL = 'https://api.github.com/repos/William-De71/Projectory/releases/latest'
const CACHE_MS = 60 * 60 * 1000

// A fixed image tag (1.2.3) never moves: pulling it again brings nothing new.
const followsReleases = (tag) => !/^v?\d+\.\d+\.\d+/.test(tag)

// The repository is public: a token that expired or lacks access must not hide
// a new version, so a refused request is tried again without it.
async function fetchLatestRelease(db) {
  const { token } = forgeContext(db, 'github')
  try {
    return await fetchJson(LATEST_URL, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch (err) {
    if (!token || !(err instanceof HttpError) || ![401, 403, 404].includes(err.status)) throw err
    return fetchJson(LATEST_URL)
  }
}

const checkError = (err) => (err instanceof HttpError
  ? tr('GitHub a répondu {status}', { status: err.status })
  : tr('GitHub injoignable : {error}', { error: err.message }))

// Compares the running version with the latest release. The last answer is kept
// in config:update, so a failed check still shows what was known and when.
export async function updateStatus(db, version, { refresh = false, now = new Date() } = {}) {
  let { release = null, checked_at: checkedAt = null } = getConfig(db, 'update')
  let error
  if (refresh || !release || now - new Date(checkedAt) >= CACHE_MS) {
    try {
      const r = await fetchLatestRelease(db)
      release = { version: r.tag_name.replace(/^v/, ''), url: r.html_url, notes: r.body || '', published_at: r.published_at }
      checkedAt = now.toISOString()
      setConfig(db, 'update', { ...getConfig(db, 'update'), release, checked_at: checkedAt })
    } catch (err) {
      error = checkError(err)
    }
  }
  const imageTag = process.env.IMAGE_TAG || 'latest'
  // Dev builds (dev-<sha>) are not compared with releases.
  const comparable = looksLikeVersion(version)
  return {
    current: version,
    comparable,
    can_update: !!process.env.UPDATER_TOKEN && followsReleases(imageTag),
    image_tag: imageTag,
    latest: release,
    checked_at: checkedAt,
    available: !!release && comparable && compareVersions(release.version, version) > 0,
    ...(error ? { error } : {}),
  }
}

// Background check: pushes a new version to ntfy, once per version.
export async function checkForUpdate(db, version, now = new Date()) {
  const status = await updateStatus(db, version, { now })
  if (!status.available) return { status, notified: false }
  const ntfy = ntfyConfig(db)
  const stored = getConfig(db, 'update')
  if (!ntfy.enabled || !ntfy.topic || !ntfy.events.includes('app_update') || stored.notified === status.latest.version) {
    return { status, notified: false }
  }
  await sendNtfy(ntfy, {
    title: tr('Projectory v{v} est disponible', { v: status.latest.version }),
    message: tr('Tu utilises la v{v}.', { v: status.current }),
    tags: ['package'],
    click: status.latest.url,
  })
  setConfig(db, 'update', { ...stored, notified: status.latest.version })
  return { status, notified: true }
}
