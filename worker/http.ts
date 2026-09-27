// Response helpers and the shape of an API error on the wire.
import { ApiError, tooLarge } from './errors'

export interface ApiErrorBody {
  error: { code: string; message: string }
}

const NO_STORE = 'no-store'

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', NO_STORE)
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } } satisfies ApiErrorBody, {
      status: err.status,
    })
  }
  // Never echo an unexpected error to the client: the message could carry a
  // binding name, a query, or part of a row.
  console.error('unhandled', err)
  return json({ error: { code: 'server_error', message: 'Something went wrong' } } satisfies ApiErrorBody, {
    status: 500,
  })
}

/**
 * The API is same-origin only — the site and the Worker share a hostname, so
 * there is no legitimate cross-origin caller and no Access-Control-Allow-Origin
 * header anywhere. Preflights are answered but allow nothing.
 */
export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } } satisfies ApiErrorBody, {
    status: 405,
    headers: { Allow: allowed.join(', ') },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': NO_STORE } })
}

/**
 * Cheap early rejection on the declared body size. Not a substitute for
 * checking the parsed parts — Content-Length is a claim, and a chunked request
 * omits it entirely — but it drops the obvious abuse before buffering anything.
 */
export function assertDeclaredSize(request: Request, max: number): void {
  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > max) {
    throw tooLarge(`Upload must be at most ${Math.round(max / 1024)} KB`)
  }
}
