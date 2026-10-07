import { useEffect, useState } from 'react'
import { useData } from '../../hooks/useData'
import { momentumEvent } from '../../lib/api'
import { db } from '../../lib/supabase'
import { relative, shortDate, parseDate } from '../../lib/time'
import { MomentumBar } from '../shared/Momentum'
import Modal from '../shared/Modal'
import ChunkForm from './ChunkForm'
import ChunkRow from './ChunkRow'
import DecomposeDialog from './DecomposeDialog'
import ItemForm from './ItemForm'

const STATUS_PILL = { active: 'accent', waiting_on: 'yellow', dead: 'red', complete: 'green', archived: '' }

export default function ItemDetail({ kind, id, onClose }) {
  const data = useData()
  const table = kind === 'goal' ? data.goals : data.tasks
  const item = (kind === 'goal' ? data.goalsById : data.tasksById)[id]
  const [edit, setEdit] = useState(false)
  const [addChunk, setAddChunk] = useState(false)
  const [decompose, setDecompose] = useState(false)
  const [addTask, setAddTask] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => { momentumEvent(kind, id, 'viewed') }, [kind, id])

  if (!item) return null
  const tbl = kind === 'goal' ? 'goals' : 'tasks'
  const lane = data.lanesById[item.lane_id]
  const myChunks = data.chunks.rows.filter((c) => (kind === 'goal' ? c.goal_id === id : c.task_id === id))
  const childTasks = kind === 'goal' ? data.tasks.rows.filter((t) => t.goal_id === id) : []

  async function patch(p) {
    try { table.merge(await db.update(tbl, id, p)) } catch (e) { setErr(e.message) }
  }
  const ev = (e) => momentumEvent(kind, id, e)

  async function waiting() {
    const who = prompt('Waiting on whom?', item.waiting_on_whom || '')
    if (who === null) return
    patch({ status: 'waiting_on', waiting_on_whom: who || null, waiting_since: new Date().toISOString(), waiting_prompted_at: null })
  }
  async function remove() {
    if (!confirm(`Delete this ${kind}? Chunks under it are deleted too.`)) return
    try { await db.remove(tbl, id); table.drop(id); onClose() } catch (e) { setErr(e.message) }
  }

  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row">
          <span className={`pill ${STATUS_PILL[item.status]}`}>{item.status.replace('_', ' ')}</span>
          <span className="pill">{kind}</span>
          {lane && <span className="pill" style={{ borderColor: lane.color }}>{lane.icon} {lane.name}</span>}
          <span className="pill">priority {item.priority_user ?? '–'}{item.priority_app ? ` / app ${item.priority_app}` : ''}</span>
          {item.due_date && <span className="pill">due {shortDate(parseDate(item.due_date))}</span>}
          {item.status === 'waiting_on' && <span className="pill yellow">waiting on {item.waiting_on_whom || '?'} · {relative(item.waiting_since)}</span>}
        </div>
        {item.description && <p>{item.description}</p>}
        <MomentumBar item={item} />
        <small>Last interaction {relative(item.last_interaction)} · decays after {item.decay_threshold_days} idle days</small>

        <div className="row">
          {item.status === 'active' && <>
            <button onClick={() => ev('progress')}>+ Log progress</button>
            <button onClick={() => ev('in_progress')}>▶ In progress</button>
            <button onClick={waiting}>⏸ Waiting on…</button>
          </>}
          {item.status === 'waiting_on' && <button onClick={() => ev('unblocked')}>▶ Unblocked</button>}
          {item.status === 'dead' && <button className="primary" onClick={() => patch({ status: 'active', dead_at: null, low_since: null, momentum: Math.max(item.momentum, 30), last_interaction: new Date().toISOString() })}>Revive</button>}
          {item.status !== 'complete' && <button onClick={() => patch({ status: 'complete', completed_at: new Date().toISOString() })}>✓ Complete</button>}
          {['complete', 'archived'].includes(item.status) && <button onClick={() => patch({ status: 'active', completed_at: null })}>Reopen</button>}
          {item.status !== 'archived' && <button onClick={() => patch({ status: 'archived' })}>Archive</button>}
          <button onClick={() => setEdit(true)}>✎ Edit</button>
          <button className="danger" onClick={remove}>Delete</button>
        </div>
        {err && <div className="error">{err}</div>}

        {kind === 'goal' && (
          <div className="card">
            <div className="card-head"><h3>Tasks</h3><button className="small" onClick={() => setAddTask(true)}>+ Task</button></div>
            {childTasks.length === 0 && <div className="empty">No tasks under this goal.</div>}
            <div className="list">
              {childTasks.map((t) => <ItemRow key={t.id} kind="task" item={t} compact />)}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h3>Chunks</h3>
            <div className="row">
              <button className="small" onClick={() => setDecompose(true)}>✨ AI break down</button>
              <button className="small" onClick={() => setAddChunk(true)}>+ Chunk</button>
            </div>
          </div>
          {myChunks.length === 0 && <div className="empty">No chunks yet. Chunks are schedulable blocks of work.</div>}
          <div className="list">{myChunks.map((c) => <ChunkRow key={c.id} chunk={c} />)}</div>
        </div>
      </div>
      {edit && <ItemForm kind={kind} item={item} onClose={() => setEdit(false)} />}
      {addChunk && <ChunkForm parent={{ ...item, kind }} onClose={() => setAddChunk(false)} />}
      {decompose && <DecomposeDialog parent={{ ...item, kind }} onClose={() => setDecompose(false)} />}
      {addTask && <ItemForm kind="task" defaults={{ goal_id: id, lane_id: item.lane_id }} onClose={() => setAddTask(false)} />}
    </Modal>
  )
}

export function ItemRow({ kind, item, compact, onOpen }) {
  const { lanesById, chunks } = useData()
  const [open, setOpen] = useState(false)
  const lane = lanesById[item.lane_id]
  const openChunks = chunks.rows.filter((c) => (kind === 'goal' ? c.goal_id : c.task_id) === item.id && !c.completed_at && !c.skipped_at).length
  const color = { rising: 'green', flat: 'yellow', falling: 'red' }[item.momentum_trend || 'flat']
  return (
    <>
      <div className="list-item clickable" onClick={() => (onOpen ? onOpen() : setOpen(true))}>
        <span className={`dot ${color}`} title={`momentum ${item.momentum}`} />
        <div className="grow">
          <div className="truncate" style={{ fontWeight: 500, textDecoration: item.status === 'complete' ? 'line-through' : 'none' }}>{item.title}</div>
          {!compact && (
            <small>
              {lane ? `${lane.icon || ''} ${lane.name} · ` : ''}m{item.momentum} · p{item.priority_user ?? '–'}
              {openChunks ? ` · ${openChunks} chunk${openChunks > 1 ? 's' : ''}` : ''}
              {item.due_date ? ` · due ${shortDate(parseDate(item.due_date))}` : ''}
            </small>
          )}
        </div>
        {item.status !== 'active' && <span className={`pill ${STATUS_PILL[item.status]}`}>{item.status.replace('_', ' ')}</span>}
        <div style={{ width: 60 }} className={`bar ${color}`}><i style={{ width: `${item.momentum}%` }} /></div>
      </div>
      {open && <ItemDetail kind={kind} id={item.id} onClose={() => setOpen(false)} />}
    </>
  )
}
