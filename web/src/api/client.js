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
