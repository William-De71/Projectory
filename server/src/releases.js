import { parse } from 'yaml'
import { FAILED } from './sync/forges/common.js'

// A run still queued or in progress after this long is considered stuck.
export const STUCK_MINUTES = 30

// Conventional Commits type of a commit message; "chore(release): …" commits
// are the releases themselves.
export function commitType(message) {
  const [title, ...rest] = String(message || '').split('\n')
  const m = title.match(/^(\w+)(?:\([^)]*\))?(!)?:\s/)
  const type = m ? m[1].toLowerCase() : 'other'
  const breaking = !!m?.[2] || rest.some((line) => /^BREAKING[ -]CHANGE:/.test(line))
  return { type, breaking, release: type === 'chore' && /^chore\(release\)/i.test(title) }
}

// The version the commits since the last tag call for: breaking -> major
// (minor below 1.0.0), feat -> minor, fix / perf -> patch, anything else -> none.
export function bumpOf(commits) {
  if (commits.some((c) => c.breaking)) return 'major'
  if (commits.some((c) => c.type === 'feat')) return 'minor'
  if (commits.some((c) => c.type === 'fix' || c.type === 'perf')) return 'patch'
  return null
}

export function nextVersion(tag, bump) {
  const m = String(tag || '').match(/^(v?)(\d+)\.(\d+)\.(\d+)/)
  if (!m || !bump) return null
  let [major, minor, patch] = [Number(m[2]), Number(m[3]), Number(m[4])]
  if (bump === 'major' && major === 0) bump = 'minor'
  if (bump === 'major') [major, minor, patch] = [major + 1, 0, 0]
  else if (bump === 'minor') [minor, patch] = [minor + 1, 0]
  else patch += 1
  return `${m[1]}${major}.${minor}.${patch}`
}

// Where a repository stands, from the state stored by the sync:
// stuck | failed | running | pending (commits worth a version) | quiet
// (commits that release nothing) | up_to_date | unknown (no release workflow nor tag).
export function releaseView(release, now = Date.now()) {
  if (!release) return null
  const commits = (release.commits || []).map((c) => ({ ...c, ...commitType(c.message) })).filter((c) => !c.release)
  const bump = bumpOf(commits)
  const run = release.run
  let status
  if (run && run.status !== 'completed') {
    status = now - new Date(run.created_at).getTime() > STUCK_MINUTES * 60e3 ? 'stuck' : 'running'
  } else if (run && [...FAILED, 'cancelled'].includes(run.conclusion) && !(release.published_at && run.created_at < release.published_at)) {
    status = 'failed'
  } else if (bump) {
    status = 'pending'
  } else if (commits.length) {
    status = 'quiet'
  } else {
    status = release.tag || release.workflow ? 'up_to_date' : 'unknown'
  }
  const types = {}
  for (const c of commits) types[c.breaking ? 'breaking' : c.type] = (types[c.breaking ? 'breaking' : c.type] || 0) + 1
  return {
    ...release,
    commits: commits.map(({ message, ...c }) => ({ ...c, title: String(message).split('\n')[0] })),
    ahead_by: Math.max(release.ahead_by || 0, commits.length),
    types,
    bump,
    next_version: nextVersion(release.tag, bump),
    status,
  }
}

// The workflow that publishes versions: release.yml first, then by name.
export function pickReleaseWorkflow(workflows) {
  const active = (workflows || []).filter((w) => w.state === 'active')
  const file = (w) => String(w.path || '').split('/').pop().toLowerCase()
  return active.find((w) => /^release\.ya?ml$/.test(file(w)))
    || active.find((w) => /^release$/i.test(w.name))
    || active.find((w) => /release/i.test(file(w)) && !/github-release/.test(file(w)))
    || null
}

// Manual trigger of a workflow file: null when it cannot be run by hand,
// otherwise its inputs ({ name, type, description, required, default, options }).
export function dispatchInputs(text) {
  let doc
  try { doc = parse(text) } catch { return null }
  // YAML 1.1 readers turn the key "on" into true.
  const on = doc?.on ?? doc?.[true]
  const dispatch = typeof on === 'string' ? (on === 'workflow_dispatch' ? {} : undefined)
    : Array.isArray(on) ? (on.includes('workflow_dispatch') ? {} : undefined)
      : on && 'workflow_dispatch' in on ? (on.workflow_dispatch || {}) : undefined
  if (!dispatch) return null
  return Object.entries(dispatch.inputs || {}).map(([name, spec]) => ({
    name,
    type: spec?.type || 'string',
    description: spec?.description || '',
    required: !!spec?.required,
    default: spec?.default ?? null,
    options: Array.isArray(spec?.options) ? spec.options.map(String) : null,
  }))
}
