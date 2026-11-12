'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAuth } from '@/lib/hooks/use-auth'
import { peekPostLoginPath } from '@siet/platform/lib/auth-redirect'
import { authApi, type AdminInfo } from '@siet/platform/lib/api/auth'
import { getApiUrl } from '@/lib/config'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ShieldAlert,
  LogOut,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  Building2,
  RefreshCw,
  AlertOctagon,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { PdpaConsentDialog } from '@siet/platform/components/auth/PdpaConsentDialog'

export function AccessDeniedScreen() {
  const router = useRouter()
  const { logout } = useAuth()
  const { user, refreshUser } = useAuthStore()

  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const isSuspended = Boolean(user?.disabled)
  const isApproved = Boolean(user?.role && user.role !== 'pending' && !user.disabled)

  // Fetch admin contact info
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const apiUrl = await getApiUrl()
        const info = await authApi.adminInfo(apiUrl)
        if (active) {
          setAdminInfo(info)
        }
      } catch {
        // Fallback default admin info
        if (active) {
          setAdminInfo({
            name: 'ผู้ดูแลระบบ คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี',
            email: 'siet_admin@kmitl.ac.th',
            department: 'คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี (SIET) สจล.',
            telephone: '02-329-8000 ต่อ 3030',
            note: 'ติดต่อผู้ดูแลระบบเพื่อแจ้งปัญหาหรือขอตรวจสอบสิทธิ์การใช้งาน',
          })
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Redirect if already approved / restored
  useEffect(() => {
    if (isApproved && user?.role) {
      router.replace(peekPostLoginPath(user.role))
    }
  }, [isApproved, user?.role, router])

  // ตรวจสอบสิทธิ์อัตโนมัติเมื่อผู้ใช้สลับหน้าต่างกลับมาที่หน้านี้
  useEffect(() => {
    const handleFocus = async () => {
      const updated = await refreshUser()
      if (updated && updated.role && updated.role !== 'pending' && !updated.disabled) {
        toast.success('บัญชีของคุณได้รับการอนุมัติ / คืนสิทธิ์เรียบร้อยแล้ว ยินดีต้อนรับสู่ระบบ')
        router.replace(peekPostLoginPath(updated.role))
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshUser, router])

  // กดปุ่มตรวจสอบสิทธิ์อีกครั้ง
  const handleCheckStatus = async () => {
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
        toast.error('บัญชียังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาตรวจสอบเงื่อนไขรหัสนักศึกษาหรือติดต่อผู้ดูแลระบบ')
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
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-background selection:bg-rose-100 selection:text-rose-600">
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
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* การ์ดหลัก */}
      <Card className="relative z-10 w-full max-w-[540px] rounded-3xl border border-border/80 bg-card/95 p-5 sm:p-7 shadow-2xl backdrop-blur-xl transition-all">
        <CardHeader className="text-center space-y-3 pb-3">
          {/* ตราสัญลักษณ์และชื่อระบบ */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400">
              <GraduationCap className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-foreground">
              StudyTogether
            </span>
          </div>

          {/* ป้ายแสดงสังกัด */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-pulse dark:text-rose-400" />
              <span>พื้นที่ชุมชนการเรียนรู้ SIET · KMITL</span>
            </div>
          </div>

          {/* ไอคอนและหัวข้อตามสถานะ */}
          <div className="pt-2 flex flex-col items-center space-y-2">
            {isSuspended ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-600 shadow-sm">
                  <XCircle className="w-9 h-9 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  บัญชีของคุณถูกระงับการใช้งาน
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-rose-700 bg-rose-500/10 border border-rose-500/20 dark:text-rose-400">
                  สถานะ: บัญชีถูกระงับการใช้งาน (Suspended)
                </div>
              </>
            ) : isApproved ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 shadow-sm animate-bounce">
                  <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  ได้รับการอนุมัติสิทธิ์เรียบร้อยแล้ว
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 dark:text-emerald-400">
                  สถานะ: อนุมัติสิทธิ์เรียบร้อยแล้ว
                </div>
              </>
            ) : (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 border border-red-500/20 text-red-600 shadow-sm">
                  <AlertOctagon className="w-9 h-9 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  ปฏิเสธการเข้าใช้งาน (Access Denied)
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-red-700 bg-red-500/10 border border-red-500/20 dark:text-red-400">
                  สถานะ: ไม่อยู่ในเงื่อนไขการให้บริการ
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

          {/* รายละเอียดกรณีถูกระงับ หรือปฏิเสธสิทธิ์ */}
          {isSuspended ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2.5 text-xs text-foreground leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>เหตุผลในการระงับการใช้งาน</span>
              </div>
              <p className="text-muted-foreground leading-relaxed pl-6">
                {user?.suspend_reason || 'บัญชีนี้ถูกระงับสิทธิ์การใช้งานชั่วคราวโดยผู้ดูแลระบบเนื่องจากละเมิดข้อกำหนดชุมชน'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/5 via-transparent to-transparent p-4 space-y-2.5 text-xs leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>เงื่อนไขการได้รับสิทธิ์เข้าใช้งานระบบ</span>
              </div>
              <div className="space-y-2 text-muted-foreground text-[12px] pl-1">
                <div className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <div>
                    <strong className="text-foreground">นักศึกษาคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี (SIET)</strong>:
                    ต้องเข้าสู่ระบบด้วยอีเมลสถาบัน <span className="font-mono text-foreground font-semibold">@kmitl.ac.th</span> และมีรหัสนักศึกษาขึ้นต้นด้วย <span className="font-mono text-foreground font-semibold">030</span> (เช่น 65030xxx)
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <div>
                    <strong className="text-foreground">คณาจารย์ผู้สอน</strong>:
                    ต้องเป็นอาจารย์ที่มีรายชื่ออยู่ในบัญชีผู้สอนที่ได้รับอนุญาตของคณะ (Teacher Whitelist)
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">•</span>
                  <div className="text-red-600/90 dark:text-red-400">
                    อีเมลส่วนตัวภายนอก (@gmail.com, @hotmail.com) หรือนักศึกษาต่างคณะไม่สามารถเข้าใช้งานระบบได้
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ข้อมูลติดต่อผู้ดูแลระบบ (Admin Info / Contact Seed ตามหัวข้อ 3.4.1) */}
          <div className="rounded-2xl border border-border/80 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-2.5 text-xs">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-pink-600" />
              <span>ข้อมูลติดต่อผู้ดูแลระบบ (Admin Support)</span>
            </div>
            <div className="space-y-1.5 text-muted-foreground text-[11.5px] pl-5">
              <div className="text-foreground font-medium">
                {adminInfo?.name || 'ผู้ดูแลระบบ คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี'}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <a
                  href={`mailto:${adminInfo?.email || 'siet_admin@kmitl.ac.th'}`}
                  className="hover:underline font-mono text-rose-600 dark:text-rose-400"
                >
                  {adminInfo?.email || 'siet_admin@kmitl.ac.th'}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{adminInfo?.telephone || '02-329-8000 ต่อ 3030'}</span>
              </div>
              <div className="text-[11px] text-muted-foreground/90 pt-1">
                {adminInfo?.department || 'คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง'}
              </div>
            </div>
          </div>

          {/* ปุ่มการกระทำ */}
          <div className="space-y-2.5 pt-2">
            <Button
              type="button"
              onClick={handleCheckStatus}
              disabled={isChecking || isLoggingOut}
              className="w-full rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold py-5 text-sm shadow-md shadow-rose-600/20 transition-all hover:shadow-lg disabled:opacity-50"
            >
              {isChecking ? (
                <div className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span>กำลังตรวจสอบสิทธิ์…</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  <span>ตรวจสอบสิทธิ์อีกครั้ง</span>
                </div>
              )}
            </Button>

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
        </CardContent>
      </Card>

      <PdpaConsentDialog />
    </div>
  )
}

