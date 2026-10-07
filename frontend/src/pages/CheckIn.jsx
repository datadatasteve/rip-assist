import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReplanCard from '../components/dashboard/ReplanCard'
import { TextField } from '../components/shared/Field'
import Rating from '../components/shared/Rating'
import { useData } from '../hooks/useData'
import { ai } from '../lib/ai'
import { api } from '../lib/api'
import { currentSubscription, guessDeviceLabel, pushSupported, subscribePush } from '../lib/push'
import { relative } from '../lib/time'

const MOODS = [
  { v: 'green', label: 'On track', icon: '●' },
  { v: 'yellow', label: 'A bit behind', icon: '◐' },
  { v: 'red', label: 'Off the rails', icon: '○' },
]
const ENERGY = ['Empty', 'Low', 'OK', 'Good', 'Charged']
const ACTIVITIES = ['Deep work', 'Meetings', 'Email / admin', 'Errands', 'Exercise', 'Resting', 'With people', 'Distracted', 'Stuck']
const TRIGGERS = ['scheduled', 'on_demand', 'random']

export default function CheckIn() {
  const [params] = useSearchParams()
  const trig = TRIGGERS.includes(params.get('trigger')) ? params.get('trigger') : 'on_demand'
  const { checkins, settings, updateSettings } = useData()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [mood, setMood] = useState(null)
  const [energy, setEnergy] = useState(null)
  const [acts, setActs] = useState([])
  const [reflection, setReflection] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [result, setResult] = useState(null)
  const [reply, setReply] = useState(null)
  const [replyErr, setReplyErr] = useState(null)
  const [pushAsk, setPushAsk] = useState(false)
  const [pushMsg, setPushMsg] = useState(null)

  useEffect(() => {
    // first check-in setup is where we ask for push permission
    if (!result || !pushSupported() || settings?.push_prompted) return
    currentSubscription().then((s) => { if (!s && Notification.permission !== 'denied') setPushAsk(true) })
  }, [result, settings?.push_prompted])

  async function submit() {
    setBusy(true); setErr(null)
    const refl = [acts.join(', '), reflection].filter(Boolean).join(' — ')
    try {
      const r = await api('/api/checkins', { method: 'POST', body: { mood, energy, reflection: refl || null, notes: notes || null, triggered_by: trig } })
      checkins.merge(r.checkin)
      setResult(r)
      ai.checkinReply(r.checkin.id).then(setReply).catch((e) => setReplyErr(e.message))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function enablePush() {
    try {
      await subscribePush(guessDeviceLabel())
      setPushMsg('Notifications on for this device.')
    } catch (e) { setPushMsg(e.message) }
    setPushAsk(false)
    updateSettings({ push_prompted: true }).catch(() => {})
  }

  if (result) {
    const sig = result.checkin.behavioral_signals || {}
    return (
      <>
        <div className="topbar"><h1>Checked in</h1><button onClick={() => nav('/')}>Done</button></div>
        <div className="card">
          <div className="row"><span className={`pill ${result.checkin.mood}`}>{MOODS.find((m) => m.v === result.checkin.mood)?.label}</span><span className="pill">energy {result.checkin.energy}/5</span><span className="pill">{trig.replace('_', ' ')}</span></div>
          <small style={{ display: 'block', marginTop: 8 }}>
            Since last check-in: {sig.completed_chunks ?? 0} done · {sig.missed_chunks ?? 0} missed · {sig.skipped_chunks ?? 0} skipped
            {sig.skipped_checkins ? ` · ${sig.skipped_checkins} reminder(s) unanswered` : ''}
          </small>
        </div>
        <div className="card">
          <h3>rip-assist</h3>
          {!reply && !replyErr && <small>Thinking…</small>}
          {replyErr && <div className="error">AI unavailable: {replyErr}</div>}
          {reply && (
            <>
              <p style={{ whiteSpace: 'pre-wrap' }}>{reply.reply}</p>
              <small>{reply.provider} · {reply.model}</small>
              <hr className="divider" />
              <Rating key={reply.interaction_id} interactionId={reply.interaction_id} />
            </>
          )}
        </div>
        {pushAsk && (
          <div className="card">
            <b>Get check-in reminders on this device?</b>
            <p><small>Used for scheduled check-ins, momentum alerts and plan warnings. You can change this in Settings.</small></p>
            <div className="row">
              <button className="primary" onClick={enablePush}>Enable notifications</button>
              <button onClick={() => { setPushAsk(false); updateSettings({ push_prompted: true }).catch(() => {}) }}>Not now</button>
            </div>
          </div>
        )}
        {pushMsg && <div className="banner">{pushMsg}</div>}
        <div className="section"><ReplanCard recommended={result.replan_recommended} feasibility={sig.feasibility} /></div>
      </>
    )
  }

  const steps = [
    {
      title: 'How is today going, relative to your plan?',
      ok: Boolean(mood),
      body: (
        <div className="mood-row">
          {MOODS.map((m) => (
            <button key={m.v} className={`mood ${m.v}${mood === m.v ? ' selected' : ''}`} onClick={() => { setMood(m.v); setStep(1) }}>
              <span style={{ fontSize: 22, color: `var(--${m.v})` }}>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'Energy?',
      ok: Boolean(energy),
      body: (
        <div className="energy-row">
          {ENERGY.map((label, i) => (
            <button key={i} className={energy === i + 1 ? 'selected' : ''} onClick={() => { setEnergy(i + 1); setStep(2) }} title={label} style={{ flexDirection: 'column' }}>
              {i + 1}<small style={{ fontSize: 10 }}>{label}</small>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'What have you been up to?',
      ok: true,
      body: (
        <div className="stack">
          <div className="row">
            {ACTIVITIES.map((a) => (
              <button key={a} className={`small${acts.includes(a) ? ' selected' : ''}`} onClick={() => setActs((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]))}>{a}</button>
            ))}
          </div>
          <TextField value={reflection} onChange={setReflection} multiline placeholder="Anything else? (optional)" />
        </div>
      ),
    },
    {
      title: 'Notes (optional)',
      ok: true,
      body: <TextField value={notes} onChange={setNotes} multiline placeholder="Anything to remember…" />,
    },
  ]
  const s = steps[step]
  const last = checkins.rows[0]

  return (
    <>
      <div className="topbar"><h1>Check-in</h1><small>{trig.replace('_', ' ')}{last ? ` · last ${relative(last.created_at)}` : ''}</small></div>
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="steps">{steps.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <h2>{s.title}</h2>
        {s.body}
        {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button className="ghost" onClick={() => (step === 0 ? nav(-1) : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {step < steps.length - 1
            ? <button className="primary" disabled={!s.ok} onClick={() => setStep(step + 1)}>Next</button>
            : <button className="primary" disabled={busy || !mood || !energy} onClick={submit}>{busy ? 'Saving…' : 'Submit'}</button>}
        </div>
      </div>
    </>
  )
}
