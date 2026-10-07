import { useState } from 'react'
import { useData } from '../../hooks/useData'
import { db } from '../../lib/supabase'
import { Input, Select, TextField } from '../shared/Field'
import Modal from '../shared/Modal'

export const LANE_COLORS = ['#2f6f5e', '#3b6fd8', '#8a4fd6', '#d2453b', '#d69e1c', '#2f9e5b', '#d6589a', '#4b8f9e', '#7a6a58']
const TYPES = [
  { value: 'persistent', label: 'Persistent — ongoing area (Health, Work)' },
  { value: 'project', label: 'Project — has an outcome, then archives' },
  { value: 'temporary', label: 'Temporary — ends on a date' },
]

export default function LaneForm({ lane, onClose }) {
  const { lanes } = useData()
  const [f, setF] = useState({
    name: lane?.name || '', type: lane?.type || 'persistent', color: lane?.color || LANE_COLORS[lanes.rows.length % LANE_COLORS.length],
    icon: lane?.icon || '', end_date: lane?.end_date || '',
  })
  const [err, setErr] = useState(null)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Name required')
    if (f.type === 'temporary' && !f.end_date) return setErr('Temporary lanes need an end date')
    const row = { name: f.name.trim(), type: f.type, color: f.color, icon: f.icon || null, end_date: f.type === 'temporary' ? f.end_date : null }
    try {
      const saved = lane ? await db.update('lanes', lane.id, row) : await db.insert('lanes', { ...row, sort_order: lanes.rows.length })
      lanes.merge(saved)
      onClose()
    } catch (e2) { setErr(e2.message) }
  }
  async function archive() {
    try { lanes.merge(await db.update('lanes', lane.id, { archived_at: lane.archived_at ? null : new Date().toISOString() })); onClose() } catch (e) { setErr(e.message) }
  }

  return (
    <Modal title={lane ? 'Edit lane' : 'New lane'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="form-row">
          <TextField label="Name" value={f.name} onChange={set('name')} autoFocus />
          <Input label="Icon (emoji)" value={f.icon} onChange={set('icon')} maxLength={4} placeholder="💼" />
        </div>
        <Select label="Type" value={f.type} onChange={set('type')} options={TYPES} />
        {f.type === 'temporary' && <Input label="End date" type="date" value={f.end_date} onChange={set('end_date')} />}
        <label className="field"><span>Color</span>
          <div className="row">
            {LANE_COLORS.map((c) => (
              <button type="button" key={c} onClick={() => set('color')(c)} aria-label={`color ${c}`}
                style={{ width: 30, height: 30, minHeight: 0, padding: 0, borderRadius: 999, background: c, outline: f.color === c ? '3px solid var(--text)' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </label>
        {err && <div className="error">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {lane && <button type="button" onClick={archive}>{lane.archived_at ? 'Unarchive' : 'Archive'}</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Save</button>
        </div>
      </form>
    </Modal>
  )
}
