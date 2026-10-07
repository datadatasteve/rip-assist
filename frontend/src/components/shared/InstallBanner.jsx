import { useEffect, useState } from 'react'

let deferred = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    listeners.forEach((l) => l())
  })
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])
  return {
    canPrompt: Boolean(deferred),
    standalone: isStandalone(),
    ios: isIOS(),
    prompt: async () => {
      if (!deferred) return
      deferred.prompt()
      await deferred.userChoice
      deferred = null
      listeners.forEach((l) => l())
    },
  }
}

export default function InstallBanner() {
  const inst = useInstall()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('ra-install-dismissed') === '1' } catch { return false }
  })
  if (inst.standalone || dismissed) return null
  if (!inst.canPrompt && !inst.ios) return null
  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem('ra-install-dismissed', '1') } catch { /* ignore */ }
  }
  return (
    <div className="banner">
      <span>📲</span>
      <span className="grow" style={{ flex: 1 }}>
        {inst.canPrompt ? 'Install rip-assist as an app for notifications and quick access.'
          : 'On iPhone: tap Share → Add to Home Screen to install (required for push notifications).'}
      </span>
      {inst.canPrompt && <button className="small primary" onClick={inst.prompt}>Install</button>}
      <button className="small ghost" onClick={dismiss}>Dismiss</button>
    </div>
  )
}
