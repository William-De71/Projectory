import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { syncProject } from '../src/sync/index.js'
import { bumpOf, commitType, dispatchInputs, nextVersion, pickReleaseWorkflow, releaseView } from '../src/releases.js'

for (const key of ['GITHUB_TOKEN', 'NTFY_TOPIC', 'NTFY_SERVER', 'NTFY_TOKEN', 'APP_URL', 'APP_PASSWORD']) delete process.env[key]

test('commit types, bump and next version', () => {
  assert.deepEqual(commitType('feat(web): panel'), { type: 'feat', breaking: false, release: false })
  assert.equal(commitType('fix!: drop node 20').breaking, true)
  assert.equal(commitType('refactor: x\n\nBREAKING CHANGE: api').breaking, true)
  assert.equal(commitType('chore(release): v1.2.0').release, true)
  assert.equal(commitType('Merge pull request #3').type, 'other')

  assert.equal(bumpOf([{ type: 'docs' }, { type: 'fix' }]), 'patch')
  assert.equal(bumpOf([{ type: 'fix' }, { type: 'feat' }]), 'minor')
  assert.equal(bumpOf([{ type: 'chore' }]), null)

  assert.equal(nextVersion('v1.2.3', 'patch'), 'v1.2.4')
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(nextVersion('v1.2.3', 'major'), 'v2.0.0')
  assert.equal(nextVersion('v0.14.0', 'major'), 'v0.15.0', 'breaking below 1.0.0 is a minor')
})

test('release status: stuck, failed, pending, quiet, up to date', () => {
  const now = Date.parse('2026-10-25T16:00:00Z')
  const base = { tag: 'v1.0.0', published_at: '2026-10-20T00:00:00Z', workflow: { id: 1, name: 'Release' }, commits: [] }
  const run = (status, conclusion, created_at = '2026-10-25T15:50:00Z') => ({ id: 9, status, conclusion, created_at, updated_at: created_at })

  assert.equal(releaseView({ ...base, run: run('in_progress', null) }, now).status, 'running')
  assert.equal(releaseView({ ...base, run: run('in_progress', null, '2026-10-25T15:00:00Z') }, now).status, 'stuck')
  assert.equal(releaseView({ ...base, run: run('completed', 'failure') }, now).status, 'failed')
  assert.equal(releaseView({ ...base, run: run('completed', 'failure', '2026-10-19T00:00:00Z') }, now).status, 'up_to_date', 'a version was published since')

  const pending = releaseView({ ...base, run: run('completed', 'success'), commits: [{ message: 'feat: a' }, { message: 'docs: b' }, { message: 'chore(release): v1.0.0' }] }, now)
  assert.equal(pending.status, 'pending')
  assert.deepEqual([pending.bump, pending.next_version, pending.ahead_by], ['minor', 'v1.1.0', 2])
  assert.deepEqual(pending.types, { feat: 1, docs: 1 })
  assert.equal(pending.commits[0].title, 'feat: a')

  assert.equal(releaseView({ ...base, commits: [{ message: 'chore: deps' }] }, now).status, 'quiet')
  assert.equal(releaseView({ commits: [] }, now).status, 'unknown')
})

test('release workflow: picked by file then name, manual inputs read from YAML', () => {
  const wf = (id, path, name, state = 'active') => ({ id, path: `.github/workflows/${path}`, name, state })
  assert.equal(pickReleaseWorkflow([wf(1, 'ci.yml', 'CI'), wf(2, 'github-release.yml', 'GitHub release'), wf(3, 'release.yml', 'Release')]).id, 3)
  assert.equal(pickReleaseWorkflow([wf(1, 'publish.yml', 'Release')]).id, 1)
  assert.equal(pickReleaseWorkflow([wf(1, 'release.yml', 'Release', 'disabled_manually')]), null)

  assert.deepEqual(dispatchInputs(`
on:
  workflow_dispatch:
    inputs:
      bump:
        description: Type de version
        type: choice
        options: [patch, minor, major]
        default: patch
`), [{ name: 'bump', type: 'choice', description: 'Type de version', required: false, default: 'patch', options: ['patch', 'minor', 'major'] }])
  assert.deepEqual(dispatchInputs('on: [push, workflow_dispatch]'), [])
  assert.equal(dispatchInputs('on:\n  push:\n    branches: [main]'), null)
})

