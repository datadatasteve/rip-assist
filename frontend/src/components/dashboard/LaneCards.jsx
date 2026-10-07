import { useNavigate } from 'react-router-dom'
import { useData } from '../../hooks/useData'
import { chunkLane, laneAggregate, laneOf } from '../../lib/momentum'
import { relative } from '../../lib/time'

export default function LaneCards() {
  const { activeLanes, goals, tasks, chunks, tasksById, goalsById } = useData()
  const nav = useNavigate()
  if (!activeLanes.length) {
    return <div className="card empty">No lanes yet. <a href="#/lanes">Create your first lane</a> (e.g. Work, Health, Home).</div>
  }
  return (
    <div className="grid grid-auto">
      {activeLanes.map((l) => {
        const items = [...goals.rows.filter((g) => g.lane_id === l.id), ...tasks.rows.filter((t) => laneOf(t, goalsById) === l.id)]
        const agg = laneAggregate(items)
        const active = chunks.rows.filter((c) => !c.completed_at && !c.skipped_at && chunkLane(c, tasksById, goalsById) === l.id).length
        const last = items.reduce((m, i) => (i.last_interaction > m ? i.last_interaction : m), '')
        return (
          <div key={l.id} className="card clickable" style={{ borderTop: `4px solid ${l.color}` }} onClick={() => nav('/lanes')}>
            <div className="row-between">
              <b className="truncate">{l.icon} {l.name}</b>
              <span className={`dot lg ${agg.color}`} title={`Lane momentum: ${agg.trend}`} />
            </div>
            <div className="row" style={{ marginTop: 6, gap: 14 }}>
              <div className="stat"><b>{agg.momentum ?? '–'}</b><small>momentum</small></div>
              <div className="stat"><b>{active}</b><small>active chunks</small></div>
            </div>
            <small>Last activity {relative(last || null)}</small>
          </div>
        )
      })}
    </div>
  )
}
