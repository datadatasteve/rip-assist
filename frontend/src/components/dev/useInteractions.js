import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Lightweight columns only, for aggregate views.
export function useInteractions(days = 90) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState(null)
  useEffect(() => {
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    supabase.from('ai_interactions')
      .select('id,provider,model,feature,created_at,user_rating_major,user_rating_sub,outcome_followed,agent_config_version,cost_usd,success,input_tokens,output_tokens')
      .gte('created_at', since).order('created_at').limit(10000)
      .then(({ data, error }) => (error ? setErr(error.message) : setRows(data)))
  }, [days])
  return { rows, err }
}
