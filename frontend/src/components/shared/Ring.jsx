export default function Ring({ value, max, size = 64, stroke = 8, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max ? Math.min(1, value / max) : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || `${value} of ${max}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 4.2} fontWeight="700" fill="var(--text)">
        {value}/{max}
      </text>
    </svg>
  )
}
