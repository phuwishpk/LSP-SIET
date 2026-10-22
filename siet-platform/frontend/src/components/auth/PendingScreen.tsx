'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAuth } from '@/lib/hooks/use-auth'
import { peekPostLoginPath } from '@siet/platform/lib/auth-redirect'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Clock,
  ShieldAlert,
  LogOut,
  RefreshCw,
  GraduationCap,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { PdpaConsentDialog } from '@siet/platform/components/auth/PdpaConsentDialog'

export function PendingScreen() {
  const router = useRouter()
  const { logout } = useAuth()
  const { user, refreshUser } = useAuthStore()

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  useEffect(() => {
    if (user?.role && user.role !== 'pending') {
      router.replace(peekPostLoginPath(user.role))
    }
  }, [user, router])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setFeedbackMessage(null)
    try {
      const updated = await refreshUser()
      if (updated && updated.role && updated.role !== 'pending') {
        // Role has been upgraded by admin! Redirect to appropriate home.
        router.replace(peekPostLoginPath(updated.role))
      } else {
        setFeedbackMessage('สถานะบัญชียังคงเป็น PENDING กรุณารอผู้ดูแลระบบอนุมัติ')
      }
    } catch {
      setFeedbackMessage('ไม่สามารถตรวจสอบสถานะได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      router.replace('/login')
    } catch {
      window.location.href = '/login'
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#faf7f9] selection:bg-pink-100 selection:text-pink-600">
      {/* Background Decorative Grid Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, #f2cdd9 1px, transparent 1px),
            linear-gradient(to bottom, #f2cdd9 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px',
        }}
      />

      {/* Decorative Glow Blobs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-rose-200/30 rounded-full blur-3xl pointer-events-none" />

      {/* Main Pending Card */}
      <Card className="relative z-10 w-full max-w-[500px] rounded-3xl border border-amber-200/70 bg-white/95 p-4 sm:p-6 shadow-[0_20px_60px_rgba(245,158,11,0.08)] backdrop-blur-md transition-all">
        <CardHeader className="text-center space-y-3 pb-2">
          {/* Logo & Brand */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200/70 shadow-sm text-pink-600">
              <GraduationCap className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-800">
              StudyTogether
            </span>
          </div>

          {/* Badge */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3.5 py-1 text-xs font-semibold text-pink-600 border border-pink-200/60 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-pink-500 animate-pulse" />
              <span>พื้นที่ชุมชนการเรียนรู้ SIET · KMITL</span>
            </div>
          </div>

          {/* Pending Icon Header */}
          <div className="pt-2 flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 shadow-sm animate-pulse">
              <Clock className="w-8 h-8 stroke-[2.2]" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900 pt-3">
              อยู่ระหว่างรอการอนุมัติสิทธิ์
            </CardTitle>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-100/70 px-3 py-1 rounded-full mt-1.5 border border-amber-200/60">
              สถานะ: PENDING
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-2 sm:px-4 pt-1">
          {/* User Profile Summary */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1.5 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">เข้าสู่ระบบด้วย:</span>
              <span className="font-semibold text-slate-800 font-mono">
                {user?.email || user?.username || 'บัญชี Google'}
              </span>
            </div>
            {user?.display_name && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">ชื่อผู้ใช้:</span>
                <span className="font-medium text-slate-700">{user.display_name}</span>
              </div>
            )}
            {user?.student_id && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">รหัสนักศึกษา:</span>
                <span className="font-medium text-slate-700 font-mono">{user.student_id}</span>
              </div>
            )}
          </div>

          {/* Reason & Explanation Box */}
          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 p-4 space-y-3 text-xs text-slate-700 leading-relaxed shadow-2xs">
            <div className="flex items-center gap-2 font-bold text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>เงื่อนไขการเข้าใช้งานพื้นที่การเรียนรู้</span>
            </div>

            <div className="space-y-2 text-slate-600 text-[12.5px]">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold">•</span>
                <div>
                  <strong className="text-slate-800">นักศึกษาคณะครุศาสตร์อุตสาหกรรมฯ (SIET):</strong>{' '}
                  ระบบจะอนุมัติสิทธิ์เข้าใช้งานอัตโนมัติเฉพาะนักศึกษาที่มีรหัสขึ้นต้นด้วย{' '}
                  <code className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-mono font-bold text-xs">
                    030
                  </code>{' '}
                  (เช่น 65030xxx)
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold">•</span>
                <div>
                  <strong className="text-slate-800">นักศึกษาคณะอื่นๆ หรือผู้ใช้นอกสถาบัน:</strong>{' '}
                  หากท่านใช้อีเมลนอกคณะหรือ Gmail ทั่วไป บัญชีของท่านได้รับการบันทึกเข้าสู่ระบบแล้ว และจะต้องรอให้ผู้ดูแลระบบ (Admin) ตรวจสอบและอนุมัติสิทธิ์ก่อนจึงจะสามารถเข้าใช้งานได้
                </div>
              </div>
            </div>
          </div>

          {/* Feedback message if refreshed */}
          {feedbackMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-2.5 text-xs text-slate-600 border border-slate-200">
              <Info className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {/* Refresh Button */}
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoggingOut}
              className="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold py-5 text-sm shadow-sm transition-all hover:shadow-md active:scale-[0.99] disabled:opacity-50"
            >
              {isRefreshing ? (
                <div className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span>กำลังตรวจสอบสถานะ…</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  <span>ตรวจสอบสถานะสิทธิ์อีกครั้ง</span>
                </div>
              )}
            </Button>

            {/* Logout Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              disabled={isRefreshing || isLoggingOut}
              className="w-full rounded-2xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-5 text-sm transition-colors"
            >
              {isLoggingOut ? (
                <div className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span>กำลังออกจากระบบ…</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <LogOut className="w-4 h-4 text-slate-500" />
                  <span>ออกจากระบบ (กลับไปหน้า Login)</span>
                </div>
              )}
            </Button>
          </div>

          {/* Contact note */}
          <p className="text-center text-[11px] text-slate-400 pt-1">
            ติดต่อผู้ดูแลระบบ: คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี สจล. (KMITL)
          </p>
        </CardContent>
      </Card>
      <PdpaConsentDialog />
    </div>
  )
}
