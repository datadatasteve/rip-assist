import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisProps, bucketKey, gridProps, tooltipProps } from './chart'
import { useInteractions } from './useInteractions'

const money = (v) => `$${v.toFixed(v < 1 ? 4 : 2)}`

export default function CostTracker() {
  const [days, setDays] = useState(30)
  const [bucket, setBucket] = useState('day')
  const { rows, err } = useInteractions(days)

  const { total, byProvider, byModel, byFeature, series, today } = useMemo(() => {
    const sum = (key) => {
      const m = {}
      rows.forEach((r) => { const k = key(r); m[k] = m[k] || { cost: 0, n: 0, tokens: 0 }; m[k].cost += Number(r.cost_usd || 0); m[k].n++; m[k].tokens += (r.input_tokens || 0) + (r.output_tokens || 0) })
      return Object.entries(m).sort((a, b) => b[1].cost - a[1].cost || b[1].n - a[1].n)
    }
    const b = {}
    rows.forEach((r) => { const k = bucketKey(r.created_at, bucket); b[k] = (b[k] || 0) + Number(r.cost_usd || 0) })
    const todayKey = bucketKey(new Date().toISOString(), 'day')
    return {
      total: rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
      today: rows.filter((r) => bucketKey(r.created_at, 'day') === todayKey).reduce((s, r) => s + Number(r.cost_usd || 0), 0),
      byProvider: sum((r) => r.provider), byModel: sum((r) => `${r.provider}/${r.model}`), byFeature: sum((r) => r.feature),
      series: Object.keys(b).sort().map((k) => ({ bucket: k, cost: +b[k].toFixed(6) })),
    }
  }, [rows, bucket])

  const Table = ({ title, data }) => (
    <div className="card table-wrap">
      <h3>{title}</h3>
      <table><thead><tr><th>Name</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
        <tbody>{data.map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td>{v.n}</td><td>{v.tokens.toLocaleString()}</td><td>{money(v.cost)}</td></tr>)}</tbody>
      </table>
      {data.length === 0 && <div className="empty">No calls in range.</div>}
    </div>
  )

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <div className="seg">{[7, 30, 90, 365].map((d) => <button key={d} className={`small${days === d ? ' selected' : ''}`} onClick={() => setDays(d)}>{d}d</button>)}</div>
        <div className="seg">{['day', 'week', 'month'].map((b) => <button key={b} className={`small${bucket === b ? ' selected' : ''}`} onClick={() => setBucket(b)}>{b}</button>)}</div>
        {err && <span className="error">{err}</span>}
      </div>
      <div className="kpis">
        <div className="card stat"><b>{money(total)}</b><small>total, last {days}d</small></div>
        <div className="card stat"><b>{money(today)}</b><small>today</small></div>
        <div className="card stat"><b>{rows.length}</b><small>calls</small></div>
        <div className="card stat"><b>{rows.filter((r) => Number(r.cost_usd) === 0).length}</b><small>free calls</small></div>
      </div>
      <div className="card">
        <h3>Spend per {bucket}</h3>
        <div className="chart-box" style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="bucket" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => `$${v}`} />
              <Tooltip {...tooltipProps} formatter={(v) => [money(v), 'cost']} />
              <Bar dataKey="cost" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-3">
        <Table title="By provider" data={byProvider} />
        <Table title="By feature" data={byFeature} />
        <Table title="By model" data={byModel} />
      </div>
    </div>
  )
}
