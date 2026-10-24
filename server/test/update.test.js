import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'NTFY_TOPIC', 'APP_PASSWORD', 'APP_VERSION', 'UPDATER_TOKEN', 'UPDATER_URL', 'IMAGE_TAG']) delete process.env[key]

// Fake GitHub release and Watchtower API.
const calls = []
const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = async (url, init) => {
    url = String(url)
    calls.push({ url, method: init?.method, auth: init?.headers?.Authorization })
    if (url === 'https://api.github.com/repos/William-De71/Projectory/releases/latest') {
      return new Response(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://gh/v99', body: '### ✨ Nouveautés\n- tout', published_at: '2026-10-24T00:00:00Z' }))
    }
    if (url.startsWith('http://watchtower:8080/v1/update')) return new Response('', { status: 202 })
    return new Response('not found', { status: 404 })
  }
})
after(() => { globalThis.fetch = realFetch })

let app
before(async () => { app = await buildApp({ db: openDb(':memory:'), logger: false }) })
const call = async (method, url) => {
  const res = await app.inject({ method, url })
  return { status: res.statusCode, body: res.json() }
}

test('a newer release is reported, the button needs Watchtower', async () => {
  const { body } = await call('GET', '/api/update')
  assert.equal(body.latest.version, '99.0.0')
  assert.equal(body.available, true)
  assert.equal(body.can_update, false)
  assert.equal((await call('POST', '/api/update')).status, 400)
})

test('the release is cached, refresh=1 asks GitHub again', async () => {
  const count = () => calls.filter((c) => c.url.includes('/releases/latest')).length
  const before = count()
  await call('GET', '/api/update')
  assert.equal(count(), before)
  await call('GET', '/api/update?refresh=1')
  assert.equal(count(), before + 1)
})

test('update now: Watchtower is called with the token, not for a fixed image tag', async () => {
  process.env.UPDATER_TOKEN = 'secret'
  try {
    assert.equal((await call('GET', '/api/update')).body.can_update, true)
    assert.equal((await call('POST', '/api/update')).status, 200)
    const hit = calls.find((c) => c.url.startsWith('http://watchtower:8080/v1/update'))
    assert.equal(hit.method, 'POST')
    assert.equal(hit.auth, 'Bearer secret')
    process.env.IMAGE_TAG = '0.12.0'
    assert.equal((await call('GET', '/api/update')).body.can_update, false)
  } finally {
    delete process.env.UPDATER_TOKEN
    delete process.env.IMAGE_TAG
  }
})
