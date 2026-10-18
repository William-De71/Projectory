import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITEA_TOKEN', 'GITEA_URL', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD', 'APP_LANG']) delete process.env[key]
const BACKUPS = mkdtempSync(join(tmpdir(), 'projectory-backups-'))
process.env.BACKUP_DIR = BACKUPS

const { openDb } = await import('../src/db.js')
const { buildApp } = await import('../src/app.js')
const { isDigestDue, lastSlot } = await import('../src/insights.js')
const { aggregate } = await import('../src/stats.js')
const { isBackupDue, rotateBackups } = await import('../src/backup.js')

const DAY = 864e5
const ago = (d) => new Date(Date.now() - d * DAY).toISOString()
const ntfy = []
const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const json = (b) => new Response(JSON.stringify(b))
    if (url.startsWith('https://ntfy.test')) { ntfy.push(JSON.parse(init.body)); return json({}) }
    if (url === 'https://api.github.com/repos/me/app') return json({ full_name: 'me/app', default_branch: 'main' })
    if (url.startsWith('https://api.github.com/repos/me/app/issues?state=open')) return json([
      { number: 1, title: 'Old question', html_url: 'u1', user: { login: 'a' }, labels: [], comments: 0, created_at: ago(20), updated_at: ago(20) },
      { number: 2, title: 'Answered', html_url: 'u2', user: { login: 'b' }, labels: [], comments: 3, created_at: ago(20), updated_at: ago(1) },
      { number: 3, title: 'Fresh', html_url: 'u3', user: { login: 'c' }, labels: [], comments: 0, created_at: ago(1), updated_at: ago(1) },
      { number: 4, title: 'Waiting PR', pull_request: {}, html_url: 'u4', user: { login: 'd' }, labels: [], comments: 1, created_at: ago(30), updated_at: ago(9) },
      { number: 5, title: 'Draft PR', pull_request: {}, draft: true, html_url: 'u5', user: { login: 'e' }, labels: [], comments: 0, created_at: ago(30), updated_at: ago(9) },
    ])
    if (url.startsWith('https://api.github.com/repos/me/app/commits?')) return json([{ commit: { author: { date: ago(2) } } }, { commit: { author: { date: ago(3) } } }, { commit: { author: { date: ago(40) } } }])
    if (url.startsWith('https://api.github.com/repos/me/app/issues?state=all')) return json([
      { created_at: ago(10), closed_at: ago(6) },
      { created_at: ago(20), closed_at: ago(10) },
      { created_at: ago(5), closed_at: null },
      { pull_request: {}, created_at: ago(4), closed_at: ago(3) },
    ])
    return new Response('not found', { status: 404 })
  }
})
after(() => { globalThis.fetch = realFetch; rmSync(BACKUPS, { recursive: true, force: true }) })

let app, db
before(async () => { db = openDb(':memory:'); app = await buildApp({ db, logger: false }) })
const call = async (method, url, payload) => {
  const res = await app.inject({ method, url, payload })
  return { status: res.statusCode, body: res.headers['content-type']?.includes('json') ? res.json() : res.body, headers: res.headers }
}

test('stale issues and PRs', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'App', repo: 'me/app' })
  await call('POST', `/api/projects/${p.id}/sync`)
  const stale = (await call('GET', '/api/stale')).body
  assert.deepEqual(stale.items.map((s) => [s.number, s.reason]), [[1, 'no_reply'], [4, 'waiting']])
  assert.equal(stale.items[0].age_days, 20)
  await call('PUT', '/api/settings/stale', { issue_days: 30, pr_days: 2 })
  assert.deepEqual((await call('GET', '/api/stale')).body.items.map((s) => s.number), [4])
  await call('PUT', '/api/settings/stale', { issue_days: 7, pr_days: 5 })
  assert.equal((await call('GET', '/api/dashboard')).body.stats.stale, 2)
})

