import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export default function AgentEditor() {
  const [data, setData] = useState(null)
  const [feature, setFeature] = useState('suggestion')
  const [text, setText] = useState('')
  const [bump, setBump] = useState('patch')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState(null)

  const load = () => api('/api/ai/agents').then(setData).catch((e) => setMsg(e.message))
  useEffect(() => { load() }, [])

  const versions = (data?.versions || []).filter((v) => v.feature === feature)
  const active = versions.find((v) => v.active)
  const current = active || data?.defaults?.[feature]
  useEffect(() => { if (current) setText(current.system_prompt) }, [feature, current?.version]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    try { const r = await api('/api/ai/agents', { method: 'POST', body: { feature, system_prompt: text, bump, notes: notes || null } }); setMsg(`Deployed ${feature}@${r.version}`); setNotes(''); load() } catch (e) { setMsg(e.message) }
  }
  async function activate(id) { await api(`/api/ai/agents/${id}/activate`, { method: 'POST' }); load() }
  async function reset() { if (confirm('Revert to built-in default prompt?')) { await api(`/api/ai/agents/${feature}/reset`, { method: 'POST' }); load() } }

  if (!data) return <div className="card">{msg || 'Loading…'}</div>
  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="card-head">
          <h3>System prompt</h3>
          <select value={feature} onChange={(e) => setFeature(e.target.value)} style={{ width: 180 }} aria-label="Feature">{data.features.map((f) => <option key={f}>{f}</option>)}</select>
        </div>
        <small>Live: <b className="mono">{feature}@{current?.version}</b>{active ? '' : ' (built-in default)'}</small>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 280, marginTop: 8 }} className="mono" />
        <div className="form-row" style={{ marginTop: 8 }}>
          <label className="field"><span>Version bump</span>
            <select value={bump} onChange={(e) => setBump(e.target.value)}><option>patch</option><option>minor</option><option>major</option></select>
          </label>
          <label className="field"><span>Change notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={save} disabled={!text.trim() || text === current?.system_prompt}>Deploy new version</button>
          <button onClick={reset}>Reset to default</button>
        </div>
        {msg && <small>{msg}</small>}
      </div>
      <div className="card">
        <h3>Version history · {feature}</h3>
        {versions.length === 0 && <div className="empty">Using built-in default {data.defaults[feature]?.version}.</div>}
        <div className="list">
          {versions.map((v) => (
            <div key={v.id} className="list-item">
              <div className="grow"><b className="mono">{v.version}</b>{v.active && <span className="pill accent" style={{ marginLeft: 6 }}>live</span>}<br /><small>{new Date(v.created_at).toLocaleString()}{v.notes ? ` · ${v.notes}` : ''}</small></div>
              {!v.active && <button className="small" onClick={() => activate(v.id)}>Roll back to this</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
