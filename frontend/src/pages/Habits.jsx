import { useState } from 'react'
import { Select, TextField } from '../components/shared/Field'
import LaneSelect from '../components/shared/LaneSelect'
import Modal from '../components/shared/Modal'
import Ring from '../components/shared/Ring'
import { useData } from '../hooks/useData'
import { computeStreak, DOW, dueToday, isDue } from '../lib/habits'
import { db, supabase } from '../lib/supabase'
import { addDays, isoDate } from '../lib/time'

export default function Habits() {
  const { habits, habitLogs } = useData()
  const [edit, setEdit] = useState(null)
  const today = isoDate()
  const logsFor = (id) => habitLogs.rows.filter((l) => l.habit_id === id)
  const due = habits.rows.filter((h) => { const l = logsFor(h.id); return l.some((x) => x.completed_date === today) || dueToday(h, l) })
  const doneCount = due.filter((h) => logsFor(h.id).some((l) => l.completed_date === today)).length

  return (
    <>
      <div className="topbar"><h1>Habits</h1><button className="primary" onClick={() => setEdit({})}>+ Habit</button></div>
      <div className="card">
        <div className="ring-wrap">
          <Ring value={doneCount} max={due.length} size={84} label="Habits done today" />
          <div><b>Today</b><br /><small>{doneCount} of {due.length} due habits done</small></div>
        </div>
      </div>
      {habits.rows.length === 0 && <div className="card empty">No habits yet. Add one to start a streak.</div>}
      {habits.rows.map((h) => <HabitCard key={h.id} habit={h} logs={logsFor(h.id)} onEdit={() => setEdit(h)} />)}
      {edit && <HabitForm habit={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </>
  )
}

function HabitCard({ habit, logs, onEdit }) {
  const { habits, habitLogs, lanesById } = useData()
  const [err, setErr] = useState(null)
  const doneSet = new Set(logs.map((l) => l.completed_date))
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6))
  const streak = computeStreak(habit, [...doneSet])
  const lane = lanesById[habit.lane_id]

  async function toggle(d) {
    const ds = isoDate(d)
    setErr(null)
    try {
      const existing = logs.find((l) => l.completed_date === ds)
      let next
      if (existing) {
        await db.remove('habit_logs', existing.id); habitLogs.drop(existing.id)
        next = [...doneSet].filter((x) => x !== ds)
      } else {
        const row = await db.insert('habit_logs', { habit_id: habit.id, completed_date: ds }); habitLogs.merge(row)
        next = [...doneSet, ds]
      }
      const cur = computeStreak(habit, next)
      const patch = { current_streak: cur, longest_streak: Math.max(habit.longest_streak || 0, cur), last_completed: next.sort().at(-1) || null }
      habits.merge(await db.update('habits', habit.id, patch))
    } catch (e) { setErr(e.message) }
  }

  const freq = habit.frequency === 'custom' ? (habit.custom_days || []).map((d) => DOW[d]).join(' ') : habit.frequency
  return (
    <div className="card">
      <div className="row-between">
        <div style={{ minWidth: 0 }}>
          <b className="truncate">{habit.title}</b><br />
          <small>{freq}{lane ? ` · ${lane.icon || ''} ${lane.name}` : ''} · 🔥 {streak} (best {Math.max(habit.longest_streak || 0, streak)})</small>
        </div>
        <button className="small ghost" onClick={onEdit} aria-label="Edit habit">✎</button>
      </div>
      <div className="week-grid" style={{ marginTop: 10 }}>
        {days.map((d) => {
          const ds = isoDate(d)
          const on = doneSet.has(ds)
          const off = habit.frequency === 'custom' && !isDue(habit, d)
          return (
            <button key={ds} className={`${on ? 'done' : ''}${off ? ' off' : ''}`} onClick={() => toggle(d)} title={`${ds}${on ? ' ✓' : ''}`}>
              {DOW[d.getDay()][0]}
            </button>
          )
        })}
      </div>
      {err && <div className="error">{err}</div>}
    </div>
  )
}

function HabitForm({ habit, onClose }) {
  const { habits } = useData()
  const [f, setF] = useState({ title: habit?.title || '', frequency: habit?.frequency || 'daily', custom_days: habit?.custom_days || [1, 3, 5], lane_id: habit?.lane_id || null })
  const [err, setErr] = useState(null)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!f.title.trim()) return setErr('Title required')
    const row = { title: f.title.trim(), frequency: f.frequency, custom_days: f.frequency === 'custom' ? f.custom_days : null, lane_id: f.lane_id }
    try {
      habits.merge(habit ? await db.update('habits', habit.id, row) : await db.insert('habits', row))
      onClose()
    } catch (e2) { setErr(e2.message) }
  }
  async function archive() {
    if (!confirm('Archive this habit?')) return
    await supabase.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', habit.id)
    habits.drop(habit.id); onClose()
  }

  return (
    <Modal title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <TextField label="Habit" value={f.title} onChange={set('title')} autoFocus />
        <Select label="Frequency" value={f.frequency} onChange={set('frequency')} options={[
          { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly (once per week)' }, { value: 'custom', label: 'Specific days' }]} />
        {f.frequency === 'custom' && (
          <div className="row">
            {DOW.map((d, i) => (
              <button type="button" key={d} className={`small${f.custom_days.includes(i) ? ' selected' : ''}`}
                onClick={() => set('custom_days')(f.custom_days.includes(i) ? f.custom_days.filter((x) => x !== i) : [...f.custom_days, i].sort())}>{d}</button>
            ))}
          </div>
        )}
        <LaneSelect value={f.lane_id} onChange={set('lane_id')} />
        {err && <div className="error">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {habit && <button type="button" className="danger" onClick={archive}>Archive</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Save</button>
        </div>
      </form>
    </Modal>
  )
}
