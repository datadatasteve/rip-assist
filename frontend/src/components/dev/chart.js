// Shared chart helpers. Series colors follow the entity (stable per name), never its rank.
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`)

const assigned = new Map()
export function colorFor(name) {
  if (!assigned.has(name)) assigned.set(name, SERIES[Math.min(assigned.size, SERIES.length - 1)])
  return assigned.get(name)
}

export const axisProps = {
  stroke: 'var(--muted)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false, axisLine: { stroke: 'var(--grid)' },
}
export const tooltipProps = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 },
  labelStyle: { color: 'var(--muted)' },
  itemStyle: { color: 'var(--text)' },
}
export const gridProps = { stroke: 'var(--grid)', vertical: false }

export function bucketKey(iso, size) {
  const d = new Date(iso)
  if (size === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (size === 'week') { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x.toISOString().slice(0, 10) }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
