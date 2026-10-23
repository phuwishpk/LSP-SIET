import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = { theme: 'light', hasHydrated: true }
vi.mock('@/lib/stores/theme-store', () => ({
  useThemeStore: (pick: (s: typeof store) => unknown) => pick(store),
}))

import { readThemeCookie, useShareThemeWithApps, writeThemeCookie } from './theme-cookie'

describe('useShareThemeWithApps', () => {
  beforeEach(() => {
    document.cookie = 'siet-theme=; path=/; max-age=0'
    store.theme = 'light'
    store.hasHydrated = true
  })

  it('shares the theme when nothing is shared yet, and again when the user changes it', () => {
    store.theme = 'dark'
    const { rerender } = renderHook(() => useShareThemeWithApps())
    expect(readThemeCookie()?.choice).toBe('dark')
    expect(readThemeCookie()?.at).toBeGreaterThan(0)

    store.theme = 'system'
    rerender()
    expect(readThemeCookie()?.choice).toBe('system')
  })

  it('does not overwrite a choice another copy of the app made just by opening a page', () => {
    writeThemeCookie('dark', 1000)
    store.theme = 'system' // this copy never had a theme picked
    renderHook(() => useShareThemeWithApps())
    expect(readThemeCookie()).toEqual({ choice: 'dark', at: 1000 })
  })

  it('replaces a cookie from before times were recorded', () => {
    document.cookie = 'siet-theme=light; path=/'
    store.theme = 'dark'
    renderHook(() => useShareThemeWithApps())
    expect(readThemeCookie()?.choice).toBe('dark')
  })

  it('waits for the saved theme before writing', () => {
    store.hasHydrated = false
    renderHook(() => useShareThemeWithApps())
    expect(readThemeCookie()).toBeNull()
  })
})
