import { describe, it, expect, beforeAll } from 'vitest'
import { createInstance } from 'i18next'
import { resources } from './index'

// Mirrors the interpolation config in src/lib/i18n.ts
const i18n = createInstance()

beforeAll(async () => {
  await i18n.init({
    resources,
    lng: 'en-US',
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  })
})

describe('i18next interpolation', () => {
  it('interpolates a single variable', () => {
    expect(i18n.t('chat.chatWith', { name: 'Sources' })).toBe('Chat with Sources')
  })

  it('interpolates multiple variables', () => {
    expect(i18n.t('sources.batchPartial', { success: 2, failed: 1 })).toBe(
      '2 succeeded, 1 failed',
    )
  })

  it('resolves plural forms from the base key', () => {
    // No en-US key is plural today, so the test brings its own.
    i18n.addResources('en-US', 'translation', {
      pluralProbe_one: 'Used by 1 item',
      pluralProbe_other: 'Used by {{count}} items',
    })
    expect(i18n.t('pluralProbe', { count: 1 })).toBe('Used by 1 item')
    expect(i18n.t('pluralProbe', { count: 3 })).toBe('Used by 3 items')
  })

  it('does not escape interpolated values (React escapes at render)', () => {
    expect(i18n.t('notebooks.deleteNotebookDesc', { name: 'Research & Notes' })).toBe(
      'Are you sure you want to delete "Research & Notes"? This action cannot be undone.',
    )
  })
})
