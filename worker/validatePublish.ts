// Upload validation: everything a publish request claims, checked before any
// of it reaches D1 or R2.
//
// The blueprint itself is checked with the editor's own `validate()` — see the
// note at the top of src/model/serialize.ts. Sharing that function is the point:
// a document the Worker accepts is by construction one the editor can open.
import { BlueprintError, toJson, validate } from '../src/model/serialize'
import type { Blueprint } from '../src/model/blueprint'
import { badRequest, tooLarge } from './errors'
import { isValidId } from './ids'
import type { Visibility } from './env'

export const MAX_JSON_BYTES = 1024 * 1024
export const MAX_NODES = 2000
export const MAX_EDGES = 4000
export const MAX_TITLE = 120
export const MAX_AUTHOR = 60
export const MAX_DESCRIPTION = 2000

// C0 and C1 control characters. Stripped rather than rejected: they are never
// something a user typed on purpose, and they are how a title smuggles a line
// break into a log or a terminal. Matching them here is the whole point.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
// oxlint-disable-next-line no-control-regex
const CONTROL_AND_NEWLINES = /[\u0000-\u001f\u007f-\u009f]/g

/** Collapse to a single line and clamp. For titles and author names. */
export function sanitizeLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_AND_NEWLINES, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Keep paragraph structure, drop everything else. For descriptions. */
export function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

export interface ValidatedUpload {
  /** Re-serialized from the validated blueprint, so unknown top-level fields never land in R2. */
  json: string
  sizeBytes: number
  title: string
  description: string
  author: string
  gameVersion: string | null
  nodeCount: number
  edgeCount: number
}

/**
 * The metadata columns are derived from the blueprint, never sent alongside it.
 * Two sources for the same string is two chances for them to disagree, and the
 * copy in the JSON is the one the editor shows after download.
 */
export function validateUpload(text: string): ValidatedUpload {
  const sizeBytes = new TextEncoder().encode(text).byteLength
  if (sizeBytes > MAX_JSON_BYTES) {
    throw tooLarge(`Blueprint must be at most ${MAX_JSON_BYTES / 1024} KB`)
  }
  let bp: Blueprint
  try {
    bp = validate(JSON.parse(text))
  } catch (err) {
    if (err instanceof BlueprintError) throw badRequest(err.message, 'invalid_blueprint')
    throw badRequest('Blueprint is not valid JSON', 'invalid_blueprint')
  }
  if (!bp.nodes.length) throw badRequest('Blueprint is empty', 'invalid_blueprint')
  if (bp.nodes.length > MAX_NODES) throw tooLarge(`Blueprint must have at most ${MAX_NODES} nodes`)
  if (bp.edges.length > MAX_EDGES) throw tooLarge(`Blueprint must have at most ${MAX_EDGES} connections`)

  const title = sanitizeLine(bp.title, MAX_TITLE) || 'Untitled blueprint'
  const description = sanitizeText(bp.description, MAX_DESCRIPTION)
  const author = sanitizeLine(bp.author, MAX_AUTHOR)
  const gameVersion = sanitizeLine(bp.gameVersion, 40) || null

  // Store the sanitized strings, not just index them, so the published copy and
  // the gallery card can never show different text.
  const json = toJson({ ...bp, title, description, author, gameVersion: gameVersion ?? undefined })
  return {
    json,
    sizeBytes: new TextEncoder().encode(json).byteLength,
    title,
    description,
    author,
    gameVersion,
    nodeCount: bp.nodes.length,
    edgeCount: bp.edges.length,
  }
}

/**
 * LISTED is never accepted from a client — gallery entries go through
 * moderation, so a request asking to be listed becomes PENDING.
 */
export function parseVisibility(value: unknown): Visibility {
  if (value === 'UNLISTED' || value == null || value === '') return 'UNLISTED'
  if (value === 'PENDING' || value === 'LISTED' || value === 'gallery') return 'PENDING'
  throw badRequest('Unknown visibility', 'bad_visibility')
}

export function parseDerivedFrom(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  if (!isValidId(value)) throw badRequest('Bad derivedFrom id', 'bad_derived_from')
  return value
}
