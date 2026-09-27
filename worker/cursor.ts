// Gallery pagination cursors.
//
// Keyset, not OFFSET: the gallery is ordered newest-first and grows at the
// front, so an offset page would silently repeat rows every time something is
// published mid-scroll. A cursor pins the exact (created_at, id) to continue
// after, and `id` breaks ties between blueprints published in the same second.
import { badRequest } from './errors'
import { isValidId } from './ids'

export interface Cursor {
  createdAt: number
  id: string
}

export function encodeCursor(c: Cursor): string {
  return btoa(`${c.createdAt}.${c.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Opaque to clients, but not trusted: a cursor is a query parameter, so it is
 * attacker-controlled and gets the same treatment as any other input.
 */
export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null
  let text: string
  try {
    text = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    throw badRequest('Bad cursor', 'bad_cursor')
  }
  const dot = text.indexOf('.')
  if (dot < 0) throw badRequest('Bad cursor', 'bad_cursor')
  const createdAt = Number(text.slice(0, dot))
  const id = text.slice(dot + 1)
  if (!Number.isSafeInteger(createdAt) || createdAt < 0 || !isValidId(id)) {
    throw badRequest('Bad cursor', 'bad_cursor')
  }
  return { createdAt, id }
}

export const DEFAULT_PAGE_SIZE = 24
export const MAX_PAGE_SIZE = 48

export function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_PAGE_SIZE
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw badRequest('Bad limit', 'bad_limit')
  return Math.min(n, MAX_PAGE_SIZE)
}
