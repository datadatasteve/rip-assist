import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../hooks/useData'
import { chunkLane, laneAggregate, laneOf } from '../../lib/momentum'
import { addDays, DAY, hm, minutesLabel, sameDay, startOfDay } from '../../lib/time'
import Modal from '../shared/Modal'
import ChunkForm from '../tasks/ChunkForm'
import { completeChunk, skipChunk, reopenChunk } from '../tasks/chunkActions'
import ItemDetail from '../tasks/ItemDetail'
import LaneForm from './LaneForm'

const NONE = '__none__'
const CAL = '__calendar__'

function useNarrow() {
  const [n, setN] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 760px)')
    const f = () => setN(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return n
}

// Overlapping chunks in one lane form a cluster; clusters >1 collapse to a badge.
function clusters(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s)
  const out = []
  for (const it of sorted) {
    const last = out[out.length - 1]
    if (last && it.s < last.e) { last.items.push(it); last.e = Math.max(last.e, it.e) } else out.push({ s: it.s, e: it.e, items: [it] })
  }
  return out
}

export default function LaneTimeline({ zoom, date }) {
  const data = useData()
  const narrow = useNarrow()
  const { activeLanes, chunks, gcalEvents, tasks, goals, goalsById, tasksById, calendar, settings } = data
  const [expanded, setExpanded] = useState(() => new Set())
  const [chunkOpen, setChunkOpen] = useState(null)
  const [itemOpen, setItemOpen] = useState(null)
  const [laneEdit, setLaneEdit] = useState(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])

  const calLane = useMemo(() => {
    const m = {}
    ;(calendar.rows[0]?.calendars || []).forEach((c) => { m[c.id] = c.lane_id || null })
    return m
  }, [calendar.rows])

  // bucket everything by lane
  const rows = useMemo(() => {
    const base = activeLanes.map((l) => ({ id: l.id, lane: l, chunks: [], events: [], pills: [], items: [] }))
    const byId = Object.fromEntries(base.map((r) => [r.id, r]))
    const extra = (id) => {
      if (!byId[id]) {
        byId[id] = { id, lane: id === CAL ? { name: 'Calendar', icon: '📅', color: '#888' } : { name: 'No lane', icon: '·', color: '#999' }, chunks: [], events: [], pills: [], items: [], virtual: true }
      }
      return byId[id]
    }
    chunks.rows.forEach((c) => {
      const lid = chunkLane(c, tasksById, goalsById)
      ;(lid && byId[lid] ? byId[lid] : extra(NONE)).chunks.push(c)
    })
    gcalEvents.rows.forEach((e) => {
      const lid = calLane[e.calendar_id]
      ;(lid && byId[lid] ? byId[lid] : extra(CAL)).events.push(e)
    })
    const scheduledParents = new Set(chunks.rows.filter((c) => c.scheduled_start && !c.completed_at && !c.skipped_at).map((c) => c.task_id || c.goal_id))
    tasks.rows.forEach((t) => {
      const lid = laneOf(t, goalsById)
      const r = lid && byId[lid] ? byId[lid] : null
      if (r) r.items.push(t)
      if (t.status === 'active' && !scheduledParents.has(t.id)) (r || extra(NONE)).pills.push({ kind: 'task', item: t })
    })
    goals.rows.forEach((g) => {
      const r = g.lane_id && byId[g.lane_id]
      if (r) r.items.push(g)
    })
    const out = base.slice()
    if (byId[NONE]) out.push(byId[NONE])
    if (byId[CAL]) out.push(byId[CAL])
    return out
  }, [activeLanes, chunks.rows, gcalEvents.rows, tasks.rows, goals.rows, tasksById, goalsById, calLane])

  // ----- time axis -----
  const day0 = startOfDay(date)
  let range, colW, cols
  if (zoom === 'day') {
    const ws = Number(String(settings?.workday_start || '07:00').slice(0, 2))
    const we = Number(String(settings?.workday_end || '22:00').slice(0, 2))
    const startH = Math.max(0, Math.min(ws, 7) - 1)
    const endH = Math.min(24, Math.max(we, 21) + 1)
    colW = narrow ? 56 : 76
    cols = Array.from({ length: endH - startH }, (_, i) => startH + i)
    range = [day0.getTime() + startH * 3600_000, day0.getTime() + endH * 3600_000]
  } else if (zoom === 'week') {
    const ws = addDays(day0, -day0.getDay())
    colW = narrow ? 84 : 124
    cols = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    range = [ws.getTime(), addDays(ws, 7).getTime()]
  } else {
    const ms = new Date(day0.getFullYear(), day0.getMonth(), 1)
    const n = new Date(day0.getFullYear(), day0.getMonth() + 1, 0).getDate()
    colW = 30
    cols = Array.from({ length: n }, (_, i) => addDays(ms, i))
    range = [ms.getTime(), addDays(ms, n).getTime()]
  }
  const headW = narrow ? 108 : 150
  const trackW = cols.length * colW
  const x = (t) => ((t - range[0]) / (zoom === 'day' ? 3600_000 : DAY)) * colW

  const inRange = (s, e) => e > range[0] && s < range[1]

  function laneHead(r) {
    const agg = laneAggregate(r.items)
    const pills = r.pills
    return (
      <div className="lane-head" style={{ width: headW, borderLeft: `4px solid ${r.lane.color || 'var(--border)'}` }}>
        <div className="name clickable" onClick={() => !r.virtual && setLaneEdit(r.lane)} title={r.virtual ? '' : 'Edit lane'}>
          {!r.virtual && <span className={`dot ${agg.color}`} title={`Lane momentum ${agg.momentum ?? '–'} · ${agg.trend}`} />}
          <span className="truncate">{r.lane.icon} {r.lane.name}</span>
        </div>
        {zoom === 'day' && pills.length > 0 && (
          <div className="pills">
            {pills.slice(0, narrow ? 1 : 3).map((p) => (
              <span key={p.item.id} className="pill" onClick={() => setItemOpen({ kind: p.kind, id: p.item.id })} title="Unscheduled — tap to open">
                {p.item.title}
              </span>
            ))}
            {pills.length > (narrow ? 1 : 3) && <span className="pill">+{pills.length - (narrow ? 1 : 3)}</span>}
          </div>
        )}
      </div>
    )
  }

  function dayTrack(r) {
    const evs = r.events
      .filter((e) => !e.all_day)
      .map((e) => ({ e, s: new Date(e.start_at).getTime(), en: new Date(e.end_at).getTime() }))
      .filter((v) => inRange(v.s, v.en))
    const allDay = r.events.filter((e) => e.all_day && sameDay(new Date(e.start_at.slice(0, 10) + 'T12:00'), day0))
    const ch = r.chunks
      .filter((c) => c.scheduled_start)
      .map((c) => {
        const s = new Date(c.scheduled_start).getTime()
        const e = c.scheduled_end ? new Date(c.scheduled_end).getTime() : s + c.duration_minutes * 60_000
        return { c, s, e }
      })
      .filter((v) => inRange(v.s, v.e))
    const cls = clusters(ch)
    let maxRows = 1
    const blocks = []
    cls.forEach((cl) => {
      const key = `${r.id}-${cl.s}`
      if (cl.items.length > 1 && !expanded.has(key)) {
        blocks.push(
          <div key={key} className="block badge" style={{ left: x(cl.s), width: Math.max(28, x(cl.e) - x(cl.s) - 2), top: 32, height: 24 }}
            onClick={() => setExpanded((s) => new Set(s).add(key))} title="Parallel chunks — tap to expand">
            {cl.items.length} chunks
          </div>,
        )
      } else {
        maxRows = Math.max(maxRows, cl.items.length)
        cl.items.forEach((v, i) => {
          const cls2 = `block chunk${v.c.completed_at ? ' done' : ''}${v.c.skipped_at ? ' skipped' : ''}`
          blocks.push(
            <div key={v.c.id} className={cls2} title={`${v.c.title} · ${hm(v.s)}–${hm(v.e)}`}
              style={{ left: x(v.s), width: Math.max(18, x(v.e) - x(v.s) - 2), top: 32 + i * 28, height: 24, background: r.lane.color || 'var(--accent)' }}
              onClick={() => setChunkOpen(v.c)}>
              {v.c.title}
            </div>,
          )
        })
        if (cl.items.length > 1) {
          blocks.push(
            <button key={key + 'c'} className="small ghost" style={{ position: 'absolute', left: x(cl.e) + 2, top: 32, minHeight: 20, padding: '0 4px', fontSize: 11 }}
              onClick={() => setExpanded((s) => { const n = new Set(s); n.delete(key); return n })}>collapse</button>,
          )
        }
      }
    })
    const height = Math.max(64, 32 + maxRows * 28 + 6)
    return (
      <div className="lane-track" style={{ width: trackW, height }}>
        {cols.map((h, i) => <div key={h} className="gridline" style={{ left: i * colW }} />)}
        {allDay.length > 0 && (
          <div className="block event" style={{ left: 2, top: 4, height: 22, width: Math.min(trackW - 4, 200) }} title="All-day">{allDay.map((e) => e.title).join(', ')}</div>
        )}
        {evs.map((v) => (
          <div key={v.e.id} className="block event" title={`${v.e.title} · ${hm(v.s)}–${hm(v.en)} (Google Calendar)`}
            style={{ left: x(v.s), width: Math.max(18, x(v.en) - x(v.s) - 2), top: 4, height: 24 }}>
            {v.e.title}
          </div>
        ))}
        {blocks}
        {now >= range[0] && now <= range[1] && <div className="now-line" style={{ left: x(now) }} />}
      </div>
    )
  }

  function weekTrack(r) {
    return (
      <div className="lane-track" style={{ width: trackW, display: 'flex' }}>
        {cols.map((d) => {
          const ds = d.getTime(), de = ds + DAY
          const evs = r.events.filter((e) => inRangeDay(e.start_at, e.end_at, ds, de))
          const chs = r.chunks.filter((c) => c.scheduled_start && new Date(c.scheduled_start).getTime() >= ds && new Date(c.scheduled_start).getTime() < de)
          return (
            <div key={ds} className={`cell${sameDay(d, new Date()) ? ' today' : ''}`} style={{ width: colW, minHeight: 56 }}>
              {evs.map((e) => <i key={e.id} className="mini event" title={e.title} style={{ width: miniW(e.start_at, e.end_at, colW) }} />)}
              {chs.map((c) => (
                <i key={c.id} className="mini clickable" title={`${c.title} · ${minutesLabel(c.duration_minutes)}`} onClick={() => setChunkOpen(c)}
                  style={{ width: Math.max(8, Math.min(colW - 10, (c.duration_minutes / 240) * (colW - 10))), background: r.lane.color || 'var(--accent)', opacity: c.completed_at || c.skipped_at ? 0.4 : 1 }} />
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  function monthTrack(r) {
    return (
      <div className="lane-track" style={{ width: trackW, display: 'flex' }}>
        {cols.map((d) => {
          const ds = d.getTime(), de = ds + DAY
          const n = r.events.filter((e) => inRangeDay(e.start_at, e.end_at, ds, de)).length +
            r.chunks.filter((c) => c.scheduled_start && new Date(c.scheduled_start).getTime() >= ds && new Date(c.scheduled_start).getTime() < de).length
          const size = n ? Math.min(16, 6 + n * 2) : 0
          return (
            <div key={ds} className={`cell${sameDay(d, new Date()) ? ' today' : ''}`} style={{ width: colW, minHeight: 40, alignItems: 'center', justifyContent: 'center' }} title={n ? `${n} item(s)` : ''}>
              {n > 0 && <i className="mdot" style={{ width: size, height: size, background: r.lane.color || 'var(--accent)' }} />}
            </div>
          )
        })}
      </div>
    )
  }

  const axisLabel = (c) =>
    zoom === 'day' ? `${c % 12 || 12}${c < 12 ? 'a' : 'p'}` : zoom === 'week' ? c.toLocaleDateString([], { weekday: 'short', day: 'numeric' }) : c.getDate()

  return (
    <>
      <div className="lane-scroll">
        <div className="lane-grid">
          <div className="lane-axis">
            <div className="corner" style={{ width: headW, flex: 'none' }} />
            {cols.map((c, i) => <div key={i} className="axis-cell" style={{ width: colW }}>{axisLabel(c)}</div>)}
          </div>
          {rows.length === 0 && <div className="empty" style={{ padding: 24 }}>No lanes yet. Create one to start.</div>}
          {rows.map((r) => (
            <div key={r.id} className="lane-row">
              {laneHead(r)}
              {zoom === 'day' ? dayTrack(r) : zoom === 'week' ? weekTrack(r) : monthTrack(r)}
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 14 }}>
        <small className="row"><i className="mini event" style={{ width: 16, display: 'inline-block' }} /> Google Calendar (fixed)</small>
        <small className="row"><i className="mini" style={{ width: 16, display: 'inline-block', background: 'var(--accent)' }} /> Scheduled chunk</small>
        <small className="row"><span className="pill" style={{ fontSize: 10 }}>task</span> Unscheduled task</small>
      </div>

      {chunkOpen && <ChunkQuick chunk={chunks.rows.find((c) => c.id === chunkOpen.id) || chunkOpen} onClose={() => setChunkOpen(null)}
        onOpenParent={(p) => { setChunkOpen(null); setItemOpen(p) }} />}
      {itemOpen && <ItemDetail kind={itemOpen.kind} id={itemOpen.id} onClose={() => setItemOpen(null)} />}
      {laneEdit && <LaneForm lane={laneEdit} onClose={() => setLaneEdit(null)} />}
    </>
  )
}

function inRangeDay(s, e, ds, de) {
  const a = new Date(s).getTime(), b = new Date(e).getTime()
  return b > ds && a < de
}
function miniW(s, e, colW) {
  const m = (new Date(e) - new Date(s)) / 60000
  return Math.max(8, Math.min(colW - 10, (m / 240) * (colW - 10)))
}

function ChunkQuick({ chunk, onClose, onOpenParent }) {
  const { chunks, tasksById, goalsById } = useData()
  const [edit, setEdit] = useState(false)
  const [err, setErr] = useState(null)
  const parent = chunk.task_id ? { kind: 'task', item: tasksById[chunk.task_id] } : chunk.goal_id ? { kind: 'goal', item: goalsById[chunk.goal_id] } : null
  const run = (fn) => fn(chunks, chunk).then(onClose).catch((e) => setErr(e.message))
  if (edit) return <ChunkForm chunk={chunk} onClose={onClose} />
  return (
    <Modal title={chunk.title} onClose={onClose}>
      <div className="stack">
        <small>
          {chunk.scheduled_start ? `${hm(chunk.scheduled_start)} · ` : ''}{minutesLabel(chunk.duration_minutes)}
          {chunk.completed_at ? ' · done' : chunk.skipped_at ? ' · skipped' : ''}
          {parent?.item ? ` · ${parent.item.title}` : ''}
        </small>
        <div className="row">
          {!chunk.completed_at && <button className="primary" onClick={() => run(completeChunk)}>✓ Complete</button>}
          {!chunk.completed_at && !chunk.skipped_at && <button onClick={() => run(skipChunk)}>Skip</button>}
          {(chunk.completed_at || chunk.skipped_at) && <button onClick={() => run(reopenChunk)}>Reopen</button>}
          <button onClick={() => setEdit(true)}>Edit / reschedule</button>
          {parent?.item && <button onClick={() => onOpenParent({ kind: parent.kind, id: parent.item.id })}>Open {parent.kind}</button>}
        </div>
        {err && <div className="error">{err}</div>}
      </div>
    </Modal>
  )
}

