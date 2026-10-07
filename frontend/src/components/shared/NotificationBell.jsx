import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../hooks/useData'
import { supabase } from '../../lib/supabase'
import { relative } from '../../lib/time'

// In-app notification feed. Same rows the backend pushes, synced live across devices.
export default function NotificationBell() {
  const { notifications } = useData()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const nav = useNavigate()
  const unread = notifications.rows.filter((n) => !n.read_at)

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function markAll() {
    const ids = unread.map((n) => n.id)
    if (!ids.length) return
    const now = new Date().toISOString()
    ids.forEach((id) => notifications.merge({ id, read_at: now }))
    await supabase.from('notifications').update({ read_at: now }).in('id', ids)
  }

  function go(n) {
    setOpen(false)
    if (!n.read_at) {
      notifications.merge({ id: n.id, read_at: new Date().toISOString() })
      supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id).then(() => {})
    }
    if (n.url) nav(n.url.replace(/^#/, ''))
  }

  return (
    <div className="bell" ref={ref}>
      <button className="ghost icon" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${unread.length} unread)`}>
        🔔{unread.length > 0 && <span className="count">{unread.length}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="row-between" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <b>Notifications</b>
            <button className="small ghost" onClick={markAll} disabled={!unread.length}>Mark all read</button>
          </div>
          {notifications.rows.length === 0 && <div className="empty">Nothing yet.</div>}
          {notifications.rows.slice(0, 30).map((n) => (
            <div key={n.id} className="list-item clickable" style={{ padding: '10px 12px' }} onClick={() => go(n)}>
              {!n.read_at && <span className="dot green" />}
              <div className="grow">
                <div style={{ fontWeight: n.read_at ? 400 : 600 }}>{n.title}</div>
                {n.body && <small>{n.body}</small>}
              </div>
              <small style={{ whiteSpace: 'nowrap' }}>{relative(n.created_at)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
