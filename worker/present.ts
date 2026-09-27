// Row → wire. The one place that decides what a client is allowed to see.
import type { BlueprintRow, Env } from './env'
import { imageKey, jsonKey, storageUrl } from './env'
import type { PublishedBlueprint } from '../src/api/types'

/**
 * Built by naming every field rather than spreading the row. `token_hash` and
 * `ip_hash` are selected by some queries, and a spread here would ship them the
 * first time someone reuses one of those queries.
 */
export function toPublic(row: BlueprintRow, env: Env): PublishedBlueprint {
  return {
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    description: row.description,
    author: row.author_name,
    gameVersion: row.game_version,
    visibility: row.visibility,
    jsonUrl: storageUrl(env, jsonKey(row.id)),
    imageUrl: row.image_key ? storageUrl(env, imageKey(row.id)) : null,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    nodeCount: row.node_count,
    edgeCount: row.edge_count,
    sizeBytes: row.size_bytes,
    derivedFrom: row.derived_from,
  }
}
