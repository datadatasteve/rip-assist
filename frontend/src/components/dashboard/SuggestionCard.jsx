import { useCallback, useEffect, useState } from 'react'
import { useData } from '../../hooks/useData'
import { ai } from '../../lib/ai'
import { api } from '../../lib/api'
import { minutesLabel } from '../../lib/time'
import Rating from '../shared/Rating'
import ItemDetail from '../tasks/ItemDetail'

// Top suggestion (engine-ranked, instant) + optional AI "next best action".
export default function SuggestionCard() {
  const { tasks, goals, chunks } = useData()
  const [s, setS] = useState(null)
  const [err, setErr] = useState(null)
  const [aiRes, setAiRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [useCal, setUseCal] = useState(false)
  const [open, setOpen] = useState(null)

  const load = useCallback(() => {
    api('/api/suggestions?limit=5').then((r) => { setS(r); setErr(null) }).catch((e) => setErr(e.message))
  }, [])
  // refresh when underlying data changes (debounced by React batching)
  const sig = `${tasks.rows.length}-${goals.rows.length}-${chunks.rows.length}-${chunks.rows.filter((c) => c.completed_at).length}`
  useEffect(() => { load() }, [load, sig])

  async function askAI() {
    setBusy(true); setErr(null)
    try { setAiRes(await ai.suggest({ include_calendar_details: useCal })) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const top = s?.suggestions?.[0]
  return (
    <div className="card">
      <div className="card-head"><h2>Next best action</h2><button className="small ghost" onClick={load} aria-label="Refresh">↻</button></div>
      {err && <div className="error">Backend: {err}</div>}
      {s && !top && <div className="empty">Nothing active. Add a task to get suggestions.</div>}
      {top && (
        <div className="list-item clickable" onClick={() => setOpen({ kind: top.ref_type, id: top.ref_id })} style={{ padding: '6px 0' }}>
          <span className={`dot lg ${top.color}`} />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{top.title}</div>
            <small>{top.parent_title ? `${top.parent_title} · ` : ''}{minutesLabel(top.minutes)} · {top.reasons.join(' · ')}</small>
          </div>
          <span className="pill accent">{Math.round(top.score)}</span>
        </div>
      )}
      {s?.suggestions?.length > 1 && (
        <details style={{ marginTop: 6 }}>
          <summary><small>Other candidates</small></summary>
          <div className="list">
            {s.suggestions.slice(1).map((c) => (
              <div key={c.ref_id + (c.chunk_id || '')} className="list-item clickable" onClick={() => setOpen({ kind: c.ref_type, id: c.ref_id })}>
                <span className={`dot ${c.color}`} /><div className="grow truncate">{c.title}</div><small>{Math.round(c.score)}</small>
              </div>
            ))}
          </div>
        </details>
      )}
      {s?.lane_balance_flag && <div className="banner warn" style={{ marginTop: 8 }}>{s.lane_balance_flag}</div>}
      <hr className="divider" />
      <div className="row">
        <button onClick={askAI} disabled={busy}>{busy ? 'Thinking…' : '✨ Ask AI'}</button>
        <label className="check"><input type="checkbox" checked={useCal} onChange={(e) => setUseCal(e.target.checked)} /> include calendar event details</label>
      </div>
      {aiRes && (
        <div className="card" style={{ marginTop: 10 }}>
          {aiRes.parsed?.next_action ? (
            <>
              <b>{aiRes.parsed.next_action.title}</b>
              <p><small>{aiRes.parsed.next_action.why}</small></p>
              {aiRes.parsed.alternates?.length > 0 && <small>Alternates: {aiRes.parsed.alternates.map((a) => a.title).join(' · ')}</small>}
              {aiRes.parsed.note && <p><small>{aiRes.parsed.note}</small></p>}
            </>
          ) : <pre>{aiRes.content}</pre>}
          <small className="muted">{aiRes.provider} · {aiRes.model} · {aiRes.latency_ms}ms{aiRes.fallback_attempts?.length ? ` · fell back after ${aiRes.fallback_attempts.length}` : ''}</small>
          <hr className="divider" />
          <Rating key={aiRes.interaction_id} interactionId={aiRes.interaction_id} />
        </div>
      )}
      {open && <ItemDetail kind={open.kind} id={open.id} onClose={() => setOpen(null)} />}
    </div>
  )
}
