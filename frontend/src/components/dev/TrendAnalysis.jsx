import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ratingValue } from '../../lib/ai'
import { supabase } from '../../lib/supabase'
import { axisProps, bucketKey, colorFor, gridProps, tooltipProps } from './chart'
import { useInteractions } from './useInteractions'

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const fmt = (v) => (v == null ? '–' : v.toFixed(2))

export default function TrendAnalysis() {
  const [days, setDays] = useState(90)
  const { rows, err } = useInteractions(days)
  const rated = rows.filter((r) => r.user_rating_major != null)

  // 1. avg rating over time by provider (weekly)
  const { series, data } = useMemo(() => {
    const providers = [...new Set(rated.map((r) => r.provider))]
    const b = {}
    rated.forEach((r) => {
      const k = bucketKey(r.created_at, days > 30 ? 'week' : 'day')
      ;((b[k] ||= {})[r.provider] ||= []).push(ratingValue(r.user_rating_major, r.user_rating_sub))
    })
    const data = Object.keys(b).sort().map((k) => ({ bucket: k, ...Object.fromEntries(providers.map((p) => [p, b[k][p] ? +avg(b[k][p]).toFixed(2) : null])) }))
    return { series: providers, data }
  }, [rated, days])

  // 2. provider/model × feature table
  const matrix = useMemo(() => {
    const m = {}
    rated.forEach((r) => {
      const k = `${r.provider}/${r.model}`
      ;((m[k] ||= {})[r.feature] ||= []).push(ratingValue(r.user_rating_major, r.user_rating_sub))
    })
    return m
  }, [rated])
  const features = [...new Set(rated.map((r) => r.feature))]

  // 3. version deltas per feature
  const versions = useMemo(() => {
    const m = {}
    rated.forEach((r) => {
      const f = r.feature, v = r.agent_config_version || '?'
      const e = ((m[f] ||= {})[v] ||= { first: r.created_at, vals: [] })
      e.vals.push(ratingValue(r.user_rating_major, r.user_rating_sub))
    })
    return Object.entries(m).map(([f, vs]) => {
      const list = Object.entries(vs).map(([v, e]) => ({ v, first: e.first, n: e.vals.length, avg: avg(e.vals) })).sort((a, b) => a.first.localeCompare(b.first))
      return { feature: f, list: list.map((x, i) => ({ ...x, delta: i ? x.avg - list[i - 1].avg : null })) }
    })
  }, [rated])

  // 4. follow-through by provider
  const follow = useMemo(() => {
    const m = {}
    rows.filter((r) => r.outcome_followed != null).forEach((r) => { (m[r.provider] ||= []).push(r.outcome_followed ? 1 : 0) })
    return Object.entries(m).map(([p, v]) => ({ provider: p, rate: Math.round(avg(v) * 100), n: v.length }))
  }, [rows])

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <small>Range</small>
        <div className="seg">{[7, 30, 90, 365].map((d) => <button key={d} className={`small${days === d ? ' selected' : ''}`} onClick={() => setDays(d)}>{d}d</button>)}</div>
        {err && <span className="error">{err}</span>}
        <small>{rated.length} rated of {rows.length} interactions</small>
      </div>

      <div className="card">
        <h3>Average rating by provider</h3>
        {data.length === 0 ? <div className="empty">Rate some AI responses to see trends.</div> : (
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="bucket" {...axisProps} />
                <YAxis domain={[0, 5]} {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map((p) => <Line key={p} dataKey={p} stroke={colorFor(p)} strokeWidth={2} dot={{ r: 4 }} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card table-wrap">
        <h3>Average rating · model × feature</h3>
        <table>
          <thead><tr><th>Model</th>{features.map((f) => <th key={f}>{f}</th>)}</tr></thead>
          <tbody>
            {Object.entries(matrix).map(([m, fs]) => (
              <tr key={m}><td className="mono">{m}</td>{features.map((f) => <td key={f}>{fs[f] ? `${fmt(avg(fs[f]))} (${fs[f].length})` : '–'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <h3>Rating before/after agent config changes</h3>
        <table>
          <thead><tr><th>Feature</th><th>Version</th><th>Since</th><th>n</th><th>Avg</th><th>Δ vs previous</th></tr></thead>
          <tbody>
            {versions.flatMap((f) => f.list.map((v) => (
              <tr key={f.feature + v.v}>
                <td>{f.feature}</td><td className="mono">{v.v}</td><td>{new Date(v.first).toLocaleDateString()}</td><td>{v.n}</td><td>{fmt(v.avg)}</td>
                <td>{v.delta == null ? '–' : `${v.delta >= 0 ? '▲ +' : '▼ '}${v.delta.toFixed(2)}`}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      <BenchmarkHistory />

      <div className="card">
        <h3>Suggestion follow-through by provider</h3>
        {follow.length === 0 ? <div className="empty">Mark "Did you act on it?" on suggestions to populate.</div> : (
          <div className="chart-box" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={follow} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="provider" {...axisProps} />
                <YAxis domain={[0, 100]} unit="%" {...axisProps} />
                <Tooltip {...tooltipProps} formatter={(v, _n, p) => [`${v}% (n=${p.payload.n})`, 'followed']} />
                <Bar dataKey="rate" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

function BenchmarkHistory() {
  const [runs, setRuns] = useState([])
  const [scenario, setScenario] = useState('')
  useEffect(() => {
    supabase.from('benchmark_runs').select('id,scenario_id,provider,model,rubric_total,rubric_max,created_at').not('rubric_total', 'is', null).order('created_at')
      .then(({ data }) => setRuns(data || []))
  }, [])
  const ids = [...new Set(runs.map((r) => r.scenario_id))]
  const sc = scenario || ids[0]
  const sel = runs.filter((r) => r.scenario_id === sc)
  const models = [...new Set(sel.map((r) => `${r.provider}/${r.model}`))]
  const data = sel.map((r) => ({ t: new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }), [`${r.provider}/${r.model}`]: Math.round((r.rubric_total / (r.rubric_max || 1)) * 100) }))
  return (
    <div className="card">
      <div className="card-head"><h3>Benchmark rubric score history</h3>
        <select value={sc || ''} onChange={(e) => setScenario(e.target.value)} style={{ width: 220 }} aria-label="Scenario">{ids.map((i) => <option key={i}>{i}</option>)}</select>
      </div>
      {sel.length === 0 ? <div className="empty">Score some benchmark runs first.</div> : (
        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" {...axisProps} />
              <YAxis domain={[0, 100]} unit="%" {...axisProps} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {models.map((m) => <Line key={m} dataKey={m} stroke={colorFor(m)} strokeWidth={2} dot={{ r: 4 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
