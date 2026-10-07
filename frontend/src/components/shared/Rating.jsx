import { useState } from 'react'
import { RATING_OPTIONS, SUBS, markOutcome, rate, ratingLabel } from '../../lib/ai'

// Two taps max: major number, then (for 2/3/4) low/mid/high.
export default function Rating({ interactionId, initialMajor = null, initialSub = null, showOutcome = true, initialOutcome = null }) {
  const [major, setMajor] = useState(initialMajor)
  const [sub, setSub] = useState(initialSub)
  const [pending, setPending] = useState(null)
  const [outcome, setOutcome] = useState(initialOutcome)
  const [err, setErr] = useState(null)
  if (!interactionId) return null

  async function save(m, s) {
    try { await rate(interactionId, m, s); setMajor(m); setSub(s); setPending(null); setErr(null) } catch (e) { setErr(e.message) }
  }
  function tapMajor(m) {
    if ([2, 3, 4].includes(m)) setPending(m)
    else save(m, null)
  }
  async function setOut(v) {
    try { await markOutcome(interactionId, v); setOutcome(v) } catch (e) { setErr(e.message) }
  }

  return (
    <div className="rating">
      <div className="row">
        <small>Rate this{major != null && <> · <b>{ratingLabel(major, sub)}</b></>}</small>
      </div>
      {pending == null ? (
        <div className="row">
          {RATING_OPTIONS.map((m) => (
            <button key={m} className={`small${major === m ? ' selected' : ''}`} onClick={() => tapMajor(m)}>{m}</button>
          ))}
        </div>
      ) : (
        <div className="row">
          {SUBS.map((s) => (
            <button key={s} className="small" onClick={() => save(pending, s)}>{s} {pending}</button>
          ))}
          <button className="small ghost" onClick={() => setPending(null)}>back</button>
        </div>
      )}
      {showOutcome && (
        <div className="row">
          <small>Did you act on it?</small>
          <button className={`small${outcome === true ? ' selected' : ''}`} onClick={() => setOut(true)}>Yes</button>
          <button className={`small${outcome === false ? ' selected' : ''}`} onClick={() => setOut(false)}>No</button>
        </div>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  )
}
