'use client'

import { Map, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeaderboard, usePopularRoadmaps } from '@/lib/hooks/use-community'
import { displayName } from '@/lib/utils/community-format'

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const { data, isLoading } = useLeaderboard(7)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="h-4 w-4 text-amber-500" /> Top Contributors
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">7 วันล่าสุด</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">
            ยังไม่มีใครได้แต้มสัปดาห์นี้ แชร์สรุปหรือควิซเป็นคนแรกเพื่อขึ้นตาราง!
          </p>
        )}
        <ol className="space-y-1.5">
          {data?.items.map((entry, index) => (
            <li key={entry.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-center text-base">{MEDALS[index] ?? `${index + 1}.`}</span>
              <Avatar size="xs" src={entry.avatar_url} name={displayName(entry)} />
              <span className="min-w-0 flex-1 truncate">{displayName(entry)}</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                +{entry.earned} PT
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function PopularRoadmaps({ onOpenPost }: { onOpenPost: (postId: number) => void }) {
  const { data, isLoading } = usePopularRoadmaps()
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Map className="h-4 w-4 text-orange-500" /> Roadmap ยอดนิยม
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">ยังไม่มี Roadmap ที่แชร์ในสัปดาห์นี้</p>
        )}
        <ul className="space-y-1.5">
          {data?.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenPost(r.id)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent"
              >
                <p className="truncate font-medium">• {r.title || 'Roadmap'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.node_count} ด่าน · {displayName(r.author)} · เดินตาม {r.counts.follow}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
