import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { normalizeRepo } from '../src/sync/forges/index.js'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITEA_TOKEN', 'GITEA_URL', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD']) delete process.env[key]

// Fake GitLab (gitlab.test), Gitea (git.home.test), GitHub and ntfy.
const calls = []
const state = { ghIssues: [], notifications: [], ntfy: [] }
const realFetch = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body && JSON.parse(init.body) })
    if (url.startsWith('https://ntfy.test')) { state.ntfy.push(JSON.parse(init.body)); return json({}) }

    // GitLab: project "grp/sub/app"
    const gl = 'https://gitlab.test/api/v4/projects/grp%2Fsub%2Fapp'
    if (url === gl) return json({ path_with_namespace: 'grp/sub/app', path: 'app', web_url: 'https://gitlab.test/grp/sub/app', default_branch: 'main', star_count: 2 })
    if (url.startsWith(`${gl}/issues?`)) return json([{ iid: 3, title: 'GL bug', author: { username: 'ann' }, web_url: 'https://gitlab.test/i/3', labels: ['bug'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }])
    if (url.startsWith(`${gl}/merge_requests?`)) return json([{ iid: 7, title: 'GL MR', draft: true, author: { username: 'bob' }, web_url: 'https://gitlab.test/mr/7', labels: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }])
    if (url.startsWith(`${gl}/pipelines?ref=main`)) return json([{ id: 99, status: 'failed', web_url: 'https://gitlab.test/p/99', sha: 'deadbeef00', updated_at: '2026-01-01T00:00:00Z' }])
    if (url.startsWith(`${gl}/releases`) && init.method !== 'POST') return json([{ tag_name: 'v2.0.0', released_at: '2026-01-01T00:00:00Z', _links: { self: 'https://gitlab.test/rel' } }])
    if (url === `${gl}/issues` && init.method === 'POST') return json({ iid: 4, web_url: 'https://gitlab.test/i/4' })
    if (url === `${gl}/releases` && init.method === 'POST') return json({ _links: { self: `https://gitlab.test/rel/${JSON.parse(init.body).tag_name}` } }, 201)

    // Gitea: repo "me/tool"
    const gt = 'https://git.home.test/api/v1/repos/me/tool'
    if (url === gt) return json({ full_name: 'me/tool', name: 'tool', html_url: 'https://git.home.test/me/tool', default_branch: 'dev', stars_count: 1 })
    if (url.startsWith(`${gt}/issues?`)) return json([
      { number: 1, title: 'Gitea issue', user: { login: 'x' }, html_url: 'https://git.home.test/me/tool/issues/1', labels: [{ name: 'bug', color: 'ee0701' }], comments: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { number: 2, title: 'Gitea PR', pull_request: { draft: false }, user: { login: 'y' }, html_url: 'https://git.home.test/me/tool/pulls/2', labels: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ])
    if (url === `${gt}/commits/dev/status`) return json({ sha: 'cafe1234567', statuses: [
      { id: 1, context: 'ci/woodpecker', status: 'failure', target_url: 'https://ci/1', updated_at: '2026-01-01T00:00:00Z' },
      { id: 2, context: 'ci/woodpecker', status: 'success', target_url: 'https://ci/2', updated_at: '2026-01-02T00:00:00Z' },
    ] })
    if (url.startsWith(`${gt}/releases`)) return json([{ tag_name: 'v0.3.0', draft: false, prerelease: false, html_url: 'https://git.home.test/rel' }])
    if (url === `${gt}/issues` && init.method === 'POST') return json({ number: 5, html_url: 'https://git.home.test/me/tool/issues/5' })
    if (url.startsWith('https://git.home.test/api/v1/users/me/repos')) return json([{ full_name: 'me/tool', name: 'tool', owner: { login: 'me' } }, { full_name: 'other/x', name: 'x', owner: { login: 'other' } }])

    // GitHub: repo "will/app"
    const gh = 'https://api.github.com/repos/will/app'
    if (url === gh) return json({ full_name: 'will/app', default_branch: 'main' })
    if (url.startsWith(`${gh}/issues?`)) return json(state.ghIssues)
    if (url === `${gh}/issues` && init.method === 'POST') {
      const issue = { number: 42, html_url: 'https://github.com/will/app/issues/42', title: JSON.parse(init.body).title, user: { login: 'will' }, labels: [], created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' }
      state.ghIssues.push(issue)
      return json(issue, 201)
    }
    if (url === `${gh}/releases` && init.method === 'POST') return json({ html_url: `https://github.com/will/app/releases/tag/${JSON.parse(init.body).tag_name}` }, 201)
    if (url.startsWith('https://api.github.com/notifications')) return json(state.notifications)
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
const lastCall = (pred) => calls.filter(pred).at(-1)

test('normalizeRepo accepts paths and URLs of every forge', () => {
  assert.equal(normalizeRepo('https://github.com/a/b.git'), 'a/b')
  assert.equal(normalizeRepo('https://gitlab.com/grp/sub/app/-/issues'), 'grp/sub/app')
  assert.equal(normalizeRepo('git@git.home.lan:me/tool.git'), 'me/tool')
  assert.equal(normalizeRepo(' owner/repo/ '), 'owner/repo')
})

test('forge accounts keep tokens server-side', async () => {
  let res = await call('PUT', '/api/settings/forges', { accounts: [
    { type: 'gitlab', url: 'https://gitlab.test/', token: 'glpat-1' },
    { type: 'gitea', url: 'https://git.home.test', token: 'gt-1' },
  ] })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.accounts.map((a) => [a.type, a.url, a.token_set, a.token]), [['gitlab', 'https://gitlab.test', true, undefined], ['gitea', 'https://git.home.test', true, undefined]])
  // Re-saving without token keeps it.
  res = await call('PUT', '/api/settings/forges', { accounts: res.body.accounts.map(({ token_set, ...a }) => a) })
  assert.equal(res.body.accounts.every((a) => a.token_set), true)
  assert.equal((await call('PUT', '/api/settings/forges', { accounts: [{ type: 'gitea', url: '' }] })).status, 400)
})

test('GitLab project: issues, MRs, pipeline, release, issue creation', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'GL', forge: 'gitlab', forge_url: 'https://gitlab.test', repo: 'https://gitlab.test/grp/sub/app', version_sources: [{ type: 'repo', ref: '' }] })
  assert.equal(p.repo, 'grp/sub/app')
  const res = (await call('POST', `/api/projects/${p.id}/sync`)).body
  assert.deepEqual(res.errors, [])
  assert.deepEqual([res.project.open_issues, res.project.open_prs, res.project.ci], [1, 1, 'failure'])
  assert.equal(res.project.versions[0].version, 'v2.0.0')
  assert.equal(lastCall((c) => c.url.includes('gitlab.test')).headers['PRIVATE-TOKEN'], 'glpat-1')
  const inbox = (await call('GET', `/api/inbox?project_id=${p.id}&source=repo`)).body
  assert.ok(inbox.some((x) => x.title === '!7 GL MR' && x.source === 'gitlab'))

  const { body: item } = await call('POST', '/api/items', { project_id: p.id, title: 'Crash', body: 'Étapes', external_url: 'https://forum/t/1', target_version: '2.1.0' })
  const linked = (await call('POST', `/api/items/${item.id}/issue`, { labels: ['bug'] })).body
  assert.deepEqual([linked.issue_number, linked.issue_url], [4, 'https://gitlab.test/i/4'])
  const sent = lastCall((c) => c.method === 'POST' && c.url.includes('gitlab.test'))
  assert.equal(sent.body.labels, 'bug')
  assert.match(sent.body.description, /Signalé ici : https:\/\/forum\/t\/1/)
  assert.equal((await call('POST', `/api/items/${item.id}/issue`)).status, 409)
})

