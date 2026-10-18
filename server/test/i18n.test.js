import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from '../src/i18n-en.js'

// Keep tests hermetic whatever the developer's environment holds.
for (const key of ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITEA_TOKEN', 'NTFY_TOPIC', 'APP_LANG']) delete process.env[key]

const SRC = new URL('../src/', import.meta.url).pathname
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : f.endsWith('.js') && f !== 'i18n-en.js' ? [p] : []
})
const STRING = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`
const unescape = (s) => s.replace(/\\(.)/g, '$1')

// French source texts: tr('…') calls plus the label tables translated with tr(variable).
export function serverKeys() {
  const keys = new Set()
  for (const file of files(SRC)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(new RegExp(String.raw`\btr\(\s*(?:${STRING})`, 'g'))) keys.add(unescape(m[1] ?? m[2]))
    for (const table of ['NOTIFY_EVENTS', 'GH_NOTIFICATION_REASONS', 'SECTIONS', 'PRIORITIES']) {
      const block = src.match(new RegExp(String.raw`(?:const|export const) ${table} = [\[{]([\s\S]*?)\n[\]}]`))
      if (!block) continue
      for (const m of block[1].matchAll(new RegExp(String.raw`(?:\w+|title):\s*(?:${STRING})`, 'g'))) keys.add(unescape(m[1] ?? m[2]))
    }
  }
  return [...keys].sort()
}

test('every French server text has an English translation', () => {
  const missing = serverKeys().filter((k) => !(k in en))
  assert.deepEqual(missing, [], `Missing in src/i18n-en.js:\n${missing.join('\n')}`)
})

test('the API follows the chosen language', async () => {
  const { openDb } = await import('../src/db.js')
  const { buildApp } = await import('../src/app.js')
  const app = await buildApp({ db: openDb(':memory:'), logger: false })
  const call = async (method, url, payload) => (await app.inject({ method, url, payload })).json()
  assert.equal((await call('GET', '/api/settings/locale')).lang, 'fr')
  assert.equal((await call('POST', '/api/projects', {})).error, 'Le nom est obligatoire')
  assert.equal((await call('PUT', '/api/settings/locale', { lang: 'en' })).lang, 'en')
  assert.equal((await call('POST', '/api/projects', {})).error, 'Name is required')
  const { id } = await call('POST', '/api/projects', { name: 'P' })
  await call('POST', '/api/items', { project_id: id, title: 'Fix crash', kind: 'bug', target_version: '1.0.0', status: 'done' })
  const { markdown } = await call('GET', `/api/projects/${id}/changelog?version=1.0.0`)
  assert.match(markdown, /### 🐛 Fixes\n\n- Fix crash/)
  const ntfy = await call('GET', '/api/settings/ntfy')
  assert.equal(ntfy.available_events.ci_failed, 'CI failing')
  assert.equal((await call('PUT', '/api/settings/locale', { lang: 'de' })).error, 'Unknown language')
  await call('PUT', '/api/settings/locale', { lang: 'fr' })
})
