'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertCircle, UserPlus } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export function RegisterForm() {
  const router = useRouter()
  const { register, isLoading, error, registrationEnabled } = useAuth()
  const { checkAuthRequired, hasHydrated, authRequired } = useAuthStore()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    checkAuthRequired()
      .catch(() => {})
      .finally(() => setReady(true))
  }, [hasHydrated, checkAuthRequired])

  if (!hasHydrated || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    )
  }

  if (authRequired === false) {
    router.replace('/dashboard')
    return null
  }

  if (registrationEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Registration disabled</CardTitle>
            <CardDescription>
              The workspace administrator has turned off new sign-ups. Please ask them
              to create an account for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/login"
              className="text-primary hover:underline text-sm"
            >
              ← Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!username.trim() || !password) return
    if (password !== confirm) {
      setLocalError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters')
      return
    }
    const success = await register(
      username.trim(),
      password,
      displayName.trim() || undefined
    )
    if (!success) return
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Create account</CardTitle>
          <CardDescription>
            One account unlocks every KMITL AI app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                placeholder="e.g. alice"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
              <p className="text-xs text-muted-foreground">
                3-32 characters · letters, digits, dots, underscores or dashes.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name (optional)</Label>
              <Input
                id="displayName"
                placeholder="Alice KMITL"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            {(localError || error) && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                {localError || error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || !username.trim() || !password || password !== confirm
              }
            >
              {isLoading ? 'Creating account…' : 'Create account'}
            </Button>

            <div className="text-center text-sm text-muted-foreground pt-2 border-t">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}