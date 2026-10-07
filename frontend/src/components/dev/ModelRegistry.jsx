import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTable } from '../../hooks/useTable'
import { api } from '../../lib/api'
import { db } from '../../lib/supabase'

const FEATURES = ['suggestion', 'schedule', 'checkin', 'momentum', 'chunk_decompose', 'benchmark']
const PROVIDERS = ['ollama', 'groq', 'gemini', 'openrouter', 'cloudflare', 'claude', 'openai']

export default function ModelRegistry() {
  const { user } = useAuth()
  const cfgs = useTable('model_configs', { enabled: Boolean(user), query: (q) => q.order('priority_order', { nullsFirst: false }), deps: [user?.id] })
  const [health, setHealth] = useState(null)
  const [tests, setTests] = useState({})
  const [msg, setMsg] = useState(null)
  const [edit, setEdit] = useState(null)

  useEffect(() => {
    // seeds the registry on first visit
    api('/api/ai/models').then(() => cfgs.reload()).catch((e) => setMsg(e.message))
    api('/api/ai/health').then(setHealth).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = [...cfgs.rows].sort((a, b) => (a.priority_order ?? 999) - (b.priority_order ?? 999))
  const save = async (id, patch) => { try { cfgs.merge(await db.update('model_configs', id, patch)) } catch (e) { setMsg(e.message) } }
  async function test(c) {
    setTests((t) => ({ ...t, [c.id]: { pending: true } }))
    try { const r = await api(`/api/ai/models/${c.id}/test`, { method: 'POST' }); setTests((t) => ({ ...t, [c.id]: r })) } catch (e) { setTests((t) => ({ ...t, [c.id]: { ok: false, error: e.message } })) }
  }
  async function importOllama() {
    try { const r = await api('/api/ai/models/import-ollama', { method: 'POST' }); setMsg(`Ollama at ${r.endpoint || 'unreachable'}: added ${r.added.length ? r.added.join(', ') : 'nothing new'}`); cfgs.reload() } catch (e) { setMsg(e.message) }
  }
  async function makeDefault(c) {
    try { await api(`/api/ai/models/${c.id}/make-default`, { method: 'POST' }); cfgs.reload() } catch (e) { setMsg(e.message) }
  }
  async function add() {
    try { cfgs.merge(await db.insert('model_configs', { provider: 'openrouter', model_name: 'new-model', enabled: false, priority_order: 90, api_key_env_var: 'OPENROUTER_API_KEY' })) } catch (e) { setMsg(e.message) }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card">
        <div className="card-head"><h2>Model registry</h2>
          <div className="row"><button className="small" onClick={importOllama}>Import Ollama models</button><button className="small" onClick={add}>+ Config</button></div>
        </div>
        <small>Lower priority number is tried first. Configs sharing a priority for a feature form an A/B slot (random pick per request). The default is the enabled config with priority 1.</small>
        {health && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`pill ${health.ollama.endpoint ? 'green' : 'red'}`}>Ollama {health.ollama.endpoint || 'unreachable'}</span>
            {health.tailnet_proxy && <span className="pill accent">via tailnet</span>}
            {Object.entries(health.provider_keys_present).map(([p, ok]) => <span key={p} className={`pill ${ok ? 'green' : ''}`}>{p} key {ok ? '✓' : '–'}</span>)}
          </div>
        )}
        {msg && <div className="banner" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>On</th><th>Prio</th><th>Provider / model</th><th>Endpoint · key env</th><th>Feature overrides</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => {
              const t = tests[c.id]
              return (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={c.enabled} onChange={(e) => save(c.id, { enabled: e.target.checked })} aria-label="enabled" /></td>
                  <td><input type="number" defaultValue={c.priority_order ?? ''} style={{ width: 64 }} onBlur={(e) => save(c.id, { priority_order: e.target.value === '' ? null : Number(e.target.value) })} aria-label="priority" /></td>
                  <td><b>{c.provider}</b><br /><span className="mono">{c.model_name}</span>{c.priority_order === 1 && c.enabled && <> <span className="pill accent">default</span></>}</td>
                  <td className="mono" style={{ maxWidth: 220, wordBreak: 'break-all' }}>{c.endpoint_url || <span className="muted">(default)</span>}<br />{c.api_key_env_var || '–'}</td>
                  <td className="mono">{c.per_feature_overrides ? Object.entries(c.per_feature_overrides).map(([f, p]) => `${f}:${p}`).join(' ') : '–'}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="small" onClick={() => test(c)}>{t?.pending ? '…' : 'Test'}</button>
                      <button className="small" onClick={() => makeDefault(c)} title="Priority 1 + enabled">★</button>
                      <button className="small" onClick={() => setEdit(c)}>✎</button>
                    </div>
                    {t && !t.pending && <small className={t.ok ? '' : 'error'}>{t.ok ? `✓ ${t.latency_ms}ms “${t.reply?.slice(0, 20)}”` : t.error}</small>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {edit && <EditConfig cfg={edit} onClose={() => setEdit(null)} onSave={async (p) => { await save(edit.id, p); setEdit(null) }}
        onDelete={async () => { await db.remove('model_configs', edit.id); cfgs.drop(edit.id); setEdit(null) }} />}
    </div>
  )
}

function EditConfig({ cfg, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    provider: cfg.provider, model_name: cfg.model_name, endpoint_url: cfg.endpoint_url || '', api_key_env_var: cfg.api_key_env_var || '',
    overrides: { ...(cfg.per_feature_overrides || {}) },
  })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const bumpVersion = (v) => String((parseInt(v, 10) || 1) + 1)
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Edit model config</h2>
        <div className="form">
          <label className="field"><span>Provider</span><select value={f.provider} onChange={set('provider')}>{PROVIDERS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="field"><span>Model</span><input value={f.model_name} onChange={set('model_name')} /></label>
          <label className="field"><span>Endpoint base URL (blank = provider default; Ollama: Tailscale IP then localhost)</span><input value={f.endpoint_url} onChange={set('endpoint_url')} placeholder="https://…/v1" /></label>
          <label className="field"><span>API key env var name (the key itself lives on the backend)</span><input value={f.api_key_env_var} onChange={set('api_key_env_var')} /></label>
          <small>Per-feature priority (blank = use global)</small>
          <div className="form-row">
            {FEATURES.map((ft) => (
              <label key={ft} className="field"><span>{ft}</span>
                <input type="number" value={f.overrides[ft] ?? ''} onChange={(e) => setF((s) => ({ ...s, overrides: { ...s.overrides, [ft]: e.target.value === '' ? undefined : Number(e.target.value) } }))} />
              </label>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="danger" onClick={() => confirm('Delete config?') && onDelete()}>Delete</button>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={() => {
              const ov = Object.fromEntries(Object.entries(f.overrides).filter(([, v]) => v !== undefined && !Number.isNaN(v)))
              onSave({ provider: f.provider, model_name: f.model_name, endpoint_url: f.endpoint_url || null, api_key_env_var: f.api_key_env_var || null,
                per_feature_overrides: Object.keys(ov).length ? ov : null, version: bumpVersion(cfg.version) })
            }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
