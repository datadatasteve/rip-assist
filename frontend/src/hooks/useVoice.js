import { useEffect, useRef, useState } from 'react'

// Web Speech API — transcription happens in the browser; no audio leaves the device via this app.
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const voiceSupported = Boolean(Recognition)

export function useVoice(onFinal) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const rec = useRef(null)
  const cb = useRef(onFinal)
  cb.current = onFinal

  useEffect(() => () => rec.current?.abort(), [])

  function start() {
    if (!Recognition) return
    setError(null)
    const r = new Recognition()
    r.lang = navigator.language || 'en-US'
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      let fin = '', mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += t; else mid += t
      }
      setInterim(mid)
      if (fin) cb.current(fin.trim())
    }
    r.onerror = (e) => { setError(e.error); setListening(false) }
    r.onend = () => { setListening(false); setInterim('') }
    rec.current = r
    r.start()
    setListening(true)
  }
  function stop() { rec.current?.stop() }

  return { listening, interim, error, start, stop, toggle: () => (listening ? stop() : start()) }
}
