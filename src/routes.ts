// Path routing. Five flat routes, one path param — a hand-rolled parser rather
// than a router dependency.
//
// Deliberately never reads `location.hash`. Share links (`#bp=…`) predate path
// routing, are already out in the wild, and are handled independently in the
// Editor's load chain; keeping the two apart is what stops one breaking the other.
import { useMemo, useSyncExternalStore } from 'react'

export type Route =
  | { name: 'editor' }
  | { name: 'published'; id: string }
  | { name: 'gallery' }
  | { name: 'help' }
  | { name: 'admin' }
  | { name: 'notFound' }

/** Published ids are 8 base62 chars; the range tolerates a future length change. */
export const BLUEPRINT_ID_RE = /^[A-Za-z0-9]{6,16}$/

export function parseRoute(pathname: string): Route {
  // Treat "/gallery" and "/gallery/" as the same route.
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (path === '' || path === '/') return { name: 'editor' }
  if (path === '/gallery') return { name: 'gallery' }
  if (path === '/help') return { name: 'help' }
  if (path === '/admin') return { name: 'admin' }
  const parts = path.split('/')
  if (parts.length === 3 && parts[1] === 'b' && BLUEPRINT_ID_RE.test(parts[2])) {
    return { name: 'published', id: parts[2] }
  }
  return { name: 'notFound' }
}

/**
 * The id out of anything a user is likely to paste: a full link, a path, or the
 * bare id. Used by the "I have a management key" form, where the natural thing
 * to hand someone is the link, not the eight characters inside it.
 */
export function parseBlueprintRef(input: string): string | null {
  const trimmed = input.trim().split(/[?#]/)[0].replace(/\/+$/, '')
  if (!trimmed) return null
  const parts = trimmed.split('/')
  // A bare id is taken at face value, but anything path-shaped has to be a `/b/`
  // link: otherwise "/gallery" parses as the perfectly well-formed id "gallery".
  if (parts.length > 1 && parts[parts.length - 2] !== 'b') return null
  const id = parts[parts.length - 1]
  return BLUEPRINT_ID_RE.test(id) ? id : null
}

const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('popstate', onChange)
  }
}

// The snapshot has to be a primitive: returning a fresh Route object here would
// make useSyncExternalStore re-render forever. Parse it downstream instead.
function getPathname(): string {
  return window.location.pathname
}

export function navigate(to: string, opts?: { replace?: boolean }): void {
  if (opts?.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  // pushState/replaceState don't fire popstate, so tell our own subscribers.
  for (const fn of [...listeners]) fn()
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, getPathname)
  return useMemo(() => parseRoute(pathname), [pathname])
}
