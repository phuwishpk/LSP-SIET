import { AccessDeniedScreen } from '@siet/platform/components/auth/AccessDeniedScreen'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function DeniedPage() {
  return (
    <ErrorBoundary>
      <AccessDeniedScreen />
    </ErrorBoundary>
  )
}

