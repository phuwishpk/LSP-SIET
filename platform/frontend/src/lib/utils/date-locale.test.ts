import { describe, it, expect } from 'vitest'
import { enUS } from 'date-fns/locale'
import { getDateLocale } from './date-locale'

describe('getDateLocale', () => {
  it('is date-fns en-US for en-US', () => {
    expect(getDateLocale('en-US')).toBe(enUS)
  })

  it('is en-US for any other language code (only en-US is shipped)', () => {
    for (const code of ['th-TH', 'zh-CN', 'pt-BR', '']) {
      expect(getDateLocale(code)).toBe(enUS)
    }
  })
})
