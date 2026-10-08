'use client'

/**
 * The two charts the admin consoles share: something counted per day, and a
 * handful of categories compared by size.
 *
 * One hue for magnitude, thin columns with a 2px gap, values in text colour, a
 * hover/focus readout and a table view so nothing depends on hovering or on
 * colour. `tone` follows the theme: purple for the AI consoles, ink for the
 * community one.
 */
import { useMemo, useState } from 'react'
import type { DayCount } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

export type ChartTone = 'ai' | 'neutral'

const FILL: Record<ChartTone, string> = { ai: 'bg-ai', neutral: 'bg-primary' }

export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

interface Bucket {
  key: string
  label: string
  count: number
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * One column per day, including the days with nothing counted. Past a month
 * the days are grouped by week (ending today) so the columns stay readable.
 */
function buildSeries(days: number, rows: DayCount[]): { buckets: Bucket[]; weekly: boolean } {
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

export function DailyColumns({
  days,
  rows,
  unit,
  tableHeading,
  emptyLabel,
  tone = 'ai',
}: {
  days: number
  rows: DayCount[]
  /** What one count is, e.g. "แผน" or "คำถาม". */
  unit: string
  /** Column heading of the table view. */
  tableHeading: string
  emptyLabel: string
  tone?: ChartTone
}) {
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
            <span className="font-semibold">
              {focus.count.toLocaleString()} {unit}
            </span>{' '}
            <span className="text-muted-foreground">· {focus.label}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">
              {total.toLocaleString()} {unit}
            </span>{' '}
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
                aria-label={`${item.label}: ${item.count} ${unit}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 max-w-6 flex-1 items-end focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'block w-full rounded-t-[4px] group-hover:opacity-70 group-focus-visible:ring-2 group-focus-visible:ring-ring',
                    FILL[tone]
                  )}
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
          <p className="mt-2 text-muted-foreground">{emptyLabel}</p>
        ) : (
          <table className="mt-2 w-full max-w-xs text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">วัน</th>
                <th className="py-1 text-right font-medium">{tableHeading}</th>
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

/** A few categories compared by size; every bar carries its value, so no axis. */
export function BarList({
  rows,
  tone = 'ai',
}: {
  rows: { label: string; value: number }[]
  tone?: ChartTone
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[9.5rem_1fr] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <div className="flex items-center gap-2">
            <span
              className={cn('block h-3 rounded-r-[4px]', FILL[tone])}
              style={{ width: `${(row.value / max) * 85}%`, minWidth: row.value > 0 ? 4 : 0 }}
            />
            <span className="tabular-nums">{row.value.toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
