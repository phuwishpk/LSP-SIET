import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * One headline number. `accent` marks the tiles about AI usage or credits, the
 * only things the admin theme colours purple.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  hint?: string
  accent?: boolean
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={cn('h-4 w-4 shrink-0', accent ? 'text-ai' : 'text-subtle-foreground')} /> {label}
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
