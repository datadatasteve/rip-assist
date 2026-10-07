import { useState } from 'react'
import { useData } from '../../hooks/useData'
import { ai } from '../../lib/ai'
import { db } from '../../lib/supabase'
import Rating from '../shared/Rating'

function todayAt(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0); return d
}

// Plan re-suggestion: always available on demand; the backend recommends it
// proactively (once) only when today's plan is infeasible.
export default function ReplanCard({ recommended, feasibility, onDismiss }) {
  const { chunks, tasksById, goalsById } = useData()
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [applied, setApplied] = useState(false)
  const [useCal, setUseCal] = useState(false)

  async function run() {
    setBusy(true); setErr(null)
    try { setRes(await ai.replan({ include_calendar_details: useCal })) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function apply() {
    const blocks = (res?.parsed?.blocks || []).filter((b) => b.type !== 'break' && b.ref_id)
    try {
      for (const b of blocks) {
        const s = todayAt(b.start), e = todayAt(b.end)
        const dur = Math.max(5, Math.round((e - s) / 60000))
        const existing = chunks.rows.find((c) => c.id === b.ref_id)
        if (existing) {
          chunks.merge(await db.update('chunks', existing.id, { scheduled_start: s.toISOString(), scheduled_end: e.toISOString() }))
        } else if (tasksById[b.ref_id] || goalsById[b.ref_id]) {
          const key = tasksById[b.ref_id] ? 'task_id' : 'goal_id'
          chunks.merge(await db.insert('chunks', { title: b.title, duration_minutes: dur, scheduled_start: s.toISOString(), scheduled_end: e.toISOString(), [key]: b.ref_id }))
        }
      }
      if (res.interaction_id) await db.update('ai_interactions', res.interaction_id, { outcome_followed: true }).catch(() => {})
      setApplied(true)
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className={`card`} style={recommended ? { borderColor: 'var(--yellow)' } : undefined}>
      <div className="card-head">
        <h2>{recommended ? "Today's plan doesn't fit" : 'Re-plan today'}</h2>
        {recommended && <button className="small ghost" onClick={onDismiss}>Dismiss</button>}
      </div>
      {feasibility && (
        <small>Free {feasibility.free_minutes}m · scheduled {feasibility.remaining_scheduled_minutes}m{feasibility.infeasible ? ` · over by ${feasibility.over_by_minutes}m` : ''}</small>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className={recommended ? 'primary' : ''} onClick={run} disabled={busy}>{busy ? 'Planning…' : res ? 'Re-plan again' : '✨ Suggest a new plan'}</button>
        <label className="check"><input type="checkbox" checked={useCal} onChange={(e) => setUseCal(e.target.checked)} /> include calendar event details</label>
      </div>
      {err && <div className="error">{err}</div>}
      {res && (
        <div className="stack" style={{ marginTop: 10 }}>
          {res.parsed?.blocks ? (
            <div className="list">
              {res.parsed.blocks.map((b, i) => (
                <div key={i} className="list-item">
                  <small className="mono" style={{ width: 92 }}>{b.start}–{b.end}</small>
                  <div className="grow" style={{ opacity: b.type === 'break' ? 0.6 : 1 }}>{b.title}</div>
                </div>
              ))}
              {res.parsed.deferred?.length > 0 && <small>Deferred: {res.parsed.deferred.map((d) => d.title).join(', ')}</small>}
              {res.parsed.reasoning && <small>{res.parsed.reasoning}</small>}
            </div>
          ) : <pre>{res.content}</pre>}
          <div className="row">
            <button className="primary" onClick={apply} disabled={applied || !res.parsed?.blocks}>{applied ? 'Applied ✓' : 'Apply to my chunks'}</button>
            <small>{res.provider} · {res.model}</small>
          </div>
          <Rating key={res.interaction_id} interactionId={res.interaction_id} showOutcome={!applied} />
        </div>
      )}
    </div>
  )
}
