// Reading, unlisting and deleting a published blueprint.
import type { Env, Visibility } from '../env'
import { badRequest, forbidden, notFound } from '../errors'
import { json, noContent } from '../http'
import { deleteBlueprint, getBlueprint, getBlueprintAuth, getBlueprints, setVisibility } from '../db'
import { toPublic } from '../present'
import { bearer, tokenMatches } from '../tokens'
import { isValidId } from '../ids'

/** Enough for the published list localStorage keeps, far below D1's bind limit. */
const MAX_BATCH = 50

function requireId(params: Record<string, string>): string {
  const id = params.id ?? ''
  if (!isValidId(id)) throw notFound('No such blueprint')
  return id
}

export async function handleGetBlueprint(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const id = requireId(params)
  const row = await getBlueprint(env, id)
  if (!row) throw notFound('No such blueprint')

  // A request that carries a key is asking a second question: "is this key
  // mine?" — the one way to check a management key without mutating anything.
  // A wrong key answers 404 for the same reason `requireOwner` does.
  const token = bearer(request)
  if (token) {
    const auth = await getBlueprintAuth(env, id)
    if (!auth || !(await tokenMatches(token, auth.token_hash))) throw notFound('No such blueprint')
    return json({ ...toPublic(row, env), owner: true }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Published blueprints are immutable, but visibility is not, so this is
  // revalidated rather than cached outright.
  return json(toPublic(row, env), { headers: { 'Cache-Control': 'public, max-age=60' } })
}

/**
 * `GET /api/blueprints?ids=a,b,c` — the refresh behind "blueprints you
 * published". Public metadata only: the ids come from the caller's own
 * localStorage, and knowing one already implies having been given the link.
 *
 * Unknown ids are simply absent from the result rather than an error, because
 * the expected reason for one is that its blueprint was deleted.
 */
export async function handleListBlueprints(request: Request, env: Env): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const parts = raw.split(',').filter(Boolean)
  // Capped before the de-duplication, not after: the point is to bound the work
  // this request can ask for, and 10,000 copies of one id is still 10,000 ids.
  if (parts.length > MAX_BATCH) throw badRequest(`At most ${MAX_BATCH} ids`, 'too_many_ids')
  const ids = [...new Set(parts)]
  if (ids.some((id) => !isValidId(id))) throw badRequest('Bad blueprint id', 'bad_id')
  const rows = await getBlueprints(env, ids)
  return json(
    { items: rows.map((row) => toPublic(row, env)) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * Prove ownership before anything destructive.
 *
 * A wrong token and a missing blueprint both answer 404: 403 would confirm that
 * an id exists, which is exactly what an UNLISTED blueprint is trying not to do.
 */
async function requireOwner(request: Request, env: Env, id: string) {
  const row = await getBlueprintAuth(env, id)
  const token = bearer(request)
  if (!row || !token || !(await tokenMatches(token, row.token_hash))) {
    throw notFound('No such blueprint')
  }
  return row
}

export async function handleDeleteBlueprint(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const id = requireId(params)
  const row = await requireOwner(request, env, id)
  await deleteBlueprint(env, id, !!row.image_key)
  return noContent()
}

/**
 * The only mutable thing about a published blueprint. Its content is immutable
 * by design — links people have shared must keep meaning what they meant — so
 * "editing" is publishing a new one.
 */
export async function handleUpdateBlueprint(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const id = requireId(params)
  await requireOwner(request, env, id)

  let body: { visibility?: unknown }
  try {
    body = await request.json()
  } catch {
    throw badRequest('Expected a JSON body')
  }
  // Withdrawing from the gallery is the owner's to make; putting something into
  // it is a moderator's. An owner asking to be listed goes back to PENDING.
  const requested = body.visibility
  let next: Visibility
  if (requested === 'UNLISTED') next = 'UNLISTED'
  else if (requested === 'PENDING' || requested === 'gallery') next = 'PENDING'
  else if (requested === 'LISTED') throw forbidden('Only a moderator can list a blueprint')
  else throw badRequest('Unknown visibility', 'bad_visibility')

  await setVisibility(env, id, next)
  const row = await getBlueprint(env, id)
  if (!row) throw notFound('No such blueprint')
  return json(toPublic(row, env))
}
