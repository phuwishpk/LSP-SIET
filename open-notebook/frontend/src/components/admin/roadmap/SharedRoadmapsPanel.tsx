'use client'

/**
 * Roadmaps that were shared into the feed, most followed first.
 *
 * Hiding is the same flag the moderation list uses: the post leaves the feed
 * but stays in the database, and people who already followed it keep their copy.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, EyeOff, Footprints, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminRoadmapPosts, useModeratePost } from '@/lib/hooks/use-admin'
import { displayName, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

const PAGE = 25

export function SharedRoadmapsPanel() {
  const [state, setState] = useState<'visible' | 'deleted' | 'all'>('visible')
  const [offset, setOffset] = useState(0)
  const { data, isLoading } = useAdminRoadmapPosts({ state, offset })
  const moderate = useModeratePost()

  const pages = Math.ceil((data?.total ?? 0) / PAGE)
  const page = Math.floor(offset / PAGE)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Roadmap ที่แชร์ในฟีด</CardTitle>
        <CardDescription>
          {data ? `${data.total.toLocaleString()} โพสต์ · ` : ''}
          เรียงตามจำนวนคนเดินตาม · ซ่อนแล้วกู้คืนได้ และคนที่เดินตามไปแล้วยังมีสำเนาของตัวเอง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex w-fit rounded-md border p-0.5">
          {(['visible', 'deleted', 'all'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setState(item)
                setOffset(0)
              }}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition',
                state === item ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
            >
              {item === 'visible' ? 'แสดงอยู่' : item === 'deleted' ? 'ซ่อนไว้' : 'ทั้งหมด'}
            </button>
          ))}
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {state === 'deleted' ? 'ไม่มีโพสต์ Roadmap ที่ซ่อนไว้' : 'ยังไม่มี Roadmap ที่แชร์ในฟีด'}
          </p>
        )}

        {(data?.items.length ?? 0) > 0 && (
          <div className="divide-y rounded-lg border">
            {data?.items.map((post) => (
              <div
                key={post.id}
                data-post-id={post.id}
                className={cn('flex flex-wrap items-start gap-3 p-3', post.is_deleted && 'bg-muted/40')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('truncate text-sm font-medium', post.is_deleted && 'line-through opacity-70')}>
                      {post.title || '(ไม่มีหัวข้อ)'}
                    </span>
                    {post.is_deleted && (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <EyeOff className="h-3 w-3" /> ซ่อนอยู่
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {displayName(post.author)} (@{post.author.username}) · {timeAgo(post.created_at)}
                    {post.room ? ` · ${post.room.code || post.room.name}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {post.node_count} ด่าน
                    {post.sub_node_count > 0 ? ` (ด่านย่อย ${post.sub_node_count})` : ''}
                    {post.grounding_label ? ` · ${post.grounding_label}` : ''}
                    {' · '}❤️ {post.counts.like} 💬 {post.counts.comment} 🔁 {post.counts.share}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-xs tabular-nums" title="จำนวนคนเดินตาม">
                    <Footprints className="h-3.5 w-3.5 text-muted-foreground" /> {post.counts.follow} คนเดินตาม
                  </span>
                  {!post.is_deleted && (
                    <Button asChild variant="ghost" size="sm" className="h-8 px-2" aria-label="เปิดโพสต์">
                      <Link href={`/community?post=${post.id}`} target="_blank">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                  {post.is_deleted ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ id: post.id, action: 'restore' })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> กู้คืน
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ id: post.id, action: 'delete' })}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ซ่อน
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setOffset(offset - PAGE)}>
              ก่อนหน้า
            </Button>
            <span className="text-muted-foreground">
              หน้า {page + 1} จาก {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setOffset(offset + PAGE)}>
              ถัดไป
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
