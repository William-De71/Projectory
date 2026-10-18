import { decode } from '../db.js'
import { failedRun, fetchCi, fetchRepo, normalizeRepo } from './github.js'
import { fetchForum, forumSourceKey, latestVersion } from './sources.js'
import { notifyProject } from './notify.js'

export const syncState = { running: false, last_run_at: null, last_duration_ms: null, errors: [], notify_error: null }

// The first time a source is synced we record what already exists as read,
// so only what appears afterwards shows up as new in the inbox.
function isBaselined(db, key) {
  return !!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(`baseline:${key}`)
}
function markBaselined(db, key) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, datetime('now'))").run(`baseline:${key}`)
}

// Returns true when the entry is new and unread (i.e. worth a notification).
function pushInbox(db, entry, { asRead, fresh }) {
  const { changes } = db.prepare(
    `INSERT OR IGNORE INTO inbox (project_id, source, kind, title, url, excerpt, external_key, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')), ${asRead ? "datetime('now')" : 'NULL'})`
  ).run(
    entry.project_id,
    entry.source,
    entry.kind,
    entry.title,
    entry.url || '',
    entry.excerpt || '',
    entry.external_key,
    entry.created_at ? new Date(entry.created_at).toISOString().replace('T', ' ').slice(0, 19) : null
  )
  const isFresh = Number(changes) > 0 && !asRead
  if (isFresh) fresh?.push(entry)
  return isFresh
}

