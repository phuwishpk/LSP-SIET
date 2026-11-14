'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { openRoadmapApp } from '@siet/platform/lib/external-apps'
import { useAuthStore } from '@/lib/stores/auth-store'

/**
 * True once the API has accepted this browser's session. The layout renders
 * this page from the remembered sign-in before its own check is back, so a
 * week-old token would otherwise be handed to AI Roadmap, refused there, and
 * leave the visitor on its "sign-in failed" screen instead of the login page.
 */
async function sessionAccepted(): Promise<boolean> {
  if (useAuthStore.getState().isCheckingAuth) {
    await new Promise<void>((resolve) => {
      const stop = useAuthStore.subscribe((state) => {
        if (!state.isCheckingAuth) {
          stop()
          resolve()
        }
      })
    })
  }
  return useAuthStore.getState().checkAuth()
}

/**
 * Relay into the AI Roadmap app.
 *
 * The roadmap app sends a visitor here when it has no valid session. Being a
 * dashboard page, this only renders once the user is signed in (the layout
 * sends everyone else to /login and brings them back), and then hands the
 * token over and returns them to the page they were on.
 */
function Relay() {
  const params = useSearchParams()

  useEffect(() => {
    let cancelled = false
    void sessionAccepted().then((accepted) => {
      // Not accepted: the store has signed out and the dashboard layout takes
      // the visitor to /login, then back here.
      if (!accepted || cancelled) return
      const back = params.get('return')
      void openRoadmapApp({
        path: params.get('path') || '/',
        returnTo: back || `${window.location.origin}/community`,
        course: Number(params.get('course')) || null,
        doc: Number(params.get('doc')) || null,
        replace: true,
      })
    })
    return () => {
      cancelled = true
    }
  }, [params])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <LoadingSpinner />
      <p className="text-sm text-muted-foreground">กำลังเปิด AI Roadmap…</p>
    </div>
  )
}

export default function GoRoadmapPage() {
  return (
    <Suspense fallback={null}>
      <Relay />
    </Suspense>
  )
}
