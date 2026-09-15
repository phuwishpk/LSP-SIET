'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { isAdmin, type Role } from '@/lib/roles'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const role = useAuthStore((s) => s.user?.role) as Role
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Reads the AI credential status, which only admins may fetch. */}
        {isAdmin(role) && <SetupBanner />}
        {children}
      </main>
    </div>
  )
}
