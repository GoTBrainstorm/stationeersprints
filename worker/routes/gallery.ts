// GET /api/gallery — the public, moderated list.
import type { Env } from '../env'
import { json } from '../http'
import { decodeCursor, encodeCursor, parseLimit } from '../cursor'
import { listGallery } from '../db'
import { toPublic } from '../present'
import type { GalleryResponse } from '../../src/api/types'

export async function handleGallery(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const limit = parseLimit(url.searchParams.get('limit'))
  const after = decodeCursor(url.searchParams.get('cursor'))
  const page = await listGallery(env, limit, after)
  const body: GalleryResponse = {
    items: page.items.map((row) => toPublic(row, env)),
    nextCursor: page.next ? encodeCursor(page.next) : null,
  }
  // Short and public: the gallery changes, but not per-viewer, so the edge can
  // absorb a burst of traffic without waking the Worker for each request.
  return json(body, { headers: { 'Cache-Control': 'public, max-age=60' } })
}
