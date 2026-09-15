'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { ModalProvider } from '@/components/providers/ModalProvider'
import { CreateDialogsProvider } from '@/lib/hooks/use-create-dialogs'
import { CommandPalette } from '@/components/common/CommandPalette'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth-store'
import { canAccessRoute, isStaff, type Role } from '@/lib/roles'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const role = useAuthStore((s) => s.user?.role) as Role
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false)
  const allowed = canAccessRoute(role, pathname ?? '/')

  // NOTE: the upstream "new Open Notebook version available" toast
  // (useVersionCheck) is intentionally disabled for the KMITL workspace.

  useEffect(() => {
    // Mark that we've completed the initial auth check
    if (!isLoading) {
      setHasCheckedAuth(true)

      // Redirect to login if not authenticated
      if (!isAuthenticated) {
        // Store the current path to redirect back after login
        const currentPath = window.location.pathname + window.location.search
        sessionStorage.setItem('redirectAfterLogin', currentPath)
        router.push('/login')
      }
    }
  }, [isAuthenticated, isLoading, router])

  // The API refuses these routes for students (api/auth_roles.py); send them
  // back to the community instead of rendering a page full of 403s.
  useEffect(() => {
    if (!isLoading && isAuthenticated && !allowed) {
      router.replace('/community')
    }
  }, [isLoading, isAuthenticated, allowed, router])

  // Show loading spinner during initial auth check or while loading
  if (isLoading || !hasCheckedAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // Don't render anything if not authenticated (during redirect)
  if (!isAuthenticated || !allowed) {
    return null
  }

  return (
    <ErrorBoundary>
      <CreateDialogsProvider>
        {children}
        <ModalProvider />
        {/* The palette lists notebooks and staff-only create actions. */}
        {isStaff(role) && <CommandPalette />}
      </CreateDialogsProvider>
    </ErrorBoundary>
  )
}
