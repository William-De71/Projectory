import { VISIBLE_ITEM } from './visibility.js'
import { OPEN_STATUSES, getConfig } from './db.js'
import { tr } from './i18n.js'
import { compareVersions } from './sync/http.js'

const DAY = 24 * 3600 * 1000
const daysAgo = (n, now = new Date()) => new Date(now.getTime() - n * DAY).toISOString()
const ageDays = (iso, now = new Date()) => Math.floor((now - new Date(iso)) / DAY)

export function staleConfig(db) {
  const stored = getConfig(db, 'stale')
  return { issue_days: stored.issue_days ?? 7, pr_days: stored.pr_days ?? 5 }
}

// Open issues nobody answered and PRs / MRs untouched for a while, oldest first.
export function findStale(db, now = new Date()) {
  const { issue_days, pr_days } = staleConfig(db)
  const base = `SELECT g.id, g.project_id, g.type, g.number, g.title, g.url, g.author, g.comments, g.created_at, g.updated_at,
      p.name AS project_name, p.forge
    FROM github_items g JOIN projects p ON p.id = g.project_id
    WHERE p.status != 'archived' AND ${VISIBLE_ITEM}`
  const issues = db.prepare(`${base} AND g.type = 'issue' AND g.comments = 0 AND g.created_at <= ?`).all(daysAgo(issue_days, now))
    .map((r) => ({ ...r, reason: 'no_reply', age_days: ageDays(r.created_at, now) }))
  const prs = db.prepare(`${base} AND g.type = 'pr' AND g.draft = 0 AND g.updated_at <= ?`).all(daysAgo(pr_days, now))
    .map((r) => ({ ...r, reason: 'waiting', age_days: ageDays(r.updated_at, now) }))
  return [...prs, ...issues].sort((a, b) => b.age_days - a.age_days)
}

const ref = (r) => `${r.forge === 'gitlab' && r.type === 'pr' ? '!' : '#'}${r.number}`
const bullet = (text) => `  • ${text}`

// Plain-text weekly summary, sized for a push notification.
export function buildDigest(db, now = new Date()) {
  const projects = db.prepare("SELECT * FROM projects WHERE status != 'archived'").all()
  const parse = (v, fallback) => { try { return JSON.parse(v) ?? fallback } catch { return fallback } }
  const stale = findStale(db, now)
  const prs = stale.filter((s) => s.type === 'pr')
  const issues = stale.filter((s) => s.type === 'issue')
  const ciFailing = projects.filter((p) => parse(p.github, {})?.ci?.conclusion === 'failure')
  const outdated = projects.flatMap((p) => {
    if (!p.deployed_version) return []
    const latest = parse(p.versions, []).find((v) => v.version && compareVersions(v.version, p.deployed_version) > 0)
    return latest ? [`${p.name} (${p.deployed_version} → ${latest.version})`] : []
  })
  const urgent = db.prepare(
    `SELECT i.title, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id
     WHERE i.status IN ${OPEN_STATUSES} AND i.priority IN ('high', 'critical')
     ORDER BY CASE i.priority WHEN 'critical' THEN 0 ELSE 1 END, i.updated_at`
  ).all()
  const in14 = new Date(now.getTime() + 14 * DAY).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)
  const upcoming = [
    ...db.prepare(`SELECT m.version, m.due_date, p.name AS project_name FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.status = 'planned' AND m.due_date IS NOT NULL AND m.due_date <= ? ORDER BY m.due_date`).all(in14)
      .map((m) => ({ date: m.due_date, text: tr('{project} {v} (version)', { project: m.project_name, v: m.version }) })),
    ...db.prepare(`SELECT i.title, i.due_date, p.name AS project_name FROM items i JOIN projects p ON p.id = i.project_id
      WHERE i.status IN ${OPEN_STATUSES} AND i.due_date IS NOT NULL AND i.due_date <= ? ORDER BY i.due_date`).all(in14)
      .map((i) => ({ date: i.due_date, text: `${i.project_name} : ${i.title}` })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const unread = db.prepare('SELECT count(*) AS n FROM inbox WHERE read_at IS NULL').get().n
  const minutes = db.prepare('SELECT coalesce(sum(minutes), 0) AS n FROM time_entries WHERE date >= ? AND date < ?')
    .get(daysAgo(7, now).slice(0, 10), today).n

  const lines = []
  const section = (title, list, format, max = 3) => {
    if (!list.length) return
    lines.push(title)
    lines.push(...list.slice(0, max).map((x) => bullet(format(x))))
    if (list.length > max) lines.push(bullet(tr('… et {n} autre(s)', { n: list.length - max })))
  }
  section(tr('🔴 CI en échec ({n})', { n: ciFailing.length }), ciFailing, (p) => p.name, 5)
  section(tr('⏳ PR en attente ({n})', { n: prs.length }), prs, (s) => tr('{project} {ref} {title} — {days} j', { project: s.project_name, ref: ref(s), title: s.title, days: s.age_days }))
  section(tr('💬 Issues sans réponse ({n})', { n: issues.length }), issues, (s) => tr('{project} {ref} {title} — {days} j', { project: s.project_name, ref: ref(s), title: s.title, days: s.age_days }))
  section(tr('🐛 Prioritaires ({n})', { n: urgent.length }), urgent, (i) => `${i.project_name} : ${i.title}`)
  section(tr('📅 Dans les 14 jours ({n})', { n: upcoming.length }), upcoming, (u) => `${u.date} — ${u.text}`, 4)
  section(tr('⬆️ Mises à jour disponibles ({n})', { n: outdated.length }), outdated, (o) => o)
  if (unread) lines.push(tr('📥 {n} non lu(s) dans la boîte de réception', { n: unread }))
  if (minutes) lines.push(tr('⏱️ {h} h passées les 7 derniers jours', { h: Math.round((minutes / 60) * 10) / 10 }))
  if (!lines.length) lines.push(tr('Rien à signaler cette semaine 🎉'))

  return {
    title: tr('Projectory — résumé de la semaine'),
    message: lines.join('\n').slice(0, 3900),
    counts: { ci_failing: ciFailing.length, prs: prs.length, issues: issues.length, urgent: urgent.length, upcoming: upcoming.length, outdated: outdated.length, unread, minutes },
  }
}

export function digestConfig(db) {
  const stored = getConfig(db, 'digest')
  return { enabled: !!stored.enabled, day: stored.day ?? 1, hour: stored.hour ?? 8, last_sent_at: stored.last_sent_at || null }
}

// Most recent scheduled moment (weekday `day`, `hour`:00 local time) at or before `now`.
export function lastSlot(now, day, hour) {
  const slot = new Date(now)
  slot.setHours(hour, 0, 0, 0)
  slot.setDate(slot.getDate() - ((slot.getDay() - day + 7) % 7))
  if (slot > now) slot.setDate(slot.getDate() - 7)
  return slot
}

export function isDigestDue(config, now = new Date()) {
  if (!config.enabled) return false
  const slot = lastSlot(now, config.day, config.hour)
  return !config.last_sent_at || new Date(config.last_sent_at) < slot
}
