// GET /storage/* — the development stand-in for the R2 custom domain.
//
// In production R2_PUBLIC_ORIGIN points at the bucket's own subdomain and this
// route is never hit: previews and blueprint JSON are fetched straight from the
// edge, so a gallery page costs one Worker request instead of one per card.
// Locally there is no such domain, so the Worker reads the bucket itself.
import type { Env } from '../env'
import { notFound } from '../errors'

export async function handleStorage(env: Env, key: string): Promise<Response> {
  // Keys are always built from a validated id, but this is a path parameter, so
  // it gets checked on the way in like any other.
  if (!/^blueprints\/[A-Za-z0-9]{6,16}\/(blueprint\.json|preview\.png)$/.test(key)) {
    throw notFound('No such object')
  }
  const object = await env.BUCKET.get(key)
  if (!object) throw notFound('No such object')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  // The bucket's own metadata already says image/png or application/json;
  // nosniff makes sure nothing downstream second-guesses it.
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(object.body, { headers })
}
