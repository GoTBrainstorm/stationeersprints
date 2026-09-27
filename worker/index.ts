// Worker entry point.
//
// Three kinds of request arrive here, and only these three — everything else is
// served from the edge without waking the Worker (see `run_worker_first` in
// wrangler.toml):
//
//   /api/*      the publishing API
//   /b/:id      a published page, so its OpenGraph tags can be injected
//   /storage/*  object storage, in local development only
import { API_ROUTES, matchRoute } from './router'
import { errorResponse, methodNotAllowed } from './http'
import { notFound } from './errors'
import type { Env } from './env'
import { getBlueprint } from './db'
import { withMetaTags } from './og'
import { isValidId } from './ids'
import { handleConfig, handleHealth } from './routes/config'
import { handlePublish } from './routes/publish'
import {
  handleDeleteBlueprint,
  handleGetBlueprint,
  handleListBlueprints,
  handleUpdateBlueprint,
} from './routes/blueprints'
import { handleGallery } from './routes/gallery'
import { handleAdminModerate, handleAdminQueue } from './routes/admin'
import { handleStorage } from './routes/storage'

/**
 * Served for /b/:id. A crawler gets the real title and preview; a browser gets
 * the same SPA it would have got anyway, and the client router takes over.
 *
 * A miss still returns the app, not a 404 page: the id may have been deleted
 * while a link was in flight, and the app has a better way to say so.
 */
async function publishedPage(request: Request, env: Env, id: string): Promise<Response> {
  const asset = await env.ASSETS.fetch(request)
  if (!isValidId(id) || !asset.ok) return asset
  const row = await getBlueprint(env, id)
  if (!row) return asset
  return withMetaTags(asset, row, env)
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/b/')) {
    return publishedPage(request, env, url.pathname.slice(3))
  }

  const { match, methodMismatch, allowed } = matchRoute(API_ROUTES, request.method, url.pathname)
  if (!match) {
    if (request.method === 'OPTIONS' && methodMismatch) {
      // Same-origin only: preflights are answered so a browser gets a clear
      // answer, but nothing cross-origin is ever allowed.
      return new Response(null, { status: 204, headers: { Allow: allowed.join(', ') } })
    }
    if (methodMismatch) return methodNotAllowed(allowed)
    // Unknown /api paths must not fall through to the SPA — a 200 of HTML is a
    // far more confusing answer to a fetch() than a 404 of JSON.
    if (url.pathname.startsWith('/api/')) throw notFound('No such endpoint')
    return env.ASSETS.fetch(request)
  }

  switch (match.name) {
    case 'health':
      return handleHealth()
    case 'config':
      return handleConfig(env)
    case 'publish':
      return handlePublish(request, env)
    case 'listBlueprints':
      return handleListBlueprints(request, env)
    case 'getBlueprint':
      return handleGetBlueprint(request, env, match.params)
    case 'updateBlueprint':
      return handleUpdateBlueprint(request, env, match.params)
    case 'deleteBlueprint':
      return handleDeleteBlueprint(request, env, match.params)
    case 'gallery':
      return handleGallery(request, env)
    case 'adminQueue':
      return handleAdminQueue(request, env)
    case 'adminModerate':
      return handleAdminModerate(request, env, match.params)
    case 'storage':
      return handleStorage(env, match.params['*'])
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env)
    } catch (err) {
      return errorResponse(err)
    }
  },
} satisfies ExportedHandler<Env>
