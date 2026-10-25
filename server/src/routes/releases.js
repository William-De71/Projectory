import { decode } from '../db.js'
import { forgeFor, normalizeRepo } from '../sync/forges/index.js'
import { dispatchInputs, releaseView } from '../releases.js'
import { tr } from '../i18n.js'
import { forgeError } from './integrations.js'

// Waiting for a cancelled run to stop: up to a minute.
const RETRY_POLLS = 20
const RETRY_POLL_MS = 3000

const ORDER = ['stuck', 'failed', 'running', 'pending', 'quiet', 'up_to_date', 'unknown']

const loadProject = (db, id) => decode(db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
const row = (p) => ({ id: p.id, name: p.name, repo: p.repo, forge: p.forge, release: releaseView(p.github?.release) })

// What is waiting to be released on the user's repositories, and the release
// workflow to launch from here.
export default async function releaseRoutes(app, { db }) {
  app.get('/releases', async () =>
    db.prepare("SELECT * FROM projects WHERE status != 'archived' AND repo != '' ORDER BY name COLLATE NOCASE").all()
      .map(decode)
      .filter((p) => p.github?.release)
      .map(row)
      .sort((a, b) => ORDER.indexOf(a.release.status) - ORDER.indexOf(b.release.status)))

  app.get('/projects/:id/release', async (req, reply) => {
    const p = loadProject(db, Number(req.params.id))
    if (!p) return reply.code(404).send({ error: tr('Projet introuvable') })
    return row(p)
  })

  // Live state of one repository (after a launch, or on demand).
  app.post('/projects/:id/release/refresh', async (req, reply) => {
    const p = loadProject(db, Number(req.params.id))
    if (!p?.repo) return reply.code(404).send({ error: tr('Projet introuvable') })
    const forge = forgeFor(db, p)
    if (!forge.fetchReleaseState) return reply.code(400).send({ error: tr('Releases non prises en charge pour cette forge') })
    try {
      const release = { ...await forge.fetchReleaseState(normalizeRepo(p.repo), p.github?.default_branch || 'main'), checked_at: new Date().toISOString() }
      db.prepare('UPDATE projects SET github = ? WHERE id = ?').run(JSON.stringify({ ...p.github, release }), p.id)
      return row({ ...p, github: { ...p.github, release } })
    } catch (err) {
      return reply.code(502).send({ error: forgeError(err) })
    }
  })

  // Inputs of the release workflow, read from its file on the default branch.
  app.get('/projects/:id/release/workflow', async (req, reply) => {
    const p = loadProject(db, Number(req.params.id))
    const workflow = p?.github?.release?.workflow
    if (!workflow) return reply.code(404).send({ error: tr('Aucun workflow de release trouvé sur ce dépôt') })
    try {
      const text = await forgeFor(db, p).fetchFile(normalizeRepo(p.repo), workflow.path, p.github.default_branch || 'main')
      return { workflow, inputs: dispatchInputs(text) }
    } catch (err) {
      return reply.code(502).send({ error: forgeError(err) })
    }
  })

  // A failed or stuck run: cancels it when it still runs, then runs its failed
  // jobs again (a new dispatch could publish a second version).
  app.post('/projects/:id/release/retry', async (req, reply) => {
    const p = loadProject(db, Number(req.params.id))
    const run = p?.github?.release?.run
    if (!run) return reply.code(404).send({ error: tr('Aucun run de release à relancer') })
    const forge = forgeFor(db, p)
    const repo = normalizeRepo(p.repo)
    try {
      let current = await forge.fetchRun(repo, run.id)
      if (current.status !== 'completed') {
        await forge.cancelRun(repo, run.id)
        for (let i = 0; i < RETRY_POLLS; i++) {
          current = await forge.fetchRun(repo, run.id)
          if (current.status === 'completed') break
          await new Promise((resolve) => setTimeout(resolve, RETRY_POLL_MS))
        }
        if (current.status !== 'completed') return reply.code(409).send({ error: tr('Le run ne s’est pas encore arrêté : réessaie dans une minute') })
      }
      await forge.rerunFailedJobs(repo, run.id)
      return { ok: true }
    } catch (err) {
      const hint = err.status === 403 || err.status === 404 ? tr('Le token doit pouvoir lancer les workflows (GitHub : Actions en écriture).') : ''
      return reply.code(502).send({ error: [forgeError(err), hint].filter(Boolean).join(' ') })
    }
  })

  app.post('/projects/:id/release/dispatch', async (req, reply) => {
    const p = loadProject(db, Number(req.params.id))
    const workflow = p?.github?.release?.workflow
    if (!workflow) return reply.code(404).send({ error: tr('Aucun workflow de release trouvé sur ce dépôt') })
    const forge = forgeFor(db, p)
    const repo = normalizeRepo(p.repo)
    const ref = p.github.default_branch || 'main'
    try {
      const spec = dispatchInputs(await forge.fetchFile(repo, workflow.path, ref))
      if (!spec) return reply.code(409).send({ error: tr('Ce workflow ne se lance pas à la main : il publie tout seul à chaque push') })
      // Only declared inputs, as strings; empty optional ones are left to their default.
      const given = req.body?.inputs || {}
      const inputs = {}
      for (const input of spec) {
        const value = given[input.name]
        if (value === undefined || value === null || value === '') continue
        inputs[input.name] = String(value)
      }
      await forge.dispatchWorkflow(repo, workflow.id, ref, inputs)
      return { ok: true }
    } catch (err) {
      const hint = err.status === 403 || err.status === 404 ? tr('Le token doit pouvoir lancer les workflows (GitHub : Actions en écriture).') : ''
      return reply.code(502).send({ error: [forgeError(err), hint].filter(Boolean).join(' ') })
    }
  })
}
