import { randomBytes } from 'node:crypto'
import { getConfig, setConfig } from './db.js'
import { tr } from './i18n.js'

// Secret token in the subscription URL: calendar apps cannot send credentials.
export function calendarToken(db, { regenerate = false } = {}) {
  const stored = getConfig(db, 'calendar')
  if (stored.token && !regenerate) return stored.token
  const token = randomBytes(18).toString('base64url')
  setConfig(db, 'calendar', { ...stored, token })
  return token
}

const PRIORITIES = { low: 'basse', normal: 'normale', high: 'haute', critical: 'critique' }

const escape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const ymd = (date) => date.replaceAll('-', '').slice(0, 8)
const nextDay = (date) => {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line) {
  const bytes = Buffer.from(line)
  if (bytes.length <= 75) return line
  const parts = []
  let start = 0
  while (start < bytes.length) {
    let end = Math.min(start + (start ? 74 : 75), bytes.length)
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end-- // don't split a UTF-8 sequence
    parts.push(bytes.subarray(start, end).toString())
    start = end
  }
  return parts.join('\r\n ')
}

function event({ uid, date, summary, description, url }, stamp) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@projectory`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(date))}`,
    `SUMMARY:${escape(summary)}`,
    ...(description ? [`DESCRIPTION:${escape(description)}`] : []),
    ...(url ? [`URL:${url}`] : []),
    'END:VEVENT',
  ]
}

// All-day events: due dates of open items, planned and released versions.
export function buildCalendar(db, { appUrl = '', now = new Date() } = {}) {
  const base = appUrl.replace(/\/+$/, '')
  const link = (path) => (base ? `${base}${path}` : null)
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const items = db.prepare(
    `SELECT i.id, i.title, i.kind, i.priority, i.due_date, i.project_id, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id
     WHERE i.status IN ('todo', 'in_progress') AND i.due_date IS NOT NULL`
  ).all()
  const milestones = db.prepare(
    `SELECT m.id, m.version, m.title, m.status, m.due_date, m.released_at, m.project_id, p.name AS project_name FROM milestones m JOIN projects p ON p.id = m.project_id
     WHERE (m.status = 'planned' AND m.due_date IS NOT NULL) OR (m.status = 'released' AND m.released_at IS NOT NULL)`
  ).all()
  const events = [
    ...items.map((i) => event({
      uid: `item-${i.id}`,
      date: i.due_date,
      summary: `[${i.project_name}] ${i.title}`,
      description: tr('Échéance — priorité {priority}', { priority: tr(PRIORITIES[i.priority] || i.priority) }),
      url: link(`/projects/${i.project_id}/items`),
    }, stamp)),
    ...milestones.map((m) => event({
      uid: `milestone-${m.id}`,
      date: m.status === 'released' ? m.released_at : m.due_date,
      summary: m.status === 'released'
        ? tr('✅ {project} {v} publiée', { project: m.project_name, v: m.version })
        : tr('🚀 {project} {v} prévue', { project: m.project_name, v: m.version }) + (m.title ? ` — ${m.title}` : ''),
      url: link(`/projects/${m.project_id}/roadmap`),
    }, stamp)),
  ]
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Projectory//Projectory//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Projectory',
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...events.flat(),
    'END:VCALENDAR',
  ]
  return `${lines.map(fold).join('\r\n')}\r\n`
}
