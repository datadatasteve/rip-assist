import { useState } from 'react'
import { useData } from '../../hooks/useData'
import { hm, minutesLabel, shortDate } from '../../lib/time'
import ChunkForm from './ChunkForm'
import { completeChunk, deleteChunk, reopenChunk, skipChunk } from './chunkActions'

export default function ChunkRow({ chunk, showParent }) {
  const { chunks, tasksById, goalsById } = useData()
  const [edit, setEdit] = useState(false)
  const [err, setErr] = useState(null)
  const done = Boolean(chunk.completed_at)
  const skipped = Boolean(chunk.skipped_at)
  const parent = tasksById[chunk.task_id] || goalsById[chunk.goal_id]
  const run = (fn) => fn(chunks, chunk).catch((e) => setErr(e.message))

  return (
    <div className="list-item">
      <button className={`small icon${done ? ' selected' : ''}`} onClick={() => run(done ? reopenChunk : completeChunk)} aria-label={done ? 'Mark not done' : 'Complete chunk'}>
        {done ? '✓' : '○'}
      </button>
      <div className="grow">
        <div className="truncate" style={{ textDecoration: done ? 'line-through' : 'none', opacity: skipped ? 0.5 : 1 }}>{chunk.title}</div>
        <small>
          {minutesLabel(chunk.duration_minutes)}
          {chunk.scheduled_start ? ` · ${shortDate(chunk.scheduled_start)} ${hm(chunk.scheduled_start)}` : ' · unscheduled'}
          {skipped && ' · skipped'}
          {showParent && parent ? ` · ${parent.title}` : ''}
        </small>
        {err && <div className="error">{err}</div>}
      </div>
      {!done && !skipped && <button className="small ghost" onClick={() => run(skipChunk)}>Skip</button>}
      <button className="small ghost" onClick={() => setEdit(true)} aria-label="Edit chunk">✎</button>
      <button className="small ghost danger" onClick={() => confirm('Delete this chunk?') && run(deleteChunk)} aria-label="Delete chunk">🗑</button>
      {edit && <ChunkForm chunk={chunk} onClose={() => setEdit(false)} />}
    </div>
  )
}
