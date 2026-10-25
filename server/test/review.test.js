import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { buildReview } from '../src/review.js'

for (const key of ['GITHUB_TOKEN', 'NTFY_TOPIC', 'APP_URL', 'APP_PASSWORD']) delete process.env[key]

let app, db
before(async () => {
  db = openDb(':memory:')
  app = await buildApp({ db, logger: false })
})
const call = async (method, url, payload) => {
  const res = await app.inject({ method, url, payload })
  return { status: res.statusCode, body: res.json() }
}

test('weekly review: one section per item, decisions take items out, done hides it for a week', async () => {
  const now = new Date('2026-10-25T10:00:00Z')
  const project = (await call('POST', '/api/projects', { name: 'App' })).body
  const archived = (await call('POST', '/api/projects', { name: 'Old', status: 'archived' })).body
  const add = (title, fields, daysIdle) => {
    const id = db.prepare('INSERT INTO items (project_id, title, status, due_date, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(fields.project_id ?? project.id, title, fields.status || 'todo', fields.due_date ?? null,
        new Date(now - daysIdle * 86400e3).toISOString().replace('T', ' ').slice(0, 19)).lastInsertRowid
    return Number(id)
  }
  add('late and idle', { due_date: '2026-10-20', status: 'in_progress' }, 30)
  add('in test for ages', { status: 'testing' }, 10)
  add('in test, recent', { status: 'testing' }, 2)
  add('started, forgotten', { status: 'in_progress' }, 8)
  const stale = add('old todo', {}, 40)
  add('recent todo', {}, 5)
  add('blocked for long', { status: 'blocked' }, 25)
  add('done long ago', { status: 'done' }, 90)
  add('archived project', { project_id: archived.id }, 90)
  db.prepare("INSERT INTO milestones (project_id, version, status, due_date) VALUES (?, '1.0.0', 'planned', '2026-10-01')").run(project.id)

  let review = buildReview(db, now)
  const titles = (key) => review.sections[key].map((i) => i.title || i.version)
  assert.deepEqual(titles('overdue'), ['late and idle'])
  assert.deepEqual(titles('testing'), ['in test for ages'])
  assert.deepEqual(titles('in_progress'), ['started, forgotten'])
  assert.deepEqual(titles('stale'), ['old todo', 'blocked for long'])
  assert.deepEqual(titles('milestones'), ['1.0.0'])
  assert.equal(review.count, 6)
  assert.equal(review.sections.stale[0].idle_days, 40)
  assert.equal(review.sections.stale[0].project_name, 'App')
  assert.equal(review.due, true, 'never reviewed')

  // "Keep" touches the item: out of the review.
  await call('PUT', `/api/items/${stale}`, {})
  review = buildReview(db, new Date())
  assert.ok(!review.sections.stale.some((i) => i.id === stale))

  const after = (await call('POST', '/api/review/done')).body
  assert.equal(after.due, false)
  assert.ok(after.last_done_at)
  assert.equal(buildReview(db, new Date(Date.now() + 8 * 86400e3)).due, true, 'a week later')
})
