import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetPublished,
  loadPublished,
  rememberPublished,
  tokenFor,
  updatePublished,
} from './managementTokens'

const KEY = 'stationeersprints.published.v1'

/**
 * A minimal localStorage. The suite runs in the node pool — deliberately, it is
 * what keeps it under a second — and node has no web storage, so the few
 * methods this module touches are stubbed rather than pulling in jsdom.
 */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}

const record = (id: string) => ({
  id,
  token: `token-${id}`,
  title: `Blueprint ${id}`,
  publishedAt: 1758960000000,
  visibility: 'UNLISTED' as const,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

describe('management tokens', () => {
  it('starts empty', () => {
    expect(loadPublished()).toEqual([])
  })

  it('remembers newest first', () => {
    rememberPublished(record('aaa'))
    rememberPublished(record('bbb'))
    expect(loadPublished().map((r) => r.id)).toEqual(['bbb', 'aaa'])
  })

  it('does not duplicate a re-published id', () => {
    rememberPublished(record('aaa'))
    rememberPublished({ ...record('aaa'), title: 'Renamed' })
    const all = loadPublished()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Renamed')
  })

  it('looks up a token by id', () => {
    rememberPublished(record('aaa'))
    expect(tokenFor('aaa')).toBe('token-aaa')
    expect(tokenFor('zzz')).toBe(null)
  })

  it('forgets and updates', () => {
    rememberPublished(record('aaa'))
    updatePublished('aaa', { visibility: 'PENDING' })
    expect(loadPublished()[0].visibility).toBe('PENDING')
    forgetPublished('aaa')
    expect(loadPublished()).toEqual([])
  })

  it('caps the list', () => {
    for (let i = 0; i < 250; i++) rememberPublished(record(`id${i}`))
    expect(loadPublished()).toHaveLength(200)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem(KEY, 'not json')
    expect(loadPublished()).toEqual([])
    localStorage.setItem(KEY, '{"not":"an array"}')
    expect(loadPublished()).toEqual([])
  })

  it('drops entries that are missing a token', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'aaa' }, record('bbb')]))
    expect(loadPublished().map((r) => r.id)).toEqual(['bbb'])
  })

  it('does not throw when storage is unavailable', () => {
    // Private mode: every access throws. Publishing must still work.
    const deny = () => {
      throw new Error('denied')
    }
    vi.stubGlobal('localStorage', { getItem: deny, setItem: deny, removeItem: deny, clear: deny })
    expect(loadPublished()).toEqual([])
    expect(() => rememberPublished(record('aaa'))).not.toThrow()
  })
})