test('Gitea / Forgejo project: commit statuses, releases, import listing', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Tool', forge: 'gitea', forge_url: 'https://git.home.test', repo: 'me/tool', version_sources: [{ type: 'repo' }] })
  const res = (await call('POST', `/api/projects/${p.id}/sync`)).body
  assert.deepEqual(res.errors, [])
  // Latest status per context wins: success.
  assert.equal(res.project.ci, 'success')
  assert.deepEqual([res.project.open_issues, res.project.open_prs], [1, 1])
  assert.equal(res.project.versions[0].version, 'v0.3.0')
  assert.equal(lastCall((c) => c.url.includes('git.home.test')).headers.Authorization, 'token gt-1')

  const list = (await call('GET', '/api/forges/repos?forge=gitea&url=https://git.home.test&owner=me')).body
  assert.deepEqual(list.repos.map((r) => [r.full_name, r.tracked]), [['me/tool', true]])
})

test('GitHub: issue from item, linked item closes with the issue, track an issue', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'App', repo: 'will/app' })
  await call('POST', `/api/projects/${p.id}/sync`)
  const { body: item } = await call('POST', '/api/items', { project_id: p.id, title: 'Bouton cassé', status: 'in_progress' })
  const linked = (await call('POST', `/api/items/${item.id}/issue`)).body
  assert.equal(linked.issue_number, 42)

  await call('POST', `/api/projects/${p.id}/sync`)
  const gi = (await call('GET', `/api/github-items?project_id=${p.id}`)).body
  assert.equal(gi.length, 1)
  const tracked = (await call('POST', `/api/github-items/${gi[0].id}/track`)).body
  assert.equal(tracked.id, item.id, 'already tracked issue returns the existing item')

  state.ghIssues = []
  await call('POST', `/api/projects/${p.id}/sync`)
  const after = (await call('GET', `/api/items?project_id=${p.id}`)).body
  assert.equal(after[0].status, 'done')
})

