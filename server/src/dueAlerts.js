import { OPEN_STATUSES, getConfig, setConfig } from './db.js'
import { tr } from './i18n.js'
import { ntfyConfig, sendNtfy } from './sync/notify.js'

const MAX_LINES = 8

export function dueAlertConfig(db) {
  const stored = getConfig(db, 'due_alerts')
  return { enabled: !!stored.enabled, days_before: stored.days_before ?? 2, hour: stored.hour ?? 8, last_run_date: stored.last_run_date || null }
}

// Server-local day, like the hour the alerts are scheduled at.
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Open items to tell about, each at most twice per due date: once when it gets
// close and once when it is overdue. A new due date starts over.
export function findDueAlerts(db, now = new Date()) {
  const today = localDate(now)
  const limit = new Date(now)
  limit.setDate(limit.getDate() + dueAlertConfig(db).days_before)
  return db.prepare(
    `SELECT i.id, i.title, i.due_date, i.due_alert, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id
     WHERE i.status IN ${OPEN_STATUSES} AND i.due_date IS NOT NULL AND i.due_date != '' AND i.due_date <= ?
       AND p.status != 'archived' AND p.notify != 0
     ORDER BY i.due_date, i.id`
  ).all(localDate(limit))
    .map((item) => ({ ...item, stage: item.due_date < today ? 'overdue' : 'soon' }))
    .filter((item) => item.due_alert !== `${item.due_date}:${item.stage}`)
}

export function buildDueAlert(alerts) {
  const lines = []
  const section = (title, list) => {
    if (!list.length) return
    lines.push(title)
    lines.push(...list.slice(0, MAX_LINES).map((a) => `  • ${a.due_date} — ${a.project_name} : ${a.title}`))
    if (list.length > MAX_LINES) lines.push(`  • ${tr('… et {n} autre(s)', { n: list.length - MAX_LINES })}`)
  }
  const overdue = alerts.filter((a) => a.stage === 'overdue')
  const soon = alerts.filter((a) => a.stage === 'soon')
  section(tr('⏰ En retard ({n})', { n: overdue.length }), overdue)
  section(tr('📅 À venir ({n})', { n: soon.length }), soon)
  return { title: tr('Projectory — échéances'), message: lines.join('\n').slice(0, 3900), tags: ['alarm_clock'], priority: overdue.length ? 4 : 3 }
}

// Once a day, from the chosen hour on.
export function isDueAlertDue(config, now = new Date()) {
  return config.enabled && now.getHours() >= config.hour && config.last_run_date !== localDate(now)
}

// Sends one grouped notification. On failure nothing is marked, so the next run retries.
export async function sendDueAlerts(db, now = new Date()) {
  const alerts = findDueAlerts(db, now)
  if (alerts.length) {
    const config = ntfyConfig(db)
    const appUrl = config.app_url.replace(/\/+$/, '')
    await sendNtfy(config, { ...buildDueAlert(alerts), click: appUrl ? `${appUrl}/` : undefined })
    const mark = db.prepare('UPDATE items SET due_alert = ? WHERE id = ?')
    for (const a of alerts) mark.run(`${a.due_date}:${a.stage}`, a.id)
  }
  setConfig(db, 'due_alerts', { ...getConfig(db, 'due_alerts'), last_run_date: localDate(now) })
  return { sent: alerts.length }
}
