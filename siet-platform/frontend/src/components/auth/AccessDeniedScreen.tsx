'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  ArrowRight,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { PdpaConsentDialog } from '@siet/platform/components/auth/PdpaConsentDialog'


// Shown when /api/system/admin-info cannot be reached. Keep in sync with the
// ADMIN_CONTACT_* defaults in siet_platform/routers/users.py.
const FALLBACK_ADMIN_INFO: AdminInfo = {
  name: 'ผู้ดูแลระบบ',
  email: 'siet_admin@kmitl.ac.th',
  department: '',
  telephone: '02-329-8000 ต่อ 3030',
}

export function AccessDeniedScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { logout } = useAuth()
  const { user, refreshUser } = useAuthStore()

  const emailParam = searchParams.get('email')
  const nameParam = searchParams.get('name')
  const displayEmail = user?.email || emailParam || user?.username || 'บัญชี Google'
  const displayNameVal = user?.display_name || nameParam || null

  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const isSuspended = Boolean(user?.disabled)
  const isApproved = Boolean(user?.role && user.role !== 'pending' && !user.disabled)

  // ดึงข้อมูลติดต่อผู้ดูแลระบบ
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
        if (active) {
          setAdminInfo(FALLBACK_ADMIN_INFO)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // หากได้รับการอนุมัติหรือปลดระงับแล้ว ให้เข้าสู่ระบบอัตโนมัติ
  useEffect(() => {
    if (isApproved && user?.role) {
      router.replace(peekPostLoginPath(user.role))
    }
  }, [isApproved, user?.role, router])

  // ตรวจสอบสิทธิ์อัตโนมัติเมื่อผู้ใช้สลับหน้าต่างกลับมา
  useEffect(() => {
    const handleFocus = async () => {
      const updated = await refreshUser()
      if (updated && updated.role && updated.role !== 'pending' && !updated.disabled) {
        toast.success('บัญชีของคุณใช้งานได้เรียบร้อยแล้ว')
        router.replace(peekPostLoginPath(updated.role))
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshUser, router])

  // ตรวจสอบสิทธิ์ใหม่ (สำหรับกรณีระงับบัญชีที่แอดมินเพิ่งปลดให้)
  const handleCheckStatus = async () => {
    if (isApproved && user?.role) {
      router.replace(peekPostLoginPath(user.role))
      return
    }

    setIsChecking(true)
    try {
      const updated = await refreshUser()
      if (updated && updated.role && updated.role !== 'pending' && !updated.disabled) {
        toast.success('บัญชีของคุณได้รับการคืนสิทธิ์เรียบร้อยแล้ว')
        router.replace(peekPostLoginPath(updated.role))
      } else if (updated?.disabled) {
        toast.error('บัญชียังถูกระงับการใช้งานอยู่ กรุณาติดต่อผู้ดูแลระบบ')
      } else {
        toast.error('ยังไม่พบสิทธิ์การใช้งาน กรุณาตรวจสอบรหัสนักศึกษาหรือติดต่อผู้ดูแลระบบ')
      }
    } catch {
      toast.error('ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsChecking(false)
    }
  }

  // ออกจากระบบ
  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      if (user) {
        await logout()
      }
      router.replace('/login')
    } catch {
      window.location.href = '/login'
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-background">
      {/* ลวดลายพื้นหลัง */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      <Card className="relative z-10 w-full max-w-[500px] rounded-3xl border border-border/70 bg-card/95 p-6 sm:p-7 shadow-xl backdrop-blur-xl">
        <CardHeader className="text-center space-y-3 pb-2 pt-0 px-0">
          {/* ชื่อระบบ */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400">
              <GraduationCap className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-foreground">
              nungsue
            </span>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <Sparkles className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
              <span>พื้นที่ชุมชนการเรียนรู้ SIET · KMITL</span>
            </div>
          </div>

          {/* ไอคอนและหัวข้อ */}
          <div className="pt-2 flex flex-col items-center space-y-2">
            {isSuspended ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-600 shadow-sm">
                  <XCircle className="w-9 h-9 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  บัญชีนี้ถูกระงับการใช้งาน
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium text-rose-700 bg-rose-500/10 border border-rose-500/20 dark:text-rose-400">
                  ถูกระงับสิทธิ์ชั่วคราว
                </div>
              </>
            ) : isApproved ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 shadow-sm">
                  <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  เข้าใช้งานได้เรียบร้อย
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 dark:text-emerald-400">
                  ผ่านการยืนยันสิทธิ์แล้ว
                </div>
              </>
            ) : (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 border border-red-500/20 text-red-600 shadow-sm">
                  <AlertOctagon className="w-9 h-9 stroke-[2.2]" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-foreground pt-1">
                  ไม่สามารถเข้าใช้งานได้
                </CardTitle>
                <div className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium text-red-700 bg-red-500/10 border border-red-500/20 dark:text-red-400">
                  อยู่นอกเหนือขอบเขตการให้บริการ
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-0 pt-2 pb-0">
          {/* ข้อมูลบัญชีผู้ใช้ */}
          <div className="rounded-2xl border border-border/80 bg-muted/40 p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">อีเมลที่เข้าสู่ระบบ</span>
              <span className="font-medium text-foreground font-mono">
                {displayEmail}
              </span>
            </div>
            {displayNameVal && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ชื่อผู้ใช้</span>
                <span className="font-medium text-foreground">{displayNameVal}</span>
              </div>
            )}
            {user?.student_id && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">รหัสนักศึกษา</span>
                <span className="font-medium text-foreground font-mono">{user.student_id}</span>
              </div>
            )}
          </div>

          {/* รายละเอียดคำชี้แจง */}
          {isSuspended ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2 text-xs text-foreground leading-relaxed">
              <div className="flex items-center gap-2 font-medium text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>สาเหตุที่ระงับการใช้งาน</span>
              </div>
              <p className="text-muted-foreground leading-relaxed pl-6">
                {user?.suspend_reason || 'บัญชีนี้ถูกพักการใช้งานชั่วคราวเนื่องจากไม่เป็นไปตามข้อตกลงของระบบ'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.03] p-4 space-y-2.5 text-xs leading-relaxed">
              <div className="flex items-center gap-2 font-medium text-red-600 dark:text-red-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>ข้อกำหนดการเข้าใช้งาน</span>
              </div>
              <ul className="space-y-2 text-muted-foreground text-[12px] pl-6 list-disc marker:text-red-500">
                <li>
                  เปิดให้เข้าใช้งานเฉพาะนักศึกษาคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยีที่ใช้อีเมลสถาบัน และมีรหัสคณะ 030 (เช่น 67030xxx) เท่านั้น
                </li>
                <li>
                  สำหรับอาจารย์ผู้สอน ต้องเป็นรายชื่อที่ได้รับการรับรองจากทางคณะ
                </li>
                <li className="text-red-600/90 dark:text-red-400">
                  ระบบไม่เปิดให้ใช้งานสำหรับอีเมลส่วนตัวทั่วไป หรือนักศึกษาจากคณะอื่น
                </li>
              </ul>
            </div>
          )}

          {/* ติดต่อผู้ดูแลระบบ */}
          <div className="rounded-2xl border border-border/80 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-2 text-xs">
            <div className="font-medium text-foreground flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-pink-600" />
              <span>ติดต่อผู้ดูแลระบบ</span>
            </div>
            <div className="space-y-1.5 text-muted-foreground text-[11.5px] pl-5">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="font-mono text-foreground font-medium">
                  {adminInfo?.email || FALLBACK_ADMIN_INFO.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{adminInfo?.telephone || FALLBACK_ADMIN_INFO.telephone}</span>
              </div>
              {(adminInfo?.name || adminInfo?.department) && (
                <div className="pt-0.5 leading-relaxed">
                  {[adminInfo?.name, adminInfo?.department].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* ปุ่มการกระทำ - ออกแบบตาม Material 3 UX Hierarchy */}
          <div className="space-y-2.5 pt-1">
            {isSuspended ? (
              // กรณีระงับบัญชี: Action หลักคือออกจากระบบ และมีปุ่มตรวจสอบสิทธิ์รองเผื่อแอดมินเพิ่งปลดให้
              <>
                <Button
                  type="button"
                  variant="default"
                  onClick={handleLogout}
                  disabled={isChecking || isLoggingOut}
                  className="w-full rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-medium py-5 text-sm shadow-sm transition-all"
                >
                  {isLoggingOut ? (
                    <div className="flex items-center justify-center gap-2">
                      <LoadingSpinner size="sm" />
                      <span>กำลังออกจากระบบ</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <LogOut className="w-4 h-4" />
                      <span>ออกจากระบบ</span>
                    </div>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCheckStatus}
                  disabled={isChecking || isLoggingOut}
                  className="w-full text-xs text-muted-foreground hover:text-foreground h-9 font-normal"
                >
                  {isChecking ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <LoadingSpinner size="sm" />
                      <span>กำลังตรวจสอบข้อมูล</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>ตรวจสอบสถานะบัญชีอีกครั้ง</span>
                    </div>
                  )}
                </Button>
              </>
            ) : (
              // กรณีไม่ได้รับสิทธิ์ (คนนอก): Action ชัดเจนอันเดียวคือ "เข้าสู่ระบบด้วยบัญชีสถาบัน"
              <Button
                type="button"
                variant="default"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-medium py-5 text-sm shadow-sm transition-all"
              >
                {isLoggingOut ? (
                  <div className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span>กำลังออกจากระบบ</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    <span>เข้าสู่ระบบด้วยบัญชีสถาบัน (@kmitl.ac.th)</span>
                  </div>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <PdpaConsentDialog />
    </div>
  )
}
