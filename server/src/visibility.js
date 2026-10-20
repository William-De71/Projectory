import { normalizeRepo } from './sync/forges/index.js'

// SQL condition on github_items g joined to projects p: on a project limited to
// the user's own issues / PRs, only those that concern them are counted.
export const VISIBLE_ITEM = "(p.mine_only = 0 OR g.mine != '[]')"

// "auto": everything on the user's own repositories, only their own items on
// someone else's (e.g. GladysAssistant/Gladys); "all" / "mine" force it.
export function computeMineOnly(project) {
  const scope = project.github_scope || 'auto'
  if (scope === 'all') return 0
  if (scope === 'mine') return 1
  const viewer = project.github?.viewer
  const owner = normalizeRepo(project.repo || '').split('/')[0]
  return viewer && owner && owner.toLowerCase() !== viewer.toLowerCase() ? 1 : 0
}

export function refreshMineOnly(db, projectId) {
  const row = db.prepare('SELECT repo, github, github_scope FROM projects WHERE id = ?').get(projectId)
  if (!row) return 0
  let github = null
  try { github = JSON.parse(row.github || 'null') } catch { /* keep null */ }
  const value = computeMineOnly({ ...row, github })
  db.prepare('UPDATE projects SET mine_only = ? WHERE id = ?').run(value, projectId)
  return value
}
