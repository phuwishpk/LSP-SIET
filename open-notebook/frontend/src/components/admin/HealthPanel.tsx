'use client'

/** "Is the workspace able to work?" — the checks behind "the AI does not answer". */
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemHealth } from '@/lib/hooks/use-admin'
import { cn } from '@/lib/utils'

export function HealthPanel() {
  const { data, isLoading, refetch, isFetching } = useSystemHealth()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          สถานะระบบ
          {data && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                data.healthy
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
              )}
            >
              {data.healthy ? 'พร้อมใช้งาน' : 'มีปัญหา'}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="ตรวจใหม่"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </CardTitle>
        <CardDescription>ตรวจทุก 1 นาที · ถ้าข้อไหนแดง ฟีเจอร์ AI จะใช้ไม่ได้</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {data && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.checks.map((c) => (
                <div
                  key={c.name}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-2.5 text-sm',
                    !c.ok && 'border-destructive/50 bg-destructive/5'
                  )}
                >
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{c.label}</p>
                    <p className="break-words text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile
                label="เอกสารล้มเหลว"
                value={data.content.failed_documents}
                warn={data.content.failed_documents > 0}
                hint="กด retry ในหน้าคลังความรู้"
              />
              <Tile label="กำลังประมวลผล" value={data.content.processing_documents} />
              <Tile label="โพสต์ที่ซ่อนไว้" value={data.content.deleted_posts} hint="กู้คืนได้ในแท็บเนื้อหา" />
              <Tile
                label="ห้องไม่มีเจ้าของ"
                value={data.content.ownerless_rooms}
                warn={data.content.ownerless_rooms > 0}
                hint="อาจารย์จะแก้ไขห้องเหล่านี้ไม่ได้"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Tile({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: number
  hint?: string
  warn?: boolean
}) {
  return (
    <div className={cn('rounded-lg border p-2.5', warn && 'border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20')}>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {warn && <AlertTriangle className="h-3 w-3 text-amber-600" />}
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && value > 0 && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
