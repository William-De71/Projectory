import { getConfig } from '../db.js'

export const NOTIFY_EVENTS = {
  issue: 'Nouvelle issue',
  pr: 'Nouvelle pull request',
  release: 'Nouvelle version',
  forum: 'Nouveau sujet de forum',
  ci_failed: 'CI en échec',
  ci_fixed: 'CI réparée',
}

const TAGS = { issue: 'beetle', pr: 'twisted_rightwards_arrows', release: 'package', forum: 'speech_balloon', ci_failed: 'rotating_light', ci_fixed: 'white_check_mark' }
const PRIORITY = { ci_failed: 4 }
// Beyond this many entries for one project in one sync, send a single summary.
const GROUP_THRESHOLD = 3

const eventOf = (entry) => (entry.source === 'forum' ? 'forum' : entry.kind)

// Stored config wins; environment variables provide defaults.
export function ntfyConfig(db) {
  const stored = getConfig(db, 'ntfy')
  return {
    enabled: stored.enabled ?? !!process.env.NTFY_TOPIC,
    server: stored.server || process.env.NTFY_SERVER || 'https://ntfy.sh',
    topic: stored.topic || process.env.NTFY_TOPIC || '',
    token: stored.token || process.env.NTFY_TOKEN || '',
    events: stored.events || Object.keys(NOTIFY_EVENTS),
    app_url: stored.app_url || process.env.APP_URL || '',
  }
}

// Uses ntfy's JSON publishing so titles and messages can hold any UTF-8.
export async function sendNtfy(config, { title, message, tags = [], priority = 3, click }) {
  if (!config.topic) throw new Error('Topic ntfy non configuré')
  const res = await fetch(config.server.replace(/\/+$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
    body: JSON.stringify({ topic: config.topic, title, message, tags, priority, ...(click ? { click } : {}) }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`ntfy a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`)
}

export function buildMessages(project, entries, config) {
  const wanted = entries.filter((e) => config.events.includes(eventOf(e)))
  if (!wanted.length) return []
  const projectUrl = config.app_url ? `${config.app_url.replace(/\/+$/, '')}/projects/${project.id}/inbox` : undefined
  if (wanted.length > GROUP_THRESHOLD) {
    const lines = wanted.slice(0, 6).map((e) => `• ${NOTIFY_EVENTS[eventOf(e)]} : ${e.title}`)
    if (wanted.length > 6) lines.push(`… et ${wanted.length - 6} autre(s)`)
    return [{
      title: `${project.name} : ${wanted.length} nouveautés`,
      message: lines.join('\n'),
      tags: ['bell'],
      priority: Math.max(...wanted.map((e) => PRIORITY[eventOf(e)] || 3)),
      click: projectUrl,
    }]
  }
  return wanted.map((e) => ({
    title: `${project.name} — ${NOTIFY_EVENTS[eventOf(e)]}`,
    message: [e.title, e.excerpt].filter(Boolean).join('\n').slice(0, 500),
    tags: [TAGS[eventOf(e)]],
    priority: PRIORITY[eventOf(e)] || 3,
    click: e.url || projectUrl,
  }))
}

export async function notifyProject(db, project, entries) {
  const config = ntfyConfig(db)
  if (!config.enabled || !config.topic || project.notify === false || !entries.length) return
  for (const msg of buildMessages(project, entries, config)) await sendNtfy(config, msg)
}
