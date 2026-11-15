'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'
import { useGate } from '@/lib/extensions'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const showSetupBanner = useGate('setup-banner') // KMITL hook
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {showSetupBanner && <SetupBanner />}
        {children}
      </main>
    </div>
  )
}
