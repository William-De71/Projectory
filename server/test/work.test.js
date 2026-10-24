import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITEA_TOKEN', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD', 'APP_LANG']) delete process.env[key]

// Fake GitHub repository acme/lib and Discourse forum.
const gh = {
  open: [],
  pulls: {},
  checks: 'success',
  merged: [],
}
const realFetch = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const prIssue = (number, title, author) => ({ number, title, user: { login: author }, html_url: `https://github.com/acme/lib/pull/${number}`, pull_request: {}, labels: [], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const api = 'https://api.github.com/repos/acme/lib'
    if (url === api) return json({ full_name: 'acme/lib', html_url: 'https://github.com/acme/lib', default_branch: 'main' })
    if (url.startsWith(`${api}/issues?`)) return json(gh.open)
    if (url.startsWith(`${api}/pulls?`)) return json([])
    if (url.startsWith(`${api}/actions/runs`)) return json({ workflow_runs: [] })
    if (url.startsWith(`${api}/commits/`)) return json({ check_runs: [{ status: 'completed', conclusion: gh.checks }] })
    let m = url.match(/\/pulls\/(\d+)\/merge$/)
    if (m && init.method === 'PUT') {
      gh.merged.push(Number(m[1]))
      return json({ merged: true })
    }
    m = url.match(/\/pulls\/(\d+)\/reviews/)
    if (m) return json([])
    m = url.match(/\/pulls\/(\d+)$/)
    if (m) return json({ number: Number(m[1]), head: { sha: 'abc' }, mergeable: true, ...gh.pulls[m[1]] })
    if (url === 'https://forum.test/t/123/4.json') return json({ post_stream: { posts: [{ post_number: 4, username: 'alice' }] } })
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

test('checklist, links, unblocking and bulk edits', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Work', item_templates: { bug: '## Étapes' } })
  assert.deepEqual((await call('GET', `/api/projects/${p.id}`)).body.item_templates, { bug: '## Étapes' })
  const { body: a } = await call('POST', '/api/items', { project_id: p.id, title: 'A', status: 'blocked', checklist: [{ label: 'un', done: true }, { label: 'deux', done: false }] })
  const { body: b } = await call('POST', '/api/items', { project_id: p.id, title: 'B' })
  const { body: c } = await call('POST', '/api/items', { project_id: p.id, title: 'C' })
  assert.deepEqual(a.checklist, [{ label: 'un', done: true }, { label: 'deux', done: false }])

  assert.equal((await call('POST', `/api/items/${a.id}/links`, { target_id: b.id, type: 'blocked_by' })).status, 201)
  assert.equal((await call('POST', `/api/items/${a.id}/links`, { target_id: c.id, type: 'blocked_by' })).status, 201)
  assert.equal((await call('POST', `/api/items/${a.id}/links`, { target_id: a.id, type: 'blocked_by' })).status, 400)
  assert.equal((await call('POST', `/api/items/${a.id}/links`, { target_id: b.id, type: 'nope' })).status, 400)
  const links = (await call('GET', `/api/items/${b.id}/links`)).body
  assert.deepEqual(links.map((l) => [l.direction, l.type, l.item_id]), [['in', 'blocked_by', a.id]])

  const listed = () => call('GET', `/api/items?project_id=${p.id}`).then((r) => Object.fromEntries(r.body.map((it) => [it.title, it])))
  assert.equal((await listed()).A.open_blockers, 2)

  // B done: A still waits on C. C done (in bulk): A is back to "to do".
  await call('PUT', `/api/items/${b.id}`, { status: 'done' })
  assert.equal((await listed()).A.status, 'blocked')
  assert.equal((await call('POST', '/api/items/bulk', { ids: [c.id], changes: { status: 'done', title: 'ignored' } })).status, 200)
  const after = await listed()
  assert.equal(after.A.status, 'todo')
  assert.equal(after.C.title, 'C')

  assert.equal((await call('POST', '/api/items/bulk', { ids: [a.id, b.id], changes: { priority: 'high', target_version: '2.0' } })).status, 200)
  assert.deepEqual(Object.values(await listed()).filter((it) => it.priority === 'high').map((it) => it.target_version), ['2.0', '2.0'])
  assert.equal((await call('POST', '/api/items/bulk', { ids: [a.id], changes: {} })).status, 400)
  await call('POST', '/api/items/bulk', { ids: [a.id, b.id], delete: true })
  assert.deepEqual(Object.keys(await listed()), ['C'])
})

test('a merged linked PR moves the item to testing; its closed issue does not close it', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Lib', repo: 'acme/lib' })
  gh.open = [prIssue(7, 'Fix', 'me'), { number: 3, title: 'Bug', user: { login: 'bob' }, html_url: 'https://github.com/acme/lib/issues/3', labels: [], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }]
  await call('POST', `/api/projects/${p.id}/sync`)
  const { body: item } = await call('POST', '/api/items', {
    project_id: p.id, title: 'Le bug', status: 'in_progress', pr_url: 'https://github.com/acme/lib/pull/7', issue_number: 3, issue_url: 'https://github.com/acme/lib/issues/3',
  })
  const { body: other } = await call('POST', '/api/items', { project_id: p.id, title: 'Autre dépôt', pr_url: 'https://github.com/someone/else/pull/7' })

  // Still open: nothing changes.
  await call('POST', `/api/projects/${p.id}/sync`)
  assert.equal((await call('GET', `/api/items?project_id=${p.id}`)).body.find((it) => it.id === item.id).status, 'in_progress')

  // PR merged and issue closed by it.
  gh.open = []
  gh.pulls[7] = { merged: true, state: 'closed' }
  await call('POST', `/api/projects/${p.id}/sync`)
  const rows = (await call('GET', `/api/items?project_id=${p.id}`)).body
  assert.equal(rows.find((it) => it.id === item.id).status, 'testing')
  assert.equal(rows.find((it) => it.id === other.id).status, 'todo')
  const inbox = (await call('GET', '/api/inbox?unread=1&limit=100')).body
  assert.ok(inbox.some((e) => e.kind === 'pr_merged' && e.title.includes('Le bug')))

  // Next sync: the closed issue leaves the item in testing.
  await call('POST', `/api/projects/${p.id}/sync`)
  assert.equal((await call('GET', `/api/items?project_id=${p.id}`)).body.find((it) => it.id === item.id).status, 'testing')
})

