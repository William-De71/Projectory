// Projectory service worker: makes the app installable and usable offline.
// The shell and the API answers are cached; the network always comes first,
// so data stays live and the cache only serves when the server is unreachable.
const CACHE = 'projectory-shell-v2'
const API_CACHE = 'projectory-api-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']
// Live state, downloads and secrets: never answered from the cache.
const API_LIVE = ['/api/health', '/api/update', '/api/sync', '/api/export', '/api/calendar']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

const store = (cacheName, request, res) => {
  if (res.ok) {
    const copy = res.clone()
    caches.open(cacheName).then((c) => c.put(request, copy))
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    if (API_LIVE.some((p) => url.pathname.startsWith(p))) return
    // Attachments never change: cache first.
    if (url.pathname.startsWith('/api/uploads/')) {
      event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => store(API_CACHE, request, res))))
      return
    }
    // Data: network first, last answer when offline (Response.error() makes fetch fail as offline).
    event.respondWith(
      fetch(request)
        .then((res) => store(API_CACHE, request, res))
        .catch(() => caches.match(request).then((hit) => hit || Response.error()))
    )
    return
  }

  // Pages: network first so a new version is picked up, cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => store(CACHE, '/', res))
        .catch(() => caches.match('/'))
    )
    return
  }

  // Hashed build assets and icons: cache first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => store(CACHE, request, res))))
  }
})