test('weekly digest: schedule, content, sending', async () => {
  // Monday 08:00 slot
  const wed = new Date(2026, 9, 21, 10, 0) // Wed 21 Oct 2026
  assert.equal(lastSlot(wed, 1, 8).toString(), new Date(2026, 9, 19, 8, 0).toString())
  const mon7 = new Date(2026, 9, 19, 7, 59)
  assert.equal(lastSlot(mon7, 1, 8).toString(), new Date(2026, 9, 12, 8, 0).toString())
  assert.equal(isDigestDue({ enabled: true, day: 1, hour: 8, last_sent_at: new Date(2026, 9, 18).toISOString() }, wed), true)
  assert.equal(isDigestDue({ enabled: true, day: 1, hour: 8, last_sent_at: new Date(2026, 9, 19, 8, 1).toISOString() }, wed), false)
  assert.equal(isDigestDue({ enabled: false, day: 1, hour: 8 }, wed), false)

  const [p] = (await call('GET', '/api/projects')).body
  await call('POST', '/api/items', { project_id: p.id, title: 'Crash critique', kind: 'bug', priority: 'critical' })
  const { body: d } = await call('PUT', '/api/settings/digest', { enabled: true, day: 1, hour: 8 })
  assert.ok(d.last_sent_at, 'enabling does not fire for a past slot')
  assert.match(d.preview.message, /⏳ PR en attente \(1\)\n  • App #4 Waiting PR — 9 j/)
  assert.match(d.preview.message, /💬 Issues sans réponse \(1\)/)
  assert.match(d.preview.message, /🐛 Prioritaires \(1\)\n  • App : Crash critique/)

  assert.equal((await call('POST', '/api/digest/send')).status, 400, 'ntfy not configured')
  await call('PUT', '/api/settings/ntfy', { enabled: true, server: 'https://ntfy.test', topic: 't' })
  assert.equal((await call('POST', '/api/digest/send')).status, 200)
  assert.equal(ntfy.at(-1).title, 'Projectory — résumé de la semaine')
})

test('calendar feed requires its token and lists due items and versions', async () => {
  const [p] = (await call('GET', '/api/projects')).body
  await call('POST', '/api/items', { project_id: p.id, title: 'Livrer, enfin; la v2', due_date: '2026-11-03' })
  await call('POST', '/api/milestones', { project_id: p.id, version: '2.0.0', title: 'Grosse version avec un titre vraiment très long pour vérifier le pliage des lignes', due_date: '2026-11-20' })
  const { path } = (await call('GET', '/api/settings/calendar')).body
  assert.match(path, /^\/api\/calendar\.ics\?token=[\w-]{20,}$/)
  assert.equal((await call('GET', '/api/calendar.ics?token=nope')).status, 403)

  process.env.APP_PASSWORD = 'secret' // calendar route bypasses basic auth
  const authApp = await buildApp({ db, logger: false })
  const res = await authApp.inject({ url: path })
  delete process.env.APP_PASSWORD
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /text\/calendar/)
  const ics = res.body
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/)
  assert.ok(ics.includes('SUMMARY:[App] Livrer\\, enfin\\; la v2\r\n'), 'commas and semicolons escaped')
  assert.match(ics, /DESCRIPTION:Échéance — priorité normale/)
  assert.match(ics, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104/)
  assert.match(ics, /UID:milestone-\d+@projectory/)
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines folded at 75 octets')
  const regenerated = (await call('POST', '/api/settings/calendar/regenerate')).body.path
  assert.notEqual(regenerated, path)
  assert.equal((await call('GET', path)).status, 403)
})

test('backups: snapshot, listing, download, rotation, schedule', async () => {
  const res = (await call('POST', '/api/backups')).body
  assert.match(res.name, /^projectory-\d{4}-\d{2}-\d{2}\.db$/)
  assert.ok(res.size > 0)
  assert.equal((await call('GET', `/api/backups/${res.name}`)).status, 200)
  assert.equal((await call('GET', '/api/backups/..%2Fprojectory.db')).status, 404)

  // Two months of fake backups: keep the 7 newest + the newest of 4 earlier weeks.
  for (const f of readdirSync(BACKUPS)) rmSync(join(BACKUPS, f))
  for (let d = new Date(2026, 7, 1); d <= new Date(2026, 8, 30); d.setDate(d.getDate() + 1)) {
    writeFileSync(join(BACKUPS, `projectory-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.db`), 'x')
  }
  const deleted = rotateBackups({ keep_daily: 7, keep_weekly: 4 })
  const kept = readdirSync(BACKUPS).sort().map((f) => f.slice(11, 21))
  assert.deepEqual(kept, ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'])
  assert.equal(deleted.length, 61 - 11)
  await call('POST', '/api/backups')
  assert.equal(isBackupDue(db, new Date()), false, 'already backed up today')
  await call('PUT', '/api/settings/backup', { enabled: false })
  assert.equal((await call('GET', '/api/backups')).body.enabled, false)
})

test('stats aggregate forge activity and local data per week', async () => {
  const [p] = (await call('GET', '/api/projects')).body
  await call('POST', '/api/time', { project_id: p.id, date: new Date().toISOString().slice(0, 10), minutes: 90 })
  const { body } = await call('GET', `/api/projects/${p.id}/stats?months=3`)
  assert.equal(body.has_repo, true)
  assert.equal(body.error, null)
  assert.equal(body.totals.commits, 3)
  assert.equal(body.totals.issues_opened, 3)
  assert.equal(body.totals.issues_closed, 2)
  assert.equal(body.totals.prs_closed, 1)
  assert.equal(body.totals.issue_resolution_days, 7)
  assert.equal(body.totals.minutes, 90)
  assert.ok(body.weeks.length >= 13 && body.weeks.length <= 15)
  assert.equal(body.weeks.reduce((s, w) => s + w.commits, 0), 3)

  const agg = aggregate({ activity: null, timeEntries: [], items: [{ status: 'done', created_at: '2026-10-01 10:00:00', updated_at: '2026-10-02 10:00:00' }], since: new Date('2026-09-28T00:00:00Z'), now: new Date('2026-10-05T00:00:00Z') })
  assert.deepEqual(agg.weeks.map((w) => [w.week, w.items_created, w.items_done]), [['2026-09-28', 1, 1], ['2026-10-05', 0, 0]])
})
