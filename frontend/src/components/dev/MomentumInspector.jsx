import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { relative } from '../../lib/time'

export default function MomentumInspector() {
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)
  const [filter, setFilter] = useState('open')
  const load = () => api('/api/momentum/inspector').then(setRows).catch((e) => setMsg(e.message))
  useEffect(() => { load() }, [])
  async function decay() {
    try { const r = await api('/api/momentum/recompute', { method: 'POST' }); setMsg(`Decay pass: ${JSON.stringify(r)}`); load() } catch (e) { setMsg(e.message) }
  }
  async function review() {
    setMsg('Asking AI…')
    try { const r = await api('/api/ai/momentum-review', { method: 'POST' }); setMsg(r.parsed?.summary || r.content) } catch (e) { setMsg(e.message) }
  }
  const shown = rows.filter((r) => filter === 'all' || ['active', 'waiting_on', 'dead'].includes(r.status))
  return (
    <div className="card">
      <div className="card-head"><h2>Momentum inspector</h2>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 120 }} aria-label="Filter"><option value="open">Open</option><option value="all">All</option></select>
          <button className="small" onClick={load}>Refresh</button><button className="small" onClick={decay}>Run decay pass</button><button className="small" onClick={review}>AI review</button>
        </div>
      </div>
      {msg && <div className="banner" style={{ whiteSpace: 'pre-wrap' }}>{msg}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Status</th><th>Momentum</th><th>Trend</th><th>Score</th><th>Last touch</th><th>Threshold</th><th>Decayed on</th><th>Low since</th><th>Due</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><span className="pill">{r.kind}</span> {r.title}</td><td>{r.status}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><span className={`dot ${r.color}`} />{r.momentum}</div></td>
                <td>{r.trend || 'flat'}</td><td>{r.suggestion_score}</td><td>{relative(r.last_interaction)}</td>
                <td>{r.decay_threshold_days}d</td><td>{r.decay_applied_on || '–'}</td><td>{r.low_since ? relative(r.low_since) : '–'}</td><td>{r.due_date || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Nothing to inspect.</div>}
      </div>
    </div>
  )
}
