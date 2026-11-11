import { useEffect, useRef } from 'react'

// Page-scroll lock shared by every open modal. A counter (not "restore the previous
// value") so nested modals and re-renders can never leave the page stuck unscrollable.
let openModals = 0
function lockScroll() {
  openModals += 1
  document.body.style.overflow = 'hidden'
}
function unlockScroll() {
  openModals = Math.max(0, openModals - 1)
  if (openModals === 0) document.body.style.overflow = ''
}

export default function Modal({ title, onClose, children, wide, footer }) {
  // Keep the latest onClose without re-running the lock effect on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    lockScroll()
    return unlockScroll
  }, [])

  useEffect(() => {
    // Escape closes only the top-most modal, not every modal underneath it.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const all = document.querySelectorAll('.modal-backdrop')
      if (all[all.length - 1] === backdrop.current) closeRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const backdrop = useRef(null)
  return (
    <div ref={backdrop} className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="ghost icon" onClick={onClose} aria-label="Close" title="Close">✕</button>
        </div>
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  )
}
