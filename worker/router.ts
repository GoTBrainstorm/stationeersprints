// A pattern matcher for the API surface, kept separate from the handlers so the
// routing table can be tested without a Worker runtime.
//
// Patterns use `:name` for a single segment and a trailing `*` for the rest of
// the path. Matching is exact otherwise — no implicit prefixes, because a route
// that accidentally matches more than it should is how an admin endpoint ends
// up reachable.

export interface Match<N extends string> {
  name: N
  params: Record<string, string>
}

export interface RouteDef<N extends string> {
  method: string
  pattern: string
  name: N
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/')
  const s = path.split('/')
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    const part = p[i]
    if (part === '*') {
      if (i !== p.length - 1) return null
      const rest = s.slice(i).join('/')
      if (!rest) return null
      params['*'] = rest
      return params
    }
    if (i >= s.length) return null
    if (part.startsWith(':')) {
      if (!s[i]) return null
      params[part.slice(1)] = decodeURIComponent(s[i])
      continue
    }
    if (part !== s[i]) return null
  }
  return p.length === s.length ? params : null
}

export interface RouterResult<N extends string> {
  match: Match<N> | null
  /** True when the path exists but not for this method — a 405, not a 404. */
  methodMismatch: boolean
  /** Methods the path does accept, for the Allow header. */
  allowed: string[]
}

export function matchRoute<N extends string>(
  routes: readonly RouteDef<N>[],
  method: string,
  pathname: string,
): RouterResult<N> {
  // Normalize the trailing slash so /api/gallery/ is not a separate 404.
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  // HEAD is GET without a body; the runtime strips the body for us.
  const m = method === 'HEAD' ? 'GET' : method.toUpperCase()
  const allowed: string[] = []
  for (const route of routes) {
    const params = matchPattern(route.pattern, path)
    if (!params) continue
    if (route.method === m) return { match: { name: route.name, params }, methodMismatch: false, allowed: [] }
    if (!allowed.includes(route.method)) allowed.push(route.method)
  }
  if (allowed.length) {
    if (allowed.includes('GET')) allowed.push('HEAD')
    allowed.push('OPTIONS')
  }
  return { match: null, methodMismatch: allowed.length > 0, allowed }
}

export type ApiRouteName =
  | 'health'
  | 'config'
  | 'publish'
  | 'listBlueprints'
  | 'getBlueprint'
  | 'updateBlueprint'
  | 'deleteBlueprint'
  | 'gallery'
  | 'adminQueue'
  | 'adminModerate'
  | 'storage'

export const API_ROUTES: readonly RouteDef<ApiRouteName>[] = [
  { method: 'GET', pattern: '/api/health', name: 'health' },
  { method: 'GET', pattern: '/api/config', name: 'config' },
  { method: 'POST', pattern: '/api/publish', name: 'publish' },
  // Batch lookup for "blueprints you published": one request refreshes a whole
  // list, rather than one per remembered id.
  { method: 'GET', pattern: '/api/blueprints', name: 'listBlueprints' },
  { method: 'GET', pattern: '/api/blueprints/:id', name: 'getBlueprint' },
  { method: 'PATCH', pattern: '/api/blueprints/:id', name: 'updateBlueprint' },
  { method: 'DELETE', pattern: '/api/blueprints/:id', name: 'deleteBlueprint' },
  { method: 'GET', pattern: '/api/gallery', name: 'gallery' },
  { method: 'GET', pattern: '/api/admin/queue', name: 'adminQueue' },
  { method: 'POST', pattern: '/api/admin/blueprints/:id', name: 'adminModerate' },
  // Dev-only: in production R2 is served from its own domain and never reaches here.
  { method: 'GET', pattern: '/storage/*', name: 'storage' },
]
