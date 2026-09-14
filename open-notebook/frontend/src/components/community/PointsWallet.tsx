'use client'

import { Coins, Infinity as InfinityIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useWallet } from '@/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { kindLabel, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

export function PointsWallet({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const { data: wallet, isLoading } = useWallet()
  const exempt = wallet?.exempt ?? user?.points_exempt ?? false
  const balance = wallet?.balance ?? user?.points_balance ?? 0
  const rules = wallet?.rules

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-1.5 rounded-full border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
            compact && 'px-2'
          )}
          aria-label="กระเป๋าแต้ม"
        >
          <Coins className="h-4 w-4" />
          {exempt ? (
            <span className="flex items-center gap-1 text-xs font-semibold">
              <InfinityIcon className="h-3.5 w-3.5" /> {!compact && 'ไม่จำกัด'}
            </span>
          ) : (
            <span className="text-xs font-semibold tabular-nums">
              {balance} {!compact && 'PT'}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Points Wallet</p>
          <div className="mt-1 flex items-end justify-between">
            <p className="text-3xl font-bold tabular-nums">
              {exempt ? '∞' : balance}
              <span className="ml-1 text-base font-medium text-muted-foreground">แต้ม</span>
            </p>
            {exempt && <Badge variant="secondary">อาจารย์/ผู้ดูแล ไม่ถูกตัดแต้ม</Badge>}
          </div>
          {wallet?.stats && (
            <p className="mt-1 text-xs text-muted-foreground">
              ได้รับจากการแชร์/ช่วยเพื่อนรวม +{wallet.stats.earned} แต้ม · โพสต์ {wallet.stats.posts}{' '}
              รายการ
            </p>
          )}
        </div>

        {rules && (
          <div className="border-b p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">อัตราการตัดแต้ม</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <RuleRow label="ถาม RAG AI 1 คำถาม" cost={rules.costs.rag_question} />
              <RuleRow
                label={`เซสชัน RAG ${rules.rag_session_messages} ข้อความ`}
                cost={rules.costs.rag_session}
              />
              <RuleRow label="สร้าง AI Quiz 1 ชุด" cost={rules.costs.quiz_generate} />
              <RuleRow label="สร้าง AI Roadmap 1 แผน" cost={rules.costs.roadmap_generate} />
              <RuleRow label="นำเข้าควิซเพื่อน" cost={rules.costs.quiz_import} />
              <RuleRow label="ดู/บันทึก Roadmap เพื่อน" cost={0} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              แชร์ควิซแล้วเพื่อนเล่นจบ ได้คืน +{rules.cashback_per_play} แต้ม/คน (สูงสุด{' '}
              {rules.cashback_max_per_post}) · แชร์สรุป +{rules.creator_bonus_summary} · ถูกกด
              Helpful +{rules.helpful_bonus}
            </p>
          </div>
        )}

        <div className="p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">ประวัติแต้ม</p>
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
          {!isLoading && (wallet?.history.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">ยังไม่มีรายการ</p>
          )}
          <ScrollArea className="max-h-56">
            <ul className="space-y-1.5 pr-3">
              {wallet?.history.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{kindLabel(tx.kind)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {tx.note || ''} {tx.created_at ? `· ${timeAgo(tx.created_at)}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'ml-2 flex shrink-0 items-center gap-0.5 font-semibold tabular-nums',
                      tx.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {tx.delta >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {tx.delta >= 0 ? '+' : ''}
                    {tx.delta}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RuleRow({ label, cost }: { label: string; cost: number }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold tabular-nums">
        {cost === 0 ? 'ฟรี' : `${cost} แต้ม`}
      </span>
    </>
  )
}
