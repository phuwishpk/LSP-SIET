'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import { useVersionCheck } from '@/lib/hooks/use-version-check'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { ModalProvider } from '@/components/providers/ModalProvider'
import { CreateDialogsProvider } from '@/lib/hooks/use-create-dialogs'
import { CommandPalette } from '@/components/common/CommandPalette'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { useGate, useRouteGate } from '@/lib/extensions'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false)
  // KMITL hooks: extensions may keep a user out of a page or hide features
  const routeGate = useRouteGate(usePathname() ?? '/')
  const showCommandPalette = useGate('command-palette')

  // Check for version updates once per session
  useVersionCheck(useGate('version-check'))

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

  useEffect(() => {
    if (!isLoading && isAuthenticated && routeGate.redirect) {
      router.replace(routeGate.redirect)
    }
  }, [isAuthenticated, isLoading, routeGate.redirect, router])

  // Show loading spinner during initial auth check or while loading
  if (isLoading || !hasCheckedAuth || !routeGate.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // Don't render anything if not authenticated (during redirect)
  if (!isAuthenticated || routeGate.redirect) {
    return null
  }

  return (
    <ErrorBoundary>
      <CreateDialogsProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <AppNavbar />
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
            {children}
          </div>
        </div>
        <ModalProvider />
        {showCommandPalette && <CommandPalette />}
      </CreateDialogsProvider>
    </ErrorBoundary>
  )
}