async function syncGithub(db, project, fresh, errors) {
  const repo = normalizeRepo(project.repo)
  const { info, items } = await fetchRepo(repo)
  const baseKey = `p${project.id}:github:${repo}`
  const asRead = !isBaselined(db, baseKey)

  try {
    info.ci = await fetchCi(repo, info.default_branch)
  } catch (err) {
    // Actions disabled or no access: keep the previous status, report the error.
    info.ci = project.github?.ci ?? null
    if (err.status !== 404) errors.push(`CI : ${err.message}`)
  }

  const existing = new Set(
    db.prepare('SELECT type, number FROM github_items WHERE project_id = ?').all(project.id).map((r) => `${r.type}#${r.number}`)
  )
  const upsert = db.prepare(
    `INSERT INTO github_items (project_id, type, number, title, author, url, labels, draft, comments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, type, number) DO UPDATE SET
       title = excluded.title, labels = excluded.labels, draft = excluded.draft,
       comments = excluded.comments, updated_at = excluded.updated_at`
  )
  db.exec('BEGIN')
  try {
    for (const it of items) {
      upsert.run(project.id, it.type, it.number, it.title, it.author, it.url, JSON.stringify(it.labels), it.draft ? 1 : 0, it.comments, it.created_at, it.updated_at)
      if (!existing.has(`${it.type}#${it.number}`)) {
        pushInbox(db, {
          project_id: project.id,
          source: 'github',
          kind: it.type === 'pr' ? 'pr' : 'issue',
          title: `#${it.number} ${it.title}`,
          url: it.url,
          excerpt: it.author ? `par ${it.author} — ${it.excerpt}` : it.excerpt,
          external_key: `${baseKey}:${it.type}:${it.number}`,
          created_at: it.created_at,
        }, { asRead, fresh })
      }
    }
    pushCiTransition(db, project, baseKey, info.ci, { asRead, fresh })
    // Anything no longer listed was closed or merged.
    const open = new Set(items.map((it) => `${it.type}#${it.number}`))
    const del = db.prepare('DELETE FROM github_items WHERE project_id = ? AND type = ? AND number = ?')
    for (const key of existing) {
      if (!open.has(key)) {
        const [type, number] = key.split('#')
        del.run(project.id, type, Number(number))
      }
    }
    db.prepare('UPDATE projects SET github = ? WHERE id = ?').run(JSON.stringify(info), project.id)
    markBaselined(db, baseKey)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// Only changes of state are worth an inbox entry: green -> red and red -> green.
function pushCiTransition(db, project, baseKey, ci, { asRead, fresh }) {
  const before = project.github?.ci?.conclusion
  if (!ci || before === ci.conclusion) return
  if (ci.conclusion === 'failure') {
    const run = failedRun(ci)
    pushInbox(db, {
      project_id: project.id,
      source: 'github',
      kind: 'ci_failed',
      title: `CI en échec : ${run.name}`,
      url: run.url,
      excerpt: `Branche ${project.github?.default_branch || 'principale'}${run.sha ? `, commit ${run.sha}` : ''}`,
      external_key: `${baseKey}:ci:${run.id}`,
    }, { asRead, fresh })
  } else if (ci.conclusion === 'success' && before === 'failure') {
    const run = ci.runs[0]
    pushInbox(db, {
      project_id: project.id,
      source: 'github',
      kind: 'ci_fixed',
      title: 'CI de nouveau au vert',
      url: run.url,
      excerpt: ci.runs.map((r) => r.name).join(', '),
      external_key: `${baseKey}:ci-fixed:${run.id}`,
    }, { asRead, fresh })
  }
}

async function syncVersions(db, project, errors, fresh) {
  const previous = new Map((project.versions || []).map((v) => [`${v.type}:${v.ref}`, v]))
  const results = []
  for (const source of project.version_sources || []) {
    const key = `${source.type}:${source.ref || ''}`
    const prev = previous.get(key)
    try {
      const latest = await latestVersion(source, normalizeRepo(project.repo))
      results.push({ type: source.type, ref: source.ref || '', ...latest, checked_at: new Date().toISOString() })
      if (latest && prev?.version && prev.version !== latest.version) {
        pushInbox(db, {
          project_id: project.id,
          source: 'version',
          kind: 'release',
          title: `Nouvelle version ${latest.version} (${source.type}${source.ref ? ` ${source.ref}` : ''})`,
          url: latest.url,
          excerpt: `Précédente : ${prev.version}${project.deployed_version ? ` — déployée chez toi : ${project.deployed_version}` : ''}`,
          external_key: `p${project.id}:version:${key}:${latest.version}`,
        }, { asRead: false, fresh })
      }
    } catch (err) {
      errors.push(`Version ${key} : ${err.message}`)
      results.push({ ...(prev || { type: source.type, ref: source.ref || '' }), error: err.message })
    }
  }
  db.prepare('UPDATE projects SET versions = ? WHERE id = ?').run(JSON.stringify(results), project.id)
}

async function syncForums(db, project, errors, fresh) {
  for (const source of project.forum_sources || []) {
    const baseKey = `p${project.id}:forum:${forumSourceKey(source)}`
    try {
      const topics = await fetchForum(source)
      const asRead = !isBaselined(db, baseKey)
      for (const t of topics) {
        pushInbox(db, {
          project_id: project.id,
          source: 'forum',
          kind: source.type,
          title: t.title,
          url: t.url,
          excerpt: t.excerpt,
          external_key: `${baseKey}:${t.id}`,
          created_at: t.created_at,
        }, { asRead, fresh })
      }
      markBaselined(db, baseKey)
    } catch (err) {
      errors.push(`Forum ${source.label || source.url} : ${err.message}`)
    }
  }
}

export async function syncProject(db, id, log = console) {
  const project = decode(db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
  if (!project) throw new Error('Projet introuvable')
  const errors = []
  const fresh = []
  if (project.repo) {
    try {
      await syncGithub(db, project, fresh, errors)
    } catch (err) {
      errors.push(`GitHub : ${err.message}`)
    }
  }
  await syncVersions(db, project, errors, fresh)
  await syncForums(db, project, errors, fresh)
  db.prepare("UPDATE projects SET last_synced_at = datetime('now'), sync_error = ? WHERE id = ?").run(errors.join('\n') || null, id)
  // A notification failure must not mark the project itself as broken.
  try {
    await notifyProject(db, project, fresh)
    if (fresh.length) syncState.notify_error = null
  } catch (err) {
    syncState.notify_error = `${new Date().toISOString()} — ${err.message}`
    log.warn?.(`ntfy : ${err.message}`)
  }
  return { id, errors, fresh: fresh.length }
}

export async function syncAll(db, log = console) {
  if (syncState.running) return { skipped: true }
  syncState.running = true
  const started = Date.now()
  const errors = []
  try {
    const ids = db.prepare("SELECT id FROM projects WHERE status != 'archived' ORDER BY id").all()
    for (const { id } of ids) {
      const res = await syncProject(db, id, log)
      errors.push(...res.errors.map((e) => `[${id}] ${e}`))
    }
  } finally {
    syncState.running = false
    syncState.last_run_at = new Date().toISOString()
    syncState.last_duration_ms = Date.now() - started
    syncState.errors = errors
  }
  if (errors.length) log.warn?.({ errors }, 'sync terminée avec erreurs')
  return { errors }
}

export function startScheduler(db, log) {
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? 30)
  if (!minutes) return null
  const run = () => syncAll(db, log).catch((err) => log.error(err, 'sync échouée'))
  setTimeout(run, 5000)
  return setInterval(run, minutes * 60 * 1000)
}
