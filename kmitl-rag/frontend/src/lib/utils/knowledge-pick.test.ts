import { describe, expect, it } from 'vitest'
import { decodePick, encodePick, pickFromParams, pickToAskFields } from './knowledge-pick'

const params = (init: Record<string, string>) => ({ get: (k: string) => init[k] ?? null })

describe('knowledge pick encoding', () => {
  it('round-trips every kind', () => {
    for (const pick of [
      { kind: 'doc', id: 12 } as const,
      { kind: 'notebook', id: 'notebook:imsibidv441yufbsi5x1' } as const,
      { kind: 'source', id: 'source:5hw7jdwzzim5pitpq04o' } as const,
    ]) {
      expect(decodePick(encodePick(pick))).toEqual(pick)
    }
  })

  it('rejects values that are not a known pick', () => {
    for (const bad of ['', null, 'doc:0', 'doc:abc', 'nb:source:abc', 'src:notebook:abc', 'nb:notebook:', 'nb:notebook:a b', 'x:1', 'nb']) {
      expect(decodePick(bad)).toBeNull()
    }
  })

  it('reads the pick from the query string', () => {
    expect(pickFromParams(params({ doc: '7' }))).toBe('doc:7')
    expect(pickFromParams(params({ notebook: 'notebook:abc' }))).toBe('nb:notebook:abc')
    expect(pickFromParams(params({ source: 'source:xyz' }))).toBe('src:source:xyz')
    expect(pickFromParams(params({ doc: 'DROP' }))).toBeNull()
    expect(pickFromParams(params({ notebook: 'source:abc' }))).toBeNull()
    expect(pickFromParams(params({}))).toBeNull()
  })

  it('maps a pick to the ask request fields', () => {
    expect(pickToAskFields({ kind: 'doc', id: 3 })).toEqual({
      scope: 'document', document_ids: [3], notebook_ids: [], source_ids: [],
    })
    expect(pickToAskFields({ kind: 'source', id: 'source:x' })).toEqual({
      scope: 'document', document_ids: [], notebook_ids: [], source_ids: ['source:x'],
    })
    expect(pickToAskFields({ kind: 'notebook', id: 'notebook:n' })).toEqual({
      scope: 'notebook', document_ids: [], notebook_ids: ['notebook:n'], source_ids: [],
    })
    expect(pickToAskFields(null).document_ids).toEqual([])
  })
})
