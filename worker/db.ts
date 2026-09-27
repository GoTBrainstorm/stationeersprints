// D1 and R2 access. Every query the Worker runs lives here, so the shape of a
// row is defined in one place and the handlers stay about policy.
import type { BlueprintRow, Env, Visibility } from './env'
import { imageKey, jsonKey } from './env'
import { ID_LENGTH, generateId } from './ids'
import { serverError } from './errors'

const COLUMNS = `id, created_at, title, description, author_name, visibility,
  json_key, image_key, image_width, image_height, game_version,
  size_bytes, node_count, edge_count, derived_from`

export interface ReserveInput {
  title: string
  description: string
  author: string
  gameVersion: string | null
  visibility: Visibility
  sizeBytes: number
  nodeCount: number
  edgeCount: number
  derivedFrom: string | null
  tokenHash: string
  ipHash: string | null
  hasImage: boolean
}

export interface Reservation {
  id: string
  createdAt: number
}

/**
 * Claim an id and write the row before a byte reaches R2.
 *
 * `INSERT OR IGNORE` plus `meta.changes` is what makes this safe under
 * concurrency: a SELECT-then-INSERT would let two simultaneous publishes both
 * see an id as free, and the second would overwrite the first's objects. Here
 * the loser sees changes = 0 and simply tries another id.
 */
export async function reserveId(env: Env, input: ReserveInput): Promise<Reservation> {
  // Read the clock once. The caller echoes this timestamp back to the client,
  // and a second Date.now() there would disagree with the stored row.
  const createdAt = Date.now()
  for (let attempt = 0; attempt < 6; attempt++) {
    // Widen after repeated collisions rather than spinning at one length. With
    // 62^8 ids this should never fire; if it ever does, the table is full
    // enough that a longer id is the right answer.
    const id = generateId(ID_LENGTH + Math.floor(attempt / 3))
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO blueprints
         (id, created_at, title, description, author_name, game_version, visibility,
          ready, json_key, image_key, size_bytes, node_count, edge_count,
          derived_from, token_hash, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        createdAt,
        input.title,
        input.description,
        input.author,
        input.gameVersion,
        input.visibility,
        jsonKey(id),
        input.hasImage ? imageKey(id) : null,
        input.sizeBytes,
        input.nodeCount,
        input.edgeCount,
        input.derivedFrom,
        input.tokenHash,
        input.ipHash,
      )
      .run()
    if (result.meta.changes === 1) return { id, createdAt }
  }
  throw serverError('Could not allocate a blueprint id')
}

export async function markReady(
  env: Env,
  id: string,
  image: { width: number; height: number } | null,
): Promise<void> {
  await env.DB.prepare('UPDATE blueprints SET ready = 1, image_width = ?, image_height = ? WHERE id = ?')
    .bind(image?.width ?? null, image?.height ?? null, id)
    .run()
}

export async function getBlueprint(env: Env, id: string): Promise<BlueprintRow | null> {
  return env.DB.prepare(`SELECT ${COLUMNS} FROM blueprints WHERE id = ? AND ready = 1`)
    .bind(id)
    .first<BlueprintRow>()
}

/**
 * The same, for a set of ids. The caller has a list of remembered ids and wants
 * their current state; doing that one request per id would turn a page of ten
 * into ten Worker invocations.
 *
 * Ids absent from the result do not exist (or are not ready) — the caller is
 * expected to treat a missing id as gone, so the parameter list is capped well
 * below D1's bound-variable limit.
 */
export async function getBlueprints(env: Env, ids: string[]): Promise<BlueprintRow[]> {
  if (!ids.length) return []
  const holes = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM blueprints WHERE ready = 1 AND id IN (${holes})`,
  )
    .bind(...ids)
    .all<BlueprintRow>()
  return results
}

/** Includes the token hash; only the owner-check path needs it. */
export async function getBlueprintAuth(
  env: Env,
  id: string,
): Promise<{ token_hash: string; image_key: string | null } | null> {
  return env.DB.prepare('SELECT token_hash, image_key FROM blueprints WHERE id = ?')
    .bind(id)
    .first<{ token_hash: string; image_key: string | null }>()
}

export async function setVisibility(env: Env, id: string, visibility: Visibility): Promise<void> {
  await env.DB.prepare('UPDATE blueprints SET visibility = ? WHERE id = ?').bind(visibility, id).run()
}

/**
 * Delete the row first, then the objects. The reverse order would leave a live
 * row pointing at a 404 if the second step failed; this way the worst case is
 * an unreferenced object, which costs a fraction of a cent and can be swept.
 */
export async function deleteBlueprint(env: Env, id: string, hasImage: boolean): Promise<void> {
  await env.DB.prepare('DELETE FROM blueprints WHERE id = ?').bind(id).run()
  await env.BUCKET.delete(hasImage ? [jsonKey(id), imageKey(id)] : [jsonKey(id)])
}

export interface GalleryPage {
  items: BlueprintRow[]
  /** The row to continue after, or null at the end of the list. */
  next: { createdAt: number; id: string } | null
}

export async function listGallery(
  env: Env,
  limit: number,
  after: { createdAt: number; id: string } | null,
): Promise<GalleryPage> {
  // One extra row tells us whether a next page exists without a second query.
  const overfetch = limit + 1
  const query = after
    ? env.DB.prepare(
        `SELECT ${COLUMNS} FROM blueprints
          WHERE visibility = 'LISTED' AND ready = 1
            AND (created_at < ? OR (created_at = ? AND id < ?))
          ORDER BY created_at DESC, id DESC LIMIT ?`,
      ).bind(after.createdAt, after.createdAt, after.id, overfetch)
    : env.DB.prepare(
        `SELECT ${COLUMNS} FROM blueprints
          WHERE visibility = 'LISTED' AND ready = 1
          ORDER BY created_at DESC, id DESC LIMIT ?`,
      ).bind(overfetch)
  const { results } = await query.all<BlueprintRow>()
  const items = results.slice(0, limit)
  const last = items[items.length - 1]
  return {
    items,
    next: results.length > limit && last ? { createdAt: last.created_at, id: last.id } : null,
  }
}

export async function listPending(env: Env, limit: number): Promise<BlueprintRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM blueprints
      WHERE visibility = 'PENDING' AND ready = 1
      ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(limit)
    .all<BlueprintRow>()
  return results
}
