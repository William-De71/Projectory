import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/index.js'

// Creations that can wait for the network: written down offline, sent back
// in order once the connection returns.
const OUTBOX_KEY = 'projectory:outbox'
const QUEUEABLE = [/^\/items$/, /^\/docs$/]

export function readOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') } catch { return [] }
}
function writeOutbox(entries) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('projectory:outbox'))
}

async function send(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

async function request(method, url, body) {
  try {
    return await send(method, url, body)
  } catch (err) {
    // fetch only throws a TypeError when the network is unreachable.
    if (!(err instanceof TypeError)) throw err
    if (method === 'POST' && QUEUEABLE.some((re) => re.test(url))) {
      writeOutbox([...readOutbox(), { method, url, body, at: new Date().toISOString() }])
      return { ...body, id: null, offline: true }
    }
    throw new Error(method === 'GET' ? t('Hors ligne et rien en cache pour cette page') : t('Hors ligne : action impossible pour l’instant'))
  }
}

let flushing = false
// Replays the waiting creations; stops at the first network failure.
export async function flushOutbox() {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    for (let entries = readOutbox(); entries.length; entries = readOutbox()) {
      try {
        await send(entries[0].method, entries[0].url, entries[0].body)
      } catch (err) {
        if (err instanceof TypeError) break
        // Refused by the server (e.g. project deleted meanwhile): dropped, but said.
        window.dispatchEvent(new CustomEvent('projectory:outbox-rejected', { detail: { title: entries[0].body?.title || '', error: err.message } }))
      }
      writeOutbox(readOutbox().slice(1))
      sent++
    }
  } finally {
    flushing = false
  }
  if (sent) notifyChange()
  return sent
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  // Sends the file as the raw body; resolves to { file, url, size, image }.
  upload: async (file) => {
    const res = await fetch(`/api/uploads?name=${encodeURIComponent(file.name || '')}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
    return data
  },
}

// Lets any page tell the others (menu badge, dashboard...) that data changed.
export const notifyChange = () => window.dispatchEvent(new Event('projectory:change'))

export function useChangeListener(callback) {
  useEffect(() => {
    window.addEventListener('projectory:change', callback)
    return () => window.removeEventListener('projectory:change', callback)
  }, [callback])
}

export function useApi(url, { listen = false } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    if (!url) return Promise.resolve()
    setLoading(true)
    return api.get(url)
      .then((d) => { setData(d); setError(null) })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [url])
  useEffect(() => { reload() }, [reload])
  useChangeListener(listen ? reload : noop)
  return { data, error, loading, reload, setData }
}

function noop() {}
