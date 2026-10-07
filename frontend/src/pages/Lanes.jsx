import { useState } from 'react'
import LaneForm from '../components/lanes/LaneForm'
import LaneTimeline from '../components/lanes/LaneTimeline'
import { useData } from '../hooks/useData'
import { addDays } from '../lib/time'

export default function Lanes() {
  const { lanes } = useData()
  const [zoom, setZoom] = useState('day')
  const [date, setDate] = useState(new Date())
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const step = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30
  const shift = (n) => setDate((d) => (zoom === 'month' ? new Date(d.getFullYear(), d.getMonth() + n, 1) : addDays(d, n * step)))
  const label = zoom === 'month'
    ? date.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : zoom === 'week' ? `Week of ${addDays(date, -date.getDay()).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  const archived = lanes.rows.filter((l) => l.archived_at)

  return (
    <>
      <div className="topbar"><h1>Lanes</h1><button className="primary" onClick={() => setCreating(true)}>+ Lane</button></div>
      <div className="lane-toolbar">
        <div className="seg">
          {['day', 'week', 'month'].map((z) => (
            <button key={z} className={zoom === z ? 'selected' : ''} onClick={() => setZoom(z)}>{z[0].toUpperCase() + z.slice(1)}</button>
          ))}
        </div>
        <button className="small" onClick={() => shift(-1)} aria-label="Previous">‹</button>
        <button className="small" onClick={() => setDate(new Date())}>Today</button>
        <button className="small" onClick={() => shift(1)} aria-label="Next">›</button>
        <b>{label}</b>
      </div>
      <LaneTimeline zoom={zoom} date={date} />
      {archived.length > 0 && (
        <div className="section">
          <button className="small ghost" onClick={() => setShowArchived((s) => !s)}>{showArchived ? '▾' : '▸'} Archived lanes ({archived.length})</button>
          {showArchived && <div className="list">{archived.map((l) => <ArchivedLane key={l.id} lane={l} />)}</div>}
        </div>
      )}
      {creating && <LaneForm onClose={() => setCreating(false)} />}
    </>
  )
}

function ArchivedLane({ lane }) {
  const [edit, setEdit] = useState(false)
  return (
    <div className="list-item clickable" onClick={() => setEdit(true)}>
      <span className="dot" style={{ background: lane.color }} /> <span className="grow">{lane.icon} {lane.name}</span><small>{lane.type}</small>
      {edit && <LaneForm lane={lane} onClose={() => setEdit(false)} />}
    </div>
  )
}
