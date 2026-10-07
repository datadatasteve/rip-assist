import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../../hooks/useData'
import { isoDate } from '../../lib/time'

const WINDOW_MS = 2 * 60 * 60 * 1000

function at(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0); return d
}

// In-app side of scheduled + random check-ins: if a slot passed (within 2h) and
// there's been no check-in since, show a banner. Push does the same while the app is closed.
export function useDueCheckin() {
  const { settings, checkins } = useData()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  if (!settings) return null
  const state = settings.checkin_state || {}
  const slots = [
    ...(settings.checkin_times || []).map((t) => ({ t, trigger: 'scheduled' })),
    ...(state.date === isoDate() ? state.random_times || [] : []).map((t) => ({ t, trigger: 'random' })),
  ]
    .map((s) => ({ ...s, at: at(s.t) }))
    .filter((s) => s.at.getTime() <= now && now - s.at.getTime() <= WINDOW_MS)
    .sort((a, b) => b.at - a.at)
  const latest = slots[0]
  if (!latest) return null
  const last = checkins.rows[0]
  if (last && new Date(last.created_at) >= latest.at) return null
  return latest
}

export default function CheckinDueBanner() {
  const due = useDueCheckin()
  const nav = useNavigate()
  const loc = useLocation()
  const [hidden, setHidden] = useState(null)
  if (!due || loc.pathname.startsWith('/checkin') || hidden === due.t) return null
  return (
    <div className="banner">
      <span>♥</span>
      <span style={{ flex: 1 }}>{due.trigger === 'random' ? 'Random check-in' : 'Scheduled check-in'} — how's it going?</span>
      <button className="small primary" onClick={() => nav(`/checkin?trigger=${due.trigger}`)}>Check in</button>
      <button className="small ghost" onClick={() => setHidden(due.t)}>Later</button>
    </div>
  )
}
