import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITEA_TOKEN', 'GITEA_URL', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD', 'APP_LANG']) delete process.env[key]

const { openDb, setConfig } = await import('../src/db.js')
const { buildApp } = await import('../src/app.js')
const { isDueAlertDue, sendDueAlerts } = await import('../src/dueAlerts.js')
const { setItemStatus, unblockDependents } = await import('../src/items.js')

const ntfy = []
let ntfyFails = false
const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = async (url, init = {}) => {
    if (ntfyFails) return new Response('down', { status: 500 })
    ntfy.push(JSON.parse(init.body))
    return new Response('{}')
  }
})

const db = openDb(':memory:')
const app = await buildApp({ db, logger: false })
after(async () => { globalThis.fetch = realFetch; await app.close() })

const req = async (method, url, payload) => {
  const res = await app.inject({ method, url, payload })
  return { status: res.statusCode, body: res.headers['content-type']?.includes('json') ? res.json() : res.body }
}
const project = async (fields = {}) => (await req('POST', '/api/projects', { name: 'App', ...fields })).body
const addItem = async (project_id, fields) => (await req('POST', '/api/items', { project_id, title: 'Item', ...fields })).body
const history = async (id) => (await req('GET', `/api/items/${id}/history`)).body

// ---- Due date alerts ----

const NOW = new Date(2026, 10, 10, 9, 0, 0) // 10 Nov 2026, 09:00 local time

test('due date alerts: an item is told once when close and once when overdue', async () => {
  setConfig(db, 'ntfy', { enabled: true, server: 'https://ntfy.test', topic: 'x' })
  setConfig(db, 'due_alerts', { enabled: true, days_before: 2, hour: 8 })
  const p = await project({ name: 'Alerts' })
  const muted = await project({ name: 'Muted', notify: false })
  const late = await addItem(p.id, { title: 'Late', due_date: '2026-11-09', priority: 'high' })
  await addItem(p.id, { title: 'Soon', due_date: '2026-11-12' })
  await addItem(p.id, { title: 'Far away', due_date: '2026-11-13' })
  await addItem(p.id, { title: 'Finished', due_date: '2026-11-09', status: 'done' })
  await addItem(muted.id, { title: 'Silent', due_date: '2026-11-09' })

  ntfy.length = 0
  assert.equal((await sendDueAlerts(db, NOW)).sent, 2)
  assert.equal(ntfy.length, 1)
  assert.match(ntfy[0].message, /Late/)
  assert.match(ntfy[0].message, /Soon/)
  assert.doesNotMatch(ntfy[0].message, /Far away|Finished|Silent/)
  assert.equal(ntfy[0].priority, 4)

  // Nothing new: no second notification.
  assert.equal((await sendDueAlerts(db, NOW)).sent, 0)
  assert.equal(ntfy.length, 1)

  // "Soon" is now overdue: told again, but "Late" is not.
  ntfy.length = 0
  assert.equal((await sendDueAlerts(db, new Date(2026, 10, 13, 9))).sent, 2) // "Far away" comes into range too
  assert.match(ntfy[0].message, /Soon/)
  assert.doesNotMatch(ntfy[0].message, /Late/)

  // A new due date starts over.
  await req('PUT', `/api/items/${late.id}`, { due_date: '2026-11-14' })
  ntfy.length = 0
  assert.equal((await sendDueAlerts(db, new Date(2026, 10, 13, 10))).sent, 1)
  assert.match(ntfy[0].message, /Late/)
})

test('due date alerts: a failed send is retried', async () => {
  const p = await project({ name: 'Retry' })
  await addItem(p.id, { title: 'Retry me', due_date: '2026-12-01' })
  const day = new Date(2026, 11, 2, 9)
  ntfyFails = true
  await assert.rejects(sendDueAlerts(db, day))
  ntfyFails = false
  ntfy.length = 0
  await sendDueAlerts(db, day)
  assert.match(ntfy[0].message, /Retry me/)
})

test('due date alerts: scheduling and settings', async () => {
  const config = { enabled: true, hour: 8, last_run_date: null }
  assert.equal(isDueAlertDue({ ...config, enabled: false }, NOW), false)
  assert.equal(isDueAlertDue(config, new Date(2026, 10, 10, 7, 59)), false)
  assert.equal(isDueAlertDue(config, NOW), true)
  assert.equal(isDueAlertDue({ ...config, last_run_date: '2026-11-10' }, NOW), false)
  assert.equal(isDueAlertDue({ ...config, last_run_date: '2026-11-09' }, NOW), true)

  const { body } = await req('PUT', '/api/settings/due-alerts', { enabled: false, days_before: 5, hour: 99 })
  assert.equal(body.enabled, false)
  assert.equal(body.days_before, 5)
  assert.equal(body.hour, 8) // out of range: unchanged
  assert.equal(typeof body.pending, 'number')
})

