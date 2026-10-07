import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(null); setMsg(null); setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
        })
        if (error) throw error
        if (!data.session) setMsg('Check your email to confirm your account, then sign in.')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL + '#/settings' })
        if (error) throw error
        setMsg('Password reset email sent.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 6 }}>rip<span>·</span>assist</div>
        <p className="muted">Your planning hub.</p>
        {!supabaseConfigured && <div className="banner danger">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. See docs/startup.md.</div>}
        <div className="seg" style={{ margin: '10px 0 14px' }}>
          <button className={mode === 'signin' ? 'selected' : ''} onClick={() => setMode('signin')}>Sign in</button>
          <button className={mode === 'signup' ? 'selected' : ''} onClick={() => setMode('signup')}>Sign up</button>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          {mode !== 'reset' && (
            <label className="field"><span>Password</span>
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          )}
          {err && <div className="error">{err}</div>}
          {msg && <div className="banner">{msg}</div>}
          <button className="primary" disabled={busy}>{busy ? '…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
          {mode === 'signin' && <button type="button" className="ghost small" onClick={() => setMode('reset')}>Forgot password?</button>}
        </form>
      </div>
    </div>
  )
}
