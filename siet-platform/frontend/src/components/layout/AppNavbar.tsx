'use client'

import { Navbar, type NavbarProps } from '@shared/components/Navbar'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTheme } from '@/lib/stores/theme-store'

export type AppNavbarProps = NavbarProps

/**
 * The shared navbar (shared/components/Navbar.tsx) over every SIET Space
 * dashboard page. It is given this app's own session, so here it never takes
 * a token from a link or from storage, and this app's theme store, which the
 * AI apps follow (lib/theme-cookie.ts).
 */
export function AppNavbar(props: AppNavbarProps) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const { isDark, setTheme } = useTheme()
  // Links stay in this SIET Space copy, not one an AI app learned about.
  const communityUrl = typeof window === 'undefined' ? undefined : `${window.location.origin}/community`
  return (
    <Navbar
      {...props}
      user={user}
      token={token}
      communityUrl={communityUrl}
      isDark={isDark}
      onToggleTheme={() => setTheme(isDark ? 'light' : 'dark')}
    />
  )
}

export default AppNavbar
