'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/lib/stores/auth-store'
import { getConfig } from '@/lib/config'
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
import { AlertCircle, LogIn } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export function LoginForm() {
  const router = useRouter()
  const { login, isLoading, error, registrationEnabled } = useAuth()
  const {
    authRequired,
    checkAuthRequired,
    hasHydrated,
    isAuthenticated,
  } = useAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [configInfo, setConfigInfo] = useState<{
    apiUrl: string
    version: string
    buildTime: string
  } | null>(null)

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfigInfo({
          apiUrl: cfg.apiUrl,
          version: cfg.version,
          buildTime: cfg.buildTime,
        })
      })
      .catch((err) => console.error('Failed to load config:', err))
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    if (authRequired !== null) {
      if (!authRequired && isAuthenticated) {
        router.push('/dashboard')
      } else {
        setIsCheckingAuth(false)
      }
      return
    }
    checkAuthRequired()
      .then((required) => {
        if (!required) router.push('/dashboard')
      })
      .catch(() => {
        // Error already captured in the store
      })
      .finally(() => setIsCheckingAuth(false))
  }, [hasHydrated, authRequired, checkAuthRequired, router, isAuthenticated])

  if (!hasHydrated || isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    )
  }

  if (authRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Connection error</CardTitle>
            <CardDescription>
              Unable to reach the Open Notebook API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                {error || 'Please verify the API container is running.'}
              </div>
            </div>
            <Button onClick={() => window.location.reload()} className="w-full mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    await login(username.trim(), password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>KMITL AI Workspace</CardTitle>
          <CardDescription>
            Sign in to access Open Notebook, AI Quiz, and AI Roadmap.
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !username.trim() || !password.trim()}
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>

            {registrationEnabled && (
              <div className="text-center text-sm text-muted-foreground pt-2 border-t">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-primary hover:underline">
                  Create one
                </Link>
              </div>
            )}

            {configInfo && (
              <div className="text-xs text-center text-muted-foreground pt-2 border-t">
                <div>v{configInfo.version}</div>
                <div className="font-mono text-[10px] break-all">{configInfo.apiUrl}</div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}