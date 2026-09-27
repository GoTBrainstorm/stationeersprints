import { describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, decodeCursor, encodeCursor, parseLimit } from './cursor'
import { buildMetaTags, escapeAttribute, pageTitle, renderMetaTags } from './og'
import type { BlueprintRow, Env } from './env'

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

describe('cursors', () => {
  it('round-trips', () => {
    const c = { createdAt: 1758960000000, id: 'aB3dEf9h' }
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
  })

  it('is url-safe', () => {
    for (let i = 0; i < 100; i++) {
      const encoded = encodeCursor({ createdAt: Date.now() + i, id: 'aB3dEf9h' })
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('treats a missing cursor as the first page', () => {
    expect(decodeCursor(null)).toBe(null)
    expect(decodeCursor('')).toBe(null)
  })

  it('rejects a tampered cursor', () => {
    fails(() => decodeCursor('!!!!'), 'bad_cursor')
    fails(() => decodeCursor(btoa('nodot')), 'bad_cursor')
    fails(() => decodeCursor(btoa('abc.aB3dEf9h')), 'bad_cursor')
    fails(() => decodeCursor(btoa('-1.aB3dEf9h')), 'bad_cursor')
    fails(() => decodeCursor(btoa("1758960000000.' OR 1=1--")), 'bad_cursor')
  })
})

describe('parseLimit', () => {
  it('defaults and clamps', () => {
    expect(parseLimit(null)).toBe(DEFAULT_PAGE_SIZE)
    expect(parseLimit('10')).toBe(10)
    expect(parseLimit('1000')).toBe(MAX_PAGE_SIZE)
  })

  it('rejects nonsense', () => {
    fails(() => parseLimit('0'), 'bad_limit')
    fails(() => parseLimit('-5'), 'bad_limit')
    fails(() => parseLimit('1.5'), 'bad_limit')
    fails(() => parseLimit('lots'), 'bad_limit')
  })
})

const env = { SITE_ORIGIN: 'https://stationeersprints.com', R2_PUBLIC_ORIGIN: 'https://cdn.example' } as Env

const row = (over: Partial<BlueprintRow> = {}): BlueprintRow => ({
  id: 'aB3dEf9h',
  created_at: 1758960000000,
  title: 'Furnace loop',
  description: 'Keeps the furnace fed.',
  author_name: 'someone',
  visibility: 'LISTED',
  json_key: 'blueprints/aB3dEf9h/blueprint.json',
  image_key: 'blueprints/aB3dEf9h/preview.png',
  image_width: 1600,
  image_height: 1200,
  game_version: null,
  size_bytes: 100,
  node_count: 3,
  edge_count: 2,
  derived_from: null,
  ...over,
})

describe('escapeAttribute', () => {
  it('neutralizes markup', () => {
    expect(escapeAttribute('"><script>alert(1)</script>')).toBe(
      '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('escapes ampersands first, so nothing is double-decoded', () => {
    expect(escapeAttribute('&lt;')).toBe('&amp;lt;')
  })
})

describe('meta tags', () => {
  it('describes a published blueprint', () => {
    const tags = buildMetaTags(row(), env)
    const find = (key: string) => tags.find((t) => t.key === key)?.content
    expect(find('og:title')).toBe('Furnace loop by someone')
    expect(find('og:description')).toBe('Keeps the furnace fed.')
    expect(find('og:url')).toBe('https://stationeersprints.com/b/aB3dEf9h')
    expect(find('og:image')).toBe('https://cdn.example/blueprints/aB3dEf9h/preview.png')
    expect(find('twitter:card')).toBe('summary_large_image')
    expect(pageTitle(row())).toBe('Furnace loop — Stationeersprints')
  })

  it('omits the byline when there is no author', () => {
    expect(buildMetaTags(row({ author_name: '' }), env).find((t) => t.key === 'og:title')?.content).toBe(
      'Furnace loop',
    )
  })

  it('falls back to counts when there is no description', () => {
    const tags = buildMetaTags(row({ description: '' }), env)
    expect(tags.find((t) => t.key === 'og:description')?.content).toBe('3 devices, 2 connections')
  })

  it('singularizes the count fallback', () => {
    const tags = buildMetaTags(row({ description: '', node_count: 1, edge_count: 1 }), env)
    expect(tags.find((t) => t.key === 'og:description')?.content).toBe('1 device, 1 connection')
  })

  it('drops the image tags when there is no preview', () => {
    const tags = buildMetaTags(row({ image_key: null }), env)
    expect(tags.some((t) => t.key.startsWith('og:image'))).toBe(false)
    expect(tags.find((t) => t.key === 'twitter:card')?.content).toBe('summary')
  })

  it('falls back to a worker-served url without an R2 domain', () => {
    const tags = buildMetaTags(row(), { SITE_ORIGIN: 'https://s.test' } as Env)
    expect(tags.find((t) => t.key === 'og:image')?.content).toBe(
      'https://s.test/storage/blueprints/aB3dEf9h/preview.png',
    )
  })

  it('truncates a long description', () => {
    const tags = buildMetaTags(row({ description: 'x'.repeat(500) }), env)
    expect(tags.find((t) => t.key === 'og:description')?.content).toHaveLength(200)
  })

  it('escapes every rendered attribute', () => {
    const html = renderMetaTags(buildMetaTags(row({ title: '"><script>alert(1)</script>' }), env))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })
})
