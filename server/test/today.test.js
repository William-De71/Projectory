import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, utimesSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITEA_TOKEN', 'GITEA_URL', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD', 'APP_LANG']) delete process.env[key]
const TMP = mkdtempSync(join(tmpdir(), 'projectory-uploads-'))
process.env.UPLOADS_DIR = join(TMP, 'uploads')
process.env.BACKUP_DIR = join(TMP, 'backups')

const { openDb } = await import('../src/db.js')
const { buildApp } = await import('../src/app.js')
const { pruneUploads } = await import('../src/uploads.js')
const { createBackup } = await import('../src/backup.js')

const db = openDb(':memory:')
const app = await buildApp({ db, logger: false })
after(async () => { await app.close(); rmSync(TMP, { recursive: true, force: true }) })

const req = async (method, url, payload, headers) => {
  const res = await app.inject({ method, url, payload, headers })
  return { status: res.statusCode, body: res.headers['content-type']?.includes('json') ? res.json() : res.body, headers: res.headers, raw: res.rawPayload }
}

test('today view: focus, due, suggestions, reviews and time', async () => {
  const { body: p } = await req('POST', '/api/projects', { name: 'App' })
  const add = async (fields) => (await req('POST', '/api/items', { project_id: p.id, title: fields.title, ...fields })).body
  const picked = await add({ title: 'Picked today', focus_date: '2026-10-19' })
  const carried = await add({ title: 'Carried over', focus_date: '2026-10-17', priority: 'high' })
  await add({ title: 'Done yesterday', focus_date: '2026-10-18', status: 'done' })
  const doneToday = await add({ title: 'Done today', focus_date: '2026-10-19', status: 'done' })
  await add({ title: 'Overdue', due_date: '2026-10-10' })
  await add({ title: 'Due later', due_date: '2026-11-10' })
  await add({ title: 'Urgent', priority: 'critical' })
  await add({ title: 'Started', status: 'in_progress' })
  await add({ title: 'Plain' })
  db.prepare("INSERT INTO inbox (source, kind, title, external_key, reason) VALUES ('github', 'gh_notification', 'Review me', 'k1', 'review_requested'), ('github', 'gh_notification', 'Mention', 'k2', 'mention')").run()
  await req('POST', '/api/time', { project_id: p.id, date: '2026-10-19', minutes: 45 })

  const { status, body } = await req('GET', '/api/today?date=2026-10-19')
  assert.equal(status, 200)
  assert.equal(body.date, '2026-10-19')
  // Open items first (critical/high before normal), finished item of the day last.
  assert.deepEqual(body.focus.map((i) => i.title), ['Carried over', 'Picked today', 'Done today'])
  assert.deepEqual(body.due.map((i) => i.title), ['Overdue'])
  assert.deepEqual(body.suggestions.map((i) => i.title), ['Started', 'Urgent'])
  assert.deepEqual(body.reviews.map((r) => r.title), ['Review me'])
  assert.equal(body.minutes, 45)
  assert.deepEqual(body.ci_failing, [])

  // Removing an item from the day.
  await req('PUT', `/api/items/${picked.id}`, { focus_date: null })
  const after = (await req('GET', '/api/today?date=2026-10-19')).body
  assert.deepEqual(after.focus.map((i) => i.id), [carried.id, doneToday.id])
})

test('uploads: store, serve safely, prune orphans and copy into backups', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const { status, body } = await req('POST', '/api/uploads?name=Capture%20d%E2%80%99%C3%A9cran.PNG', png, { 'content-type': 'image/png' })
  assert.equal(status, 201)
  assert.match(body.file, /^[a-z0-9]+-[a-f0-9]{12}-capture-d-ecran\.png$/)
  assert.equal(body.url, `/api/uploads/${body.file}`)
  assert.equal(body.image, true)

  const got = await req('GET', body.url)
  assert.equal(got.status, 200)
  assert.equal(got.headers['content-type'], 'image/png')
  assert.equal(got.headers['x-content-type-options'], 'nosniff')
  assert.match(got.headers['content-disposition'], /^inline; filename="capture-d-ecran\.png"/)
  assert.ok(got.raw.equals(png))

  // JSON bodies are stored as files too, not parsed; SVG is always downloaded.
  const json = (await req('POST', '/api/uploads?name=config.json', '{"a":1}', { 'content-type': 'application/json' })).body
  assert.match(json.file, /-config\.json$/)
  const svg = (await req('POST', '/api/uploads?name=logo.svg', '<svg/>', { 'content-type': 'image/svg+xml' })).body
  assert.match((await req('GET', svg.url)).headers['content-disposition'], /^attachment/)
  const noName = (await req('POST', '/api/uploads', png, { 'content-type': 'image/png' })).body
  assert.match(noName.file, /^[a-z0-9]+-[a-f0-9]{12}\.png$/)

  assert.equal((await req('POST', '/api/uploads?name=x.txt', '', { 'content-type': 'text/plain' })).status, 400)
  assert.equal((await req('GET', '/api/uploads/..%2Fprojectory.db')).status, 404)
  assert.equal((await req('GET', '/api/uploads/nope.png')).status, 404)

  // Only the PNG is referenced; the others become orphans once the grace period is over.
  const { body: p } = await req('POST', '/api/projects', { name: 'Uploads' })
  await req('POST', '/api/items', { project_id: p.id, title: 'With screenshot', body: `Voir ![capture](${body.url})` })
  assert.deepEqual(pruneUploads(db), [], 'recent files are kept')
  const old = new Date(Date.now() - 2 * 864e5)
  for (const f of readdirSync(process.env.UPLOADS_DIR)) utimesSync(join(process.env.UPLOADS_DIR, f), old, old)
  assert.deepEqual(pruneUploads(db).sort(), [json.file, svg.file, noName.file].sort())
  assert.deepEqual(readdirSync(process.env.UPLOADS_DIR), [body.file])

  createBackup(db)
  assert.ok(existsSync(join(process.env.BACKUP_DIR, 'uploads', body.file)))
})

test('attachment links are made absolute (or mentioned) for forge issues', async () => {
  const { externalizeUploads } = await import('../src/uploads.js')
  const text = 'Voir ![capture.png](/api/uploads/abc-0123456789ab-capture.png) et [📎 log.txt](/api/uploads/abc-0123456789ab-log.txt)'
  assert.equal(
    externalizeUploads(text, 'http://nas:3001/'),
    'Voir [📎 capture.png](http://nas:3001/api/uploads/abc-0123456789ab-capture.png) et [📎 log.txt](http://nas:3001/api/uploads/abc-0123456789ab-log.txt)'
  )
  assert.equal(externalizeUploads(text), 'Voir 📎 capture.png (pièce jointe dans Projectory) et 📎 log.txt (pièce jointe dans Projectory)')
})
