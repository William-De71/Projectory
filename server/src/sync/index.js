import { decode, getConfig } from '../db.js'
import { failedRun, forgeFor, normalizeRepo } from './forges/index.js'
import { fetchForum, forumSourceKey, latestVersion } from './sources.js'
import { notifyProject } from './notify.js'
import { tr } from '../i18n.js'

export const syncState = { running: false, last_run_at: null, last_duration_ms: null, errors: [], notify_error: null }

export const FORGE_SOURCES = ['github', 'gitlab', 'gitea']

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

// Keys of GitHub projects keep their historical shape so existing baselines stay valid.
function forgeKey(project, repo) {
  if (project.forge === 'github') return `p${project.id}:github:${repo}`
  return `p${project.id}:${project.forge}:${project.forge_url}:${repo}`
}

async function syncForge(db, project, fresh, errors) {
  const forge = forgeFor(db, project)
  const repo = normalizeRepo(project.repo)
  const { info, items } = await forge.fetchRepo(repo)
  const baseKey = forgeKey(project, repo)
  const asRead = !isBaselined(db, baseKey)
  const source = project.forge

  try {
    info.ci = await forge.fetchCi(repo, info.default_branch)
  } catch (err) {
    // CI disabled or no access: keep the previous status, report the error.
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
          source,
          kind: it.type === 'pr' ? 'pr' : 'issue',
          title: `${it.type === 'pr' && source === 'gitlab' ? '!' : '#'}${it.number} ${it.title}`,
          url: it.url,
          excerpt: it.author ? tr('par {author} — {text}', { author: it.author, text: it.excerpt }) : it.excerpt,
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
    closeLinkedItems(db, project, items)
    db.prepare('UPDATE projects SET github = ? WHERE id = ?').run(JSON.stringify(info), project.id)
    markBaselined(db, baseKey)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// An item whose forge issue is no longer open gets closed too. Skipped when
// the issue list may be truncated (adapters stop at 5 pages).
function closeLinkedItems(db, project, items) {
  const issues = items.filter((it) => it.type === 'issue')
  if (issues.length >= 250) return
  const open = new Set(issues.map((it) => it.number))
  const linked = db.prepare(
    "SELECT id, issue_number FROM items WHERE project_id = ? AND issue_number IS NOT NULL AND status IN ('todo', 'in_progress')"
  ).all(project.id)
  const close = db.prepare("UPDATE items SET status = 'done', updated_at = datetime('now') WHERE id = ?")
  for (const it of linked) if (!open.has(it.issue_number)) close.run(it.id)
}

// Only changes of state are worth an inbox entry: green -> red and red -> green.
function pushCiTransition(db, project, baseKey, ci, { asRead, fresh }) {
  const before = project.github?.ci?.conclusion
  if (!ci || before === ci.conclusion) return
  if (ci.conclusion === 'failure') {
    const run = failedRun(ci)
    pushInbox(db, {
      project_id: project.id,
      source: project.forge,
      kind: 'ci_failed',
      title: tr('CI en échec : {name}', { name: run.name }),
      url: run.url,
      excerpt: run.sha
        ? tr('Branche {branch}, commit {sha}', { branch: project.github?.default_branch || tr('principale'), sha: run.sha })
        : tr('Branche {branch}', { branch: project.github?.default_branch || tr('principale') }),
      external_key: `${baseKey}:ci:${run.id}`,
    }, { asRead, fresh })
  } else if (ci.conclusion === 'success' && before === 'failure') {
    const run = ci.runs[0]
    pushInbox(db, {
      project_id: project.id,
      source: project.forge,
      kind: 'ci_fixed',
      title: tr('CI de nouveau au vert'),
      url: run.url,
      excerpt: ci.runs.map((r) => r.name).join(', '),
      external_key: `${baseKey}:ci-fixed:${run.id}`,
    }, { asRead, fresh })
  }
}

async function syncVersions(db, project, errors, fresh) {
  const previous = new Map((project.versions || []).map((v) => [`${v.type}:${v.ref}`, v]))
  const results = []
  const context = {
    repo: normalizeRepo(project.repo),
    forges: { project: forgeFor(db, project), github: forgeFor(db, { forge: 'github' }) },
  }
  for (const source of project.version_sources || []) {
    const key = `${source.type}:${source.ref || ''}`
    const prev = previous.get(key)
    try {
      const latest = await latestVersion(source, context)
      results.push({ type: source.type, ref: source.ref || '', ...latest, checked_at: new Date().toISOString() })
      if (latest && prev?.version && prev.version !== latest.version) {
        pushInbox(db, {
          project_id: project.id,
          source: 'version',
          kind: 'release',
          title: tr('Nouvelle version {v} ({source})', { v: latest.version, source: `${source.type === 'repo' ? tr('dépôt') : source.type}${source.ref ? ` ${source.ref}` : ''}` }),
          url: latest.url,
          excerpt: project.deployed_version
            ? tr('Précédente : {prev} — déployée chez toi : {used}', { prev: prev.version, used: project.deployed_version })
            : tr('Précédente : {prev}', { prev: prev.version }),
          external_key: `p${project.id}:version:${key}:${latest.version}`,
        }, { asRead: false, fresh })
      }
    } catch (err) {
      errors.push(tr('Version {key} : {error}', { key, error: err.message }))
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
      errors.push(tr('Forum {name} : {error}', { name: source.label || source.url, error: err.message }))
    }
  }
}

async function notify(db, project, fresh, log) {
  // A notification failure must not mark the project itself as broken.
  try {
    await notifyProject(db, project, fresh)
    if (fresh.length) syncState.notify_error = null
  } catch (err) {
    syncState.notify_error = `${new Date().toISOString()} — ${err.message}`
    log.warn?.(`ntfy : ${err.message}`)
  }
}

export async function syncProject(db, id, log = console) {
  const project = decode(db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
  if (!project) throw new Error(tr('Projet introuvable'))
  const errors = []
  const fresh = []
  if (project.repo) {
    try {
      await syncForge(db, project, fresh, errors)
    } catch (err) {
      errors.push(`${project.forge === 'github' ? 'GitHub' : project.forge === 'gitlab' ? 'GitLab' : 'Gitea'} : ${err.message}`)
    }
  }
  await syncVersions(db, project, errors, fresh)
  await syncForums(db, project, errors, fresh)
  db.prepare("UPDATE projects SET last_synced_at = datetime('now'), sync_error = ? WHERE id = ?").run(errors.join('\n') || null, id)
  await notify(db, project, fresh, log)
  return { id, errors, fresh: fresh.length }
}

export const GH_NOTIFICATION_REASONS = {
  review_requested: 'Review demandée',
  approval_requested: 'Approbation demandée',
  mention: 'Mention',
  team_mention: "Mention d'équipe",
  assign: 'Assignation',
  author: 'Activité sur ton issue / PR',
  comment: 'Réponse à ton commentaire',
  state_change: "Changement d'état",
  security_alert: 'Alerte de sécurité',
  invitation: 'Invitation',
  ci_activity: 'Activité CI',
  subscribed: 'Dépôt suivi (watch)',
  manual: 'Abonnement manuel',
}
export const DEFAULT_GH_REASONS = ['review_requested', 'approval_requested', 'mention', 'team_mention', 'assign', 'author', 'comment', 'security_alert', 'invitation']

// Reason labels are French source texts; tr() translates them when used.
export function ghNotificationConfig(db) {
  const stored = getConfig(db, 'github_notifications')
  return { enabled: !!stored.enabled, reasons: stored.reasons || DEFAULT_GH_REASONS }
}

// Personal GitHub notifications, attached to the matching project when there is one.
export async function syncGithubNotifications(db, log = console) {
  const config = ghNotificationConfig(db)
  if (!config.enabled) return []
  const threads = await forgeFor(db, { forge: 'github' }).fetchNotifications()
  const projects = db.prepare("SELECT id, name, repo, notify FROM projects WHERE forge = 'github' AND repo != ''").all()
  const byRepo = new Map(projects.map((p) => [normalizeRepo(p.repo).toLowerCase(), p]))
  const asRead = !isBaselined(db, 'github-notifications')
  const fresh = []
  for (const t of threads) {
    if (!config.reasons.includes(t.reason)) continue
    const project = byRepo.get(t.repo?.toLowerCase())
    pushInbox(db, {
      project_id: project?.id ?? null,
      source: 'github',
      kind: 'gh_notification',
      title: t.title,
      url: t.url,
      excerpt: `${tr(GH_NOTIFICATION_REASONS[t.reason] || t.reason)} · ${t.repo}`,
      external_key: `ghnotif:${t.id}:${t.updated_at}`,
      created_at: t.updated_at,
    }, { asRead, fresh })
  }
  markBaselined(db, 'github-notifications')
  const muted = new Set(projects.filter((p) => !p.notify).map((p) => p.id))
  await notify(db, { id: null, name: 'GitHub' }, fresh.filter((e) => !muted.has(e.project_id)), log)
  return fresh
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
    try {
      await syncGithubNotifications(db, log)
    } catch (err) {
      errors.push(tr('Notifications GitHub : {error}', { error: err.status === 403 || err.status === 401 ? tr('accès refusé — il faut un token classique avec le scope « notifications »') : err.message }))
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
