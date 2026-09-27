// POST /api/publish — the only write path a stranger can reach.
import type { BlueprintRow, Env } from '../env'
import { imageKey, jsonKey } from '../env'
import { badRequest } from '../errors'
import { assertDeclaredSize, json } from '../http'
import { hashIp } from '../ip'
import { checkBurst, reservePublishSlot } from '../ratelimit'
import { MAX_IMAGE_BYTES, parsePng } from '../png'
import { markReady, reserveId } from '../db'
import { generateToken, hashToken } from '../tokens'
import { toPublic } from '../present'
import { verifyTurnstile } from '../turnstile'
import {
  MAX_JSON_BYTES,
  parseDerivedFrom,
  parseVisibility,
  validateUpload,
} from '../validatePublish'
import type { PublishResponse } from '../../src/api/types'

/** Headroom over the two payload limits for multipart framing. */
const MAX_BODY_BYTES = MAX_JSON_BYTES + MAX_IMAGE_BYTES + 64 * 1024

export async function handlePublish(request: Request, env: Env): Promise<Response> {
  assertDeclaredSize(request, MAX_BODY_BYTES)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw badRequest('Expected a multipart form upload')
  }

  const blueprintPart = form.get('blueprint')
  if (typeof blueprintPart !== 'string') throw badRequest('Missing blueprint')
  const upload = validateUpload(blueprintPart)
  const visibility = parseVisibility(form.get('visibility'))
  const derivedFrom = parseDerivedFrom(form.get('derivedFrom'))

  await verifyTurnstile(env, form.get('turnstileToken'), request)

  const ipHash = await hashIp(env, request)
  await checkBurst(env, ipHash)
  await reservePublishSlot(env, ipHash)

  // Decode the preview before claiming an id, so a bad image costs nothing.
  const previewPart = form.get('preview')
  let preview: { bytes: Uint8Array; width: number; height: number } | null = null
  if (previewPart && typeof previewPart !== 'string') {
    const bytes = new Uint8Array(await previewPart.arrayBuffer())
    preview = { bytes, ...parsePng(bytes) }
  }

  const token = generateToken()
  const { id, createdAt } = await reserveId(env, {
    title: upload.title,
    description: upload.description,
    author: upload.author,
    gameVersion: upload.gameVersion,
    visibility,
    sizeBytes: upload.sizeBytes,
    nodeCount: upload.nodeCount,
    edgeCount: upload.edgeCount,
    derivedFrom,
    tokenHash: await hashToken(token),
    ipHash,
    hasImage: !!preview,
  })

  // Published blueprints are immutable, so these objects are written once and
  // can be cached by anything that sees them, effectively forever.
  const immutable = { cacheControl: 'public, max-age=31536000, immutable' }
  await env.BUCKET.put(jsonKey(id), upload.json, {
    httpMetadata: { contentType: 'application/json; charset=utf-8', ...immutable },
  })
  if (preview) {
    await env.BUCKET.put(imageKey(id), preview.bytes, {
      httpMetadata: { contentType: 'image/png', ...immutable },
    })
  }
  await markReady(env, id, preview)

  const row: BlueprintRow = {
    id,
    created_at: createdAt,
    title: upload.title,
    description: upload.description,
    author_name: upload.author,
    visibility,
    json_key: jsonKey(id),
    image_key: preview ? imageKey(id) : null,
    image_width: preview?.width ?? null,
    image_height: preview?.height ?? null,
    game_version: upload.gameVersion,
    size_bytes: upload.sizeBytes,
    node_count: upload.nodeCount,
    edge_count: upload.edgeCount,
    derived_from: derivedFrom,
  }
  const body: PublishResponse = {
    blueprint: toPublic(row, env),
    url: `${env.SITE_ORIGIN}/b/${id}`,
    managementToken: token,
  }
  return json(body, { status: 201 })
}
