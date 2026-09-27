// GET /api/config and GET /api/health.
import type { Env } from '../env'
import { json } from '../http'
import { turnstileRequired } from '../turnstile'
import { MAX_IMAGE_BYTES } from '../png'
import { PUBLISH_PER_HOUR } from '../ratelimit'
import { MAX_JSON_BYTES } from '../validatePublish'
import type { ConfigResponse } from '../../src/api/types'

export function handleConfig(env: Env): Response {
  const body: ConfigResponse = {
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    requireTurnstile: turnstileRequired(env),
    galleryEnabled: true,
    maxJsonBytes: MAX_JSON_BYTES,
    maxImageBytes: MAX_IMAGE_BYTES,
    publishesPerHour: PUBLISH_PER_HOUR,
  }
  // Changes only on deploy, but cheap enough to revalidate that a stale site
  // key never outlives a rotation by more than a minute.
  return json(body, { headers: { 'Cache-Control': 'public, max-age=60' } })
}

export function handleHealth(): Response {
  return json({ ok: true })
}
