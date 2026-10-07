import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Select } from '../components/shared/Field'
import { useInstall } from '../components/shared/InstallBanner'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useTable } from '../hooks/useTable'
import { api, API_URL } from '../lib/api'
import { currentSubscription, guessDeviceLabel, pushSupported, subscribePush, unsubscribePush } from '../lib/push'
import { supabase } from '../lib/supabase'
import { relative } from '../lib/time'

export default function Settings() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const gcal = params.get('gcal')
  return (
    <>
      <div className="topbar"><h1>Settings</h1></div>
      {gcal === 'connected' && <div className="banner">Google Calendar connected. <button className="small ghost" onClick={() => setParams({})}>✕</button></div>}
      {gcal === 'error' && <div className="banner danger">Google Calendar connection failed: {params.get('reason')} <button className="small ghost" onClick={() => setParams({})}>✕</button></div>}
      <div className="grid grid-2">
        <div className="stack" style={{ gap: 12 }}>
          <Account user={user} />
          <Preferences />
          <Checkins />
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <Notifications />
          <Calendar />
          <Install />
          <Developer />
        </div>
      </div>
    </>
  )
}

function Account({ user }) {
  return (
    <div className="card">
      <h2>Account</h2>
      <p><small>Signed in as</small><br /><b>{user?.email}</b></p>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}

function readTheme() { try { return localStorage.getItem('ra-theme') || 'system' } catch { return 'system' } }
export function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}

