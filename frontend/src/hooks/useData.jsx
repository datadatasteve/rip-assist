import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useAuth } from './useAuth'
import { useTable } from './useTable'
import { db, supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { addDays, isoDate, startOfDay } from '../lib/time'

const DataCtx = createContext(null)

const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

export function DataProvider({ children }) {
  const { user } = useAuth()
  const enabled = Boolean(user)
  const uid = user?.id

  const lanes = useTable('lanes', { enabled, query: (q) => q.order('sort_order').order('created_at'), deps: [uid] })
  const goals = useTable('goals', { enabled, query: (q) => q.order('created_at', { ascending: false }), deps: [uid] })
  const tasks = useTable('tasks', { enabled, query: (q) => q.order('created_at', { ascending: false }), deps: [uid] })
  const chunks = useTable('chunks', { enabled, query: (q) => q.order('scheduled_start', { ascending: true, nullsFirst: false }), deps: [uid] })
  const habits = useTable('habits', { enabled, query: (q) => q.is('archived_at', null).order('created_at'), accept: (r) => !r.archived_at, deps: [uid] })
  const habitSince = isoDate(addDays(new Date(), -400))
  const habitLogs = useTable('habit_logs', { enabled, query: (q) => q.gte('completed_date', habitSince), deps: [uid] })
  const checkins = useTable('checkins', { enabled, query: (q) => q.order('created_at', { ascending: false }).limit(60), deps: [uid] })
  const evFrom = addDays(startOfDay(), -35).toISOString()
  const gcalEvents = useTable('gcal_events', { enabled, query: (q) => q.gte('end_at', evFrom).order('start_at'), deps: [uid] })
  const notifications = useTable('notifications', { enabled, query: (q) => q.order('created_at', { ascending: false }).limit(50), deps: [uid] })
  const settingsT = useTable('user_settings', { enabled, deps: [uid] })
  const calendar = useTable('calendar_connections', { enabled, deps: [uid] })
  const todayStart = startOfDay().toISOString()
  const aiToday = useTable('ai_interactions', {
    enabled,
    query: (q) => q.gte('created_at', todayStart).select('id,cost_usd,created_at'),
    accept: (r) => r.created_at >= todayStart,
    deps: [uid, todayStart],
  })

  const settings = settingsT.rows[0] || null

  // First load per device: make sure a settings row exists (it also registers the
  // user for cron jobs) and keep the timezone current.
  const initRef = useRef(null)
  useEffect(() => {
    if (!uid || settingsT.loading || initRef.current === uid) return
    initRef.current = uid
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!settings) {
      db.upsert('user_settings', { user_id: uid, timezone: tz }, 'user_id').then(settingsT.merge).catch(console.warn)
    } else if (settings.timezone === 'UTC' && tz !== 'UTC') {
      supabase.from('user_settings').update({ timezone: tz }).eq('user_id', uid).then(() => {})
    }
    api('/api/checkins/plan-day', { method: 'POST' }).catch(() => {})
    api('/api/calendar/sync', { method: 'POST' }).catch(() => {})
  }, [uid, settingsT.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => {
    const goalsById = byId(goals.rows)
    const tasksById = byId(tasks.rows)
    const lanesById = byId(lanes.rows)
    return {
      lanes, goals, tasks, chunks, habits, habitLogs, checkins, gcalEvents, notifications, calendar, aiToday,
      settings, settingsT,
      goalsById, tasksById, lanesById,
      activeLanes: lanes.rows.filter((l) => !l.archived_at),
      costToday: aiToday.rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
      updateSettings: async (patch) => {
        const { data, error } = await supabase.from('user_settings').update(patch).eq('user_id', uid).select().single()
        if (error) throw new Error(error.message)
        settingsT.merge(data)
        return data
      },
    }
  }, [lanes, goals, tasks, chunks, habits, habitLogs, checkins, gcalEvents, notifications, calendar, aiToday, settings, settingsT, uid])

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

export const useData = () => useContext(DataCtx)
