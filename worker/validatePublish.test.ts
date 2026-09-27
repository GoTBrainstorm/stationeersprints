import { describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import {
  MAX_DESCRIPTION,
  MAX_JSON_BYTES,
  MAX_NODES,
  MAX_TITLE,
  parseDerivedFrom,
  parseVisibility,
  sanitizeLine,
  sanitizeText,
  validateUpload,
} from './validatePublish'

const bp = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'stationeersprints',
    version: 1,
    title: 'Furnace loop',
    author: 'someone',
    description: 'A loop.',
    nodes: [{ id: 'a', type: 'device', prefab: 'StructureFurnace', x: 0, y: 0 }],
    edges: [],
    ...over,
  })

const fails = (fn: () => unknown, code: string) => {
  let thrown: unknown
  try {
    fn()
  } catch (err) {
    thrown = err
  }
  expect(thrown, 'expected an ApiError').toBeInstanceOf(ApiError)
  expect((thrown as ApiError).code).toBe(code)
}

describe('sanitizeLine', () => {
  it('collapses whitespace and trims', () => {
    expect(sanitizeLine('  a \t b  ', 50)).toBe('a b')
  })

  it('flattens newlines into spaces', () => {
    expect(sanitizeLine('one\ntwo', 50)).toBe('one two')
  })

  it('strips control characters', () => {
    expect(sanitizeLine('ok\u0000\u001b[31mred', 50)).toBe('ok [31mred')
  })

  it('clamps to the maximum', () => {
    expect(sanitizeLine('x'.repeat(200), 10)).toBe('x'.repeat(10))
  })

  it('returns empty for non-strings', () => {
    expect(sanitizeLine(undefined, 10)).toBe('')
    expect(sanitizeLine(42, 10)).toBe('')
  })
})

describe('sanitizeText', () => {
  it('keeps paragraph breaks', () => {
    expect(sanitizeText('one\n\ntwo', 100)).toBe('one\n\ntwo')
  })

  it('collapses runs of blank lines', () => {
    expect(sanitizeText('one\n\n\n\n\ntwo', 100)).toBe('one\n\ntwo')
  })

  it('normalizes CRLF', () => {
    expect(sanitizeText('one\r\ntwo', 100)).toBe('one\ntwo')
  })

  it('strips control characters but not newlines', () => {
    expect(sanitizeText('a\u0007\nb', 100)).toBe('a\nb')
  })
})

describe('validateUpload', () => {
  it('accepts a well-formed blueprint and derives its metadata', () => {
    const out = validateUpload(bp({ gameVersion: '0.2.5000', edges: [] }))
    expect(out.title).toBe('Furnace loop')
    expect(out.author).toBe('someone')
    expect(out.gameVersion).toBe('0.2.5000')
    expect(out.nodeCount).toBe(1)
    expect(out.edgeCount).toBe(0)
    expect(out.sizeBytes).toBeGreaterThan(0)
  })

  it('re-serializes rather than storing what was sent', () => {
    // An attacker-controlled top-level field must not survive into R2, and the
    // stored title must be the sanitized one, not the raw one.
    const out = validateUpload(bp({ evil: '<script>', title: '  Spaced \u0000 out  ' }))
    const parsed = JSON.parse(out.json)
    expect(parsed.evil).toBeUndefined()
    expect(parsed.title).toBe('Spaced out')
    expect(out.title).toBe('Spaced out')
    expect(out.sizeBytes).toBe(new TextEncoder().encode(out.json).byteLength)
  })

  it('falls back to a placeholder title', () => {
    expect(validateUpload(bp({ title: '   ' })).title).toBe('Untitled blueprint')
    expect(validateUpload(bp({ title: 42 })).title).toBe('Untitled blueprint')
  })

  it('clamps long metadata', () => {
    const out = validateUpload(bp({ title: 'x'.repeat(500), description: 'y'.repeat(5000) }))
    expect(out.title).toHaveLength(MAX_TITLE)
    expect(out.description).toHaveLength(MAX_DESCRIPTION)
  })

  it('rejects malformed JSON and non-blueprints', () => {
    fails(() => validateUpload('{'), 'invalid_blueprint')
    fails(() => validateUpload('{"format":"other","version":1}'), 'invalid_blueprint')
    fails(() => validateUpload(bp({ version: 2 })), 'invalid_blueprint')
    fails(() => validateUpload(bp({ nodes: [{ id: 'a', type: 'device', x: 0, y: 0 }] })), 'invalid_blueprint')
  })

  it('rejects an empty blueprint', () => {
    fails(() => validateUpload(bp({ nodes: [], edges: [] })), 'invalid_blueprint')
  })

  it('rejects blueprints over the size and count limits', () => {
    const nodes = Array.from({ length: MAX_NODES + 1 }, (_, i) => ({
      id: `n${i}`,
      type: 'device',
      prefab: 'StructureFurnace',
      x: 0,
      y: 0,
    }))
    fails(() => validateUpload(bp({ nodes })), 'too_large')
    fails(() => validateUpload(bp({ description: 'x'.repeat(MAX_JSON_BYTES + 1) })), 'too_large')
  })
})

describe('parseVisibility', () => {
  it('defaults to unlisted', () => {
    expect(parseVisibility(undefined)).toBe('UNLISTED')
    expect(parseVisibility('')).toBe('UNLISTED')
    expect(parseVisibility('UNLISTED')).toBe('UNLISTED')
  })

  it('never takes LISTED at a client’s word', () => {
    expect(parseVisibility('LISTED')).toBe('PENDING')
    expect(parseVisibility('gallery')).toBe('PENDING')
  })

  it('rejects anything else', () => {
    fails(() => parseVisibility('HIDDEN'), 'bad_visibility')
  })
})

describe('parseDerivedFrom', () => {
  it('accepts a blueprint id or nothing', () => {
    expect(parseDerivedFrom('abcd1234')).toBe('abcd1234')
    expect(parseDerivedFrom('')).toBe(null)
    expect(parseDerivedFrom(undefined)).toBe(null)
  })

  it('rejects junk that would otherwise reach a query', () => {
    fails(() => parseDerivedFrom('../../etc'), 'bad_derived_from')
  })
})
