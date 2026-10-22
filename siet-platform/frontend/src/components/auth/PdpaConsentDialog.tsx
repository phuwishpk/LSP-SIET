'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  LockKeyhole,
  UserCheck,
  FileText,
  LogOut,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/stores/auth-store'

export function PdpaConsentDialog() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const acceptPdpaConsent = useAuthStore((s) => s.acceptPdpaConsent)
  const logout = useAuthStore((s) => s.logout)

  const [hasAgreed, setHasAgreed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showFullTerms, setShowFullTerms] = useState(false)

  // กำหนดให้แสดงเฉพาะบทบาทอาจารย์และนักศึกษาเท่านั้น (ยกเว้นผู้ดูแลระบบ Admin)
  const isTargetRole = user?.role === 'student' || user?.role === 'teacher'
  const isOpen = Boolean(isAuthenticated && user && isTargetRole && !user.pdpa_consented_at)

  if (!isOpen) {
    return null
  }

  const handleAccept = async () => {
    if (!hasAgreed) return
    setIsSubmitting(true)
    try {
      const success = await acceptPdpaConsent()
      if (success) {
        toast.success('บันทึกความยินยอมการประมวลผลข้อมูลส่วนบุคคลเรียบร้อยแล้ว')
      } else {
        toast.error('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      }
    } catch {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async () => {
    setIsSubmitting(true)
    try {
      await logout()
      toast.info('ท่านได้ปฏิเสธความยินยอม ระบบทำการออกจากระบบเรียบร้อยแล้ว')
      router.replace('/login')
    } catch {
      router.replace('/login')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl border border-pink-500/20 bg-background/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
      >
        {/* ส่วนหัวแบบทางการ */}
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pink-500/10 text-pink-600 ring-1 ring-pink-500/20 dark:bg-pink-500/20 dark:text-pink-400">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                หนังสือขอความยินยอมในการประมวลผลข้อมูลส่วนบุคคล
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-pink-600/90 dark:text-pink-400">
                พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 · คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง
              </DialogDescription>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground pt-1">
            เนื่องจากท่านได้ลงชื่อเข้าใช้งานด้วยบัญชีสถาบันผ่าน Google Workspace ทางระบบจึงได้รับข้อมูลพื้นฐานเพื่อการระบุตัวตน ขอความกรุณาตรวจสอบรายละเอียดและให้ความยินยอมก่อนเริ่มเข้าใช้งานระบบ
          </p>
        </DialogHeader>

        {/* การ์ดสรุปสาระสำคัญแบบทางการ */}
        <div className="mt-2 space-y-3">
          <div className="rounded-2xl border border-pink-500/15 bg-gradient-to-br from-pink-500/5 via-transparent to-transparent p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
                <UserCheck className="h-4 w-4" />
              </span>
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-foreground">
                  รายการข้อมูลส่วนบุคคลที่ได้รับจาก Google Workspace
                </h4>
                <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <p>• ชื่อและนามสกุลของผู้ใช้งาน พร้อมทั้งที่อยู่อีเมลสถาบัน {user?.email && `(${user.email})`}</p>
                  <p>• ภาพถ่ายโปรไฟล์สำหรับแสดงผลบัญชีผู้ใช้งานภายในระบบ</p>
                  <p>• รหัสประจำตัวนักศึกษา สำหรับการจัดสรรสิทธิ์ตามหลักสูตรคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                <LockKeyhole className="h-4 w-4" />
              </span>
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-foreground">
                  วัตถุประสงค์และความมั่นคงปลอดภัยของข้อมูล
                </h4>
                <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <p>• ใช้สำหรับการตรวจสอบสิทธิ์และกำหนดบทบาทการใช้งานภายในระบบอย่างถูกต้อง</p>
                  <p>• ให้บริการแพลตฟอร์มการเรียนรู้ สังคมวิชาการ ระบบแบบทดสอบความรู้ และแผนการเรียนรู้</p>
                  <p>• ระบบไม่มีนโยบายการจัดเก็บรหัสผ่าน และไม่มีการเปิดเผยข้อมูลแก่บุคคลภายนอกเพื่อประโยชน์ทางการค้า</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-foreground">
                  สิทธิของเจ้าของข้อมูลส่วนบุคคลตามกฎหมาย
                </h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  เจ้าของข้อมูลมีสิทธิขอเข้าถึง ขอรับสำเนา ขอแก้ไข หรือขอให้ระงับการประมวลผลข้อมูลส่วนบุคคลของตนได้ตามที่พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคลกำหนด โดยสามารถยื่นคำร้องผ่านผู้ดูแลระบบของคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ส่วนขยายอ่านนโยบายฉบับเต็ม */}
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowFullTerms((prev) => !prev)}
            className="group flex items-center gap-2 text-xs font-medium text-pink-600 transition-colors hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300"
          >
            <FileText className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
            <span>{showFullTerms ? 'ซ่อนข้อกำหนดและนโยบายความเป็นส่วนตัวฉบับเต็ม' : 'อ่านข้อกำหนดและนโยบายความเป็นส่วนตัวฉบับเต็ม'}</span>
            {showFullTerms ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showFullTerms && (
            <div className="mt-3 max-h-48 space-y-2.5 overflow-y-auto rounded-2xl border border-border/80 bg-muted/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">ข้อกำหนดและเงื่อนไขการคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)</p>
              <p>
                ข้อที่ 1 ผู้ควบคุมข้อมูลส่วนบุคคล หมายถึง คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง
              </p>
              <p>
                ข้อที่ 2 ฐานความชอบธรรมตามกฎหมาย การประมวลผลข้อมูลนี้ดำเนินการภายใต้ฐานความยินยอมและความจำเป็นเพื่อการปฏิบัติตามพันธกิจการให้บริการระบบสนับสนุนการศึกษา
              </p>
              <p>
                ข้อที่ 3 ระยะเวลาการจัดเก็บข้อมูล ระบบจะจัดเก็บข้อมูลส่วนบุคคลตลอดระยะเวลาที่บัญชีผู้ใช้งานยังคงสถานะเปิดใช้งานเพื่อการศึกษา และจะดำเนินการทำลายหรือลบข้อมูลเมื่อพ้นสภาพหรือได้รับการร้องขอ
              </p>
              <p>
                ข้อที่ 4 มาตรการรักษาความมั่นคงปลอดภัย ข้อมูลได้รับการปกป้องด้วยมาตรฐานการเข้ารหัสทางเทคนิคและจำกัดการเข้าถึงเฉพาะบุคลากรที่ได้รับมอบหมายตามอำนาจหน้าที่
              </p>
            </div>
          )}
        </div>

        {/* ช่องทางเลือกยินยอม */}
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-pink-500/25 bg-pink-500/5 p-4 transition-colors">
          <input
            id="pdpa-consent-agree"
            type="checkbox"
            checked={hasAgreed}
            onChange={(e) => setHasAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-md border-pink-400 text-pink-600 focus:ring-pink-500 focus:ring-offset-background dark:border-pink-600"
          />
          <label htmlFor="pdpa-consent-agree" className="cursor-pointer text-xs leading-relaxed text-foreground select-none">
            ข้าพเจ้าได้อ่านและเข้าใจข้อกำหนดการคุ้มครองข้อมูลส่วนบุคคลข้างต้นอย่างครบถ้วน และ<strong>ยินยอมให้คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง จัดเก็บ รวบรวม และประมวลผลข้อมูลส่วนบุคคล</strong>ของข้าพเจ้าตามวัตถุประสงค์ที่ระบุไว้
          </label>
        </div>

        {/* ปุ่มการกระทำ */}
        <DialogFooter className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={handleDecline}
            disabled={isSubmitting}
            className="h-10 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            ปฏิเสธและออกจากระบบ
          </Button>

          <Button
            type="button"
            onClick={handleAccept}
            disabled={!hasAgreed || isSubmitting}
            className="h-10 rounded-xl bg-pink-600 px-6 text-xs font-semibold text-white shadow-md shadow-pink-600/20 transition-all hover:bg-pink-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'กำลังบันทึกข้อมูล…' : 'ยินยอมและเริ่มใช้งาน'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
