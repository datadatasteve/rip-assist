import { useState } from 'react'
import { useData } from '../../hooks/useData'
import { db } from '../../lib/supabase'
import { Input, Select, TextField } from '../shared/Field'
import LaneSelect from '../shared/LaneSelect'
import Modal from '../shared/Modal'

const PRIORITIES = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

// Create/edit a goal or task.
export default function ItemForm({ kind, item, defaults = {}, onClose, onSaved }) {
  const { goals, tasks } = useData()
  const table = kind === 'goal' ? goals : tasks
  const [f, setF] = useState({
    title: item?.title || '',
    description: item?.description || '',
    lane_id: item?.lane_id ?? defaults.lane_id ?? null,
    goal_id: item?.goal_id ?? defaults.goal_id ?? null,
    priority_user: String(item?.priority_user ?? 5),
    due_date: item?.due_date || '',
    decay_threshold_days: String(item?.decay_threshold_days ?? 3),
  })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!f.title.trim()) return setErr('Title is required')
    setBusy(true)
    const row = {
      title: f.title.trim(),
      description: f.description || null,
      lane_id: f.lane_id || null,
      priority_user: Number(f.priority_user),
      due_date: f.due_date || null,
      decay_threshold_days: Number(f.decay_threshold_days) || 3,
    }
    if (kind === 'task') row.goal_id = f.goal_id || null
    if (!item) row.priority_app = Number(f.priority_user) // seeded; AI/engine may adjust later
    try {
      const saved = item ? await db.update(table === goals ? 'goals' : 'tasks', item.id, row) : await db.insert(kind === 'goal' ? 'goals' : 'tasks', row)
      table.merge(saved)
      onSaved?.(saved)
      onClose()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`${item ? 'Edit' : 'New'} ${kind}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <TextField label="Title" value={f.title} onChange={set('title')} autoFocus required />
        <TextField label="Description" value={f.description} onChange={set('description')} multiline />
        <div className="form-row">
          <LaneSelect value={f.lane_id} onChange={set('lane_id')} />
          {kind === 'task' && (
            <Select label="Goal" value={f.goal_id || ''} onChange={(v) => set('goal_id')(v || null)}
              options={[{ value: '', label: '— none —' }, ...goals.rows.filter((g) => g.status !== 'archived').map((g) => ({ value: g.id, label: g.title }))]} />
          )}
        </div>
        <div className="form-row">
          <Select label="Priority (1–10)" value={f.priority_user} onChange={set('priority_user')} options={PRIORITIES} />
          <Input label="Due date" type="date" value={f.due_date} onChange={set('due_date')} />
          <Input label="Decay after (days idle)" type="number" min="1" max="60" value={f.decay_threshold_days} onChange={set('decay_threshold_days')} />
        </div>
        {err && <div className="error">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
