import { Fragment, useEffect, useState } from 'react'
import { ratingLabel } from '../../lib/ai'
import { supabase } from '../../lib/supabase'
import Rating from '../shared/Rating'

const FEATURES = ['', 'suggestion', 'schedule', 'checkin', 'momentum', 'chunk_decompose', 'benchmark']

export default function InteractionLog() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [feature, setFeature] = useState('')
  const [provider, setProvider] = useState('')
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      let qb = supabase.from('ai_interactions').select('*').order('created_at', { ascending: false }).limit(200)
      if (feature) qb = qb.eq('feature', feature)
      if (provider) qb = qb.eq('provider', provider)
      if (failed) qb = qb.eq('success', false)
      if (q.trim()) {
        const s = q.trim().replace(/[%,()]/g, ' ')
        qb = qb.or(`user_prompt.ilike.%${s}%,response.ilike.%${s}%,model.ilike.%${s}%,error.ilike.%${s}%`)
      }
      const { data, error } = await qb
      if (cancelled) return
      if (error) setErr(error.message); else { setRows(data); setErr(null) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, feature, provider, failed])

  useEffect(() => {
    const ch = supabase.channel('rt-ai-log').on('postgres_changes', { event: '*', schema: 'public', table: 'ai_interactions' }, (p) => {
      setRows((prev) => {
        if (p.eventType === 'INSERT') return [p.new, ...prev]
        if (p.eventType === 'UPDATE') return prev.map((r) => (r.id === p.new.id ? p.new : r))
        return prev
      })
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <div className="card">
      <div className="card-head"><h2>AI interactions</h2><small>{rows.length} shown</small></div>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <input placeholder="Search prompt, response, model…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={feature} onChange={(e) => setFeature(e.target.value)} aria-label="Feature">{FEATURES.map((f) => <option key={f} value={f}>{f || 'All features'}</option>)}</select>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
          {['', 'ollama', 'groq', 'gemini', 'openrouter', 'cloudflare', 'claude', 'openai'].map((p) => <option key={p} value={p}>{p || 'All providers'}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} /> failures only</label>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Feature</th><th>Provider / model</th><th>ms</th><th>Tokens</th><th>$</th><th>Ver</th><th>Rating</th><th>Acted</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)} style={{ opacity: r.success === false ? 0.6 : 1 }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td>{r.feature}</td>
                  <td>{r.provider}<br /><span className="mono">{r.model}</span>{r.success === false && <><br /><span className="pill red">failed</span></>}</td>
                  <td>{r.latency_ms}</td>
                  <td>{r.input_tokens}/{r.output_tokens}</td>
                  <td>{Number(r.cost_usd || 0).toFixed(4)}</td>
                  <td className="mono">{r.agent_config_version}</td>
                  <td>{ratingLabel(r.user_rating_major, r.user_rating_sub) || '–'}</td>
                  <td>{r.outcome_followed == null ? '–' : r.outcome_followed ? 'yes' : 'no'}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={9}>
                    <div className="grid grid-2">
                      <div><small>System</small><pre className="mono" style={{ maxHeight: 160, overflow: 'auto' }}>{r.system_prompt}</pre>
                        <small>User</small><pre className="mono" style={{ maxHeight: 220, overflow: 'auto' }}>{r.user_prompt}</pre></div>
                      <div><small>{r.success === false ? 'Error' : 'Response'}</small><pre className="mono" style={{ maxHeight: 380, overflow: 'auto' }}>{r.success === false ? r.error : r.response}</pre></div>
                    </div>
                    {r.success !== false && <div style={{ marginTop: 8 }}><Rating interactionId={r.id} initialMajor={r.user_rating_major} initialSub={r.user_rating_sub} initialOutcome={r.outcome_followed} /></div>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No interactions match.</div>}
      </div>
    </div>
  )
}
