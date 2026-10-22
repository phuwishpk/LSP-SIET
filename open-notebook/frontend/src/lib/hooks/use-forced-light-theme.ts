'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/lib/stores/theme-store'

/**
 * Keep the current page in light mode while it is open.
 *
 * Pages built on DESIGN.md (SIET Pink) have no dark variant, but the app-wide
 * dark toggle still fires every `dark:` utility inside them, which leaves
 * light panels with dark-mode text. The user's saved theme is not changed;
 * it is put back the moment they leave the page.
 */
export function useForcedLightTheme() {
  const getEffectiveTheme = useThemeStore((s) => s.getEffectiveTheme)

  useEffect(() => {
    const root = document.documentElement
    const apply = (theme: 'light' | 'dark') => {
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
      root.setAttribute('data-theme', theme)
    }
    apply('light')
    // The theme store re-applies the saved theme on OS changes or a toggle in
    // settings; undo that for as long as this page is mounted.
    const observer = new MutationObserver(() => {
      if (root.classList.contains('dark')) apply('light')
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      apply(getEffectiveTheme())
    }
  }, [getEffectiveTheme])
}
