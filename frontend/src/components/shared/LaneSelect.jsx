import { useData } from '../../hooks/useData'
import { Select } from './Field'

export default function LaneSelect({ label = 'Lane', value, onChange, allowNone = true }) {
  const { activeLanes } = useData()
  const options = [
    ...(allowNone ? [{ value: '', label: '— none —' }] : []),
    ...activeLanes.map((l) => ({ value: l.id, label: `${l.icon ? l.icon + ' ' : ''}${l.name}` })),
  ]
  return <Select label={label} value={value || ''} onChange={(v) => onChange(v || null)} options={options} />
}
