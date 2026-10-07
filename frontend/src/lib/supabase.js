import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
})

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// Thin CRUD helpers. user_id defaults to auth.uid() in Postgres; RLS scopes everything.
export const db = {
  async insert(table, row) {
    return check(await supabase.from(table).insert(row).select().single())
  },
  async insertMany(table, rows) {
    return check(await supabase.from(table).insert(rows).select())
  },
  async update(table, id, patch) {
    return check(await supabase.from(table).update(patch).eq('id', id).select().single())
  },
  async upsert(table, row, onConflict) {
    return check(await supabase.from(table).upsert(row, { onConflict }).select().single())
  },
  async remove(table, id) {
    return check(await supabase.from(table).delete().eq('id', id))
  },
}
