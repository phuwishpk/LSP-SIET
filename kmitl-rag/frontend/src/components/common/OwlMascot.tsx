import Image from 'next/image'
import { cn } from '@/lib/utils'

export type OwlState = 'idle' | 'thinking'

const SRC: Record<OwlState, string> = {
  idle: '/mascot/owl-idle.png',
  thinking: '/mascot/owl-thinking.png',
}

const ALT: Record<OwlState, string> = {
  idle: 'น้องฮูก ผู้ช่วย AI',
  thinking: 'น้องฮูกกำลังคิดคำตอบ',
}

interface OwlMascotProps {
  /** `idle` once an answer is in (or before any question); `thinking` while the AI works. */
  state?: OwlState
  /** Rendered width and height in px. */
  size?: number
  className?: string
}

/**
 * The SIET owl that fronts the AI assistant. The thinking pose bobs gently
 * (only when the visitor has not asked for reduced motion).
 */
export function OwlMascot({ state = 'idle', size = 40, className }: OwlMascotProps) {
  return (
    <Image
      src={SRC[state]}
      alt={ALT[state]}
      width={size}
      height={size}
      priority={false}
      data-state={state}
      // pinned in CSS too: as a flex-row child the preflight `height: auto` lets it stretch
      style={{ width: size, height: size }}
      className={cn(
        'shrink-0 select-none self-start',
        state === 'thinking' && 'motion-safe:animate-[owl-think_1.6s_ease-in-out_infinite]',
        className
      )}
    />
  )
}
