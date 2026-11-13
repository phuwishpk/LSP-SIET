import { Suspense } from 'react'
import { AccessDeniedScreen } from '@siet/platform/components/auth/AccessDeniedScreen'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export default function DeniedPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background">
            <LoadingSpinner />
          </div>
        }
      >
        <AccessDeniedScreen />
      </Suspense>
    </ErrorBoundary>
  )
}
