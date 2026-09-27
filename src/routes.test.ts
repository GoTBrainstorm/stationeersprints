import { describe, expect, it } from 'vitest'
import { parseBlueprintRef, parseRoute } from './routes'

describe('parseRoute', () => {
  it('routes the editor', () => {
    expect(parseRoute('/')).toEqual({ name: 'editor' })
    expect(parseRoute('')).toEqual({ name: 'editor' })
  })

  it('routes published blueprints', () => {
    expect(parseRoute('/b/A7xm2KpQ')).toEqual({ name: 'published', id: 'A7xm2KpQ' })
    expect(parseRoute('/b/A7xm2KpQ/')).toEqual({ name: 'published', id: 'A7xm2KpQ' })
  })

  it('rejects ids that are not base62 of a plausible length', () => {
    for (const bad of ['/b/', '/b/bad!', '/b/short', '/b/' + 'x'.repeat(17), '/b/a-b-c', '/b/A7xm2KpQ/extra']) {
      expect(parseRoute(bad).name).toBe('notFound')
    }
  })

  it('routes the gallery, help and admin, with or without a trailing slash', () => {
    expect(parseRoute('/gallery')).toEqual({ name: 'gallery' })
    expect(parseRoute('/gallery/')).toEqual({ name: 'gallery' })
    expect(parseRoute('/help')).toEqual({ name: 'help' })
    expect(parseRoute('/help/')).toEqual({ name: 'help' })
    expect(parseRoute('/admin')).toEqual({ name: 'admin' })
    expect(parseRoute('/admin/')).toEqual({ name: 'admin' })
  })

  it('falls through to notFound', () => {
    expect(parseRoute('/nope').name).toBe('notFound')
    expect(parseRoute('/gallery/extra').name).toBe('notFound')
  })

  // Share links are pathname-independent by design, so the router must not claim
  // them: the Editor reads the fragment itself.
  it('ignores the fragment entirely', () => {
    expect(parseRoute('/')).toEqual({ name: 'editor' })
  })
})

describe('parseBlueprintRef', () => {
  it('accepts a bare id, a path and a full link', () => {
    expect(parseBlueprintRef('aB3dEf9h')).toBe('aB3dEf9h')
    expect(parseBlueprintRef('/b/aB3dEf9h')).toBe('aB3dEf9h')
    expect(parseBlueprintRef('https://stationeersprints.com/b/aB3dEf9h')).toBe('aB3dEf9h')
  })

  it('tolerates what a paste actually looks like', () => {
    expect(parseBlueprintRef('  https://stationeersprints.com/b/aB3dEf9h/  ')).toBe('aB3dEf9h')
    expect(parseBlueprintRef('https://stationeersprints.com/b/aB3dEf9h?utm_source=x')).toBe('aB3dEf9h')
  })

  it('rejects anything that is not an id', () => {
    expect(parseBlueprintRef('')).toBe(null)
    expect(parseBlueprintRef('/gallery')).toBe(null)
    expect(parseBlueprintRef('/help')).toBe(null)
    expect(parseBlueprintRef('https://stationeersprints.com/b/not-an-id!')).toBe(null)
  })
})
