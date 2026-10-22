/**
 * @siet/platform as an open-notebook frontend extension
 * (open-notebook/frontend/src/lib/extensions.ts).
 */
import { useEffect } from 'react'

import type { FrontendExtension } from '@/lib/extensions'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTranslation } from '@/lib/hooks/use-translation'

import { PointsWalletLink } from '@siet/platform/components/layout/PointsWalletLink'
import { clearPostLoginPath } from '@siet/platform/lib/auth-redirect'
import { getWorkspaceNavigation } from '@siet/platform/lib/navigation'
import { canAccessRoute, isAdmin, isStaff, type Role } from '@siet/platform/lib/roles'
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
  },

  // App name "LSP-SIET" in every language, AI-feature strings in en-US
  translations,

  useRouteGate(pathname) {
    const role = useRole()
    const signedIn = useAuthStore((s) => s.isAuthenticated)
    // Reached a page while signed in: the remembered post-login target is used up.
    useEffect(() => {
      if (signedIn && role && role !== 'pending') clearPostLoginPath()
    }, [signedIn, role])
    if (role === 'pending') return { ready: true, redirect: '/pending' }
    // The API refuses these routes for students; send them back to the community
    // instead of rendering a page full of 403s.
    if (!canAccessRoute(role, pathname)) return { ready: true, redirect: '/community' }
    return { ready: true }
  },
}

export default extension
