'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronUp, Footprints, Map, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RoadmapGraph } from '@/app/(dashboard)/features/components/RoadmapGraph'
import type { CommunityPost, RoadmapEmbed as RoadmapEmbedData } from '@/lib/api/community'
import { useRoadmapFollow } from '@/lib/hooks/use-community'

interface RoadmapEmbedProps {
  post: CommunityPost
  embed: RoadmapEmbedData
}

const PREVIEW_COUNT = 4

export function RoadmapEmbed({ post, embed }: RoadmapEmbedProps) {
  const follow = useRoadmapFollow()
  const [expanded, setExpanded] = useState(false)
  const [followedSession, setFollowedSession] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...embed.nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [embed.nodes]
  )
  const preview = ordered.slice(0, PREVIEW_COUNT)
  const remaining = Math.max(0, ordered.length - PREVIEW_COUNT)

  return (
    <div className="rounded-xl border border-orange-200/70 bg-orange-50/40 p-4 dark:border-orange-900/60 dark:bg-orange-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="gap-1 bg-orange-600 hover:bg-orange-600">
          <Map className="h-3 w-3" /> AI Roadmap
        </Badge>
        <p className="font-semibold">{embed.title || post.title}</p>
        <span className="text-xs text-muted-foreground">
          {ordered.length} ด่าน · มีคนเดินตาม {post.counts.follow} คน
        </span>
      </div>
      {embed.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{embed.description}</p>
      )}

      {!expanded ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {preview.map((node, index) => (
            <div key={node.id} className="flex items-center gap-1.5">
              <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="max-w-[160px] truncate">{node.label}</span>
              </div>
              {index < preview.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              +{remaining} ด่าน…
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border bg-background p-3">
          <RoadmapGraph nodes={embed.nodes} edges={embed.edges} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5 bg-orange-600 hover:bg-orange-700"
          disabled={follow.isPending}
          onClick={() =>
            follow.mutate(post.id, { onSuccess: (data) => setFollowedSession(data.session_id) })
          }
        >
          <Footprints className="h-4 w-4" /> นำทางตามแผนนี้ (Follow Path) · ฟรี
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="gap-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? 'ย่อ' : 'ดูแผนผังเต็ม'}
        </Button>
        {(followedSession || post.viewer.saved) && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={followedSession ? `/features?tab=roadmap&id=${followedSession}` : '/features?tab=roadmap'}>
              <Sparkles className="mr-1 h-4 w-4" /> เปิดในคลังของฉัน
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
