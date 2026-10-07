import { useSearchParams } from 'react-router-dom'
import AgentEditor from '../components/dev/AgentEditor'
import BenchmarkRunner from '../components/dev/BenchmarkRunner'
import CostTracker from '../components/dev/CostTracker'
import InteractionLog from '../components/dev/InteractionLog'
import ModelRegistry from '../components/dev/ModelRegistry'
import MomentumInspector from '../components/dev/MomentumInspector'
import TrendAnalysis from '../components/dev/TrendAnalysis'

const TABS = [
  ['models', 'Model registry', ModelRegistry],
  ['log', 'Interactions', InteractionLog],
  ['bench', 'Benchmarks', BenchmarkRunner],
  ['trends', 'Trends', TrendAnalysis],
  ['agents', 'Agent editor', AgentEditor],
  ['cost', 'Cost', CostTracker],
  ['momentum', 'Momentum', MomentumInspector],
]

export default function DevDashboard() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'models'
  const Comp = (TABS.find((t) => t[0] === tab) || TABS[0])[2]
  return (
    <>
      <div className="topbar"><h1>Dev dashboard</h1></div>
      <div className="tabs">
        {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'selected' : ''} onClick={() => setParams({ tab: k })}>{label}</button>)}
      </div>
      <Comp />
    </>
  )
}
