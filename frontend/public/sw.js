/* rip-assist service worker: app-shell cache + Web Push. */
const VERSION = 'v1'
const SHELL = `ra-shell-${VERSION}`
const ASSETS = `ra-assets-${VERSION}`
const BASE = new URL('./', self.location).pathname // '/rip-assist/'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([BASE, `${BASE}manifest.json`, `${BASE}icons/icon-192.png`])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // never cache Supabase / API traffic

  // navigations: network first, fall back to cached shell (offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(BASE, copy)); return res })
        .catch(() => caches.match(BASE)),
    )
    return
  }
  // hashed build assets: cache first
  if (url.pathname.startsWith(`${BASE}assets/`) || url.pathname.startsWith(`${BASE}icons/`)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})

self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: 'rip-assist', body: e.data && e.data.text() } }
  const title = data.title || 'rip-assist'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-192.png`,
    data: { url: data.url || '' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const hash = (e.notification.data && e.notification.data.url) || ''
  const target = `${self.location.origin}${BASE}${hash.startsWith('#') ? hash : hash ? '#' + hash : ''}`
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(`${self.location.origin}${BASE}`) && 'focus' in c) { c.navigate(target); return c.focus() }
      }
      return self.clients.openWindow(target)
    }),
  )
})
