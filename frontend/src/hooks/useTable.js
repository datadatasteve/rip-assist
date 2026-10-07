import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

let channelSeq = 0

/**
 * Loads rows from a table and keeps them live via Supabase Realtime.
 * This is the cross-device sync mechanism: any insert/update/delete on any
 * device lands here within ~1s. RLS ensures only the user's rows arrive.
 *
 * query: (builder) => builder   — narrow the initial fetch (order, limit, filters)
 * accept: (row) => bool         — which realtime rows belong in this list
 */
export function useTable(table, { query, accept, enabled = true, deps = [] } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const acceptRef = useRef(accept)
  acceptRef.current = accept
  const queryRef = useRef(query)
  queryRef.current = query

  const load = useCallback(async () => {
    if (!enabled) return
    let q = supabase.from(table).select('*')
    if (queryRef.current) q = queryRef.current(q)
    const { data, error } = await q
    if (error) setError(error.message)
    else { setRows(data || []); setError(null) }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, enabled, ...deps])

  useEffect(() => {
    if (!enabled) return
    load()
    const ch = supabase
      .channel(`rt-${table}-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
        setRows((prev) => {
          if (p.eventType === 'DELETE') return prev.filter((r) => keyOf(r) !== keyOf(p.old))
          const row = p.new
          const ok = acceptRef.current ? acceptRef.current(row) : true
          const idx = prev.findIndex((r) => keyOf(r) === keyOf(row))
          if (!ok) return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev
          if (idx >= 0) { const next = prev.slice(); next[idx] = row; return next }
          return [row, ...prev]
        })
      })
      .subscribe((status) => {
        // after a reconnect, refetch to catch anything missed while offline
        if (status === 'SUBSCRIBED') load()
      })

    // mobile browsers suspend sockets in the background: resync when visible again
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (Date.now() - hiddenAt > 15_000) load()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', load)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', load)
    }
  }, [load, table, enabled])

  // local merge for optimistic updates (realtime echo dedups by key)
  const merge = useCallback((row) => {
    if (!row) return
    setRows((prev) => {
      const idx = prev.findIndex((r) => keyOf(r) === keyOf(row))
      if (idx >= 0) { const n = prev.slice(); n[idx] = { ...prev[idx], ...row }; return n }
      return [row, ...prev]
    })
  }, [])
  const drop = useCallback((id) => setRows((prev) => prev.filter((r) => r.id !== id)), [])

  return { rows, loading, error, reload: load, merge, drop }
}

const keyOf = (r) => r.id ?? r.user_id
