import { useState } from 'react'
import { useData } from '../../hooks/useData'
import { momentumEvent } from '../../lib/api'
import { db } from '../../lib/supabase'
import { addDays, isoDate, toLocalInput } from '../../lib/time'
import { Input, TextField } from '../shared/Field'
import LaneSelect from '../shared/LaneSelect'
import Modal from '../shared/Modal'

export function scheduledSoon(start) {
  if (!start) return false
  const d = isoDate(new Date(start))
  return d === isoDate() || d === isoDate(addDays(new Date(), 1))
}

// Create/edit a chunk (a schedulable block of work under a task or goal).
export default function ChunkForm({ chunk, parent, onClose }) {
  const { chunks } = useData()
  const [f, setF] = useState({
    title: chunk?.title || parent?.title || '',
    duration_minutes: String(chunk?.duration_minutes ?? 30),
    start: chunk?.scheduled_start ? toLocalInput(chunk.scheduled_start) : '',
    lane_id: chunk?.lane_id ?? null,
  })
  const [err, setErr] = useState(null)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  async function save(e) {
    e.preventDefault()
    const dur = Number(f.duration_minutes)
    if (!f.title.trim() || !dur) return setErr('Title and duration required')
    const start = f.start ? new Date(f.start) : null
    const row = {
      title: f.title.trim(),
      duration_minutes: dur,
      scheduled_start: start ? start.toISOString() : null,
      scheduled_end: start ? new Date(start.getTime() + dur * 60000).toISOString() : null,
      lane_id: f.lane_id || null,
    }
    if (!chunk && parent) row[parent.kind === 'goal' ? 'goal_id' : 'task_id'] = parent.id
    try {
      const saved = chunk ? await db.update('chunks', chunk.id, row) : await db.insert('chunks', row)
      chunks.merge(saved)
      const wasSoon = scheduledSoon(chunk?.scheduled_start)
      if (scheduledSoon(saved.scheduled_start) && !wasSoon) momentumEvent('chunk', saved.id, 'scheduled_soon')
      onClose()
    } catch (e2) { setErr(e2.message) }
  }

  return (
    <Modal title={chunk ? 'Edit chunk' : `New chunk${parent ? ` · ${parent.title}` : ''}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <TextField label="Title" value={f.title} onChange={set('title')} autoFocus />
        <div className="form-row">
          <Input label="Minutes" type="number" min="5" step="5" value={f.duration_minutes} onChange={set('duration_minutes')} />
          <Input label="Start (optional)" type="datetime-local" value={f.start} onChange={set('start')} />
        </div>
        <div className="row">
          {[15, 25, 45, 60, 90].map((m) => (
            <button type="button" key={m} className={`small${Number(f.duration_minutes) === m ? ' selected' : ''}`} onClick={() => set('duration_minutes')(String(m))}>{m}m</button>
          ))}
        </div>
        <LaneSelect label="Lane override (optional)" value={f.lane_id} onChange={set('lane_id')} />
        {err && <div className="error">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Save</button>
        </div>
      </form>
    </Modal>
  )
}
