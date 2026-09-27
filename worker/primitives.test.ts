import { describe, expect, it } from 'vitest'
import { ID_LENGTH, generateId, isValidId } from './ids'
import { bearer, generateToken, hashToken, safeEqual, tokenMatches } from './tokens'
import { MAX_IMAGE_BYTES, parsePng } from './png'
import { ApiError } from './errors'

describe('ids', () => {
  it('generates ids of the right shape', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateId()
      expect(id).toHaveLength(ID_LENGTH)
      expect(isValidId(id)).toBe(true)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateId()))
    expect(seen.size).toBe(500)
  })

  it('covers the whole alphabet rather than favouring its start', () => {
    // Rejection sampling should produce every character eventually; a `% 62`
    // implementation would too, so this only guards against a truncated alphabet.
    const chars = new Set([...Array.from({ length: 2000 }, () => generateId()).join('')])
    expect(chars.size).toBe(62)
  })

  it('rejects ids that are not plain alphanumerics', () => {
    expect(isValidId('abc')).toBe(false)
    expect(isValidId('a'.repeat(17))).toBe(false)
    expect(isValidId('abcd/../x')).toBe(false)
    expect(isValidId('abcdef-h')).toBe(false)
    expect(isValidId('')).toBe(false)
  })
})

describe('tokens', () => {
  it('generates url-safe tokens with no padding', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(43)
  })

  it('hashes to a stable hex digest', async () => {
    // Fixed vector: SHA-256 of "abc".
    expect(await hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('matches a token against its own hash only', async () => {
    const token = generateToken()
    const hash = await hashToken(token)
    expect(await tokenMatches(token, hash)).toBe(true)
    expect(await tokenMatches(generateToken(), hash)).toBe(false)
    expect(await tokenMatches(token, '')).toBe(false)
  })

  it('compares equal-length strings without short-circuiting on length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })

  it('reads bearer tokens case-insensitively', () => {
    const req = (auth?: string) => new Request('https://x/', auth ? { headers: { Authorization: auth } } : {})
    expect(bearer(req('Bearer abc'))).toBe('abc')
    expect(bearer(req('bearer  abc  '))).toBe('abc')
    expect(bearer(req('Basic abc'))).toBe(null)
    expect(bearer(req())).toBe(null)
  })
})

/** A PNG header with the given dimensions; the pixel data is irrelevant here. */
function pngHeader(width: number, height: number, type = 'IHDR'): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  for (let i = 0; i < 4; i++) bytes[12 + i] = type.charCodeAt(i)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('parsePng', () => {
  it('reads dimensions out of IHDR', () => {
    expect(parsePng(pngHeader(1600, 1200))).toEqual({ width: 1600, height: 1200 })
  })

  it('reads dimensions from a subarray view', () => {
    // R2/Request bodies routinely hand back a Uint8Array over a larger buffer;
    // a DataView built without byteOffset would read the wrong bytes.
    const padded = new Uint8Array(32)
    padded.set(pngHeader(64, 48), 8)
    expect(parsePng(padded.subarray(8))).toEqual({ width: 64, height: 48 })
  })

  const rejects = (bytes: Uint8Array, code: string) => {
    let thrown: unknown
    try {
      parsePng(bytes)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(ApiError)
    expect((thrown as ApiError).code).toBe(code)
  }

  it('rejects non-PNG bytes', () => {
    rejects(new Uint8Array(24), 'bad_image')
    rejects(new TextEncoder().encode('<svg onload=alert(1)>....................'), 'bad_image')
  })

  it('rejects a truncated header', () => {
    rejects(pngHeader(10, 10).subarray(0, 20), 'bad_image')
  })

  it('rejects a first chunk that is not IHDR', () => {
    rejects(pngHeader(10, 10, 'IDAT'), 'bad_image')
  })

  it('rejects zero and oversized dimensions', () => {
    rejects(pngHeader(0, 10), 'bad_image')
    rejects(pngHeader(10, 0), 'bad_image')
    rejects(pngHeader(4097, 10), 'bad_image')
    rejects(pngHeader(10, 4097), 'bad_image')
  })

  it('rejects oversized files before parsing them', () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(pngHeader(10, 10))
    rejects(big, 'too_large')
  })
})
