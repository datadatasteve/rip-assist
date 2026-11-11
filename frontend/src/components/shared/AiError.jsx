import { useData } from '../../hooks/useData'

// Plain-language AI failure. With Dev mode on, shows what each model returned.
export default function AiError({ error, raw }) {
  const { settings } = useData()
  if (!error && raw == null) return null
  const message = raw != null ? "The AI's answer couldn't be read. Try again." : (error?.message || String(error))
  const attempts = error?.attempts || []
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="error">{message}</div>
      {settings?.dev_mode && (attempts.length > 0 || raw != null) && (
        <details>
          <summary><small>Details</small></summary>
          {attempts.map((a, i) => (
            <div key={i}><small className="mono">{a.provider} · {a.model}: {a.error}</small>
              {a.raw && <pre className="mono" style={{ maxHeight: 160, overflow: 'auto' }}>{a.raw}</pre>}</div>
          ))}
          {raw != null && <pre className="mono" style={{ maxHeight: 160, overflow: 'auto' }}>{raw}</pre>}
        </details>
      )}
    </div>
  )
}
