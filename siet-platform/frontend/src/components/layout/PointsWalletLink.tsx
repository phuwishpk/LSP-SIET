'use client'

import Link from 'next/link'
import { Coins } from 'lucide-react'

import { useAuthStore } from '@/lib/stores/auth-store'
import { cn } from '@/lib/utils'

/** Sidebar footer: the student's point balance, linking to the community. */
export function PointsWalletLink({ collapsed }: { collapsed: boolean }) {
  const authUser = useAuthStore((s) => s.user)
  if (!authUser || authUser.points_exempt) return null
  return (
    <Link
      href="/community"
      className={cn(
        'flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
        collapsed && 'justify-center px-0'
      )}
      title="กระเป๋าแต้ม"
    >
      <Coins className="h-3.5 w-3.5" />
      {!collapsed && <span>{authUser.points_balance ?? 0} PT</span>}
    </Link>
  )
}
