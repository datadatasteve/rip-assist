import { useState } from 'react'
import { useData } from '../../hooks/useData'
import { ai } from '../../lib/ai'
import { momentumEvent } from '../../lib/api'
import { db } from '../../lib/supabase'
import { addDays, minutesLabel } from '../../lib/time'
import { Input } from '../shared/Field'
import Modal from '../shared/Modal'
import Rating from '../shared/Rating'
import { scheduledSoon } from './ChunkForm'

// AI chunk decomposition: proposes chunks; nothing is saved until "Add chunks".
export default function DecomposeDialog({ parent, onClose }) {
  const { chunks } = useData()
  const [total, setTotal] = useState('')
  const [days, setDays] = useState('7')
  const [useCal, setUseCal] = useState(false)
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function run() {
    setBusy(true); setErr(null)
    try {
      setRes(await ai.decompose({ goal_id: parent.id, total_minutes: total ? Number(total) : null, days: Number(days) || 7, include_calendar_details: useCal }))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function accept() {
    const list = res?.parsed?.chunks || []
    const rows = list.map((c) => {
      let start = null
      if (c.suggested_start && /^\d{1,2}:\d{2}$/.test(c.suggested_start)) {
        const [h, m] = c.suggested_start.split(':').map(Number)
        start = addDays(new Date(), Number(c.day_offset) || 0); start.setHours(h, m, 0, 0)
      }
      const dur = Number(c.duration_minutes) || 30
      return {
        title: c.title, duration_minutes: dur,
        scheduled_start: start?.toISOString() ?? null,
        scheduled_end: start ? new Date(start.getTime() + dur * 60000).toISOString() : null,
        [parent.kind === 'goal' ? 'goal_id' : 'task_id']: parent.id,
      }
    })
    try {
      const saved = await db.insertMany('chunks', rows)
      saved.forEach(chunks.merge)
      const soon = saved.find((c) => scheduledSoon(c.scheduled_start))
      if (soon) momentumEvent('chunk', soon.id, 'scheduled_soon')
      if (res.interaction_id) await db.update('ai_interactions', res.interaction_id, { outcome_followed: true }).catch(() => {})
      onClose()
    } catch (e) { setErr(e.message) }
  }

  const list = res?.parsed?.chunks
  return (
    <Modal title={`Break down: ${parent.title}`} onClose={onClose}>
      <div className="form">
        <div className="form-row">
          <Input label="Total minutes (optional)" type="number" value={total} onChange={setTotal} placeholder="e.g. 300" />
          <Input label="Days available" type="number" value={days} onChange={setDays} />
        </div>
        <label className="check"><input type="checkbox" checked={useCal} onChange={(e) => setUseCal(e.target.checked)} /> Share today's calendar events with the AI for this request</label>
        <button className="primary" onClick={run} disabled={busy}>{busy ? 'Thinking…' : res ? 'Try again' : 'Suggest chunks'}</button>
        {err && <div className="error">{err}</div>}
        {res && (
          <div className="card">
            <small>{res.provider} · {res.model} · {res.latency_ms}ms</small>
            {list ? (
              <div className="list">
                {list.map((c, i) => (
                  <div key={i} className="list-item">
                    <div className="grow">{c.title}</div>
                    <small>{minutesLabel(c.duration_minutes)} · day +{c.day_offset ?? 0}{c.suggested_start ? ` @ ${c.suggested_start}` : ''}</small>
                  </div>
                ))}
                <small>Total: {minutesLabel(list.reduce((s, c) => s + (Number(c.duration_minutes) || 0), 0))}. {res.parsed.rationale}</small>
              </div>
            ) : <pre>{res.content}</pre>}
            <hr className="divider" />
            <Rating interactionId={res.interaction_id} showOutcome={false} />
          </div>
        )}
        {list?.length > 0 && <button className="primary" onClick={accept}>Add {list.length} chunks</button>}
      </div>
    </Modal>
  )
}
