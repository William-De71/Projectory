import { getConfig } from '../../db.js'
import github from './github.js'
import gitlab from './gitlab.js'
import gitea from './gitea.js'
import { tr } from '../../i18n.js'

export { ciConclusion, failedRun } from './common.js'

const ADAPTERS = { github, gitlab, gitea }

export const FORGE_LABELS = { github: 'GitHub', gitlab: 'GitLab', gitea: 'Gitea / Forgejo' }

const defaultUrl = (type) => ({ github: 'https://github.com', gitlab: 'https://gitlab.com', gitea: process.env.GITEA_URL || '' })[type]
const ENV_TOKEN = { github: 'GITHUB_TOKEN', gitlab: 'GITLAB_TOKEN', gitea: 'GITEA_TOKEN' }

const host = (url) => {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

// Accounts configured in Settings ("forges" config); tokens never leave the server.
export function forgeAccounts(db) {
  return getConfig(db, 'forges', {}).accounts || []
}

export function forgeContext(db, type, url) {
  const resolvedUrl = (url || defaultUrl(type) || '').replace(/\/+$/, '')
  const account = forgeAccounts(db).find((a) => a.type === type && host(a.url || defaultUrl(type)) === host(resolvedUrl))
  return { url: resolvedUrl, token: account?.token || process.env[ENV_TOKEN[type]] || '' }
}

// Adapter bound to a project's forge (or to an explicit { forge, forge_url }).
export function forgeFor(db, { forge = 'github', forge_url = '' } = {}) {
  const make = ADAPTERS[forge]
  if (!make) throw new Error(tr('Forge inconnue : {forge}', { forge }))
  return make(forgeContext(db, forge, forge_url))
}

// Accepts "owner/repo", "group/sub/project" or a full web / clone URL.
export function normalizeRepo(value) {
  let repo = String(value || '').trim()
  if (/^https?:\/\//i.test(repo)) {
    try { repo = new URL(repo).pathname } catch { /* keep as typed */ }
  }
  return repo
    .replace(/^git@[^:]+:/, '')
    .replace(/\/-\/.*$/, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '')
}
