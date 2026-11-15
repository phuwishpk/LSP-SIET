import { RegisterForm } from '@/components/auth/RegisterForm'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function RegisterPage() {
  return (
    <ErrorBoundary>
      <RegisterForm />
    </ErrorBoundary>
  )
}