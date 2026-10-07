import { colorOf } from '../../lib/momentum'

const TREND_LABEL = { rising: 'rising', flat: 'flat', falling: 'falling' }

// Overview: colored dot from trend.
export function MomentumDot({ item, color, size }) {
  const c = color || colorOf(item)
  const t = item?.momentum_trend || 'flat'
  return <span className={`dot ${c}${size === 'lg' ? ' lg' : ''}`} title={`Momentum ${item?.momentum ?? '–'} · ${TREND_LABEL[t]}`} />
}

// Detail: 0–100 bar + number + trend arrow.
export function MomentumBar({ item }) {
  const c = colorOf(item)
  const t = item?.momentum_trend || 'flat'
  const arrow = { rising: '↑', flat: '→', falling: '↓' }[t]
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row-between">
        <small>Momentum</small>
        <small><b style={{ color: `var(--${c})` }}>{item?.momentum ?? 0}</b>/100 {arrow} {t}</small>
      </div>
      <div className={`bar ${c}`}><i style={{ width: `${item?.momentum ?? 0}%` }} /></div>
    </div>
  )
}
