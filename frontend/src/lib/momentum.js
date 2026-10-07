// Overview color comes from the trend (rising/flat/falling → green/yellow/red),
// detail is the 0–100 bar.
export const TREND_COLOR = { rising: 'green', flat: 'yellow', falling: 'red' }

export function colorOf(item) {
  return TREND_COLOR[item?.momentum_trend || 'flat']
}

export function laneOf(item, goalsById) {
  return item.lane_id || (item.goal_id && goalsById[item.goal_id]?.lane_id) || null
}

export function chunkLane(chunk, tasksById, goalsById) {
  if (chunk.lane_id) return chunk.lane_id
  if (chunk.task_id && tasksById[chunk.task_id]) return laneOf(tasksById[chunk.task_id], goalsById)
  if (chunk.goal_id && goalsById[chunk.goal_id]) return goalsById[chunk.goal_id].lane_id
  return null
}

export function laneAggregate(items) {
  const active = items.filter((i) => ['active', 'waiting_on'].includes(i.status))
  if (!active.length) return { momentum: null, trend: 'flat', color: 'yellow', count: 0 }
  const momentum = Math.round(active.reduce((s, i) => s + (i.momentum ?? 0), 0) / active.length)
  const votes = { rising: 0, flat: 0, falling: 0 }
  active.forEach((i) => { votes[i.momentum_trend || 'flat']++ })
  const trend = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || (a === 'flat' ? -1 : b === 'flat' ? 1 : 0))[0]
  return { momentum, trend, color: TREND_COLOR[trend], count: active.length }
}

export function suggestionScore(item) {
  const pu = item.priority_user ?? 5
  const pa = item.priority_app ?? pu
  return ((pu + pa) / 2) * 10 * 0.6 + (item.momentum ?? 0) * 0.4
}
