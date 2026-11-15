/**
 * @siet/platform as an open-notebook frontend extension
 * (open-notebook/frontend/src/lib/extensions.ts).
 */
import { useEffect } from 'react'

import type { FrontendExtension } from '@/lib/extensions'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTranslation } from '@/lib/hooks/use-translation'

import { PdpaConsentDialog } from '@/components/auth/PdpaConsentDialog'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { PointsWalletLink } from '@/components/layout/PointsWalletLink'
import { clearPostLoginPath } from '@/lib/auth-redirect'
import { useCommunityPalette } from '@/lib/hooks/use-community-palette'
import { getWorkspaceNavigation } from '@/lib/navigation'
import { canAccessRoute, isAdmin, isStaff, type Role } from '@/lib/roles'
import { useShareThemeWithApps } from '@/lib/theme-cookie'
import { translations } from '@/lib/translations'

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
  },

  slots: {
    'sidebar.footer': PointsWalletLink,
    // The top navbar over every dashboard page, and the PDPA consent dialog.
    'dashboard.navbar': AppNavbar,
    'dashboard.overlay': PdpaConsentDialog,
  },

  // App name "LSP-SIET" and the AI-feature strings (en-US is the only language)
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

    // Suspended accounts or pending role accounts must only see /denied
    if (user?.disabled || role === 'pending') {
      if (pathname !== '/denied' && pathname !== '/pending') return { ready: true, redirect: '/denied' }
      return { ready: true }
    }

    // The API refuses these routes for students; send them back to the community
    // instead of rendering a page full of 403s.
    if (!canAccessRoute(role, pathname)) return { ready: true, redirect: '/community' }
    return { ready: true }
  },
}

export default extension
