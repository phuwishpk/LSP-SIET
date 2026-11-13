import { Heart, MessageCircle, Repeat2 } from 'lucide-react'

/** Likes, comments and shares of a post, as line icons. */
export function PostCounts({ counts }: { counts: { like: number; comment: number; share: number } }) {
  const items = [
    { icon: Heart, label: 'ถูกใจ', value: counts.like },
    { icon: MessageCircle, label: 'ความคิดเห็น', value: counts.comment },
    { icon: Repeat2, label: 'แชร์', value: counts.share },
  ]
  return (
    <span className="inline-flex items-center gap-2 align-middle tabular-nums">
      {items.map(({ icon: Icon, label, value }) => (
        <span key={label} className="inline-flex items-center gap-0.5" title={label}>
          <Icon className="h-3 w-3" aria-hidden />
          <span className="sr-only">{label}</span>
          {value}
        </span>
      ))}
    </span>
  )
}