test('personal GitHub notifications: opt-in, reasons filter, baseline, ntfy', async () => {
  await call('PUT', '/api/settings/ntfy', { enabled: true, server: 'https://ntfy.test', topic: 't', events: ['gh_notification'] })
  const thread = (id, reason, updated_at = '2026-03-01T00:00:00Z') => ({
    id, reason, updated_at,
    subject: { title: `Thread ${id}`, type: 'PullRequest', url: `https://api.github.com/repos/will/app/pulls/${id}` },
    repository: { full_name: 'will/app', html_url: 'https://github.com/will/app' },
  })
  state.notifications = [thread('1', 'review_requested')]
  await call('POST', '/api/sync')
  assert.equal(calls.some((c) => c.url.includes('/notifications')), false, 'disabled by default')

  await call('PUT', '/api/settings/github-notifications', { enabled: true })
  await call('POST', '/api/sync')
  let inbox = (await call('GET', '/api/inbox')).body.filter((x) => x.kind === 'gh_notification')
  assert.equal(inbox.length, 1)
  assert.ok(inbox[0].read_at, 'first fetch is a silent baseline')

  state.ntfy.length = 0
  state.notifications = [thread('1', 'review_requested', '2026-03-02T00:00:00Z'), thread('2', 'subscribed'), thread('3', 'mention')]
  await call('POST', '/api/sync')
  inbox = (await call('GET', '/api/inbox?unread=1')).body.filter((x) => x.kind === 'gh_notification')
  assert.deepEqual(inbox.map((x) => x.title).sort(), ['Thread 1', 'Thread 3'])
  assert.equal(inbox[0].url.startsWith('https://github.com/will/app/pull/'), true)
  assert.ok(inbox[0].project_id, 'attached to the matching project')
  assert.equal(state.ntfy.length, 2)
  assert.match(state.ntfy[0].title, /Notification GitHub/)
})

