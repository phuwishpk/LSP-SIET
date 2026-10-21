'use client'

import {
  BookOpenCheck,
  Check,
  Coins,
  FileText,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useWallet } from '@/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { cn } from '@/lib/utils'

const COMMUNITY_RULES = [
  {
    icon: ShieldCheck,
    title: 'ความซื่อสัตย์ทางวิชาการและการแชร์อย่างถูกต้อง',
    description:
      'แบ่งปันความรู้อย่างรับผิดชอบ ตรวจสอบข้อเท็จจริง อ้างอิงแหล่งที่มา และเคารพสิทธิ์ของเจ้าของผลงาน ไม่ใช้หรือคัดลอกงานของผู้อื่นโดยไม่ได้รับอนุญาต',
  },
  {
    icon: HeartHandshake,
    title: 'การอภิปรายอย่างสุภาพและมีประโยชน์',
    description:
      'ให้ความคิดเห็นที่ใส่ใจและมุ่งเน้นการเรียนรู้ เคารพความเห็นที่แตกต่าง ไม่โจมตีบุคคล ใช้ถ้อยคำสร้างสรรค์ และช่วยกันสร้างพื้นที่ที่ทุกคนกล้าถาม',
  },
  {
    icon: LockKeyhole,
    title: 'การอัปโหลดเนื้อหาที่เหมาะสม',
    description:
      'อัปโหลดเฉพาะเนื้อหาที่มีสิทธิ์ใช้งาน ไม่ละเมิดลิขสิทธิ์หรือความเป็นส่วนตัว และไม่เผยแพร่ข้อสอบลับหรือข้อมูลที่เจ้าของไม่ได้อนุญาตให้แบ่งปัน',
  },
]

export function CommunityRulesContent() {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">กฎชุมชนและมารยาท</h1>
            <p className="text-xs text-muted-foreground">กฎระเบียบและมารยาทชุมชน</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          หลักการร่วมกันเพื่อการเรียนรู้ด้วยกันที่ดีขึ้น
        </p>
      </header>

      <div className="space-y-3">
        {COMMUNITY_RULES.map(({ icon: Icon, title, description }) => (
          <Card
            key={title}
            className="rounded-2xl border-pink-100/80 bg-white shadow-none transition-shadow hover:shadow-sm dark:bg-card"
          >
            <CardContent className="flex items-start gap-3 p-4 sm:p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold leading-relaxed">{title}</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-pink-100 bg-pink-50 px-4 py-4 text-foreground">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-pink-200 text-pink-700">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-xs font-medium leading-relaxed">
          การเข้าร่วมกิจกรรมช่วยให้พื้นที่ SIET Space ยังคงมีประโยชน์และปลอดภัยสำหรับนักเรียนทุกคน
        </p>
      </div>
    </div>
  )
}

export function CommunityCreditsPanel({ className }: { className?: string }) {
  const user = useAuthStore((state) => state.user)
  const { data: wallet, isLoading, isError } = useWallet()
  const rules = wallet?.rules
  const balance = wallet?.balance ?? user?.points_balance
  const exempt = wallet?.exempt ?? user?.points_exempt ?? false

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="rounded-2xl border-pink-100/80 bg-white shadow-none dark:bg-card">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-pink-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold">สรุปเครดิต</h2>
          </div>
          <div>
            <p className="mb-2 text-[11px] text-muted-foreground">ยอดเครดิตปัจจุบัน</p>
            <span className="inline-flex items-center gap-2 rounded-full bg-pink-100 px-3 py-1.5 text-sm font-semibold text-pink-800">
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              {isLoading && balance === undefined
                ? 'กำลังโหลด…'
                : exempt
                  ? 'ไม่จำกัด'
                  : `${balance ?? 0} เครดิต`}
            </span>
          </div>
          {isError && (
            <p role="alert" className="text-xs text-destructive">
              โหลดข้อมูลเครดิตไม่สำเร็จ กำลังแสดงยอดล่าสุดที่มี
            </p>
          )}
          <div className="space-y-0.5">
            <div className="flex justify-between pb-2 text-[10px] text-muted-foreground">
              <span>เครื่องมือ AI</span>
              <span>อัตราการใช้งาน</span>
            </div>
            {isLoading && !rules ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
            ) : rules ? (
              <>
                <CreditRate label="RAG AI" amount={rules.costs.rag_question} />
                <CreditRate label="แบบทดสอบ AI" amount={rules.costs.quiz_generate} />
                <CreditRate label="แผนการเรียน AI" amount={rules.costs.roadmap_generate} />
              </>
            ) : (
              <p className="py-2 text-xs text-muted-foreground">ยังไม่มีข้อมูลอัตราการใช้งาน</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-pink-100/80 bg-white shadow-none dark:bg-card">
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="text-sm font-semibold">วิธีได้รับเครดิต</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              คืนกำไรให้ชุมชนและเพิ่มยอดเครดิตของคุณ
            </p>
          </div>
          {rules ? (
            <div className="space-y-3">
              <EarnCredit
                icon={FileText}
                title="แบ่งปันบันทึกย่อที่ผ่านการตรวจสอบ"
                amount={rules.creator_bonus_summary}
                description="แบ่งปันเนื้อหาที่เป็นประโยชน์และมีแหล่งอ้างอิงที่ผ่านการตรวจสอบ"
              />
              <EarnCredit
                icon={MessageCircle}
                title="เขียนคำตอบที่มีประโยชน์"
                amount={rules.helpful_bonus}
                description="ช่วยเพื่อนเรียนรู้ผ่านคำตอบและคำอธิบายที่เป็นประโยชน์"
              />
              <EarnCredit
                icon={BookOpenCheck}
                title="แบ่งปันเนื้อหาลงฟีด"
                amount={rules.post_bonus}
                description="เริ่มต้นแบ่งปันความรู้กับสมาชิกในชุมชน"
              />
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <p role="alert" className="text-xs text-destructive">
              โหลดกติกาการได้รับเครดิตไม่สำเร็จ
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CreditRate({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between border-t border-pink-100 py-2 text-xs">
      <span>{label}</span>
      <span className="font-medium tabular-nums">
        {amount === 0 ? 'ฟรี' : `${amount} เครดิต`}
      </span>
    </div>
  )
}

function EarnCredit({
  icon: Icon,
  title,
  amount,
  description,
}: {
  icon: typeof FileText
  title: string
  amount: number
  description: string
}) {
  return (
    <div className="border-t border-pink-100 pt-3 first:border-0 first:pt-0">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-medium leading-relaxed">{title}</p>
          <p className="mt-1 text-[11px] font-medium text-pink-600">+{amount} เครดิต</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  )
}
