'use client'

/**
 * Provider usage for the admin console: tokens, estimated cost and the live
 * state of the request queue.
 *
 * Costs are estimates from the server's price list (pricing.py); the invoice is
 * Google Cloud Billing. "Today" and "this month" follow the campus clock.
 */
import { useMemo, useState } from 'react'
import { Activity, Coins, Cpu, Globe2, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { UsageBucket } from '@/lib/api/admin'
import { useAdminUsage, useLlmThrottle } from '@/lib/hooks/use-admin'
import { cn } from '@/lib/utils'

const RANGES = [7, 30, 90] as const

const fmtInt = (n: number) => new Intl.NumberFormat('th-TH').format(Math.round(n))
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : fmtInt(n))
const fmtThb = (n: number) => `฿${new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
const fmtUsd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`

const FEATURE_LABEL: Record<string, string> = {
  ask: 'ถาม RAG AI',
  quiz: 'สร้าง Quiz',
  roadmap: 'สร้าง Roadmap',
  roadmap_expand: 'ขยาย Roadmap',
  ingest: 'ทำดัชนีเอกสาร',
  direct: 'ตอบโดยตรง',
  embedding: 'Embedding',
  chat: 'Chat',
}

export function UsagePanel() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const { data, isLoading } = useAdminUsage(days)
  const { data: gate } = useLlmThrottle()

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  const rate = data.pricing.usd_thb_rate

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ headline numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={Coins}
          label="ค่าใช้จ่ายวันนี้"
          value={fmtThb(data.today.cost_thb)}
          hint={`${fmtUsd(data.today.cost_usd)} · ${fmtInt(data.today.calls)} ครั้ง`}
        />
        <Kpi
          icon={Coins}
          label="ค่าใช้จ่ายเดือนนี้"
          value={fmtThb(data.month.total_cost_thb ?? data.month.cost_thb)}
          hint={
            data.search.cost_usd_this_month > 0
              ? `รวมค้นเว็บ ${fmtUsd(data.search.cost_usd_this_month)}`
              : `${fmtUsd(data.month.total_cost_usd ?? data.month.cost_usd)} · ${fmtInt(data.month.calls)} ครั้ง`
          }
        />
        <Kpi
          icon={Cpu}
          label={`โทเค็น ${days} วัน`}
          value={fmtTokens(data.window.tokens)}
          hint={`เข้า ${fmtTokens(data.window.input_tokens)} · ออก ${fmtTokens(data.window.output_tokens)}`}
        />
        <Kpi
          icon={Globe2}
          label="ค้นเว็บเดือนนี้"
          value={fmtInt(data.search.queries_this_month)}
          hint={`ฟรีเหลือ ${fmtInt(data.search.free_remaining)} จาก ${fmtInt(data.search.free_per_month)}`}
        />
      </div>

      {/* ------------------------------------------------ daily chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            ค่าใช้จ่ายรายวัน
            <span className="text-xs font-normal text-muted-foreground">(ประมาณการ, บาท)</span>
            <div className="ml-auto flex gap-1" role="group" aria-label="ช่วงเวลา">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={days === r}
                  onClick={() => setDays(r)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-xs transition',
                    days === r ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  {r} วัน
                </button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyCostChart rows={data.by_day} days={days} />
        </CardContent>
      </Card>

      {/* ------------------------------------------------ breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          title={`ตามฟีเจอร์ (${days} วัน)`}
          rows={data.by_feature}
          keyOf={(r) => `${r.feature}-${r.kind}`}
          nameOf={(r) => `${FEATURE_LABEL[r.feature ?? ''] ?? r.feature} · ${r.kind === 'embedding' ? 'embedding' : 'chat'}`}
        />
        <BreakdownTable
          title={`ตามโมเดล (${days} วัน)`}
          rows={data.by_model}
          keyOf={(r) => `${r.model}-${r.kind}`}
          nameOf={(r) => `${r.model}${r.estimated ? ' (โทเค็นประมาณ)' : ''}`}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> ผู้ใช้ที่ใช้มากที่สุด ({days} วัน)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.top_users.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">ผู้ใช้</th>
                  <th className="py-1 text-right font-medium">ครั้ง</th>
                  <th className="py-1 text-right font-medium">โทเค็น</th>
                  <th className="py-1 text-right font-medium">บาท</th>
                </tr>
              </thead>
              <tbody>
                {data.top_users.map((u) => (
                  <tr key={u.user_id} className="border-t">
                    <td className="py-1.5">
                      <span className="font-medium">{u.display_name || u.username}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        @{u.username} · {u.role}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmtInt(u.calls)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtTokens(u.tokens)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtThb(u.cost_thb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ live queue */}
      {gate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> คิวเรียก AI (สด)
              <span className="text-xs font-normal text-muted-foreground">
                นับตั้งแต่ API เริ่มทำงาน {Math.round(gate.uptime_s / 60)} นาทีที่แล้ว
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Object.entries(gate.lanes).map(([lane, s]) => (
              <div key={lane} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{lane === 'chat' ? 'Chat' : 'Embedding'}</span>
                  <span className="tabular-nums text-muted-foreground">
                    กำลังทำ {s.in_flight}/{s.limit}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <dt>เรียกทั้งหมด</dt>
                  <dd className="text-right tabular-nums text-foreground">{fmtInt(s.calls)}</dd>
                  <dt>ต้องรอคิว</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {fmtInt(s.waited)} (เฉลี่ย {s.wait_avg_s}s, สูงสุด {s.wait_max_s}s)
                  </dd>
                  <dt>คิวเต็ม (503)</dt>
                  <dd className="text-right tabular-nums text-foreground">{fmtInt(s.queue_timeouts)}</dd>
                  <dt>Google ตอบ 429 แล้วลองใหม่</dt>
                  <dd className="text-right tabular-nums text-foreground">{fmtInt(s.rate_limit_retries)}</dd>
                  <dt>ยอมแพ้หลังลองใหม่</dt>
                  <dd className="text-right tabular-nums text-foreground">{fmtInt(s.rate_limit_failures)}</dd>
                </dl>
              </div>
            ))}
            {Object.keys(gate.lanes).length === 0 && (
              <p className="text-sm text-muted-foreground">ยังไม่มีการเรียก AI ตั้งแต่ API เริ่มทำงาน</p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {data.note} · อัตราแลกเปลี่ยน {rate} บาท/ดอลลาร์ (ตั้งค่าได้ด้วย USD_THB_RATE) · ราคาจาก{' '}
        <a href={data.pricing.source} target="_blank" rel="noopener noreferrer" className="underline">
          ตารางราคา Gemini
        </a>
      </p>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function BreakdownTable({
  title,
  rows,
  keyOf,
  nameOf,
}: {
  title: string
  rows: UsageBucket[]
  keyOf: (r: UsageBucket) => string
  nameOf: (r: UsageBucket) => string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">รายการ</th>
                <th className="py-1 text-right font-medium">ครั้ง</th>
                <th className="py-1 text-right font-medium">เข้า</th>
                <th className="py-1 text-right font-medium">ออก</th>
                <th className="py-1 text-right font-medium">บาท</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={keyOf(r)} className="border-t">
                  <td className="py-1.5">{nameOf(r)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtInt(r.calls)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtTokens(r.input_tokens)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtTokens(r.output_tokens)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtThb(r.cost_thb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One series (cost per day) as thin rounded bars on a recessive baseline, with a
 * hover tooltip and a table view underneath. No legend: the title names the series.
 */
function DailyCostChart({ rows, days }: { rows: UsageBucket[]; days: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const series = useMemo(() => {
    // every day of the range, zero-filled, so gaps are visible as gaps
    const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]))
    const out: { day: string; label: string; cost: number; calls: number; tokens: number }[] = []
    const end = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(end.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const r = byDay.get(key)
      out.push({
        day: key,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        cost: r?.cost_thb ?? 0,
        calls: r?.calls ?? 0,
        tokens: r?.tokens ?? 0,
      })
    }
    return out
  }, [rows, days])

  const W = 720
  const H = 180
  const padL = 44
  const padB = 22
  const padT = 10
  const plotW = W - padL - 8
  const plotH = H - padT - padB
  const max = Math.max(0.01, ...series.map((s) => s.cost))
  const step = plotW / series.length
  const barW = Math.max(3, Math.min(18, step - 2)) // >= 2px gap between bars
  const ticks = [0, max / 2, max]
  // tick precision follows the scale: ฿0.08 days need two decimals, ฿120 days none
  const decimals = max >= 100 ? 0 : max >= 10 ? 1 : max >= 1 ? 1 : 2
  const fmtTick = (t: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(t)
  const maxIdx = series.reduce((best, s, i) => (s.cost > series[best].cost ? i : best), 0)
  const total = series.reduce((a, s) => a + s.cost, 0)

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`ค่าใช้จ่ายรายวัน ${days} วัน รวม ${fmtThb(total)}`}>
          {ticks.map((t, i) => {
            const y = padT + plotH - (t / max) * plotH
            return (
              <g key={i}>
                <line x1={padL} x2={W - 8} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
                <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {fmtTick(t)}
                </text>
              </g>
            )
          })}
          {series.map((s, i) => {
            const h = (s.cost / max) * plotH
            const x = padL + i * step + (step - barW) / 2
            const y = padT + plotH - h
            const r = Math.min(4, barW / 2, h)
            const active = hover === i
            return (
              <g key={s.day}>
                {/* hit target wider than the bar */}
                <rect
                  x={padL + i * step}
                  y={padT}
                  width={step}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
                {h > 0 && (
                  <path
                    d={`M${x},${y + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} h-${barW} z`}
                    // the bar sits above its hit rect: let the pointer fall through so
                    // hovering the bar itself still opens the tooltip
                    className={cn('pointer-events-none fill-violet-500 dark:fill-violet-400', active && 'fill-violet-700 dark:fill-violet-300')}
                  />
                )}
                {(i === maxIdx && s.cost > 0) && !active && (
                  <text x={x + barW / 2} y={y - 4} textAnchor="middle" className="pointer-events-none fill-foreground text-[10px]">
                    {fmtThb(s.cost)}
                  </text>
                )}
                {(series.length <= 14 || i % Math.ceil(series.length / 10) === 0) && (
                  <text x={padL + i * step + step / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {s.label}
                  </text>
                )}
              </g>
            )
          })}
          <line x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} className="stroke-border" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2 py-1 text-xs shadow"
            style={{ left: `${Math.min(85, (padL + hover * step) / W * 100)}%` }}
          >
            <div className="font-medium">{series[hover].day}</div>
            <div className="tabular-nums text-muted-foreground">
              {fmtThb(series[hover].cost)} · {fmtInt(series[hover].calls)} ครั้ง · {fmtTokens(series[hover].tokens)} โทเค็น
            </div>
          </div>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">ดูเป็นตาราง</summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">วัน</th>
              <th className="py-1 text-right font-medium">ครั้ง</th>
              <th className="py-1 text-right font-medium">โทเค็น</th>
              <th className="py-1 text-right font-medium">บาท</th>
            </tr>
          </thead>
          <tbody>
            {series.filter((s) => s.calls > 0).map((s) => (
              <tr key={s.day} className="border-t">
                <td className="py-1">{s.day}</td>
                <td className="py-1 text-right tabular-nums">{fmtInt(s.calls)}</td>
                <td className="py-1 text-right tabular-nums">{fmtTokens(s.tokens)}</td>
                <td className="py-1 text-right tabular-nums">{fmtThb(s.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
