'use client'

import { Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Navbar, type NavbarProps } from '@shared/components/Navbar'
import { NotificationsMenu } from '@siet/platform/components/community/NotificationsMenu'
import { openQuizApp, openRoadmapApp } from '@siet/platform/lib/external-apps'
import { useWallet } from '@siet/platform/lib/hooks/use-community'
import { useAuth } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTheme } from '@/lib/stores/theme-store'

export type AppNavbarProps = NavbarProps

/**
 * The shared navbar (shared/components/Navbar.tsx) over every SIET Space
 * dashboard page. It is given this app's own session, so here it never takes
 * a token from a link or from storage; this app's theme store, which the AI
 * apps follow (lib/theme-cookie.ts); and this app's navigation, notifications
 * and AI-app launchers.
 */
function SietNavbar({ query = '', ...props }: AppNavbarProps & { query?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { logout } = useAuth()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const { data: wallet } = useWallet(Boolean(user))
  const { isDark, setTheme } = useTheme()
  // Links stay in this SIET Space copy, not one an AI app learned about.
  const communityUrl = typeof window === 'undefined' ? undefined : `${window.location.origin}/community`

  return (
    <Navbar
      {...props}
      user={user}
      token={token}
      pointsBalance={wallet?.balance}
      communityUrl={communityUrl}
      searchDefaultValue={query}
      onSearch={(q) => {
        if (q) router.push(`/community?q=${encodeURIComponent(q)}`)
        else if (pathname === '/community') router.push('/community')
      }}
      notifications={<NotificationsMenu onOpenPost={(postId) => router.push(`/community?post=${postId}`)} />}
      onOpenProfile={() => router.push('/community/profile/me')}
      onOpenLibrary={() => router.push('/community?view=library')}
      onOpenSettings={() => router.push('/settings')}
      onOpenRules={() => router.push('/community?view=rules')}
      onOpenQuiz={() => void openQuizApp()}
      onOpenRoadmap={() => void openRoadmapApp()}
      onLogout={() => void logout()}
      isDark={isDark}
      onToggleTheme={() => setTheme(isDark ? 'light' : 'dark')}
    />
  )
}

/** The feed's search (?q=) shows in the navbar's box. */
function SietNavbarWithQuery(props: AppNavbarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return <SietNavbar {...props} query={pathname === '/community' ? searchParams.get('q') || '' : ''} />
}

export function AppNavbar(props: AppNavbarProps) {
  return (
    <Suspense fallback={<SietNavbar {...props} />}>
      <SietNavbarWithQuery {...props} />
    </Suspense>
  )
}

export default AppNavbar
