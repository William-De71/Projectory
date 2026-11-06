import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'NTFY_TOPIC', 'APP_PASSWORD', 'APP_VERSION', 'UPDATER_TOKEN', 'UPDATER_URL', 'IMAGE_TAG']) delete process.env[key]

let app
let projectId
const call = async (method, url, payload) => {
  const res = await app.inject({ method, url, payload })
  return { status: res.statusCode, body: res.json() }
}
const texts = (rows) => rows.map((r) => r.text)

before(async () => {
  app = await buildApp({ db: openDb(':memory:'), logger: false })
  projectId = (await call('POST', '/api/projects', { name: 'Démo' })).body.id
})

test('a to-do goes to the general list or to a project list', async () => {
  const general = await call('POST', '/api/todos', { text: '  Acheter un domaine  ' })
  assert.equal(general.status, 201)
  assert.equal(general.body.text, 'Acheter un domaine')
  assert.equal(general.body.project_id, null)
  await call('POST', '/api/todos', { text: 'Relire le README', project_id: projectId })

  assert.deepEqual(texts((await call('GET', '/api/todos?project_id=none')).body), ['Acheter un domaine'])
  assert.deepEqual(texts((await call('GET', `/api/todos?project_id=${projectId}`)).body), ['Relire le README'])
  const all = (await call('GET', '/api/todos')).body
  assert.equal(all.length, 2)
  assert.equal(all.find((r) => r.project_id).project_name, 'Démo')
})

test('an empty text, an unknown project or an unknown list is refused', async () => {
  assert.equal((await call('POST', '/api/todos', { text: '   ' })).status, 400)
  assert.equal((await call('POST', '/api/todos', { text: 'x', project_id: 9999 })).status, 404)
  assert.equal((await call('GET', '/api/todos?project_id=abc')).status, 400)
  assert.equal((await call('PUT', '/api/todos/9999', { done: true })).status, 404)
  assert.equal((await call('DELETE', '/api/todos/9999')).status, 404)
})

test('done goes below the open ones, and can be undone or reworded', async () => {
  const project = (await call('POST', '/api/projects', { name: 'Ordre' })).body.id
  const add = async (text) => (await call('POST', '/api/todos', { text, project_id: project })).body.id
  const a = await add('A')
  await add('B')
  await add('C')
  const list = async () => texts((await call('GET', `/api/todos?project_id=${project}`)).body)

  const done = await call('PUT', `/api/todos/${a}`, { done: true })
  assert.ok(done.body.done_at)
  assert.deepEqual(await list(), ['B', 'C', 'A'])

  const reopened = await call('PUT', `/api/todos/${a}`, { done: false, text: 'A bis' })
  assert.equal(reopened.body.done_at, null)
  assert.deepEqual(await list(), ['A bis', 'B', 'C'])
  assert.equal((await call('PUT', `/api/todos/${a}`, { text: ' ' })).status, 400)
  assert.equal((await call('DELETE', `/api/todos/${a}`)).status, 200)
  assert.deepEqual(await list(), ['B', 'C'])
})

test('clearing the done ones only touches that list', async () => {
  const other = (await call('POST', '/api/projects', { name: 'Autre' })).body.id
  const add = async (project_id) => {
    const { id } = (await call('POST', '/api/todos', { text: 'fini', project_id })).body
    await call('PUT', `/api/todos/${id}`, { done: true })
  }
  await add(other)
  await add(null)
  const openOne = (await call('POST', '/api/todos', { text: 'reste', project_id: other })).body.id

  assert.equal((await call('DELETE', '/api/todos/done')).status, 400)
  assert.equal((await call('DELETE', `/api/todos/done?project_id=${other}`)).body.deleted, 1)
  assert.deepEqual((await call('GET', `/api/todos?project_id=${other}`)).body.map((r) => r.id), [openOne])
  assert.ok(texts((await call('GET', '/api/todos?project_id=none')).body).includes('fini'))
  assert.equal((await call('DELETE', '/api/todos/done?project_id=none')).body.deleted, 1)
})

test('deleting a project deletes its list, not the general one', async () => {
  const gone = (await call('POST', '/api/projects', { name: 'Éphémère' })).body.id
  await call('POST', '/api/todos', { text: 'disparaît', project_id: gone })
  await call('DELETE', `/api/projects/${gone}`)
  const all = texts((await call('GET', '/api/todos')).body)
  assert.ok(!all.includes('disparaît'))
  assert.ok(all.includes('Acheter un domaine'))
})
