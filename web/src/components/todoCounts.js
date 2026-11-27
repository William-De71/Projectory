import { useCallback, useEffect, useState } from 'react'
import { api, useChangeListener } from '../api/client.js'
import { needsAction } from '../pages/MyGithub.jsx'
import { isGreen } from '../pages/Dependencies.jsx'
import { needsRelease } from './ReleaseRow.jsx'

// Inbox kinds of a new issue or PR / MR (CONTRIBUTION_KINDS on the server).
export const CONTRIBUTION_KINDS = ['pr', 'issue']

// What waits for the user, per tab of the "To do" page: unread news, GitHub
// items needing an action, dependency updates ready to merge, releases to
// repair or launch, stale threads. `contrib`: unread new issues and PRs / MRs (already
// part of `news`), singled out so they are not lost among the rest.
// `loaded` stays false until the first answer.
export function useTodoCounts() {
  const [counts, setCounts] = useState({ news: 0, contrib: 0, github: 0, deps: 0, releases: 0, stale: 0, loaded: false })
  const refresh = useCallback(() => {
    const count = (url, pick) => api.get(url).then(pick).catch(() => 0)
    Promise.all([
      count('/inbox?unread=1&limit=1000', (rows) => rows.length),
      count('/my-github', (rows) => rows.filter(needsAction).length),
      count('/dependency-prs', (rows) => rows.filter(isGreen).length),
      count('/releases', (rows) => rows.filter(needsRelease).length),
      count('/stale', (res) => res.items.length),
      count(`/inbox?unread=1&kind=${CONTRIBUTION_KINDS}&limit=1000`, (rows) => rows.length),
    ]).then(([news, github, deps, releases, stale, contrib]) => setCounts({ news, contrib, github, deps, releases, stale, loaded: true }))
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [refresh])
  useChangeListener(refresh)
  return counts
}
