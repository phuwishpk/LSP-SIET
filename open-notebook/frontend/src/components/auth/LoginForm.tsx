'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/lib/stores/auth-store'
import { getApiUrl, getConfig } from '@/lib/config'
import { authApi } from '@/lib/api/auth'
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
import { AlertCircle, ChevronDown, ChevronUp, FlaskConical, KeyRound, LogIn } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  )
}

export function LoginForm() {
  const router = useRouter()
  const { login, isLoading, error, registrationEnabled } = useAuth()
  const {
    authRequired,
    checkAuthRequired,
    hasHydrated,
    isAuthenticated,
    googleLoginEnabled,
    googleLoginMock,
    allowedDomains,
  } = useAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
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
    const destinationFor = (role?: string | null) =>
      role === 'admin' ? '/admin' : '/community'
    if (authRequired !== null) {
      if (!authRequired && isAuthenticated) {
        router.push(destinationFor(useAuthStore.getState().user?.role))
      } else {
        setIsCheckingAuth(false)
      }
      return
    }
    checkAuthRequired()
      .then((required) => {
        if (!required) {
          router.push(destinationFor(useAuthStore.getState().user?.role))
        }
      })
      .catch(() => {
        // Error already captured in the store
      })
      .finally(() => setIsCheckingAuth(false))
  }, [hasHydrated, authRequired, checkAuthRequired, router, isAuthenticated])

  // If the user is already signed in (token persisted), skip the form.
  useEffect(() => {
    if (hasHydrated && authRequired && isAuthenticated) {
      const role = useAuthStore.getState().user?.role
      router.replace(role === 'admin' ? '/admin' : '/community')
    }
  }, [hasHydrated, authRequired, isAuthenticated, router])

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

  const handleGoogle = async () => {
    setGoogleBusy(true)
    setGoogleError(null)
    try {
      const apiUrl = await getApiUrl()
      let next = '/community'
      try {
        const stored = sessionStorage.getItem('redirectAfterLogin')
        if (stored && stored.startsWith('/') && !stored.startsWith('//')) next = stored
      } catch {
        /* ignore */
      }
      const data = await authApi.googleStart(apiUrl, next)
      if (data.mock) {
        router.push(data.url)
      } else {
        window.location.href = data.url
      }
    } catch (err) {
      const detail = (err as { detail?: string; message?: string })?.detail
      setGoogleError(detail || (err as Error)?.message || 'ไม่สามารถเริ่มการเข้าสู่ระบบด้วย Google ได้')
      setGoogleBusy(false)
    }
  }

  const domainLabel = (allowedDomains?.length ? allowedDomains : ['kmitl.ac.th'])
    .map((d) => `@${d}`)
    .join(', ')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-background to-rose-50 dark:from-background dark:via-background dark:to-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-2xl font-black text-white shadow">
            S
          </div>
          <CardTitle className="text-2xl">SIET Space</CardTitle>
          <CardDescription>
            ชุมชนการเรียนรู้ KMITL · แชร์สรุป ทำควิซ วางแผนการเรียนด้วย AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleLoginEnabled ? (
            <div className="space-y-2">
              <Button
                type="button"
                size="lg"
                className="w-full gap-3 bg-white text-slate-900 border shadow-sm hover:bg-slate-50 dark:bg-white dark:text-slate-900"
                onClick={handleGoogle}
                disabled={googleBusy}
              >
                {googleBusy ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <GoogleGlyph className="h-5 w-5" />
                )}
                เข้าสู่ระบบด้วย Google Workspace ({domainLabel})
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                ใช้บัญชีสถาบันเท่านั้น · ระบบจะดึงรหัสนักศึกษา ชื่อ และรูปโปรไฟล์ให้อัตโนมัติ
                · เข้าใช้ครั้งแรกรับ 20 แต้ม
              </p>
              {googleLoginMock && (
                <p className="flex items-center justify-center gap-1 text-center text-[11px] text-amber-700 dark:text-amber-300">
                  <FlaskConical className="h-3 w-3" /> โหมดจำลอง (ยังไม่ได้ตั้งค่า Google OAuth Client)
                </p>
              )}
              {googleError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {googleError}
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google (ตั้งค่า GOOGLE_OAUTH_CLIENT_ID/SECRET หรือ
              GOOGLE_OAUTH_MOCK=1)
            </p>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="bg-card px-2">หรือ</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              เข้าสู่ระบบด้วยชื่อผู้ใช้ (ผู้ดูแล / บัญชีทดสอบ)
            </span>
            {showPassword ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {(showPassword || !googleLoginEnabled) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="e.g. admin1"
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
                variant="secondary"
                disabled={isLoading || !username.trim() || !password.trim()}
              >
                <LogIn className="mr-2 h-4 w-4" />
                {isLoading ? 'Signing in…' : 'Sign in'}
              </Button>

            </form>
          )}

          {/* Sign-up used to be hidden inside the collapsed password form, so
              the workspace looked as if it had no registration at all. */}
          {registrationEnabled && (
            <div className="rounded-md border border-dashed p-3 text-center text-sm">
              <p className="text-muted-foreground">
                ยังไม่มีบัญชี?{' '}
                <Link href="/register" className="font-medium text-primary hover:underline">
                  สมัครสมาชิกด้วยชื่อผู้ใช้
                </Link>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                บัญชีที่สมัครเองจะเป็น <b>นักศึกษา</b> · อาจารย์ให้เข้าสู่ระบบด้วย Google
                ของ KMITL
              </p>
            </div>
          )}

          {configInfo && (
            <div className="text-xs text-center text-muted-foreground pt-2 border-t">
              <div>v{configInfo.version}</div>
              <div className="font-mono text-[10px] break-all">{configInfo.apiUrl}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
