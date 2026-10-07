// Date helpers (local time).
export const MIN = 60_000
export const DAY = 86_400_000

export function startOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}
export function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}
export function isoDate(d = new Date()) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export function parseDate(s) {
  // 'YYYY-MM-DD' → local midnight (avoid UTC shift)
  const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d)
}
export function sameDay(a, b) {
  return isoDate(a) === isoDate(b)
}
export function hm(d) {
  return new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
export function shortDate(d) {
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
export function relative(d) {
  if (!d) return 'never'
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.round(diff / MIN)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}
export function toLocalInput(d) {
  // value for <input type="datetime-local">
  const x = new Date(d)
  return `${isoDate(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
export function minutesLabel(m) {
  if (m == null) return ''
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}
