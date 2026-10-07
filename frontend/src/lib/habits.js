// Streak math. Mirrors backend/routers/habits.py compute_streak.
import { addDays, isoDate, startOfDay } from './time'

export function isDue(habit, d) {
  if (habit.frequency === 'custom') return (habit.custom_days || []).includes(new Date(d).getDay())
  return true
}

function weekStart(d) {
  const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return isoDate(x)
}

export function computeStreak(habit, doneDates, today = new Date()) {
  const done = new Set(doneDates)
  if (habit.frequency === 'weekly') {
    const weeks = new Set([...done].map((s) => weekStart(new Date(s + 'T12:00'))))
    let cur = startOfDay(today); cur.setDate(cur.getDate() - cur.getDay())
    if (!weeks.has(isoDate(cur))) cur = addDays(cur, -7)
    let n = 0
    while (weeks.has(isoDate(cur))) { n++; cur = addDays(cur, -7) }
    return n
  }
  let d = startOfDay(today)
  if (!done.has(isoDate(d))) d = addDays(d, -1)
  let n = 0
  for (let guard = 0; guard < 3660; guard++) {
    if (!isDue(habit, d)) { d = addDays(d, -1); continue }
    if (done.has(isoDate(d))) { n++; d = addDays(d, -1) } else break
  }
  return n
}

export function dueToday(habit, logsForHabit, today = new Date()) {
  if (habit.frequency === 'weekly') {
    const ws = weekStart(today)
    return !logsForHabit.some((l) => weekStart(new Date(l.completed_date + 'T12:00')) === ws && l.completed_date !== isoDate(today))
  }
  return isDue(habit, today)
}

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
