'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { openRoadmapApp } from '@/lib/external-apps'

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
    const back = params.get('return')
    void openRoadmapApp({
      path: params.get('path') || '/',
      returnTo: back || `${window.location.origin}/community`,
      course: Number(params.get('course')) || null,
      doc: Number(params.get('doc')) || null,
      replace: true,
    })
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
