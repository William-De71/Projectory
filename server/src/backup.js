import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { DATA_PATH, getConfig } from './db.js'
import { mirrorUploads, pruneUploads } from './uploads.js'

const NAME = /^projectory-(\d{4}-\d{2}-\d{2})\.db$/

export const backupDir = () => process.env.BACKUP_DIR || join(DATA_PATH, 'backups')

export function backupConfig(db) {
  const stored = getConfig(db, 'backup')
  return { enabled: stored.enabled ?? true, hour: stored.hour ?? 3, keep_daily: stored.keep_daily ?? 7, keep_weekly: stored.keep_weekly ?? 4, dir: backupDir() }
}

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function listBackups() {
  const dir = backupDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => NAME.test(f))
    .map((name) => {
      const st = statSync(join(dir, name))
      return { name, date: name.match(NAME)[1], size: st.size, created_at: st.mtime.toISOString() }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Monday of the ISO week, as YYYY-MM-DD.
function weekOf(date) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// Keeps the `keepDaily` newest backups, then the newest one of each of the
// `keepWeekly` previous weeks; deletes the rest. Returns the deleted names.
export function rotateBackups({ keep_daily, keep_weekly }) {
  const all = listBackups()
  const keep = new Set(all.slice(0, keep_daily).map((b) => b.name))
  const keptWeeks = new Set(all.slice(0, keep_daily).map((b) => weekOf(b.date)))
  let weeks = 0
  for (const b of all.slice(keep_daily)) {
    const week = weekOf(b.date)
    if (keptWeeks.has(week) || weeks >= keep_weekly) continue
    keptWeeks.add(week)
    keep.add(b.name)
    weeks++
  }
  const deleted = all.filter((b) => !keep.has(b.name)).map((b) => b.name)
  for (const name of deleted) unlinkSync(join(backupDir(), name))
  return deleted
}

// Consistent snapshot while the app keeps running (SQLite VACUUM INTO).
export function createBackup(db, now = new Date()) {
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })
  const name = `projectory-${localDate(now)}.db`
  const file = join(dir, name)
  if (existsSync(file)) unlinkSync(file)
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`)
  const deleted = rotateBackups(backupConfig(db))
  // Attachments live outside the database: drop the orphans, copy the rest.
  pruneUploads(db, { now: now.getTime() })
  mirrorUploads(join(dir, 'uploads'), { now: now.getTime() })
  return { name, size: statSync(file).size, deleted }
}

export function isBackupDue(db, now = new Date()) {
  const config = backupConfig(db)
  if (!config.enabled || now.getHours() < config.hour) return false
  return !listBackups().some((b) => b.date === localDate(now))
}

export function backupStream(name) {
  const safe = basename(String(name))
  if (!NAME.test(safe)) return null
  const file = join(backupDir(), safe)
  return existsSync(file) ? createReadStream(file) : null
}
