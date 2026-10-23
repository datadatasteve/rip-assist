import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function PasswordResetModal() {
  const { clearPasswordReset } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (password !== confirm) return setErr('Passwords do not match.')
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      clearPasswordReset()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <h2>Set new password</h2>
        <form className="form" onSubmit={submit}>
          <label className="field"><span>New password</span>
            <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="field"><span>Confirm password</span>
            <input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="primary" disabled={busy}>{busy ? '…' : 'Update password'}</button>
        </form>
      </div>
    </div>
  )
}
