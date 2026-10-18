import { createBackup, isBackupDue } from './backup.js'
import { digestConfig, isDigestDue } from './insights.js'
import { sendDigest } from './routes/insights.js'

// Checks once a minute for the weekly digest and the daily backup.
export function startJobs(db, log) {
  const tick = async () => {
    const now = new Date()
    if (isDigestDue(digestConfig(db), now)) {
      try {
        await sendDigest(db, now)
        log.info('résumé hebdomadaire envoyé')
      } catch (err) {
        log.warn(`résumé hebdomadaire : ${err.message}`)
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
