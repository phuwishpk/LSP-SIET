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
        'siet-sidebar-points flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        collapsed && 'justify-center px-0'
      )}
      title="กระเป๋าแต้ม"
    >
      <Coins className="h-3.5 w-3.5" />
      {!collapsed && <span>{authUser.points_balance ?? 0} PT</span>}
    </Link>
  )
}