// Fake GitHub: repository will/app, tagged v1.2.0, one feat commit since.
const state = { run: null, dispatched: [], actions: [] }
const realFetch = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const WORKFLOW = 'on:\n  workflow_dispatch:\n    inputs:\n      bump:\n        type: choice\n        options: [patch, minor, major]\n'

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const gh = 'https://api.github.com/repos/will/app'
    if (url === gh) return json({ full_name: 'will/app', html_url: 'https://github.com/will/app', default_branch: 'main' })
    if (url.startsWith(`${gh}/issues?`) || url.startsWith(`${gh}/pulls?`)) return json([])
    if (url.startsWith(`${gh}/actions/runs?`)) return json({ workflow_runs: [] })
    if (url === `${gh}/releases/latest`) return json({ tag_name: 'v1.2.0', html_url: 'https://github.com/will/app/releases/v1.2.0', published_at: '2026-10-01T00:00:00Z' })
    if (url === `${gh}/compare/v1.2.0...main`) return json({ ahead_by: 1, commits: [{ sha: 'abcdef1234', html_url: 'https://c/1', commit: { message: 'feat: new page', committer: { date: '2026-10-02T00:00:00Z' } } }] })
    if (url.startsWith(`${gh}/actions/workflows?`)) return json({ workflows: [{ id: 77, name: 'Release', path: '.github/workflows/release.yml', state: 'active', html_url: 'https://wf' }] })
    if (url.startsWith(`${gh}/actions/workflows/77/runs`)) return json({ workflow_runs: state.run ? [state.run] : [] })
    if (url.startsWith(`${gh}/contents/.github/workflows/release.yml?ref=main`)) return json({ content: Buffer.from(WORKFLOW).toString('base64') })
    const runUrl = url.match(/\/actions\/runs\/(\d+)(\/[a-z-]+)?$/)
    if (runUrl) {
      const [, id, action] = runUrl
      if (!action) return json({ id: Number(id), status: state.run.status, conclusion: state.run.conclusion })
      state.actions.push(`${action.slice(1)} ${id}`)
      if (action === '/cancel') Object.assign(state.run, { status: 'completed', conclusion: 'cancelled' })
      return new Response(null, { status: action === '/cancel' ? 202 : 201 })
    }
    if (url === `${gh}/actions/workflows/77/dispatches` && init.method === 'POST') {
      state.dispatched.push(JSON.parse(init.body))
      return new Response(null, { status: 204 })
    }
    return new Response('not found', { status: 404 })
  }
})
after(() => { globalThis.fetch = realFetch })

let app, db
before(async () => {
  db = openDb(':memory:')
  app = await buildApp({ db, logger: false })
})
const call = async (method, url, payload) => {
  const res = await app.inject({ method, url, payload })
  return { status: res.statusCode, body: res.json() }
}

test('sync stores the release state; a failed run lands in the inbox; launch from here', async () => {
  const project = (await call('POST', '/api/projects', { name: 'App', repo: 'will/app' })).body
  await syncProject(db, project.id, { warn() {} })

  let [row] = (await call('GET', '/api/releases')).body
  assert.equal(row.release.status, 'pending')
  assert.equal(row.release.next_version, 'v1.3.0')

  // The release run fails: one inbox entry, once.
  state.run = { id: 5, status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', created_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:05:00Z', html_url: 'https://run/5', head_sha: 'abcdef1234' }
  await syncProject(db, project.id, { warn() {} })
  await syncProject(db, project.id, { warn() {} })
  const entries = (await call('GET', '/api/inbox')).body.filter((e) => e.kind === 'release_failed')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].url, 'https://run/5')

  const wf = (await call('GET', `/api/projects/${project.id}/release/workflow`)).body
  assert.deepEqual(wf.inputs.map((i) => [i.name, i.options]), [['bump', ['patch', 'minor', 'major']]])

  const res = await call('POST', `/api/projects/${project.id}/release/dispatch`, { inputs: { bump: 'minor', unknown: 'x' } })
  assert.equal(res.status, 200)
  assert.deepEqual(state.dispatched, [{ ref: 'main', inputs: { bump: 'minor' } }])

  state.run = { ...state.run, id: 6, status: 'in_progress', conclusion: null, created_at: new Date().toISOString() }
  row = (await call('POST', `/api/projects/${project.id}/release/refresh`)).body
  assert.equal(row.release.status, 'running')

  // Stuck run: cancelled, then only its failed jobs run again.
  await call('POST', `/api/projects/${project.id}/release/retry`)
  assert.deepEqual(state.actions, ['cancel 6', 'rerun-failed-jobs 6'])
  // A finished, failed run is not cancelled.
  state.actions = []
  await call('POST', `/api/projects/${project.id}/release/retry`)
  assert.deepEqual(state.actions, ['rerun-failed-jobs 6'])
})
