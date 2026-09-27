// Publish rate limiting, in two layers.
import type { Env } from './env'
import { tooManyRequests } from './errors'

/** Per hour, per client. Generous for a person, useless for a script. */
export const PUBLISH_PER_HOUR = 5
const HOUR = 60 * 60 * 1000
/** Events older than this are noise; swept opportunistically. */
const RETENTION = 24 * HOUR

/**
 * The burst layer: Cloudflare's rate-limiting binding, which is fast and costs
 * nothing, but whose period can only be 10 or 60 seconds. It stops a flood, not
 * a slow drip.
 */
export async function checkBurst(env: Env, key: string | null): Promise<void> {
  if (!env.PUBLISH_BURST || !key) return
  const { success } = await env.PUBLISH_BURST.limit({ key })
  if (!success) throw tooManyRequests('Too many publishes, please wait a moment')
}

/**
 * The hourly layer, in D1 because the binding cannot express an hour.
 *
 * Reserving before the work means a publish that later fails still consumed
 * quota. That is the intended direction to be wrong in: a failing publish is
 * indistinguishable from a probe, and refunding it would hand an attacker
 * unlimited retries.
 */
export async function reservePublishSlot(env: Env, ipHash: string | null): Promise<void> {
  if (!ipHash) return
  const now = Date.now()
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM publish_events WHERE ip_hash = ? AND created_at > ?',
  )
    .bind(ipHash, now - HOUR)
    .first<{ n: number }>()
  if ((row?.n ?? 0) >= PUBLISH_PER_HOUR) {
    throw tooManyRequests(`You can publish ${PUBLISH_PER_HOUR} blueprints per hour`)
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO publish_events (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now),
    // No cron trigger for one small table; every publish pays a little of the
    // sweep instead.
    env.DB.prepare('DELETE FROM publish_events WHERE created_at < ?').bind(now - RETENTION),
  ])
}
