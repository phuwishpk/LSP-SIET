import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = { theme: 'light', hasHydrated: true }
vi.mock('@/lib/stores/theme-store', () => ({
  useThemeStore: (pick: (s: typeof store) => unknown) => pick(store),
}))

import { useShareThemeWithApps } from './theme-cookie'

describe('useShareThemeWithApps', () => {
  beforeEach(() => {
    document.cookie = 'siet-theme=; path=/; max-age=0'
  })

  it('mirrors the saved theme into the cookie the roadmap app reads', () => {
    store.theme = 'dark'
    const { rerender } = renderHook(() => useShareThemeWithApps())
    expect(document.cookie).toContain('siet-theme=dark')

    store.theme = 'system'
    rerender()
    expect(document.cookie).toContain('siet-theme=system')
  })

  it('waits for the saved theme before writing', () => {
    store.theme = 'dark'
    store.hasHydrated = false
    renderHook(() => useShareThemeWithApps())
    expect(document.cookie).not.toContain('siet-theme')
    store.hasHydrated = true
  })
})
