import { useData } from '../../hooks/useData'
import ChunkRow from '../tasks/ChunkRow'

export default function Upcoming() {
  const { chunks } = useData()
  const now = Date.now()
  const next = chunks.rows
    .filter((c) => c.scheduled_start && !c.completed_at && !c.skipped_at)
    .filter((c) => new Date(c.scheduled_end || c.scheduled_start).getTime() >= now)
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    .slice(0, 3)
  return (
    <div className="card">
      <div className="card-head"><h2>Upcoming</h2></div>
      {next.length === 0 && <div className="empty">No scheduled chunks ahead.</div>}
      <div className="list">{next.map((c) => <ChunkRow key={c.id} chunk={c} showParent />)}</div>
    </div>
  )
}
