import { PendingScreen } from '@siet/platform/components/auth/PendingScreen'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function PendingPage() {
  return (
    <ErrorBoundary>
      <PendingScreen />
    </ErrorBoundary>
  )
}
