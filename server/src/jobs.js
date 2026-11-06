import { createBackup, isBackupDue } from './backup.js'
import { digestConfig, isDigestDue } from './insights.js'
import { sendDigest } from './routes/insights.js'
import { dueAlertConfig, isDueAlertDue, sendDueAlerts } from './dueAlerts.js'
import { ntfyConfig } from './sync/notify.js'
import { checkForUpdate } from './update.js'

const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000

// Checks once a minute for the weekly digest, the due date alerts and the daily
// backup; every 6 hours (and at startup) for a new Projectory version.
export function startJobs(db, log, { version }) {
  let lastUpdateCheck = 0
  const tick = async () => {
    const now = new Date()
    if (now - lastUpdateCheck >= UPDATE_CHECK_MS) {
      lastUpdateCheck = now.getTime()
      try {
        const { status, notified } = await checkForUpdate(db, version, now)
        if (status.error) log.warn(`recherche de mise à jour : ${status.error}`)
        if (notified) log.info(`nouvelle version signalée : ${status.latest.version}`)
      } catch (err) {
        log.warn(`recherche de mise à jour : ${err.message}`)
      }
    }
    if (isDigestDue(digestConfig(db), now)) {
      try {
        await sendDigest(db, now)
        log.info('résumé hebdomadaire envoyé')
      } catch (err) {
        log.warn(`résumé hebdomadaire : ${err.message}`)
      }
    }
    const ntfy = ntfyConfig(db)
    if (ntfy.enabled && ntfy.topic && isDueAlertDue(dueAlertConfig(db), now)) {
      try {
        const { sent } = await sendDueAlerts(db, now)
        if (sent) log.info(`alertes d'échéance envoyées : ${sent}`)
      } catch (err) {
        log.warn(`alertes d'échéance : ${err.message}`)
      }
    }
    if (isBackupDue(db, now)) {
      try {
        const { name, deleted } = createBackup(db, now)
        log.info({ deleted }, `sauvegarde ${name}`)
      } catch (err) {
        log.error(err, 'sauvegarde échouée')
      }
    }
  }
  const timer = setInterval(tick, 60_000)
  setTimeout(tick, 10_000)
  return timer
}
