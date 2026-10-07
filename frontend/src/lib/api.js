import { supabase } from './supabase'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export async function api(path, { method = 'GET', body, signal } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = { detail: text } }
  if (!res.ok) {
    const msg = typeof json?.detail === 'string' ? json.detail : JSON.stringify(json?.detail || json)
    throw new Error(`${res.status}: ${msg}`)
  }
  return json
}

// Momentum events are fire-and-forget: the UI updates via Realtime when the
// backend writes the new score.
export function momentumEvent(entity_type, entity_id, event) {
  return api('/api/momentum/event', { method: 'POST', body: { entity_type, entity_id, event } })
    .catch((e) => console.warn('momentum event failed', e.message))
}
