'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/lib/stores/theme-store'

/**
 * The light / dark choice, shared with the standalone apps (AI Roadmap) as a
 * cookie. They run on other ports of the same host, so they cannot read this
 * app's localStorage, but cookies are not separated by port. The value is the
 * choice itself ('light' | 'dark' | 'system'), so "system" keeps following
 * the OS there too.
 */
export const THEME_COOKIE = 'siet-theme'

export function writeThemeCookie(theme: string) {
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=31536000; SameSite=Lax`
}

/** Keep the cookie equal to the saved theme while any dashboard page is open. */
export function useShareThemeWithApps() {
  const theme = useThemeStore((s) => s.theme)
  const hydrated = useThemeStore((s) => s.hasHydrated)
  useEffect(() => {
    if (hydrated) writeThemeCookie(theme)
  }, [theme, hydrated])
}
