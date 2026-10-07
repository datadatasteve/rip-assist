import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import HabitSummary from '../components/dashboard/HabitSummary'
import LaneCards from '../components/dashboard/LaneCards'
import ReplanCard from '../components/dashboard/ReplanCard'
import SuggestionCard from '../components/dashboard/SuggestionCard'
import Upcoming from '../components/dashboard/Upcoming'
import { useData } from '../hooks/useData'
import { api } from '../lib/api'

export default function Dashboard() {
  const { costToday, checkins, chunks } = useData()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [feas, setFeas] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const lastMood = checkins.rows[0]

  const sig = chunks.rows.map((c) => `${c.id}${c.scheduled_start}${c.completed_at}${c.skipped_at}`).join('').length
  useEffect(() => { api('/api/feasibility').then(setFeas).catch(() => {}) }, [sig])

  const recommended = !dismissed && (params.get('replan') === '1' || feas?.offered)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{greet}</h1>
          <small>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</small>
        </div>
        <div className="row">
          {lastMood && <span className={`pill ${lastMood.mood}`} title="Last check-in mood">mood · energy {lastMood.energy}</span>}
          <span className="pill" title="AI spend today">AI ${costToday.toFixed(costToday < 1 ? 4 : 2)} today</span>
          <button className="primary" onClick={() => nav('/checkin?trigger=on_demand')}>Quick check-in</button>
        </div>
      </div>
      {recommended && (
        <ReplanCard recommended feasibility={feas} onDismiss={() => { setDismissed(true); params.delete('replan'); setParams(params) }} />
      )}
      <div className="grid grid-2" style={{ marginTop: recommended ? 12 : 0 }}>
        <SuggestionCard />
        <div className="stack" style={{ gap: 12 }}>
          <Upcoming />
          <HabitSummary />
        </div>
      </div>
      <div className="section">
        <div className="card-head"><h2>Lanes</h2></div>
        <LaneCards />
      </div>
      {!recommended && <div className="section"><ReplanCard feasibility={feas} /></div>}
    </>
  )
}
