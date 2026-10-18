import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

// Fake GitHub (repos, issues, Actions) and ntfy server.
const state = { issues: [], runs: [], ntfy: [] }
// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD']) delete process.env[key]

const realFetch = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const run = (id, name, conclusion, workflow_id = 1) => ({ id, name, workflow_id, status: 'completed', conclusion, html_url: `https://gh/run/${id}`, updated_at: '2026-10-01T00:00:00Z', head_sha: 'abcdef123456' })

before(() => {
  globalThis.fetch = async (url, init) => {
    url = String(url)
    if (url.startsWith('https://ntfy.test')) {
      state.ntfy.push({ url, auth: init.headers.Authorization, ...JSON.parse(init.body) })
      return new Response('{}')
    }
    if (url.includes('/users/will/repos')) {
      return json([
        { full_name: 'will/gladys-foo', name: 'gladys-foo', description: 'Foo', topics: ['gladys'], fork: false, archived: false },
        { full_name: 'will/old', name: 'old', description: '', topics: [], fork: false, archived: true },
      ])
    }
    const m = url.match(/\/repos\/will\/([^/?]+)(.*)$/)
    if (m) {
      const rest = m[2]
      if (rest === '') return json({ full_name: `will/${m[1]}`, default_branch: 'main', stargazers_count: 1 })
      if (rest.startsWith('/issues')) return json(m[1] === 'gladys-foo' ? state.issues : [])
      if (rest.startsWith('/actions/runs')) {
        assert.match(rest, /branch=main/)
        return json({ workflow_runs: m[1] === 'gladys-foo' ? state.runs : [] })
      }
      if (rest.startsWith('/releases/latest')) return json({ tag_name: 'v1.0.0', html_url: 'x' })
    }
    return new Response('not found', { status: 404 })
  }
})
after(() => { globalThis.fetch = realFetch })

let app
before(async () => { app = await buildApp({ db: openDb(':memory:'), logger: false }) })
const call = async (method, url, payload) => {
  const res = await app.inject({ method, url, payload })
  return { status: res.statusCode, body: res.json() }
}

test('lists and imports GitHub repositories, skipping tracked ones', async () => {
  const list = (await call('GET', '/api/forges/repos?owner=will')).body
  assert.equal(list.repos.length, 2)
  assert.equal(list.repos[0].tracked, false)

  const res = (await call('POST', '/api/forges/import', { repos: list.repos, category_id: 3, extra_tags: ['perso'], sync: false })).body
  assert.deepEqual([res.created, res.skipped], [2, 0])
  const again = (await call('POST', '/api/forges/import', { repos: list.repos, sync: false })).body
  assert.deepEqual([again.created, again.skipped], [0, 2])

  const projects = (await call('GET', '/api/projects?status=archived')).body
  assert.equal(projects[0].name, 'old')
  const [foo] = (await call('GET', '/api/projects?q=gladys-foo')).body
  assert.deepEqual(foo.tags, ['gladys', 'perso'])
  assert.deepEqual(foo.version_sources, [{ type: 'repo', ref: '' }])
  assert.equal(foo.notify, true)
  assert.equal((await call('GET', '/api/forges/repos?owner=will')).body.repos[0].tracked, true)
})

test('ntfy settings keep the token write-only', async () => {
  let cfg = (await call('PUT', '/api/settings/ntfy', { enabled: true, server: 'https://ntfy.test', topic: 'projets', token: 'tk_secret', app_url: 'http://deck.lan' })).body
  assert.equal(cfg.token_set, true)
  assert.equal(cfg.token, undefined)
  cfg = (await call('PUT', '/api/settings/ntfy', { topic: 'projets', token: '' })).body
  assert.equal(cfg.token_set, true)
  assert.equal((await call('POST', '/api/settings/ntfy/test')).status, 200)
  assert.equal(state.ntfy.at(-1).auth, 'Bearer tk_secret')
  assert.equal(state.ntfy.at(-1).topic, 'projets')
})

test('CI transitions and new issues are notified, first sync is silent', async () => {
  const [foo] = (await call('GET', '/api/projects?q=gladys-foo')).body
  state.ntfy.length = 0
  state.runs = [run(10, 'Tests', 'success'), run(9, 'Tests', 'failure'), run(8, 'Lint', 'success', 2)]
  let res = (await call('POST', `/api/projects/${foo.id}/sync`)).body
  assert.deepEqual(res.errors, [])
  assert.equal(res.project.ci, 'success')
  assert.equal(state.ntfy.length, 0, 'baseline sync must not notify')

  // CI breaks + one new issue -> two individual notifications.
  state.runs = [run(11, 'Tests', 'failure'), ...state.runs]
  state.issues = [{ number: 5, title: 'Crash', html_url: 'https://gh/5', user: { login: 'bob' }, labels: [], created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' }]
  res = (await call('POST', `/api/projects/${foo.id}/sync`)).body
  assert.equal(res.project.ci, 'failure')
  assert.deepEqual(state.ntfy.map((n) => n.title).sort(), ['gladys-foo — CI en échec', 'gladys-foo — Nouvelle issue'])
  assert.equal(state.ntfy.find((n) => n.title.includes('CI')).priority, 4)
  assert.equal(state.ntfy.find((n) => n.title.includes('CI')).click, 'https://gh/run/11')

  const dash = (await call('GET', '/api/dashboard')).body
  assert.equal(dash.stats.ci_failing, 1)
  assert.equal(dash.ci_failing[0].run.name, 'Tests')

  // Same failure on the next sync: no new notification.
  state.ntfy.length = 0
  await call('POST', `/api/projects/${foo.id}/sync`)
  assert.equal(state.ntfy.length, 0)

  // Fixed -> notified; muted project -> silent.
  state.runs = [run(12, 'Tests', 'success'), ...state.runs]
  await call('POST', `/api/projects/${foo.id}/sync`)
  assert.deepEqual(state.ntfy.map((n) => n.title), ['gladys-foo — CI réparée'])

  await call('PUT', `/api/projects/${foo.id}`, { notify: false })
  state.ntfy.length = 0
  state.issues.push({ ...state.issues[0], number: 6, title: 'Autre' })
  await call('POST', `/api/projects/${foo.id}/sync`)
  assert.equal(state.ntfy.length, 0)
  assert.equal((await call('GET', `/api/inbox?project_id=${foo.id}&unread=1`)).body.length, 4)
})

test('many entries are grouped into one notification, filtered by event type', async () => {
  const [foo] = (await call('GET', '/api/projects?q=gladys-foo')).body
  await call('PUT', `/api/projects/${foo.id}`, { notify: true })
  await call('PUT', '/api/settings/ntfy', { events: ['issue', 'ci_failed'] })
  state.ntfy.length = 0
  for (let n = 10; n < 15; n++) state.issues.push({ ...state.issues[0], number: n, title: `Bug ${n}` })
  state.issues.push({ ...state.issues[0], number: 20, title: 'PR', pull_request: {} })
  await call('POST', `/api/projects/${foo.id}/sync`)
  assert.equal(state.ntfy.length, 1)
  assert.equal(state.ntfy[0].title, 'gladys-foo : 5 nouveautés')
  assert.equal(state.ntfy[0].click, `http://deck.lan/projects/${foo.id}/inbox`)
  assert.doesNotMatch(state.ntfy[0].message, /PR/)
})
