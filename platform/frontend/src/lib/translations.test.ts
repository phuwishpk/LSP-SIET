import { describe, it, expect } from 'vitest'
import { translations } from './translations'

describe('translations', () => {
  it('adds strings for en-US only', () => {
    expect(Object.keys(translations)).toEqual(['en-US'])
  })
})
