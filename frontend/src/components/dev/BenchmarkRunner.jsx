import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTable } from '../../hooks/useTable'
import { api } from '../../lib/api'
import { db } from '../../lib/supabase'

export default function BenchmarkRunner() {
  const { user } = useAuth()
  const [scenarios, setScenarios] = useState([])
  const [models, setModels] = useState([])
  const [selS, setSelS] = useState(new Set())
  const [selM, setSelM] = useState(new Set())
  const [progress, setProgress] = useState(null)
  const [group, setGroup] = useState(null)
  const [err, setErr] = useState(null)
  const [view, setView] = useState('run')
  const runs = useTable('benchmark_runs', { enabled: Boolean(user), query: (q) => q.order('created_at', { ascending: false }).limit(500), deps: [user?.id] })

  useEffect(() => {
    api('/api/testing/scenarios').then(setScenarios).catch((e) => setErr(e.message))
    api('/api/ai/models').then(setModels).catch((e) => setErr(e.message))
  }, [])

  const toggle = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n) }

  async function run() {
    const g = crypto.randomUUID()
    setGroup(g); setErr(null)
    const pairs = []
    for (const m of selM) for (const s of selS) pairs.push([s, m])
    setProgress({ done: 0, total: pairs.length })
    // one request per pair keeps each call short (no long-held HTTP requests on Fly)
    for (const [s, m] of pairs) {
      try { await api('/api/testing/run', { method: 'POST', body: { scenario_ids: [s], model_config_ids: [m], run_group: g } }) } catch (e) { setErr(e.message) }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    runs.reload()
  }

  const current = runs.rows.filter((r) => r.run_group === group).sort((a, b) => a.scenario_id.localeCompare(b.scenario_id) || a.created_at.localeCompare(b.created_at))
  const byScenario = Object.fromEntries(scenarios.map((s) => [s.id, s]))

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="tabs">
        <button className={view === 'run' ? 'selected' : ''} onClick={() => setView('run')}>Run</button>
        <button className={view === 'history' ? 'selected' : ''} onClick={() => setView('history')}>History</button>
      </div>
      {view === 'run' ? (
        <>
          <div className="grid grid-2">
            <div className="card">
              <div className="card-head"><h3>Scenarios</h3><button className="small ghost" onClick={() => setSelS(new Set(selS.size ? [] : scenarios.map((s) => s.id)))}>{selS.size ? 'none' : 'all'}</button></div>
              {scenarios.map((s) => (
                <label key={s.id} className="check" style={{ display: 'flex', padding: '3px 0' }}>
                  <input type="checkbox" checked={selS.has(s.id)} onChange={() => toggle(selS, setSelS, s.id)} /> {s.name}{s.repeat ? ` (×${s.repeat})` : ''}
                </label>
              ))}
            </div>
            <div className="card">
              <h3>Models</h3>
              {models.map((m) => (
                <label key={m.id} className="check" style={{ display: 'flex', padding: '3px 0' }}>
                  <input type="checkbox" checked={selM.has(m.id)} onChange={() => toggle(selM, setSelM, m.id)} /> {m.provider} · <span className="mono">{m.model_name}</span>{!m.enabled && <small> (disabled)</small>}
                </label>
              ))}
            </div>
          </div>
          <div className="row">
            <button className="primary" disabled={!selS.size || !selM.size || (progress && progress.done < progress.total)} onClick={run}>Run {selS.size * selM.size || ''} benchmark{selS.size * selM.size === 1 ? '' : 's'}</button>
            {progress && <small>{progress.done}/{progress.total} complete</small>}
            {err && <span className="error">{err}</span>}
          </div>
          {current.map((r) => <RunCard key={r.id} run={r} scenario={byScenario[r.scenario_id]} onSaved={runs.merge} />)}
        </>
      ) : <History runs={runs.rows} scenarios={byScenario} onSaved={runs.merge} />}
    </div>
  )
}

