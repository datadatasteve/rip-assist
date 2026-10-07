import { useVoice, voiceSupported } from '../../hooks/useVoice'

// Push-to-talk mic on any text input. Transcribed text is appended to the field;
// the user reviews it and submits normally (nothing auto-submits).
function MicButton({ value, onChange }) {
  const v = useVoice((text) => onChange(value ? `${value.replace(/\s+$/, '')} ${text}` : text))
  if (!voiceSupported) return null
  return (
    <button
      type="button"
      className={`mic${v.listening ? ' on' : ''}`}
      onClick={v.toggle}
      aria-label={v.listening ? 'Stop dictation' : 'Dictate'}
      title={v.error ? `Mic error: ${v.error}` : v.listening ? 'Listening… tap to stop' : 'Hold a thought — tap to dictate'}
    >
      🎙
    </button>
  )
}

export function TextField({ label, value, onChange, voice = true, multiline, ...rest }) {
  const Tag = multiline ? 'textarea' : 'input'
  const input = (
    <div className="with-voice">
      <Tag value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
      {voice && <MicButton value={value ?? ''} onChange={onChange} />}
    </div>
  )
  if (!label) return input
  return (
    <label className="field">
      <span>{label}</span>
      {input}
    </label>
  )
}

export function Select({ label, value, onChange, options, ...rest }) {
  const sel = (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
  if (!label) return sel
  return <label className="field"><span>{label}</span>{sel}</label>
}

export function Input({ label, value, onChange, ...rest }) {
  const el = <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
  if (!label) return el
  return <label className="field"><span>{label}</span>{el}</label>
}
