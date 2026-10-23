import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const theme = { current: 'light' }
vi.mock('@/lib/stores/theme-store', () => ({
  useThemeStore: { getState: () => ({ theme: theme.current }) },
}))

vi.mock('@siet/platform/lib/cross-app', () => ({
  buildCrossAppLink: async ({ href }: { href: string }) => href,
}))

describe('openRoadmapApp', () => {
  const assign = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: 'http://localhost/community',
      origin: 'http://localhost',
      assign,
    } as Location)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    assign.mockReset()
  })

  it('hands the theme picked here to the quiz app', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { openQuizApp } = await import('./external-apps')
    theme.current = 'dark'
    await openQuizApp()
    const link = new URL(open.mock.calls.at(-1)?.[0] as string)
    expect(link.searchParams.get('theme')).toBe('dark')
    expect(link.searchParams.get('return')).toBe('http://localhost/community')
  })

  it('hands the theme picked here to the roadmap app', async () => {
    const { openRoadmapApp } = await import('./external-apps')
    for (const picked of ['dark', 'system']) {
      theme.current = picked
      await openRoadmapApp({ course: 7 })
      const link = new URL(assign.mock.calls.at(-1)?.[0])
      expect(link.searchParams.get('theme')).toBe(picked)
      expect(link.searchParams.get('course')).toBe('7')
    }
  })
})
