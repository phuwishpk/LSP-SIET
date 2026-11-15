import { describe, it, expect, vi } from 'vitest'
import { createInstance } from 'i18next'

// No SIET extensions: this file tests the host's own i18n setup.
vi.mock('./extensions.installed', () => ({ installed: [] }))

import i18n, { i18nOptions } from './i18n'

describe('i18n setup (en-US only)', () => {
  it('runs in en-US', () => {
    expect(i18n.language).toBe('en-US')
    expect(i18n.t('common.loading')).toBe('Loading...')
  })

  it('falls back to en-US strings for a language that is not shipped (th-TH)', async () => {
    // What a stale stored language (picked before the picker was removed) or a
    // Thai browser would ask for.
    const other = createInstance()
    await other.init({ ...i18nOptions, lng: 'th-TH' })

    expect(other.t('common.loading')).toBe('Loading...')
    expect(other.t('chat.chatWith', { name: 'Sources' })).toBe('Chat with Sources')
  })
})
