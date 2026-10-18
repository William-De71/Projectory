import { useCallback, useEffect, useState } from 'react'

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
}

// Lets any page tell the others (menu badge, dashboard...) that data changed.
export const notifyChange = () => window.dispatchEvent(new Event('devdeck:change'))

export function useChangeListener(callback) {
  useEffect(() => {
    window.addEventListener('devdeck:change', callback)
    return () => window.removeEventListener('devdeck:change', callback)
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
