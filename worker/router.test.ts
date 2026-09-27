import { describe, expect, it } from 'vitest'
import { API_ROUTES, matchRoute } from './router'

const hit = (method: string, path: string) => matchRoute(API_ROUTES, method, path)

describe('matchRoute', () => {
  it('matches static routes', () => {
    expect(hit('GET', '/api/health').match?.name).toBe('health')
    expect(hit('GET', '/api/config').match?.name).toBe('config')
    expect(hit('POST', '/api/publish').match?.name).toBe('publish')
    expect(hit('GET', '/api/gallery').match?.name).toBe('gallery')
  })

  it('extracts path parameters', () => {
    const m = hit('DELETE', '/api/blueprints/aB3dEf9h').match
    expect(m?.name).toBe('deleteBlueprint')
    expect(m?.params.id).toBe('aB3dEf9h')
  })

  it('routes the same path by method', () => {
    expect(hit('GET', '/api/blueprints/x').match?.name).toBe('getBlueprint')
    expect(hit('PATCH', '/api/blueprints/x').match?.name).toBe('updateBlueprint')
    expect(hit('DELETE', '/api/blueprints/x').match?.name).toBe('deleteBlueprint')
  })

  it('treats HEAD as GET', () => {
    expect(hit('HEAD', '/api/health').match?.name).toBe('health')
  })

  it('accepts lowercase methods', () => {
    expect(hit('post', '/api/publish').match?.name).toBe('publish')
  })

  it('ignores a trailing slash', () => {
    expect(hit('GET', '/api/gallery/').match?.name).toBe('gallery')
  })

  it('does not treat a route as a prefix', () => {
    expect(hit('GET', '/api/gallery/extra').match).toBe(null)
    expect(hit('GET', '/api/blueprints/a/b').match).toBe(null)
    expect(hit('GET', '/api/admin').match).toBe(null)
    expect(hit('GET', '/api/healthz').match).toBe(null)
  })

  it('does not let a parameter swallow an empty segment', () => {
    expect(hit('POST', '/api/admin/blueprints/').match).toBe(null)
  })

  it('keeps the admin routes from matching anything else', () => {
    // /api/admin/blueprints/:id and /api/blueprints/:id differ by one segment;
    // an accidental prefix match here would expose moderation to the public.
    expect(hit('POST', '/api/admin/blueprints/x').match?.name).toBe('adminModerate')
    expect(hit('POST', '/api/blueprints/x').match).toBe(null)
    expect(hit('GET', '/api/admin/queue/x').match).toBe(null)
  })

  it('matches the storage wildcard across segments', () => {
    const m = hit('GET', '/storage/blueprints/aB3dEf9h/preview.png').match
    expect(m?.name).toBe('storage')
    expect(m?.params['*']).toBe('blueprints/aB3dEf9h/preview.png')
  })

  it('does not match an empty wildcard', () => {
    expect(hit('GET', '/storage').match).toBe(null)
    expect(hit('GET', '/storage/').match).toBe(null)
  })

  it('decodes percent-escapes in parameters', () => {
    expect(hit('GET', '/api/blueprints/a%20b').match?.params.id).toBe('a b')
  })

  it('reports a method mismatch separately from a miss', () => {
    const wrong = hit('PUT', '/api/blueprints/x')
    expect(wrong.match).toBe(null)
    expect(wrong.methodMismatch).toBe(true)
    expect(wrong.allowed).toEqual(expect.arrayContaining(['GET', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']))

    const missing = hit('GET', '/api/nope')
    expect(missing.methodMismatch).toBe(false)
    expect(missing.allowed).toEqual([])
  })

  it('does not offer HEAD for a path with no GET', () => {
    const wrong = hit('GET', '/api/publish')
    expect(wrong.allowed).toEqual(['POST', 'OPTIONS'])
  })
})

describe('the batch lookup', () => {
  // One segment shorter than /api/blueprints/:id, and it must not be swallowed
  // by it — a list request answered as a lookup for the id "" would 404.
  it('is a route of its own', () => {
    expect(hit('GET', '/api/blueprints').match?.name).toBe('listBlueprints')
    expect(hit('GET', '/api/blueprints/aB3dEf9h').match?.name).toBe('getBlueprint')
  })

  it('does not accept writes', () => {
    const r = hit('POST', '/api/blueprints')
    expect(r.match).toBe(null)
    expect(r.methodMismatch).toBe(true)
    expect(r.allowed).toContain('GET')
  })
})
