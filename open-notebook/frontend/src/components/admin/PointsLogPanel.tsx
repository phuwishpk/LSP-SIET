'use client'

/** Where the points went — the per-user history never showed the whole picture. */
import { useState } from 'react'
import { Coins, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePointsLog } from '@/lib/hooks/use-admin'
import { kindLabel, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 1, label: 'วันนี้' },
  { days: 7, label: '7 วัน' },
  { days: 30, label: '30 วัน' },
]

export function PointsLogPanel() {
  const [days, setDays] = useState(7)
  const [kind, setKind] = useState('')
  const { data, isLoading } = usePointsLog({ days, kind })

  const granted = data?.by_kind.reduce((n, k) => n + k.granted, 0) ?? 0
  const spent = data?.by_kind.reduce((n, k) => n + k.spent, 0) ?? 0

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Coins className="h-4 w-4" /> แต้มไหลไปทางไหน
            <div className="ml-auto flex rounded-md border p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition',
                    days === r.days ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </CardTitle>
          <CardDescription className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" /> แจกไป {granted.toLocaleString()} แต้ม
            </span>
            <span className="flex items-center gap-1 text-rose-700 dark:text-rose-400">
              <TrendingDown className="h-3.5 w-3.5" /> ใช้ไป {spent.toLocaleString()} แต้ม
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <Skeleton className="h-24 w-full" />}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setKind('')}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition',
                kind === '' ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent'
              )}
            >
              ทุกประเภท
            </button>
            {data?.by_kind.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => setKind(k.kind === kind ? '' : k.kind)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition',
                  kind === k.kind ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent'
                )}
              >
                {kindLabel(k.kind)} · {k.rows_count}
                {k.spent > 0 && <span className="ml-1 text-rose-600">-{k.spent}</span>}
                {k.granted > 0 && <span className="ml-1 text-emerald-600">+{k.granted}</span>}
              </button>
            ))}
          </div>

          {(data?.top_spenders.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">ใช้แต้มมากที่สุด</p>
              <div className="flex flex-wrap gap-1.5">
                {data?.top_spenders.slice(0, 6).map((u) => (
                  <Badge key={u.id} variant="secondary" className="gap-1 font-normal">
                    {u.display_name || u.username}
                    <span className="text-rose-600">-{u.spent}</span>
                    {u.earned > 0 && <span className="text-emerald-600">+{u.earned}</span>}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">รายการล่าสุด</CardTitle>
          <CardDescription>{data?.items.length ?? 0} รายการ (สูงสุด 200)</CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.items.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีการเคลื่อนไหวของแต้มในช่วงนี้</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="sticky top-0 border-b bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">ผู้ใช้</th>
                    <th className="py-2 pr-3 font-medium">ประเภท</th>
                    <th className="py-2 pr-3 text-right font-medium">แต้ม</th>
                    <th className="py-2 pr-3 text-right font-medium">คงเหลือ</th>
                    <th className="py-2 font-medium">เมื่อ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data?.items.map((row) => (
                    <tr key={row.id}>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium">{row.display_name || row.username}</span>
                        {row.note && <p className="text-[11px] text-muted-foreground">{row.note}</p>}
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-muted-foreground">{kindLabel(row.kind)}</td>
                      <td
                        className={cn(
                          'py-1.5 pr-3 text-right font-medium tabular-nums',
                          row.delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                        )}
                      >
                        {row.delta > 0 ? `+${row.delta}` : row.delta}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {row.balance_after}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">{timeAgo(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
