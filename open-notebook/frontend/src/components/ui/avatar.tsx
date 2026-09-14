'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  name?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
}

const PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-amber-500',
]

function initials(name?: string | null) {
  const clean = (name || '').trim()
  if (!clean) return '?'
  const parts = clean.split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + second).toUpperCase()
}

function colorFor(name?: string | null) {
  const s = name || ''
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/** Simple avatar with an image and an initials fallback (no Radix dependency). */
export function Avatar({ src, name, size = 'md', className, ...props }: AvatarProps) {
  const [failed, setFailed] = React.useState(false)
  const showImage = !!src && !failed
  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none',
        SIZE[size],
        showImage ? 'bg-muted' : colorFor(name),
        className
      )}
      title={name || undefined}
      {...props}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name || 'avatar'}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  )
}
