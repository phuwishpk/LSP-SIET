/**
 * @siet/platform as an open-notebook frontend extension
 * (open-notebook/frontend/src/lib/extensions.ts).
 */
import { useEffect } from 'react'

import type { FrontendExtension } from '@/lib/extensions'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTranslation } from '@/lib/hooks/use-translation'

import { PdpaConsentDialog } from '@siet/platform/components/auth/PdpaConsentDialog'
import { AppNavbar } from '@siet/platform/components/layout/AppNavbar'
import { PointsWalletLink } from '@siet/platform/components/layout/PointsWalletLink'
import { clearPostLoginPath } from '@siet/platform/lib/auth-redirect'
import { useCommunityPalette } from '@siet/platform/lib/hooks/use-community-palette'
import { getWorkspaceNavigation } from '@siet/platform/lib/navigation'
import { canAccessRoute, isAdmin, isStaff, type Role } from '@siet/platform/lib/roles'
import { useShareThemeWithApps } from '@siet/platform/lib/theme-cookie'
import { translations } from '@siet/platform/lib/translations'

const useRole = () => useAuthStore((s) => s.user?.role) as Role

const extension: FrontendExtension = {
  useNavigation() {
    const { t } = useTranslation()
    return getWorkspaceNavigation(t, useRole())
  },

  gates: {
    // Students would only collect 403s from these (api: siet_platform.auth_roles).
    'command-palette': () => isStaff(useRole()),
    'create-dialogs': () => isStaff(useRole()),
    // The setup banner reads admin-only credential status.
    'setup-banner': () => isAdmin(useRole()),
    // "New Open Notebook version" toasts are noise for students.
    'version-check': () => false,
    // Podcasts are kept from upstream but not offered (api: SIET_ENABLE_PODCASTS).
    podcasts: () => process.env.NEXT_PUBLIC_SIET_ENABLE_PODCASTS === '1',
  },

  slots: {
    'sidebar.footer': PointsWalletLink,
    // The top navbar over every dashboard page, and the PDPA consent dialog.
    'dashboard.navbar': AppNavbar,
    'dashboard.overlay': PdpaConsentDialog,
  },

  // App name "LSP-SIET" in every language, AI-feature strings in en-US
  translations,

  useRouteGate(pathname) {
    const role = useRole()
    const user = useAuthStore((s) => s.user)
    const signedIn = useAuthStore((s) => s.isAuthenticated)
    // Runs on every dashboard page: the AI Roadmap app reads the theme from here.
    useShareThemeWithApps()
    // ...and every one of them is pink, not open-notebook's green.
    useCommunityPalette()
    // Reached a page while signed in: the remembered post-login target is used up.
    useEffect(() => {
      if (signedIn && role && role !== 'pending' && !user?.disabled) clearPostLoginPath()
    }, [signedIn, role, user?.disabled])

    // Suspended accounts or pending role accounts must only see /pending
    if (user?.disabled || role === 'pending') {
      if (pathname !== '/pending') return { ready: true, redirect: '/pending' }
      return { ready: true }
    }

    // The API refuses these routes for students; send them back to the community
    // instead of rendering a page full of 403s.
    if (!canAccessRoute(role, pathname)) return { ready: true, redirect: '/community' }
    return { ready: true }
  },
}

export default extension
