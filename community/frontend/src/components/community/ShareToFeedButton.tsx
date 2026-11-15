'use client'

import { useRouter } from 'next/navigation'
import { Coins, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCreatePost, useWallet } from '@/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'

/** "แชร์ลงฟีด" button used on the AI Features page for quiz / roadmap sessions. */
export function ShareToFeedButton({
  embedType,
  sessionId,
  title,
}: {
  embedType: 'quiz' | 'roadmap'
  sessionId: string
  title?: string
}) {
  const router = useRouter()
  const create = useCreatePost()
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={create.isPending}
      onClick={() =>
        create.mutate(
          { type: embedType, embed_type: embedType, embed_id: sessionId, title },
          { onSuccess: () => router.push('/community') }
        )
      }
    >
      <Share2 className="h-4 w-4" />
      {create.isPending ? 'กำลังแชร์…' : 'แชร์ลงฟีด Community'}
    </Button>
  )
}

/** Small "N แต้ม" chip showing what an AI action will cost the current user. */
export function CostBadge({ kind }: { kind: 'quiz_generate' | 'roadmap_generate' }) {
  const user = useAuthStore((s) => s.user)
  const { data: wallet } = useWallet(!!user)
  const exempt = wallet?.exempt ?? user?.points_exempt ?? false
  const cost = wallet?.rules.costs[kind] ?? (kind === 'quiz_generate' ? 8 : 15)
  const balance = wallet?.balance ?? user?.points_balance ?? 0
  if (exempt) {
    return (
      <Badge variant="outline" className="gap-1 font-normal">
        <Coins className="h-3 w-3" /> ไม่ตัดแต้ม
      </Badge>
    )
  }
  return (
    <Badge variant={balance >= cost ? 'secondary' : 'destructive'} className="gap-1 font-normal">
      <Coins className="h-3 w-3" /> {cost} แต้ม · คุณมี {balance}
    </Badge>
  )
}
