import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { DATA_PATH } from './db.js'
import { tr } from './i18n.js'

// Files pasted or dropped into a description, a note or a spec. They are
// referenced from the Markdown as /api/uploads/<file>; no table is needed.
export const uploadsDir = () => process.env.UPLOADS_DIR || join(DATA_PATH, 'uploads')
export const MAX_UPLOAD_MB = 25

const FILE = /^[a-z0-9]+-[a-f0-9]{12}(-[a-z0-9-]{1,40})?\.[a-z0-9]{1,10}$/
const REFERENCE = /\/api\/uploads\/([A-Za-z0-9.-]+)/g

const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  txt: 'text/plain', log: 'text/plain', md: 'text/plain', csv: 'text/plain', json: 'text/plain', yml: 'text/plain', yaml: 'text/plain',
  zip: 'application/zip', gz: 'application/gzip',
}
// Shown in the browser; anything else (SVG included: it may carry scripts) is downloaded.
const INLINE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'pdf', 'mp4', 'webm', 'mov', 'txt', 'log', 'md', 'csv', 'json', 'yml', 'yaml'])
const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'])
const FROM_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'application/pdf': 'pdf', 'text/plain': 'txt' }

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
const extOf = (file) => file.split('.').pop()

export const isImage = (file) => IMAGES.has(extOf(file))

export function saveUpload(buffer, { name = '', mime = '' } = {}) {
  const dot = name.lastIndexOf('.')
  let ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : ''
  if (!ext) ext = FROM_MIME[mime.split(';')[0].trim()] || 'bin'
  const stem = slug(dot > 0 ? name.slice(0, dot) : name)
  const file = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}${stem ? `-${stem}` : ''}.${ext}`
  mkdirSync(uploadsDir(), { recursive: true })
  writeFileSync(join(uploadsDir(), file), buffer)
  return { file, url: `/api/uploads/${file}`, size: buffer.length, image: isImage(file) }
}

// Stream + headers for a stored file, or null when it does not exist.
export function readUpload(file) {
  const safe = basename(String(file))
  if (!FILE.test(safe)) return null
  const path = join(uploadsDir(), safe)
  if (!existsSync(path)) return null
  const ext = extOf(safe)
  const download = safe.replace(/^[a-z0-9]+-[a-f0-9]{12}-?/, '') || safe
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'content-length': statSync(path).size,
    'content-disposition': `${INLINE.has(ext) ? 'inline' : 'attachment'}; filename="${download}"`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=31536000, immutable',
  }
  // Chrome refuses to render a sandboxed PDF.
  if (ext !== 'pdf') headers['content-security-policy'] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
  return { stream: createReadStream(path), headers }
}

// Every file name referenced from the Markdown stored in the database.
function referencedFiles(db) {
  const found = new Set()
  const texts = [
    ...db.prepare('SELECT body AS text FROM items').all(),
    ...db.prepare('SELECT content AS text FROM docs').all(),
    ...db.prepare('SELECT description AS text FROM milestones').all(),
  ]
  for (const { text } of texts) for (const m of String(text || '').matchAll(REFERENCE)) found.add(m[1])
  return found
}

// Deletes files no longer referenced anywhere. A grace period keeps files
// uploaded in a form that is still being edited.
export function pruneUploads(db, { now = Date.now(), graceMs = 24 * 3600e3 } = {}) {
  const dir = uploadsDir()
  if (!existsSync(dir)) return []
  const used = referencedFiles(db)
  const deleted = []
  for (const file of readdirSync(dir)) {
    if (!FILE.test(file) || used.has(file)) continue
    if (now - statSync(join(dir, file)).mtimeMs < graceMs) continue
    unlinkSync(join(dir, file))
    deleted.push(file)
  }
  return deleted
}

// Copies new uploads next to the database backups. Files are immutable, so
// copying the missing ones is enough; those gone from the source for longer
// than the backup retention are dropped.
export function mirrorUploads(dest, { now = Date.now(), keepMs = 35 * 24 * 3600e3 } = {}) {
  const dir = uploadsDir()
  if (!existsSync(dir)) return { copied: 0 }
  mkdirSync(dest, { recursive: true })
  const source = new Set(readdirSync(dir).filter((f) => FILE.test(f)))
  let copied = 0
  for (const file of source) {
    if (existsSync(join(dest, file))) continue
    copyFileSync(join(dir, file), join(dest, file))
    copied++
  }
  for (const file of readdirSync(dest)) {
    if (FILE.test(file) && !source.has(file) && now - statSync(join(dest, file)).mtimeMs > keepMs) unlinkSync(join(dest, file))
  }
  return { copied }
}

// Text sent outside Projectory (forge issue): relative attachment links would
// break there, so they become plain links to this instance, or a mention.
export function externalizeUploads(text, appUrl = '') {
  const base = appUrl.replace(/\/+$/, '')
  return String(text || '').replace(/!?\[([^\]]*)\]\((\/api\/uploads\/[A-Za-z0-9.-]+)\)/g, (_, label, path) => {
    const name = label.replace(/^📎\s*/, '') || path.split('/').pop()
    return base ? `[📎 ${name}](${base}${path})` : tr('📎 {name} (pièce jointe dans Projectory)', { name })
  })
}
