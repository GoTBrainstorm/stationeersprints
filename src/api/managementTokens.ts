// Management tokens in localStorage.
//
// With no accounts, this is the only record that a browser published something.
// Clearing site data is irreversible: the blueprint stays up and nobody can
// take it down. The publish dialog says so, and offers the token for copying.
import type { Visibility } from './types'

const KEY = 'stationeersprints.published.v1'
/** Enough to be a useful list, small enough to never approach the quota. */
const MAX_ENTRIES = 200

export interface PublishedRecord {
  id: string
  token: string
  title: string
  publishedAt: number
  visibility: Visibility
}

export function loadPublished(): PublishedRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    // Written by an older version, or by hand: keep only what is usable.
    return data.filter(
      (r): r is PublishedRecord =>
        !!r && typeof r.id === 'string' && typeof r.token === 'string' && typeof r.title === 'string',
    )
  } catch {
    return []
  }
}

function save(records: PublishedRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX_ENTRIES)))
  } catch {
    /* Private mode or a full quota must not break publishing. */
  }
}

export function rememberPublished(record: PublishedRecord): void {
  save([record, ...loadPublished().filter((r) => r.id !== record.id)])
}

export function forgetPublished(id: string): void {
  save(loadPublished().filter((r) => r.id !== id))
}

export function updatePublished(id: string, patch: Partial<PublishedRecord>): void {
  save(loadPublished().map((r) => (r.id === id ? { ...r, ...patch } : r)))
}

export function tokenFor(id: string): string | null {
  return loadPublished().find((r) => r.id === id)?.token ?? null
}
