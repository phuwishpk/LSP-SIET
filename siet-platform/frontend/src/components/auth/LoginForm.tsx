'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth-store'
import { getApiUrl } from '@/lib/config'
import { authApi } from '@siet/platform/lib/api/auth'
import { peekPostLoginPath } from '@siet/platform/lib/auth-redirect'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertCircle,
  GraduationCap,
  Sparkles,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { PinkOwlMascot } from '@shared/mascot'

function GoogleMultiColorIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

export function LoginForm() {
  const router = useRouter()
  const {
    authRequired,
    checkAuthRequired,
    hasHydrated,
    isAuthenticated,
    googleLoginEnabled,
    googleLoginMock,
    allowedDomains,
  } = useAuthStore()

  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasHydrated) return
    const destinationFor = (role?: string | null) => peekPostLoginPath(role)
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
      router.replace(peekPostLoginPath(useAuthStore.getState().user?.role))
    }
  }, [hasHydrated, authRequired, isAuthenticated, router])

  // Reset googleBusy when returning to this page via browser Back button (bfcache restoration)
  useEffect(() => {
    const handlePageShow = () => {
      setGoogleBusy(false)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

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
            <CardTitle>เกิดข้อผิดพลาดในการเชื่อมต่อ</CardTitle>
            <CardDescription>
              ไม่สามารถเชื่อมต่อกับบริการ API ของระบบได้
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 text-red-600 text-sm dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                กรุณาตรวจสอบว่าเซิร์ฟเวอร์ Backend กำลังทำงานอยู่
              </div>
            </div>
            <Button onClick={() => window.location.reload()} className="w-full mt-4">
              ลองใหม่อีกครั้ง
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleGoogle = async () => {
    setGoogleBusy(true)
    setGoogleError(null)
    try {
      const apiUrl = await getApiUrl()
      const next = peekPostLoginPath()
      const data = await authApi.googleStart(apiUrl, next)
      if (data.mock) {
        router.push(data.url)
      } else {
        window.location.href = data.url
      }
    } catch (err) {
      const detail = (err as { detail?: string; message?: string })?.detail
      setGoogleError(
        detail || (err as Error)?.message || 'ไม่สามารถเริ่มการเข้าสู่ระบบด้วย Google ได้ กรุณาลองใหม่อีกครั้ง'
      )
      setGoogleBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#faf7f9] selection:bg-pink-100 selection:text-pink-600 dark:bg-zinc-950">
      {/* Background Decorative Grid Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 [--grid-line:#f2cdd9] dark:[--grid-line:#3a2a33]"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
            linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px',
        }}
      />

      {/* Decorative Glow Blobs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-pink-200/40 rounded-full blur-3xl pointer-events-none dark:bg-pink-900/20" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-rose-200/40 rounded-full blur-3xl pointer-events-none dark:bg-rose-900/20" />

      {/* Center Side-by-Side Container */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-6 sm:gap-8 md:gap-12 lg:gap-16 w-full max-w-5xl">
        {/* Left Column: Mascot */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <div className="w-40 sm:w-48 md:w-64 lg:w-72 aspect-[300/340] drop-shadow-[0_15px_30px_rgba(236,72,153,0.18)] transition-transform hover:scale-105 duration-300">
            <PinkOwlMascot mood="study" size="100%" />
          </div>
        </div>

        {/* Right Column: Original Login Card */}
        <Card className="w-full max-w-[440px] sm:max-w-[480px] rounded-3xl border border-pink-100/90 bg-white/95 p-3 sm:p-5 shadow-[0_20px_60px_rgba(236,72,153,0.10)] backdrop-blur-md transition-all dark:border-[#4b3441] dark:bg-[#2b2026]/95">
        <CardHeader className="text-center space-y-3 pb-3">
          {/* Logo & Brand */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200/70 shadow-sm text-pink-600 dark:from-pink-950/60 dark:to-pink-900/40 dark:border-pink-800/50 dark:text-pink-300">
              <GraduationCap className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-800 dark:text-zinc-100">
              nungsue
            </span>
          </div>

          {/* Badge */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3.5 py-1 text-xs font-semibold text-pink-600 border border-pink-200/60 shadow-xs dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800/50">
              <Sparkles className="w-3.5 h-3.5 text-pink-500 animate-pulse dark:text-pink-400" />
              <span>พื้นที่ชุมชนการเรียนรู้ SIET · KMITL</span>
            </div>
          </div>

          {/* Welcome Text */}
          <div className="pt-1">
            <CardTitle className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900 dark:text-zinc-50">
              เข้าสู่ระบบการเรียนรู้
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-3 sm:px-6 pt-2 pb-6">
          {/* Single Google Sign-in Action Button */}
          <div className="space-y-3 pt-1">
            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogle}
              disabled={googleBusy}
              className="group relative flex w-full items-center justify-center gap-3.5 rounded-2xl border-2 border-slate-200/90 bg-white px-5 py-4 text-left shadow-sm transition-all duration-200 hover:border-pink-300 hover:shadow-md hover:bg-slate-50/80 active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-pink-500/60 dark:hover:bg-zinc-800/80"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 shadow-2xs transition-transform group-hover:scale-105 dark:bg-zinc-800/60 dark:border-zinc-700">
                <GoogleMultiColorIcon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-slate-800 group-hover:text-pink-600 transition-colors dark:text-zinc-100 dark:group-hover:text-pink-300">
                  Sign in with Google
                </div>
                <div className="text-xs text-slate-500 truncate dark:text-zinc-400">
                  เข้าสู่ระบบด้วยบัญชีสถาบัน (@kmitl.ac.th)
                </div>
              </div>

              {googleBusy ? (
                <LoadingSpinner size="sm" />
              ) : (
                <div className="text-slate-300 group-hover:text-pink-500 transition-colors dark:text-zinc-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </button>

            {/* Google OAuth Error Alert */}
            {googleError && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-red-50 p-3 text-xs text-red-600 border border-red-200/80 shadow-xs animate-in fade-in dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 leading-relaxed">{googleError}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

