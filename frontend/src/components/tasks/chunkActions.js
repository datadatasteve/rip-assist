import { momentumEvent } from '../../lib/api'
import { db } from '../../lib/supabase'

export async function completeChunk(chunks, c) {
  const saved = await db.update('chunks', c.id, { completed_at: new Date().toISOString(), skipped_at: null })
  chunks.merge(saved)
  momentumEvent('chunk', c.id, 'chunk_completed')
  return saved
}

export async function skipChunk(chunks, c) {
  const saved = await db.update('chunks', c.id, { skipped_at: new Date().toISOString(), completed_at: null })
  chunks.merge(saved)
  momentumEvent('chunk', c.id, 'chunk_skipped')
  return saved
}

export async function reopenChunk(chunks, c) {
  const saved = await db.update('chunks', c.id, { skipped_at: null, completed_at: null })
  chunks.merge(saved)
  return saved
}

export async function deleteChunk(chunks, c) {
  await db.remove('chunks', c.id)
  chunks.drop(c.id)
}
