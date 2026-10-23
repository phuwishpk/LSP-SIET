'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
  GraduationCap,
  Sparkles,
  CheckCircle2,
  LogIn,
  XCircle,
  HelpCircle,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { PdpaConsentDialog } from '@siet/platform/components/auth/PdpaConsentDialog'

export function PendingScreen() {
  const router = useRouter()
  const { logout } = useAuth()
  const { user, refreshUser } = useAuthStore()

  const [isChecking, setIsChecking] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const isRejected = Boolean(user?.disabled)
  const isApproved = Boolean(user?.role && user.role !== 'pending' && !user.disabled)
  const isPending = Boolean(user?.role === 'pending' && !user.disabled)

  // Redirect if already approved
  useEffect(() => {
    if (isApproved && user?.role) {
      router.replace(peekPostLoginPath(user.role))
    }
  }, [isApproved, user?.role, router])

  // ตรวจสอบสิทธิ์อัตโนมัติเมื่อผู้ใช้สลับหน้าต่างกลับมาที่หน้านี้
  useEffect(() => {
    const handleFocus = async () => {
      if (isPending || isRejected) {
        const updated = await refreshUser()
        if (updated && updated.role && updated.role !== 'pending' && !updated.disabled) {
          toast.success('บัญชีของคุณได้รับการอนุมัติ / คืนสิทธิ์เรียบร้อยแล้ว ยินดีต้อนรับสู่ระบบ')
          router.replace(peekPostLoginPath(updated.role))
        }
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isPending, isRejected, refreshUser, router])

  // กดปุ่มเข้าสู่ระบบ / ตรวจสอบสิทธิ์
  const handleLoginAction = async () => {
    if (isApproved && user?.role) {
      router.replace(peekPostLoginPath(user.role))
      return
    }

    setIsChecking(true)
    try {
      const updated = await refreshUser()
      if (updated && updated.role && updated.role !== 'pending' && !updated.disabled) {
        toast.success('บัญชีของคุณได้รับการอนุมัติ / คืนสิทธิ์เรียบร้อยแล้ว ยินดีต้อนรับสู่ระบบ')
        router.replace(peekPostLoginPath(updated.role))
      } else if (updated?.disabled) {
        toast.error('บัญชียังคงอยู่ในสถานะถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
      } else {
        toast.info('บัญชีของท่านยังอยู่ระหว่างรอการอนุมัติสิทธิ์จากผู้ดูแลระบบ')
      }
    } catch {
      toast.error('ไม่สามารถตรวจสอบสถานะได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsChecking(false)
    }
  }

  // ออกจากระบบ
  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      router.replace('/login')
    } catch {
      window.location.href = '/login'
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-background selection:bg-pink-100 selection:text-pink-600">
      {/* ลวดลายกราฟิกพื้นหลัง */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* แสงสีบรรยากาศนุ่มนวล */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* การ์ดหลัก */}
      <Card className="relative z-10 w-full max-w-[520px] rounded-3xl border border-border/80 bg-card/95 p-5 sm:p-7 shadow-2xl backdrop-blur-xl transition-all">
        <CardHeader className="text-center space-y-3 pb-3">
          {/* ตราสัญลักษณ์และชื่อระบบ */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-500/10 text-pink-600 ring-1 ring-pink-500/20 dark:bg-pink-500/20 dark:text-pink-400">
              <GraduationCap className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-foreground">
              StudyTogether
            </span>
          </div>

          {/* ป้ายแสดงสังกัด */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/10 px-3.5 py-1 text-xs font-medium text-pink-600 ring-1 ring-pink-500/20 dark:text-pink-400">
              <Sparkles className="w-3.5 h-3.5 text-pink-500 animate-pulse dark:text-pink-400" />
              <span>พื้นที่ชุมชนการเรียนรู้ SIET · KMITL</span>
            </div>
          </div>

          {/* ไอคอนและหัวข้อตามสถานะ */}
          <div className="pt-2 flex flex-col items-center space-y-2">
            {isRejected ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-600 shadow-sm">
                  <XCircle className="w-8 h-8 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  บัญชีของคุณถูกระงับการใช้งาน
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-rose-700 bg-rose-500/10 border border-rose-500/20 dark:text-rose-400">
                  สถานะ บัญชีถูกระงับการใช้งาน
                </div>
              </>
            ) : isApproved ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 shadow-sm animate-bounce">
                  <CheckCircle2 className="w-8 h-8 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  ได้รับการอนุมัติสิทธิ์เรียบร้อยแล้ว
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 dark:text-emerald-400">
                  สถานะ อนุมัติสิทธิ์เรียบร้อยแล้ว
                </div>
              </>
            ) : (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-600 shadow-sm animate-pulse">
                  <Clock className="w-8 h-8 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  อยู่ระหว่างการตรวจสอบและอนุมัติสิทธิ์
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/20 dark:text-amber-400">
                  สถานะ รอการอนุมัติสิทธิ์
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-1 sm:px-3 pt-1">
          {/* ข้อมูลบัญชีผู้ลงชื่อเข้าใช้ */}
          <div className="rounded-2xl border border-border/80 bg-muted/40 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">บัญชีที่เข้าสู่ระบบ</span>
              <span className="font-semibold text-foreground font-mono">
                {user?.email || user?.username || 'บัญชี Google'}
              </span>
            </div>
            {user?.display_name && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ชื่อผู้ลงทะเบียน</span>
                <span className="font-medium text-foreground">{user.display_name}</span>
              </div>
            )}
            {user?.student_id && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">รหัสประจำตัวนักศึกษา</span>
                <span className="font-medium text-foreground font-mono">{user.student_id}</span>
              </div>
            )}
          </div>

          {/* รายละเอียดกรณีถูกปฏิเสธ หรือคำชี้แจงเงื่อนไข */}
          {isRejected ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2.5 text-xs text-foreground leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>เหตุผลในการระงับการใช้งาน</span>
              </div>
              <p className="text-muted-foreground leading-relaxed pl-6">
                {user?.suspend_reason || 'บัญชีนี้ถูกระงับสิทธิ์การใช้งานชั่วคราวโดยผู้ดูแลระบบ'}
              </p>
              <div className="pt-1 flex items-start gap-2 text-[11.5px] text-muted-foreground border-t border-rose-500/10">
                <HelpCircle className="w-4 h-4 text-rose-500/80 flex-shrink-0 mt-0.5" />
                <span>หากท่านมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-pink-500/15 bg-gradient-to-br from-pink-500/5 via-transparent to-transparent p-4 space-y-3 text-xs leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-pink-600 dark:text-pink-400">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>ข้อกำหนดและเงื่อนไขการเข้าใช้งานพื้นที่การเรียนรู้</span>
              </div>

              <div className="space-y-2 text-muted-foreground text-[12px]">
                <div className="flex items-start gap-2">
                  <span className="text-pink-600 font-bold">•</span>
                  <div>
                    <strong className="text-foreground">นักศึกษาคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี (SIET)</strong>{' '}
                    ระบบจะอนุมัติสิทธิ์เข้าใช้งานอัตโนมัติเฉพาะนักศึกษาที่มีรหัสประจำตัวขึ้นต้นด้วย 030 (เช่น 65030xxx)
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-pink-600 font-bold">•</span>
                  <div>
                    <strong className="text-foreground">นักศึกษาต่างคณะหรือผู้ใช้งานภายนอกสถาบัน</strong>{' '}
                    ข้อมูลบัญชีได้รับการบันทึกเข้าสู่ระบบแล้ว และอยู่ระหว่างรอการตรวจสอบเพื่อพิจารณาอนุมัติสิทธิ์โดยผู้ดูแลระบบ
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ปุ่มการกระทำ */}
          <div className="space-y-2.5 pt-2">
            {!isRejected && (
              <Button
                type="button"
                onClick={handleLoginAction}
                disabled={isChecking || isLoggingOut}
                className="w-full rounded-2xl bg-pink-600 hover:bg-pink-700 text-white font-semibold py-5 text-sm shadow-md shadow-pink-600/20 transition-all hover:shadow-lg disabled:opacity-50"
              >
                {isChecking ? (
                  <div className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span>กำลังตรวจสอบสิทธิ์…</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <LogIn className="w-4 h-4" />
                    <span>เข้าสู่ระบบ</span>
                  </div>
                )}
              </Button>
            )}

            {/* ปุ่มออกจากระบบ */}
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              disabled={isChecking || isLoggingOut}
              className="w-full rounded-2xl border-border bg-background hover:bg-muted text-foreground font-medium py-5 text-sm transition-colors"
            >
              {isLoggingOut ? (
                <div className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span>กำลังออกจากระบบ…</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <LogOut className="w-4 h-4 text-muted-foreground" />
                  <span>ออกจากระบบ</span>
                </div>
              )}
            </Button>
          </div>

          {/* ช่องทางติดต่อผู้ดูแลระบบ */}
          <p className="text-center text-[11px] text-muted-foreground pt-1">
            ติดต่อผู้ดูแลระบบ คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง
          </p>
        </CardContent>
      </Card>

      <PdpaConsentDialog />
    </div>
  )
}
