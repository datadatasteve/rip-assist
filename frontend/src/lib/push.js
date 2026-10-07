import { api } from './api'

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  } catch (e) {
    console.warn('SW registration failed', e)
    return null
  }
}

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Resolves the app's SW registration, registering it if needed. Unlike
// navigator.serviceWorker.ready this never hangs when registration failed.
async function getRegistration() {
  let reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  if (!reg) reg = await registerSW()
  if (!reg) throw new Error('Service worker unavailable in this browser, so push cannot be enabled here.')
  if (!reg.active) {
    // freshly registered: wait (bounded) for it to activate before subscribing
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10_000))])
  }
  return reg
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await getRegistration().catch(() => null)
  return reg ? reg.pushManager.getSubscription() : null
}

export async function subscribePush(deviceLabel) {
  if (!pushSupported()) throw new Error('Push not supported in this browser. On iPhone, install the app to the Home Screen first.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notification permission was not granted')
  const { key } = await api('/api/notifications/vapid-public-key')
  const reg = await getRegistration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
  }
  await api('/api/notifications/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), device_label: deviceLabel } })
  return sub
}

export async function unsubscribePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/api/notifications/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}

export function guessDeviceLabel() {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return `${os}${br ? ' · ' + br : ''}`
}
