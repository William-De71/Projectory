import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { compareVersions } from '../src/sync/http.js'

// Fake upstream APIs: GitHub, npm, Discourse and an RSS feed.
const upstream = { issues: [], release: 'v1.0.0', topics: [] }
// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD']) delete process.env[key]

const realFetch = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

before(() => {
  globalThis.fetch = async (url) => {
    url = String(url)
    if (url.endsWith('/repos/acme/app')) return json({ full_name: 'acme/app', html_url: 'https://github.com/acme/app', stargazers_count: 3 })
    if (url.includes('/repos/acme/app/issues')) return json(upstream.issues)
    if (url.endsWith('/repos/acme/app/releases/latest')) return json({ tag_name: upstream.release, html_url: 'https://x' })
    if (url.startsWith('https://registry.npmjs.org/')) return json({ version: '2.1.0' })
    if (url === 'https://forum.test/search.json?q=Will_71%20order%3Alatest') return json({
      posts: [
        { id: 900, username: 'Damien_D', blurb: '@Will_71 Parfait, merci !', topic_id: 42, post_number: 7, created_at: '2026-10-18T20:08:03Z' },
        { id: 901, username: 'Will_71', blurb: 'Merci @Will_71 de rien', topic_id: 42, post_number: 8, created_at: '2026-10-18T21:00:00Z' },
        { id: 902, username: 'guim31', blurb: 'Voir le dépôt de Will_71 sur GitHub', topic_id: 43, post_number: 2, created_at: '2026-10-18T22:00:00Z' },
        { id: 903, username: 'mutmut', blurb: 'ok merci @will_71 ,', topic_id: 43, post_number: 3, created_at: '2026-10-18T23:00:00Z' },
      ],
      topics: [{ id: 42, slug: 'meteo-france', title: 'Intégration externe : Meteo France' }, { id: 43, slug: 'reolink', fancy_title: 'Reolink &amp; Argus' }],
    })
    if (url === 'https://forum.test/c/bugs/5.json') return json({ topic_list: { topics: upstream.topics } })
    if (url === 'https://blog.test/feed') return new Response(`<rss><channel><item><guid>a1</guid><title>Bug zigbee</title><link>https://blog.test/a1</link></item><item><guid>a2</guid><title>Autre</title><link>https://blog.test/a2</link></item></channel></rss>`)
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

test('compareVersions', () => {
  assert.equal(compareVersions('v1.10.0', '1.9.3'), 1)
  assert.equal(compareVersions('2.0.0-rc1', '2.0.0'), -1)
  assert.equal(compareVersions('4.5', 'v4.5.0'), 0)
})

test('categories are seeded', async () => {
  const { body } = await call('GET', '/api/categories')
  assert.deepEqual(body.map((c) => c.name), ['Freelance', 'Perso', 'Organisation', 'Autre'])
})

test('full sync flow: baseline, new issue, new release, forum, convert to bug', async () => {
  upstream.issues = [{ number: 1, title: 'Old bug', html_url: 'u1', user: { login: 'bob' }, labels: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
  upstream.topics = [{ id: 10, slug: 'old', title: 'Ancien sujet', created_at: '2026-01-01T00:00:00Z' }]
  const { body: project } = await call('POST', '/api/projects', {
    name: 'App', category_id: 1, repo: 'https://github.com/acme/app.git', deployed_version: '1.0.0',
    version_sources: [{ type: 'github', ref: '' }, { type: 'npm', ref: 'left-pad' }],
    forum_sources: [{ type: 'discourse', url: 'https://forum.test', path: 'c/bugs/5' }, { type: 'rss', url: 'https://blog.test/feed', query: 'zigbee' }],
    tags: ['web'],
  })
  assert.equal(project.repo, 'acme/app')
  assert.deepEqual(project.tags, ['web'])

  let res = await call('POST', `/api/projects/${project.id}/sync`)
  assert.deepEqual(res.body.errors, [])
  assert.equal(res.body.project.open_issues, 1)
  // npm 2.1.0 > deployed 1.0.0
  assert.equal(res.body.project.outdated, true)
  // First sync: everything recorded as already read.
  assert.equal((await call('GET', '/api/inbox?unread=1')).body.length, 0)
  assert.equal((await call('GET', '/api/inbox')).body.length, 3)

  upstream.issues.push({ number: 2, title: 'New PR', pull_request: {}, html_url: 'u2', user: { login: 'eve' }, labels: [{ name: 'fix', color: 'ff0000' }], created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' })
  upstream.issues.shift()
  upstream.release = 'v1.1.0'
  upstream.topics.push({ id: 11, slug: 'crash', title: 'Crash au démarrage', created_at: '2026-02-01T00:00:00Z' })
  res = await call('POST', `/api/projects/${project.id}/sync`)
  assert.equal(res.body.project.open_issues, 0)
  assert.equal(res.body.project.open_prs, 1)

  const unread = (await call('GET', '/api/inbox?unread=1')).body
  assert.deepEqual(unread.map((x) => x.kind).sort(), ['discourse', 'pr', 'release'])

  const topic = unread.find((x) => x.kind === 'discourse')
  assert.equal(topic.url, 'https://forum.test/t/crash/11')
  const item = (await call('POST', `/api/inbox/${topic.id}/to-item`, { priority: 'high' })).body
  assert.equal(item.title, 'Crash au démarrage')
  assert.equal(item.source, 'forum')

  const dash = (await call('GET', '/api/dashboard')).body
  assert.equal(dash.stats.open_bugs, 1)
  assert.equal(dash.stats.unread, 2)
  assert.equal(dash.urgent.length, 1)
  assert.equal(dash.outdated.length, 1)

  assert.equal((await call('POST', '/api/inbox/read-all', {})).body.changes, 2)
})

test('docs, search, time and export', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Gladys plugin', category_id: 3 })
  await call('POST', '/api/docs', { project_id: p.id, type: 'spec', title: 'Spec intégration', content: '# Objectif\nSupporter le protocole Matter' })
  await call('POST', '/api/docs', { title: 'Idée globale', content: 'Penser à Matter aussi' })
  assert.equal((await call('GET', '/api/docs?global=1')).body.length, 1)
  const found = (await call('GET', '/api/search?q=matter')).body
  assert.equal(found.filter((r) => r.type === 'doc').length, 2)
  assert.equal((await call('POST', '/api/time', { project_id: p.id, date: new Date().toISOString().slice(0, 10), minutes: 90 })).status, 201)
  assert.equal((await call('GET', '/api/dashboard')).body.stats.minutes_this_month, 90)
  const exp = (await call('GET', '/api/export')).body
  assert.equal(exp.docs.length, 2)
  assert.equal((await call('POST', '/api/projects', {})).status, 400)
})

test('Discourse mentions: only posts by others that tag @user', async () => {
  const { fetchForum, forumSourceKey } = await import('../src/sync/sources.js')
  const source = { type: 'discourse_mentions', url: 'https://forum.test/', user: '@Will_71' }
  const posts = await fetchForum(source)
  assert.deepEqual(posts.map((p) => p.id), ['900', '903'])
  assert.equal(posts[0].url, 'https://forum.test/t/meteo-france/42/7')
  assert.equal(posts[0].title, 'Intégration externe : Meteo France')
  assert.equal(posts[0].excerpt, '@Damien_D : @Will_71 Parfait, merci !')
  assert.equal(posts[1].title, 'Reolink & Argus')
  assert.notEqual(forumSourceKey(source), forumSourceKey({ ...source, user: 'other' }))
  await assert.rejects(fetchForum({ ...source, user: ' ' }), /utilisateur Discourse manquant/)
})

test('decodes HTML entities in forum titles', async () => {
  const { decodeEntities } = await import('../src/sync/sources.js')
  assert.equal(decodeEntities('Probl&egrave;me d&rsquo;int&#233;gration &#x2014; ok'), 'Probl&egrave;me d’intégration — ok')
  assert.equal(decodeEntities('d&amp;#39;accord'), "d'accord")
})

test('errors are returned as { error } with the original message', async () => {
  const res = await call('POST', '/api/projects/9999/sync')
  assert.equal(res.status, 500)
  assert.equal(res.body.error, 'Projet introuvable')
})
