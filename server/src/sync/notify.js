import { getConfig } from '../db.js'
import { tr } from '../i18n.js'

export const NOTIFY_EVENTS = {
  issue: 'Nouvelle issue',
  pr: 'Nouvelle pull request',
  release: 'Nouvelle version',
  forum: 'Nouveau sujet de forum',
  ci_failed: 'CI en échec',
  ci_fixed: 'CI réparée',
  gh_notification: 'Notification GitHub perso (review, mention…)',
  forum_mention: 'Mention sur le forum',
  forum_followed: 'Réponse sur un sujet suivi',
  pr_status: 'Mes PR : approuvée, changements demandés, conflit, CI',
  pr_merged: 'PR liée fusionnée (élément passé en test)',
}
// Events that existed before the list became extensible: anything newer is
// switched on for users who saved their choice before it existed.
const LEGACY_EVENTS = ['issue', 'pr', 'release', 'forum', 'ci_failed', 'ci_fixed', 'gh_notification']

const TAGS = { gh_notification: 'bell', issue: 'beetle', pr: 'twisted_rightwards_arrows', release: 'package', forum: 'speech_balloon', forum_mention: 'speaking_head', forum_followed: 'speech_balloon', pr_status: 'eyes', pr_merged: 'twisted_rightwards_arrows', ci_failed: 'rotating_light', ci_fixed: 'white_check_mark' }
const PRIORITY = { ci_failed: 4, gh_notification: 4, forum_mention: 4, pr_status: 4 }
// Beyond this many entries for one project in one sync, send a single summary.
const GROUP_THRESHOLD = 3

export const eventOf = (entry) => {
  if (entry.kind === 'discourse_mentions') return 'forum_mention'
  if (entry.kind === 'forum_reply') return 'forum_reply'
  if (entry.kind === 'forum_followed') return 'forum_followed'
  if (entry.source === 'forum') return 'forum'
  return entry.kind
}

// Stored config wins; environment variables provide defaults.
export function ntfyConfig(db) {
  const stored = getConfig(db, 'ntfy')
  return {
    enabled: stored.enabled ?? !!process.env.NTFY_TOPIC,
    server: stored.server || process.env.NTFY_SERVER || 'https://ntfy.sh',
    topic: stored.topic || process.env.NTFY_TOPIC || '',
    token: stored.token || process.env.NTFY_TOKEN || '',
    events: stored.events
      ? [...stored.events, ...Object.keys(NOTIFY_EVENTS).filter((e) => !(stored.known_events || LEGACY_EVENTS).includes(e))]
      : Object.keys(NOTIFY_EVENTS),
    app_url: stored.app_url || process.env.APP_URL || '',
  }
}

// Uses ntfy's JSON publishing so titles and messages can hold any UTF-8.
export async function sendNtfy(config, { title, message, tags = [], priority = 3, click }) {
  if (!config.topic) throw new Error(tr('Topic ntfy non configuré'))
  const res = await fetch(config.server.replace(/\/+$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
    body: JSON.stringify({ topic: config.topic, title, message, tags, priority, ...(click ? { click } : {}) }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(tr('ntfy a répondu {status} : {body}', { status: res.status, body: (await res.text()).slice(0, 200) }))
}

export function buildMessages(project, entries, config) {
  const wanted = entries.filter((e) => config.events.includes(eventOf(e)))
  if (!wanted.length) return []
  const appUrl = config.app_url.replace(/\/+$/, '')
  const projectUrl = !appUrl ? undefined : project.id ? `${appUrl}/projects/${project.id}/inbox` : `${appUrl}/inbox`
  if (wanted.length > GROUP_THRESHOLD) {
    const lines = wanted.slice(0, 6).map((e) => `• ${tr(NOTIFY_EVENTS[eventOf(e)])} : ${e.title}`)
    if (wanted.length > 6) lines.push(tr('… et {n} autre(s)', { n: wanted.length - 6 }))
    return [{
      title: tr('{project} : {n} nouveautés', { project: project.name, n: wanted.length }),
      message: lines.join('\n'),
      tags: ['bell'],
      priority: Math.max(...wanted.map((e) => PRIORITY[eventOf(e)] || 3)),
      click: projectUrl,
    }]
  }
  return wanted.map((e) => ({
    title: `${project.name} — ${tr(NOTIFY_EVENTS[eventOf(e)])}`,
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
