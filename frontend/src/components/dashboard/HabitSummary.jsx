import { useNavigate } from 'react-router-dom'
import { useData } from '../../hooks/useData'
import { computeStreak, dueToday } from '../../lib/habits'
import { isoDate } from '../../lib/time'
import Ring from '../shared/Ring'

export default function HabitSummary() {
  const { habits, habitLogs } = useData()
  const nav = useNavigate()
  const today = isoDate()
  const rows = habits.rows.map((h) => {
    const logs = habitLogs.rows.filter((l) => l.habit_id === h.id)
    const doneToday = logs.some((l) => l.completed_date === today)
    return { h, doneToday, due: doneToday || dueToday(h, logs), streak: computeStreak(h, logs.map((l) => l.completed_date)) }
  })
  const due = rows.filter((r) => r.due)
  const done = due.filter((r) => r.doneToday)
  return (
    <div className="card clickable" onClick={() => nav('/habits')}>
      <div className="card-head"><h2>Habits</h2></div>
      {rows.length === 0 ? <div className="empty">No habits yet.</div> : (
        <div className="ring-wrap">
          <Ring value={done.length} max={due.length || 0} label="Habits done today" />
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            {rows.slice(0, 4).map((r) => (
              <small key={r.h.id} className="truncate">{r.doneToday ? '✓' : '○'} {r.h.title} · 🔥{r.streak}</small>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
