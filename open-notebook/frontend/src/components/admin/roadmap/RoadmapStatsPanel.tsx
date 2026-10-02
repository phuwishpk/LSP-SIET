'use client'

/**
 * How much the roadmap feature is used: headline numbers, new roadmaps per day,
 * what they were grounded on, and the most followed shared plans.
 *
 * One hue for magnitude, thin columns with a 2px gap, values in text colour,
 * a hover/focus readout and a table view so nothing depends on hovering or on
 * colour.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Coins, Footprints, GitBranch, Map as MapIcon, Share2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminRoadmapStats } from '@/lib/hooks/use-admin'
import type { AdminRoadmapStats } from '@/lib/api/admin'
import { displayName } from '@/lib/utils/community-format'

const RANGES = [7, 30, 90]
// Series colour: validated against the light and dark card surfaces.
const BAR = 'bg-[#2a78d6] dark:bg-[#3987e5]'

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

interface Bucket {
  key: string
  label: string
  count: number
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * One column per day, including the days with nothing created. Past a month
 * the days are grouped by week (ending today) so the columns stay readable.
 */
function buildSeries(days: number, rows: AdminRoadmapStats['per_day']): { buckets: Bucket[]; weekly: boolean } {
  const counts = new Map(rows.map((row) => [row.day, row.count]))
  const daily: Bucket[] = []
  const today = new Date()
  for (let back = days - 1; back >= 0; back -= 1) {
    const key = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back))
    daily.push({ key, label: dayLabel(key), count: counts.get(key) ?? 0 })
  }
  if (days <= 31) return { buckets: daily, weekly: false }

  const weeks: Bucket[] = []
  for (let end = daily.length; end > 0; end -= 7) {
    const chunk = daily.slice(Math.max(0, end - 7), end)
    weeks.unshift({
      key: chunk[0].key,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      count: chunk.reduce((sum, item) => sum + item.count, 0),
    })
  }
  return { buckets: weeks, weekly: true }
}

