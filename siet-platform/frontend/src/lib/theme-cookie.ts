'use client'

import { useEffect, useRef } from 'react'
import { useThemeStore } from '@/lib/stores/theme-store'

/**
 * The light / dark choice, shared with the standalone apps (AI Roadmap, AI
 * Quiz) as a cookie. They run on other ports of the same host, so they cannot
 * read this app's localStorage, but cookies are not separated by port.
 *
 * The value is `<choice>~<ms>`: the choice ('light' | 'dark' | 'system') and
 * when it was made. An app compares that time with the `?theme=` it was opened
 * with and follows the newer one. That matters when several SIET Space copies
 * run on one host (prod on :3000, a test stack on :18502): they share this
 * cookie, so a copy must not overwrite it just because one of its pages was
 * opened - only when its user really changes the theme.
 */
export const THEME_COOKIE = 'siet-theme'

export function readThemeCookie(): { choice: string; at: number } | null {
  const match = document.cookie.match(/(?:^|; )siet-theme=([^;]*)/)
  if (!match) return null
  const [choice, at] = decodeURIComponent(match[1]).split('~')
  return { choice, at: Number(at) || 0 }
}

export function writeThemeCookie(theme: string, at = Date.now()) {
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(`${theme}~${at}`)}; path=/; max-age=31536000; SameSite=Lax`
}

/** Share the theme while any dashboard page is open (see THEME_COOKIE). */
export function useShareThemeWithApps() {
  const theme = useThemeStore((s) => s.theme)
  const hydrated = useThemeStore((s) => s.hasHydrated)
  const shared = useRef<string | null>(null)
  useEffect(() => {
    if (!hydrated) return
    if (shared.current === null) {
      // Opening a page is not a choice: keep a newer choice another copy of the
      // app made, and only fill in a cookie that is missing or from before times
      // were recorded.
      shared.current = theme
      const current = readThemeCookie()
      if (!current || !current.at) writeThemeCookie(theme)
      return
    }
    if (theme !== shared.current) {
      shared.current = theme
      writeThemeCookie(theme)
    }
  }, [theme, hydrated])
}
