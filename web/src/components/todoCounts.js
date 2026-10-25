import { useCallback, useEffect, useState } from 'react'
import { api, useChangeListener } from '../api/client.js'
import { needsAction } from '../pages/MyGithub.jsx'
import { isGreen } from '../pages/Dependencies.jsx'

// What waits for the user, per tab of the "To do" page: unread news, GitHub
// items needing an action, dependency updates ready to merge, stale threads.
// `loaded` stays false until the first answer.
export function useTodoCounts() {
  const [counts, setCounts] = useState({ news: 0, github: 0, deps: 0, stale: 0, loaded: false })
  const refresh = useCallback(() => {
    const count = (url, pick) => api.get(url).then(pick).catch(() => 0)
    Promise.all([
      count('/inbox?unread=1&limit=1000', (rows) => rows.length),
      count('/my-github', (rows) => rows.filter(needsAction).length),
      count('/dependency-prs', (rows) => rows.filter(isGreen).length),
      count('/stale', (res) => res.items.length),
    ]).then(([news, github, deps, stale]) => setCounts({ news, github, deps, stale, loaded: true }))
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [refresh])
  useChangeListener(refresh)
  return counts
}