test('milestones: roadmap, rename cascade, release and changelog', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Roadmap' })
  const add = (title, kind, target_version, status = 'todo') => call('POST', '/api/items', { project_id: p.id, title, kind, target_version, status })
  await add('Mode sombre', 'feature', '1.1.0', 'done')
  await add('Crash au démarrage', 'bug', '1.1.0', 'done')
  await add('Refacto', 'task', '1.1.0', 'in_progress')
  await add('Export PDF', 'feature', '1.2.0')
  await add('Idée', 'feature', '')
  const { body: m } = await call('POST', '/api/milestones', { project_id: p.id, version: '1.2.0', title: 'Exports' })
  assert.equal((await call('POST', '/api/milestones', { project_id: p.id, version: '1.2.0' })).status, 409)

  let roadmap = (await call('GET', `/api/projects/${p.id}/roadmap`)).body
  assert.deepEqual(roadmap.versions.map((v) => [v.version, v.done, v.total, v.id === null]), [['1.2.0', 0, 1, false], ['1.1.0', 2, 3, true]])
  assert.equal(roadmap.unplanned.length, 1)

  await call('PUT', `/api/milestones/${m.id}`, { version: '2.0.0' })
  roadmap = (await call('GET', `/api/projects/${p.id}/roadmap`)).body
  assert.equal(roadmap.versions.find((v) => v.version === '2.0.0').total, 1)

  const rel = (await call('POST', `/api/projects/${p.id}/release`, { version: '1.1.0', close_items: true, save_note: true })).body
  assert.equal(rel.milestone.status, 'released')
  assert.match(rel.markdown, /^## 1\.1\.0 — \d{4}-\d{2}-\d{2}/)
  assert.match(rel.markdown, /### ✨ Nouveautés\n\n- Mode sombre/)
  assert.match(rel.markdown, /### 🐛 Corrections\n\n- Crash au démarrage/)
  assert.match(rel.markdown, /### 🔧 Autres changements\n\n- Refacto/, 'in-progress items were closed by the release')
  assert.equal(rel.doc.title, 'Changelog 1.1.0')
  const full = (await call('GET', `/api/projects/${p.id}/changelog`)).body.markdown
  assert.match(full, /^# Changelog\n\n## 1\.1\.0/)
  assert.doesNotMatch(full, /2\.0\.0/)
})

test('publishing a version creates the release on the forge', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Rel', repo: 'will/app' })
  await call('POST', '/api/items', { project_id: p.id, title: 'Export CSV', kind: 'feature', target_version: '2.0.0', status: 'done' })
  const res = (await call('POST', `/api/projects/${p.id}/release`, { version: '2.0.0', forge: { draft: true } })).body
  assert.equal(res.forge_error, null)
  assert.equal(res.milestone.release_url, 'https://github.com/will/app/releases/tag/v2.0.0')
  const sent = lastCall((c) => c.url.endsWith('/repos/will/app/releases') && c.method === 'POST').body
  assert.deepEqual([sent.tag_name, sent.name, sent.draft, sent.target_commitish], ['v2.0.0', 'v2.0.0', true, 'main'])
  assert.match(sent.body, /^### ✨ Nouveautés\n\n- Export CSV/)
  assert.equal((await call('POST', `/api/milestones/${res.milestone.id}/forge-release`)).status, 409)

  // Forge failure: the local release stands and can be retried.
  const { body: q } = await call('POST', '/api/projects', { name: 'Rel2', repo: 'will/broken' })
  const failed = (await call('POST', `/api/projects/${q.id}/release`, { version: '1.0.0', forge: {} })).body
  assert.equal(failed.milestone.status, 'released')
  assert.match(failed.forge_error, /404/)
  assert.equal((await call('POST', `/api/milestones/${failed.milestone.id}/forge-release`, { tag: 'release-1' })).status, 502)
})

test('GitLab releases use ref and the release link', async () => {
  const [p] = (await call('GET', '/api/projects?q=GL')).body
  const res = (await call('POST', `/api/projects/${p.id}/release`, { version: 'v3.0.0', forge: {} })).body
  assert.equal(res.forge_error, null)
  const sent = lastCall((c) => c.url.endsWith('/releases') && c.url.includes('gitlab.test') && c.method === 'POST').body
  assert.deepEqual([sent.tag_name, sent.ref], ['v3.0.0', 'main'])
  assert.equal(res.milestone.release_url, 'https://gitlab.test/rel/v3.0.0')
})
