// Moderation. Everything here is gated on ADMIN_TOKEN.
import type { Env } from '../env'
import { forbidden, notFound } from '../errors'
import { json, noContent } from '../http'
import { deleteBlueprint, getBlueprintAuth, listPending, setVisibility } from '../db'
import { toPublic } from '../present'
import { bearer, safeEqual } from '../tokens'
import { isValidId } from '../ids'
import { parseLimit } from '../cursor'

/**
 * Cloudflare Access in front of /admin is the intended first gate, but it only
 * covers the real hostname — so the Worker checks a bearer token too and never
 * relies on the edge alone. `workers_dev = false` closes the other way in.
 */
function requireAdmin(request: Request, env: Env): void {
  const token = bearer(request)
  if (!env.ADMIN_TOKEN || !token || !safeEqual(token, env.ADMIN_TOKEN)) {
    throw forbidden('Not allowed')
  }
}

export async function handleAdminQueue(request: Request, env: Env): Promise<Response> {
  requireAdmin(request, env)
  const limit = parseLimit(new URL(request.url).searchParams.get('limit'))
  const rows = await listPending(env, limit)
  return json({ items: rows.map((row) => toPublic(row, env)) })
}

export async function handleAdminModerate(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  requireAdmin(request, env)
  const id = params.id ?? ''
  if (!isValidId(id)) throw notFound('No such blueprint')

  const body = (await request.json().catch(() => ({}))) as { action?: unknown }
  const row = await getBlueprintAuth(env, id)
  if (!row) throw notFound('No such blueprint')

  switch (body.action) {
    case 'approve':
      await setVisibility(env, id, 'LISTED')
      return json({ id, visibility: 'LISTED' })
    case 'reject':
      // Rejected, not deleted: the blueprint stays reachable by its link. The
      // gallery is curated; a private share link is not a privilege to revoke.
      await setVisibility(env, id, 'UNLISTED')
      return json({ id, visibility: 'UNLISTED' })
    case 'delete':
      await deleteBlueprint(env, id, !!row.image_key)
      return noContent()
    default:
      throw notFound('Unknown action')
  }
}