test('dependency PRs: listed with their CI, merged only when green', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Deps', repo: 'acme/lib' })
  gh.open = [prIssue(20, 'Bump eslint', 'dependabot[bot]'), prIssue(21, 'Mine', 'me')]
  gh.checks = 'failure'
  await call('POST', `/api/projects/${p.id}/sync`)
  const deps = (await call('GET', '/api/dependency-prs')).body.filter((g) => g.project_id === p.id)
  assert.deepEqual(deps.map((g) => g.number), [20])
  assert.equal(deps[0].pr_state.ci, 'failure')

  const refused = await call('POST', `/api/github-items/${deps[0].id}/merge`, { only_green: true })
  assert.equal(refused.status, 409)
  assert.deepEqual(gh.merged, [])

  gh.checks = 'success'
  assert.equal((await call('POST', `/api/github-items/${deps[0].id}/merge`, { only_green: true })).status, 200)
  assert.deepEqual(gh.merged, [20])
  assert.equal((await call('GET', '/api/dependency-prs')).body.filter((g) => g.project_id === p.id).length, 0)
})

test('forum reply draft and reminder when the version ships', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Forum' })
  const { body: item } = await call('POST', '/api/items', {
    project_id: p.id, title: 'Plantage', source: 'forum', external_url: 'https://forum.test/t/plantage/123/4', target_version: '1.2.0', status: 'testing', pr_url: 'https://github.com/acme/lib/pull/9',
  })
  await call('POST', `/api/projects/${p.id}/release`, { version: '1.2.0', close_items: true })
  const reminders = (await call('GET', '/api/inbox?unread=1&limit=100')).body.filter((e) => e.kind === 'forum_reply' && e.project_id === p.id)
  assert.equal(reminders.length, 1)
  // Released again: no second reminder.
  await call('POST', `/api/projects/${p.id}/release`, { version: '1.2.0', close_items: true })
  assert.equal((await call('GET', '/api/inbox?unread=1&limit=100')).body.filter((e) => e.kind === 'forum_reply' && e.project_id === p.id).length, 1)

  const { body: draft } = await call('GET', `/api/items/${item.id}/forum-reply`)
  assert.equal(draft.username, 'alice')
  assert.match(draft.text, /^Bonjour @alice,/)
  assert.match(draft.text, /version 1\.2\.0/)
  assert.match(draft.text, /pull\/9/)
})

test('saved views and search excerpts', async () => {
  const saved = (await call('PUT', '/api/settings/views', { items: [{ name: 'Bugs urgents', filters: { kind: 'bug', priority: 'high' } }, { name: ' ' }] })).body
  assert.equal(saved.length, 1)
  assert.ok(saved[0].id)
  assert.deepEqual((await call('GET', '/api/settings/views')).body, saved)

  const { body: p } = await call('POST', '/api/projects', { name: 'Search' })
  await call('POST', '/api/items', { project_id: p.id, title: 'Long', body: `${'x '.repeat(300)}[📎 rapport-zigbee.pdf](/api/uploads/a.pdf) ${'y '.repeat(300)}` })
  const hit = (await call('GET', '/api/search?q=zigbee')).body.find((r) => r.type === 'item')
  assert.match(hit.excerpt, /^….*📎 rapport-zigbee\.pdf .*…$/)
  assert.doesNotMatch(hit.excerpt, /api\/uploads/)
  assert.ok(hit.excerpt.length < 220)
})
