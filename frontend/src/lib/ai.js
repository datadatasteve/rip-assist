// Frontend side of the AI provider abstraction. The browser never talks to a
// model provider directly: every call goes through the backend, which picks the
// provider (Ollama → cloud fallback), logs the interaction and tags versions.
import { api } from './api'
import { db } from './supabase'

export const ai = {
  suggest: (opts = {}) => api('/api/ai/suggest', { method: 'POST', body: opts }),
  replan: (opts = {}) => api('/api/ai/replan', { method: 'POST', body: opts }),
  decompose: (body) => api('/api/ai/decompose', { method: 'POST', body }),
  momentumReview: () => api('/api/ai/momentum-review', { method: 'POST', body: {} }),
  checkinReply: (id) => api(`/api/checkins/${id}/reply`, { method: 'POST' }),
  health: () => api('/api/ai/health'),
}

export const RATING_OPTIONS = [0, 1, 2, 3, 4, 5]
export const SUBS = ['low', 'mid', 'high']

export function ratingLabel(major, sub) {
  if (major == null) return ''
  return sub ? `${sub} ${major}` : String(major)
}

// Numeric value for trend math: low/mid/high shift by a third of a point.
export function ratingValue(major, sub) {
  if (major == null) return null
  return major + ({ low: -1 / 3, mid: 0, high: 1 / 3 }[sub] ?? 0)
}

export function rate(interactionId, major, sub) {
  return db.update('ai_interactions', interactionId, {
    user_rating_major: major,
    user_rating_sub: [2, 3, 4].includes(major) ? sub : null,
  })
}

export function markOutcome(interactionId, followed) {
  return db.update('ai_interactions', interactionId, { outcome_followed: followed })
}