/** A round axis maximum just above the data (1, 2, 5, 10, 20, 50 ...). */
function niceMax(value: number) {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 5, 10]) if (value <= step * power) return step * power
  return 10 * power
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function CreatedColumns({ days, rows }: { days: number; rows: AdminRoadmapStats['per_day'] }) {
  const { buckets, weekly } = useMemo(() => buildSeries(days, rows), [days, rows])
  const [active, setActive] = useState<number | null>(null)
  const total = buckets.reduce((sum, item) => sum + item.count, 0)
  const top = niceMax(Math.max(...buckets.map((item) => item.count)))
  const ticks = [top, top / 2, 0]
  const focus = active !== null ? buckets[active] : null
  const withData = rows.filter((row) => row.count > 0)

  return (
    <div className="space-y-2">
      <p className="text-sm" aria-live="polite">
        {focus ? (
          <>
            <span className="font-semibold">{focus.count.toLocaleString()} แผน</span>{' '}
            <span className="text-muted-foreground">· {focus.label}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{total.toLocaleString()} แผน</span>{' '}
            <span className="text-muted-foreground">
              ใน {days} วันล่าสุด · ชี้ที่แท่งเพื่อดู{weekly ? 'รายสัปดาห์' : 'รายวัน'}
            </span>
          </>
        )}
      </p>

      <div className="flex gap-2 pt-1">
        <div className="relative h-40 w-6 text-[10px] tabular-nums text-muted-foreground">
          {ticks.map((tick, index) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            >
              {tick.toLocaleString()}
            </span>
          ))}
        </div>
        <div className="relative h-40 min-w-0 flex-1">
          {ticks.map((tick, index) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t border-border"
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-between gap-[2px]" onMouseLeave={() => setActive(null)}>
            {buckets.map((item, index) => (
              <button
                key={item.key}
                type="button"
                aria-label={`${item.label}: ${item.count} แผน`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 max-w-6 flex-1 items-end focus-visible:outline-none"
              >
                <span
                  className={`block w-full rounded-t-[4px] ${BAR} group-hover:opacity-70 group-focus-visible:ring-2 group-focus-visible:ring-ring`}
                  style={{ height: `${(item.count / top) * 100}%`, minHeight: item.count > 0 ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between pl-8 text-[10px] text-muted-foreground">
        <span>{dayLabel(buckets[0].key)}</span>
        <span>วันนี้</span>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">ดูเป็นตาราง</summary>
        {withData.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ไม่มี Roadmap ที่สร้างในช่วงนี้</p>
        ) : (
          <table className="mt-2 w-full max-w-xs text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">วัน</th>
                <th className="py-1 text-right font-medium">Roadmap ที่สร้าง</th>
              </tr>
            </thead>
            <tbody>
              {withData.map((row) => (
                <tr key={row.day} className="border-t">
                  <td className="py-1">{dayLabel(row.day)}</td>
                  <td className="py-1 text-right tabular-nums">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  )
}

function GroundingBars({ grounding }: { grounding: AdminRoadmapStats['grounding'] }) {
  const rows = [
    { label: 'คลังความรู้', value: grounding.library },
    { label: 'คลังความรู้ + เว็บ', value: grounding.library_web },
    { label: 'เว็บ', value: grounding.web },
    { label: 'ความรู้ทั่วไปของ AI', value: grounding.none },
  ]
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[9.5rem_1fr] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <div className="flex items-center gap-2">
            <span
              className={`block h-3 rounded-r-[4px] ${BAR}`}
              style={{ width: `${(row.value / max) * 85}%`, minWidth: row.value > 0 ? 4 : 0 }}
            />
            <span className="tabular-nums">{row.value.toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RoadmapStatsPanel() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useAdminRoadmapStats(days)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">ช่วงเวลา</span>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          aria-label="ช่วงเวลา"
        >
          {RANGES.map((range) => (
            <option key={range} value={range}>
              {range} วันล่าสุด
            </option>
          ))}
        </select>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile icon={MapIcon} label="Roadmap ทั้งหมดในระบบ" value={data.total} />
            <StatTile icon={Sparkles} label={`สร้างใน ${data.days} วัน`} value={data.generated} />
            <StatTile icon={Footprints} label={`เดินตามใน ${data.days} วัน`} value={data.followed} hint={`ยอดเดินตามสะสม ${data.follows.toLocaleString()}`} />
            <StatTile icon={Share2} label="โพสต์ Roadmap ในฟีด" value={data.shared_posts} />
            <StatTile icon={Coins} label={`แต้มที่ใช้ใน ${data.days} วัน`} value={data.points_spent} hint="หักคืนแต้มที่ refund แล้ว" />
            <StatTile icon={GitBranch} label={`ขยายด่านใน ${data.days} วัน`} value={data.expansions} hint="นับจากรายการหักแต้ม (ไม่รวมอาจารย์/ผู้ดูแล)" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Roadmap ที่สร้างต่อ{data.days > 31 ? 'สัปดาห์' : 'วัน'}
              </CardTitle>
              <CardDescription>นับเฉพาะที่ผู้ใช้สร้างเอง ไม่รวมสำเนาจากการเดินตาม</CardDescription>
            </CardHeader>
            <CardContent>
              <CreatedColumns days={data.days} rows={data.per_day} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">อ้างอิงจากอะไร</CardTitle>
                <CardDescription>Roadmap ที่สร้างใน {data.days} วัน แยกตามแหล่งที่ใช้</CardDescription>
              </CardHeader>
              <CardContent>
                <GroundingBars grounding={data.grounding} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Roadmap ที่มีคนเดินตามมากที่สุด</CardTitle>
                <CardDescription>จากโพสต์ที่ยังแสดงอยู่ในฟีด</CardDescription>
              </CardHeader>
              <CardContent>
                {data.top_followed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มี Roadmap ที่แชร์ในฟีด</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {data.top_followed.map((post, index) => (
                      <li key={post.id} className="flex items-baseline gap-2">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/community?post=${post.id}`} target="_blank" className="font-medium hover:underline">
                            {post.title || '(ไม่มีหัวข้อ)'}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {displayName(post.author)} · {post.node_count} ด่าน
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{post.counts.follow} คน</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