// ---- History ----

test('history: only real changes are logged, with what made them', async () => {
  const p = await project({ name: 'History' })
  const item = await addItem(p.id, { title: 'Tracked', due_date: null, target_version: '' })
  assert.deepEqual(await history(item.id), [])

  // The form sends every field: only what changed is logged ("Keep" sends nothing).
  await req('PUT', `/api/items/${item.id}`, { title: 'Tracked', status: 'in_progress', priority: 'normal', due_date: null, target_version: '', body: 'text' })
  await req('PUT', `/api/items/${item.id}`, {})
  let events = await history(item.id)
  assert.equal(events.length, 1)
  assert.deepEqual([events[0].field, events[0].old_value, events[0].new_value, events[0].source], ['status', 'todo', 'in_progress', 'user'])

  await req('POST', '/api/items/bulk', { ids: [item.id], changes: { priority: 'high' } })
  setItemStatus(db, item.id, 'testing', 'sync')
  events = await history(item.id)
  assert.deepEqual(events.map((e) => [e.field, e.new_value, e.source]), [['status', 'testing', 'sync'], ['priority', 'high', 'user'], ['status', 'in_progress', 'user']])

  // Goes away with the item.
  await req('DELETE', `/api/items/${item.id}`)
  assert.deepEqual(await history(item.id), [])
})

test('history: unblocking, closing with a release and renaming a version', async () => {
  const p = await project({ name: 'Auto' })
  const blocker = await addItem(p.id, { title: 'Blocker' })
  const waiting = await addItem(p.id, { title: 'Waiting', status: 'blocked' })
  await req('POST', `/api/items/${waiting.id}/links`, { target_id: blocker.id, type: 'blocked_by' })
  await req('PUT', `/api/items/${blocker.id}`, { status: 'done' })
  unblockDependents(db, blocker.id)
  assert.deepEqual((await history(waiting.id)).map((e) => [e.new_value, e.source]), [['todo', 'dependency']])

  const { body: milestone } = await req('POST', '/api/milestones', { project_id: p.id, version: '1.0.0' })
  const shipped = await addItem(p.id, { title: 'Shipped', status: 'testing', target_version: '1.0.0' })
  await req('PUT', `/api/milestones/${milestone.id}`, { version: '1.1.0' })
  assert.deepEqual((await history(shipped.id)).map((e) => [e.field, e.old_value, e.new_value, e.source]), [['target_version', '1.0.0', '1.1.0', 'release']])

  await req('POST', `/api/projects/${p.id}/release`, { version: '1.1.0', close_items: true })
  assert.deepEqual((await history(shipped.id))[0].new_value, 'done')
  assert.deepEqual((await history(shipped.id))[0].source, 'release')
})

// ---- Time on items ----

test('time on an item: totals, project, move and deletion', async () => {
  const p = await project({ name: 'Time' })
  const other = await project({ name: 'Other' })
  const item = await addItem(p.id, { title: 'Timed', estimate_minutes: 120 })
  assert.equal(item.estimate_minutes, 120)

  // The project comes from the item, whatever the request says.
  const { status, body: entry } = await req('POST', '/api/time', { item_id: item.id, project_id: other.id, date: '2026-11-01', minutes: 90, note: 'Work' })
  assert.equal(status, 201)
  assert.equal(entry.project_id, p.id)
  await req('POST', '/api/time', { item_id: item.id, date: '2026-11-02', minutes: 45 })
  await req('POST', '/api/time', { project_id: p.id, date: '2026-11-02', minutes: 30 })
  assert.equal((await req('POST', '/api/time', { item_id: 99999, date: '2026-11-02', minutes: 30 })).status, 404)

  const list = (await req('GET', `/api/items?project_id=${p.id}`)).body
  assert.equal(list[0].spent_minutes, 135)
  assert.equal((await req('GET', `/api/items/${item.id}`)).body.spent_minutes, 135)

  const entries = (await req('GET', `/api/time?item_id=${item.id}`)).body
  assert.equal(entries.length, 2)
  assert.equal(entries[0].item_title, 'Timed')

  // Moving the item takes its time along; the entry without item stays.
  await req('PUT', `/api/items/${item.id}`, { project_id: other.id })
  assert.equal((await req('GET', `/api/time?project_id=${other.id}`)).body.length, 2)
  assert.equal((await req('GET', `/api/time?project_id=${p.id}`)).body.length, 1)

  // Deleting the item keeps the time on the project (it may be billed).
  await req('DELETE', `/api/items/${item.id}`)
  const kept = (await req('GET', `/api/time?project_id=${other.id}`)).body
  assert.equal(kept.length, 2)
  assert.equal(kept[0].item_id, null)
  assert.equal(kept[0].item_title, null)
})

test('the export holds the history', async () => {
  const { body } = await req('GET', '/api/export')
  assert.ok(Array.isArray(body.item_events))
})