function RunCard({ run, scenario, onSaved }) {
  const [scores, setScores] = useState(run.rubric_scores || {})
  const [notes, setNotes] = useState(run.notes || '')
  const [saved, setSaved] = useState(false)
  const criteria = scenario?.rubric || Object.keys(scores)

  async function save(next = scores, n = notes) {
    const total = Object.values(next).filter((v) => v === true).length
    onSaved(await db.update('benchmark_runs', run.id, { rubric_scores: next, rubric_total: total, rubric_max: criteria.length, notes: n || null }))
    setSaved(true)
  }
  const setC = (c, v) => { const n = { ...scores, [c]: v }; setScores(n); save(n) }

  return (
    <div className="card">
      <div className="row-between">
        <b>{scenario?.name || run.scenario_id}</b>
        <small>{run.provider} · <span className="mono">{run.model}</span> · {run.latency_ms ?? '–'}ms · {run.agent_config_version}</small>
      </div>
      <details style={{ margin: '6px 0' }}><summary><small>Prompt</small></summary><pre className="mono">{run.prompt}</pre></details>
      <pre className="mono" style={{ maxHeight: 280, overflow: 'auto', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>{run.response}</pre>
      <div className="stack" style={{ marginTop: 8, gap: 4 }}>
        {criteria.map((c) => (
          <div key={c} className="row-between">
            <small style={{ flex: 1 }}>{c}</small>
            <div className="seg">
              <button className={`small${scores[c] === true ? ' selected' : ''}`} onClick={() => setC(c, true)}>Pass</button>
              <button className={`small${scores[c] === false ? ' selected' : ''}`} onClick={() => setC(c, false)}>Fail</button>
            </div>
          </div>
        ))}
        <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => save(scores, notes)} />
        <small>Score {Object.values(scores).filter((v) => v === true).length}/{criteria.length}{saved ? ' · saved' : ''}</small>
      </div>
    </div>
  )
}

function History({ runs, scenarios, onSaved }) {
  const [open, setOpen] = useState(null)
  const scored = useMemo(() => runs.filter((r) => r.rubric_total != null), [runs])
  // summary: scenario × provider/model → latest score + average
  const summary = useMemo(() => {
    const m = {}
    scored.forEach((r) => {
      const k = `${r.scenario_id}|${r.provider}/${r.model}`
      ;(m[k] ||= { scenario: r.scenario_id, model: `${r.provider}/${r.model}`, runs: [] }).runs.push(r)
    })
    return Object.values(m).sort((a, b) => a.scenario.localeCompare(b.scenario))
  }, [scored])
  return (
    <>
      <div className="card table-wrap">
        <h3>Scored summary</h3>
        <table>
          <thead><tr><th>Scenario</th><th>Model</th><th>Runs</th><th>Latest</th><th>Average</th></tr></thead>
          <tbody>
            {summary.map((s) => {
              const latest = s.runs[0]
              const avg = s.runs.reduce((a, r) => a + r.rubric_total / (r.rubric_max || 1), 0) / s.runs.length
              return (
                <tr key={s.scenario + s.model}>
                  <td>{scenarios[s.scenario]?.name || s.scenario}</td><td className="mono">{s.model}</td><td>{s.runs.length}</td>
                  <td>{latest.rubric_total}/{latest.rubric_max}</td><td>{Math.round(avg * 100)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {summary.length === 0 && <div className="empty">No scored runs yet.</div>}
      </div>
      <div className="card table-wrap">
        <h3>All runs</h3>
        <table>
          <thead><tr><th>When</th><th>Scenario</th><th>Model</th><th>Score</th></tr></thead>
          <tbody>
            {runs.slice(0, 100).map((r) => (
              <Fragment key={r.id}>
                <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td>{new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td>{scenarios[r.scenario_id]?.name || r.scenario_id}</td><td className="mono">{r.provider}/{r.model}</td>
                  <td>{r.rubric_total == null ? 'unscored' : `${r.rubric_total}/${r.rubric_max}`}</td>
                </tr>
                {open === r.id && <tr><td colSpan={4}><RunCard run={r} scenario={scenarios[r.scenario_id]} onSaved={onSaved} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
