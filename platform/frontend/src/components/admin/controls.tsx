/** Small controls the admin consoles repeat: a segmented filter, a pager, a range picker. */
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const VISIBILITY_OPTIONS = [
  { value: 'visible', label: 'แสดงอยู่' },
  { value: 'deleted', label: 'ซ่อนไว้' },
  { value: 'all', label: 'ทั้งหมด' },
] as const

export type Visibility = (typeof VISIBILITY_OPTIONS)[number]['value']

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  /** What the choice is about, for screen readers. */
  label: string
  className?: string
}) {
  return (
    <div className={cn('flex w-fit rounded-md border p-0.5', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'whitespace-nowrap rounded-sm px-2.5 py-1 text-xs transition',
            value === option.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Pager({
  offset,
  pageSize,
  total,
  onChange,
}: {
  offset: number
  pageSize: number
  total: number
  onChange: (offset: number) => void
}) {
  const pages = Math.ceil(total / pageSize)
  const page = Math.floor(offset / pageSize)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between text-sm">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(offset - pageSize)}>
        ก่อนหน้า
      </Button>
      <span className="text-muted-foreground">
        หน้า {page + 1} จาก {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => onChange(offset + pageSize)}>
        ถัดไป
      </Button>
    </div>
  )
}

const RANGES = [7, 30, 90]

/** The window every statistics tab is read over. */
export function RangeSelect({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">ช่วงเวลา</span>
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="ช่วงเวลา"
      >
        {RANGES.map((range) => (
          <option key={range} value={range}>
            {range} วันล่าสุด
          </option>
        ))}
      </select>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>
  )
}
