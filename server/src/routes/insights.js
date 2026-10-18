import { getConfig, setConfig } from '../db.js'
import { tr } from '../i18n.js'
import { buildDigest, digestConfig, findStale, staleConfig } from '../insights.js'
import { backupConfig, backupStream, createBackup, listBackups } from '../backup.js'
import { buildCalendar, calendarToken } from '../calendar.js'
import { projectStats } from '../stats.js'
import { ntfyConfig, sendNtfy } from '../sync/notify.js'

const clampInt = (v, min, max, fallback) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

export async function sendDigest(db, now = new Date()) {
  const digest = buildDigest(db, now)
  const config = ntfyConfig(db)
  await sendNtfy(config, { title: digest.title, message: digest.message, tags: ['calendar'], priority: 3, click: config.app_url || undefined })
  setConfig(db, 'digest', { ...getConfig(db, 'digest'), last_sent_at: now.toISOString() })
  return digest
}

// Waiting issues / PRs, weekly digest, calendar feed, backups and statistics.
export default async function insightRoutes(app, { db }) {
  app.get('/stale', async () => ({ ...staleConfig(db), items: findStale(db) }))

  app.put('/settings/stale', async (req) => {
    const current = staleConfig(db)
    const next = {
      issue_days: clampInt(req.body?.issue_days, 1, 365, current.issue_days),
      pr_days: clampInt(req.body?.pr_days, 1, 365, current.pr_days),
    }
    setConfig(db, 'stale', next)
    return next
  })

  app.get('/digest', async () => ({ ...digestConfig(db), preview: buildDigest(db) }))

  app.put('/settings/digest', async (req) => {
    const current = digestConfig(db)
    const enabled = req.body?.enabled ?? current.enabled
    const next = {
      enabled: !!enabled,
      day: clampInt(req.body?.day, 0, 6, current.day),
      hour: clampInt(req.body?.hour, 0, 23, current.hour),
      // Turning it on does not send a summary for a slot that already passed.
      last_sent_at: enabled && !current.enabled ? new Date().toISOString() : current.last_sent_at,
    }
    setConfig(db, 'digest', next)
    return { ...next, preview: buildDigest(db) }
  })

  app.post('/digest/send', async (req, reply) => {
    try {
      return await sendDigest(db)
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.get('/projects/:id/stats', async (req, reply) => {
    const months = [3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 3
    const stats = await projectStats(db, Number(req.params.id), { months, refresh: req.query.refresh === '1' })
    return stats || reply.code(404).send({ error: tr('Projet introuvable') })
  })

  // ---- Calendar (ICS subscription, token in the URL) ----
  app.get('/settings/calendar', async () => ({ path: `/api/calendar.ics?token=${calendarToken(db)}` }))

  app.post('/settings/calendar/regenerate', async () => ({ path: `/api/calendar.ics?token=${calendarToken(db, { regenerate: true })}` }))

  app.get('/calendar.ics', async (req, reply) => {
    if (!req.query.token || req.query.token !== getConfig(db, 'calendar').token) return reply.code(403).send({ error: tr('Lien de calendrier invalide') })
    reply.header('Content-Type', 'text/calendar; charset=utf-8')
    reply.header('Content-Disposition', 'inline; filename="projectory.ics"')
    return buildCalendar(db, { appUrl: ntfyConfig(db).app_url })
  })

  // ---- Backups ----
  app.get('/backups', async () => ({ ...backupConfig(db), backups: listBackups() }))

  app.put('/settings/backup', async (req) => {
    const current = backupConfig(db)
    const next = {
      enabled: req.body?.enabled ?? current.enabled,
      hour: clampInt(req.body?.hour, 0, 23, current.hour),
      keep_daily: clampInt(req.body?.keep_daily, 1, 60, current.keep_daily),
      keep_weekly: clampInt(req.body?.keep_weekly, 0, 52, current.keep_weekly),
    }
    setConfig(db, 'backup', next)
    return { ...backupConfig(db), backups: listBackups() }
  })

  app.post('/backups', async () => ({ ...createBackup(db), backups: listBackups() }))

  app.get('/backups/:name', async (req, reply) => {
    const stream = backupStream(req.params.name)
    if (!stream) return reply.code(404).send({ error: tr('Sauvegarde introuvable') })
    reply.header('Content-Type', 'application/vnd.sqlite3')
    reply.header('Content-Disposition', `attachment; filename="${req.params.name}"`)
    return reply.send(stream)
  })
}