function Preferences() {
  const { settings, updateSettings } = useData()
  const [theme, setTheme] = useState(readTheme)
  const [msg, setMsg] = useState(null)
  if (!settings) return null
  const save = (patch) => updateSettings(patch).then(() => setMsg('Saved')).catch((e) => setMsg(e.message))
  return (
    <div className="card">
      <h2>Preferences</h2>
      <div className="form">
        <label className="field"><span>Timezone (IANA, e.g. America/New_York)</span>
          <input key={settings.timezone} defaultValue={settings.timezone} onBlur={(e) => e.target.value !== settings.timezone && save({ timezone: e.target.value.trim() })} />
        </label>
        <small>Detected on this device: {Intl.DateTimeFormat().resolvedOptions().timeZone}{' '}
          <button className="small ghost" onClick={() => save({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}>use</button></small>
        <div className="form-row">
          <Input label="Workday start" type="time" value={String(settings.workday_start).slice(0, 5)} onChange={(v) => save({ workday_start: v })} />
          <Input label="Workday end" type="time" value={String(settings.workday_end).slice(0, 5)} onChange={(v) => save({ workday_end: v })} />
        </div>
        <Select label="Theme (this device)" value={theme} onChange={(t) => { setTheme(t); applyTheme(t); try { localStorage.setItem('ra-theme', t) } catch { /* ignore */ } }}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        {msg && <small>{msg}</small>}
      </div>
    </div>
  )
}

function Checkins() {
  const { settings, updateSettings } = useData()
  const [newTime, setNewTime] = useState('09:00')
  const [msg, setMsg] = useState(null)
  if (!settings) return null
  const times = settings.checkin_times || []

  async function save(patch) {
    try {
      await updateSettings(patch)
      await api('/api/checkins/plan-day', { method: 'POST' }).catch(() => {})
      setMsg('Saved')
      // first check-in setup → ask for push on this device
      if (!settings.push_prompted && pushSupported()) {
        const sub = await currentSubscription()
        if (!sub && confirm('Enable push notifications on this device for check-in reminders?')) {
          await subscribePush(guessDeviceLabel()).then(() => setMsg('Saved · push enabled')).catch((e) => setMsg(e.message))
        }
        updateSettings({ push_prompted: true }).catch(() => {})
      }
    } catch (e) { setMsg(e.message) }
  }

  const state = settings.checkin_state || {}
  return (
    <div className="card">
      <h2>Check-ins</h2>
      <div className="form">
        <label className="field"><span>Scheduled times</span>
          <div className="row">
            {times.length === 0 && <small>None</small>}
            {times.map((t) => (
              <span key={t} className="pill accent">{t} <button className="small ghost" style={{ minHeight: 0, padding: 0 }} onClick={() => save({ checkin_times: times.filter((x) => x !== t) })} aria-label={`Remove ${t}`}>✕</button></span>
            ))}
          </div>
        </label>
        <div className="row">
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 140 }} />
          <button onClick={() => !times.includes(newTime) && save({ checkin_times: [...times, newTime].sort() })}>Add time</button>
        </div>
        <hr className="divider" />
        <div className="form-row">
          <Input label="Random check-ins per day" type="number" min="0" max="12" value={String(settings.checkin_random_per_day ?? 0)}
            onChange={(v) => save({ checkin_random_per_day: Math.max(0, Math.min(12, Number(v) || 0)) })} />
          <Input label="Random window start" type="time" value={String(settings.checkin_window_start).slice(0, 5)} onChange={(v) => save({ checkin_window_start: v })} />
          <Input label="Random window end" type="time" value={String(settings.checkin_window_end).slice(0, 5)} onChange={(v) => save({ checkin_window_end: v })} />
        </div>
        {state.random_times?.length > 0 && <small>Today's random times: {state.random_times.join(', ')}{state.sent?.length ? ` · sent: ${state.sent.join(', ')}` : ''}</small>}
        <small>On-demand: tap ♥ Check-in anywhere. Reminders arrive by push (every 15 min cron) and as an in-app banner.</small>
        {msg && <small>{msg}</small>}
      </div>
    </div>
  )
}

function Notifications() {
  const { user } = useAuth()
  const subs = useTable('push_subscriptions', { enabled: Boolean(user), query: (q) => q.order('created_at', { ascending: false }), deps: [user?.id] })
  const [sub, setSub] = useState(null)
  const [label, setLabel] = useState(guessDeviceLabel())
  const [type, setType] = useState('test')
  const [msg, setMsg] = useState(null)
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'

  useEffect(() => { currentSubscription().then(setSub).catch(() => {}) }, [])

  async function enable() {
    setMsg(null)
    try { setSub(await subscribePush(label)); subs.reload(); setMsg('Enabled on this device') } catch (e) { setMsg(e.message) }
  }
  async function disable() {
    await unsubscribePush(); setSub(null); subs.reload(); setMsg('Disabled on this device')
  }
  async function test() {
    setMsg(null)
    try {
      const r = await api('/api/notifications/test', { method: 'POST', body: { type } })
      setMsg(r.webpush_configured ? `Sent to ${r.sent.webpush} device(s) + in-app` : 'In-app only: VAPID keys not configured on backend')
    } catch (e) { setMsg(e.message) }
  }

  return (
    <div className="card">
      <h2>Notifications</h2>
      {!pushSupported() ? (
        <div className="banner warn">Push isn't available in this browser. On iPhone/iPad, install the app to your Home Screen first (iOS 16.4+).</div>
      ) : (
        <div className="form">
          <small>This device: {sub ? 'subscribed' : 'not subscribed'} · permission {perm}</small>
          {!sub ? (
            <div className="row"><input value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1, minWidth: 140 }} aria-label="Device label" /><button className="primary" onClick={enable}>Enable push here</button></div>
          ) : <button onClick={disable}>Disable push on this device</button>}
        </div>
      )}
      <hr className="divider" />
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1, minWidth: 160 }} aria-label="Test notification type">
          <option value="test">Test notification</option>
          <option value="checkin_reminder">Check-in reminder</option>
          <option value="momentum_alert">Momentum alert</option>
          <option value="waiting_followup">Waiting-on follow-up</option>
          <option value="plan_infeasible">Plan infeasible</option>
        </select>
        <button onClick={test}>Send</button>
      </div>
      {msg && <small>{msg}</small>}
      {subs.rows.length > 0 && (
        <>
          <hr className="divider" />
          <small>Subscribed devices</small>
          <div className="list">
            {subs.rows.map((s) => (
              <div key={s.id} className="list-item">
                <div className="grow truncate">{s.device_label || 'device'}{sub && s.subscription?.endpoint === sub.endpoint ? ' (this device)' : ''}</div>
                <small>{relative(s.created_at)}</small>
                <button className="small ghost danger" onClick={() => supabase.from('push_subscriptions').delete().eq('id', s.id).then(() => subs.reload())}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Calendar() {
  const { calendar, activeLanes, gcalEvents } = useData()
  const conn = calendar.rows[0]
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function connect() {
    setMsg(null)
    try { const { url } = await api('/api/calendar/auth-url'); window.location.href = url } catch (e) { setMsg(e.message) }
  }
  async function sync() {
    setBusy(true); setMsg(null)
    try { const r = await api('/api/calendar/sync', { method: 'POST' }); setMsg(r.connected === false ? 'Not connected' : `Synced ${r.events} events from ${r.calendars} calendars`) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  async function disconnect() {
    if (!confirm('Disconnect Google Calendar? Synced events are removed.')) return
    try { await api('/api/calendar/disconnect', { method: 'POST' }); calendar.reload(); gcalEvents.reload() } catch (e) { setMsg(e.message) }
  }
  async function updateCal(id, patch) {
    const cals = (conn.calendars || []).map((c) => (c.id === id ? { ...c, ...patch } : c))
    const { error } = await supabase.from('calendar_connections').update({ calendars: cals }).eq('user_id', conn.user_id)
    if (error) return setMsg(error.message)
    calendar.merge({ ...conn, calendars: cals })
    if ('enabled' in patch) sync()
  }

  return (
    <div className="card">
      <h2>Google Calendar</h2>
      <small>Read-only. Only event times and titles are stored; nothing is sent to AI unless you tick "include calendar details" on a request.</small>
      {!conn ? (
        <div className="row" style={{ marginTop: 10 }}><button className="primary" onClick={connect}>Connect Google Calendar</button></div>
      ) : (
        <div className="form" style={{ marginTop: 10 }}>
          <small>Connected{conn.google_email ? ` as ${conn.google_email}` : ''} · last sync {relative(conn.last_synced_at)}</small>
          <div className="row"><button onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</button><button className="danger" onClick={disconnect}>Disconnect</button></div>
          <small>Calendar → lane</small>
          <div className="list">
            {(conn.calendars || []).map((c) => (
              <div key={c.id} className="list-item">
                <input type="checkbox" checked={c.enabled !== false} onChange={(e) => updateCal(c.id, { enabled: e.target.checked })} aria-label={`Sync ${c.name}`} />
                <span className="dot" style={{ background: c.color || '#999' }} />
                <div className="grow truncate">{c.name}</div>
                <select value={c.lane_id || ''} onChange={(e) => updateCal(c.id, { lane_id: e.target.value || null })} style={{ width: 140 }} aria-label={`Lane for ${c.name}`}>
                  <option value="">Calendar row</option>
                  {activeLanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <small>{msg}</small>}
    </div>
  )
}

function Install() {
  const inst = useInstall()
  return (
    <div className="card">
      <h2>App</h2>
      {inst.standalone ? <small>Running as an installed app ✓</small>
        : inst.canPrompt ? <button className="primary" onClick={inst.prompt}>Install rip-assist</button>
          : inst.ios ? <small>Safari → Share → Add to Home Screen.</small>
            : <small>Use your browser's "Install app" option (Chrome/Edge address bar).</small>}
    </div>
  )
}

function Developer() {
  const { settings, updateSettings } = useData()
  const nav = useNavigate()
  const [health, setHealth] = useState(null)
  async function check() {
    try {
      const r = await fetch(`${API_URL}/health`).then((x) => x.json())
      const ai = await api('/api/ai/health').catch((e) => ({ error: e.message }))
      setHealth({ ...r, ai })
    } catch (e) { setHealth({ error: e.message }) }
  }
  if (!settings) return null
  return (
    <div className="card">
      <h2>Developer</h2>
      <label className="check"><input type="checkbox" checked={Boolean(settings.dev_mode)} onChange={(e) => updateSettings({ dev_mode: e.target.checked })} /> Show Dev dashboard in nav</label>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => nav('/dev')}>Open /dev</button>
        <button onClick={check}>Check backend</button>
      </div>
      <small className="mono">{API_URL}</small>
      {health && <pre className="mono" style={{ marginTop: 8, fontSize: 11 }}>{JSON.stringify(health, null, 1)}</pre>}
    </div>
  )
}
