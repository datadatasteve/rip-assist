import { useState } from 'react'
import ItemForm from '../components/tasks/ItemForm'
import { ItemRow } from '../components/tasks/ItemDetail'
import { Select } from '../components/shared/Field'
import { useData } from '../hooks/useData'
import { laneOf, suggestionScore } from '../lib/momentum'

const STATUSES = [
  { value: 'open', label: 'Open (active + waiting)' }, { value: 'active', label: 'Active' }, { value: 'waiting_on', label: 'Waiting on' },
  { value: 'dead', label: 'Dead' }, { value: 'complete', label: 'Complete' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' },
]

export default function Tasks() {
  const { goals, tasks, activeLanes, goalsById } = useData()
  const [create, setCreate] = useState(null)
  const [status, setStatus] = useState('open')
  const [lane, setLane] = useState('')
  const [sort, setSort] = useState('score')

  const match = (i) => (status === 'all' ? true : status === 'open' ? ['active', 'waiting_on'].includes(i.status) : i.status === status)
  const laneOk = (i, kind) => !lane || (kind === 'goal' ? i.lane_id : laneOf(i, goalsById)) === lane
  const sorter = {
    score: (a, b) => suggestionScore(b) - suggestionScore(a),
    momentum: (a, b) => a.momentum - b.momentum,
    due: (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'),
    recent: (a, b) => b.created_at.localeCompare(a.created_at),
  }[sort]
  const gl = goals.rows.filter((g) => match(g) && laneOk(g, 'goal')).sort(sorter)
  const tl = tasks.rows.filter((t) => match(t) && laneOk(t, 'task')).sort(sorter)
  const dead = [...goals.rows, ...tasks.rows].filter((i) => i.status === 'dead')

  return (
    <>
      <div className="topbar">
        <h1>Goals & tasks</h1>
        <div className="row">
          <button onClick={() => setCreate('goal')}>+ Goal</button>
          <button className="primary" onClick={() => setCreate('task')}>+ Task</button>
        </div>
      </div>
      {dead.length > 0 && status === 'open' && (
        <div className="banner danger">{dead.length} item{dead.length > 1 ? 's have' : ' has'} stalled out and need{dead.length > 1 ? '' : 's'} a decision. <button className="small" onClick={() => setStatus('dead')}>Review</button></div>
      )}
      <div className="form-row" style={{ marginBottom: 12 }}>
        <Select value={status} onChange={setStatus} options={STATUSES} aria-label="Status filter" />
        <Select value={lane} onChange={setLane} options={[{ value: '', label: 'All lanes' }, ...activeLanes.map((l) => ({ value: l.id, label: l.name }))]} aria-label="Lane filter" />
        <Select value={sort} onChange={setSort} aria-label="Sort" options={[
          { value: 'score', label: 'Sort: suggestion score' }, { value: 'momentum', label: 'Sort: lowest momentum' },
          { value: 'due', label: 'Sort: due date' }, { value: 'recent', label: 'Sort: newest' }]} />
      </div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Goals</h2><small>{gl.length}</small></div>
          {gl.length === 0 && <div className="empty">No goals here.</div>}
          <div className="list">{gl.map((g) => <ItemRow key={g.id} kind="goal" item={g} />)}</div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Tasks</h2><small>{tl.length}</small></div>
          {tl.length === 0 && <div className="empty">No tasks here.</div>}
          <div className="list">{tl.map((t) => <ItemRow key={t.id} kind="task" item={t} />)}</div>
        </div>
      </div>
      {create && <ItemForm kind={create} defaults={{ lane_id: lane || null }} onClose={() => setCreate(null)} />}
    </>
  )
}
