'use client'

/**
 * Quizzes that were shared into the feed, most played first, with how people
 * did on them.
 *
 * Hiding is the same flag the moderation list uses: the post leaves the feed
 * but stays in the database, and the attempts already made are kept.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, EyeOff, Gamepad2, RotateCcw, Trash2 } from 'lucide-react'
import { EmptyState, Pager, Segmented, VISIBILITY_OPTIONS, type Visibility } from '@/components/admin/controls'
import { PostCounts } from '@/components/admin/PostCounts'
import { scoreLabel } from '@/components/admin/quiz/QuizStatsPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminQuizPosts, useModeratePost } from '@/lib/hooks/use-admin'
import { displayName, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

const PAGE = 25

export function SharedQuizzesPanel() {
  const [state, setState] = useState<Visibility>('visible')
  const [offset, setOffset] = useState(0)
  const { data, isLoading } = useAdminQuizPosts({ state, offset })
  const moderate = useModeratePost()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quiz ที่แชร์ในฟีด</CardTitle>
        <CardDescription>
          {data ? `${data.total.toLocaleString()} โพสต์ · ` : ''}
          เรียงตามจำนวนครั้งที่เล่น · ซ่อนแล้วกู้คืนได้ และผลการทำที่ผ่านมายังเก็บไว้
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Segmented
          label="สถานะโพสต์"
          value={state}
          options={VISIBILITY_OPTIONS}
          onChange={(value) => {
            setState(value)
            setOffset(0)
          }}
        />

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <EmptyState>{state === 'deleted' ? 'ไม่มีโพสต์ Quiz ที่ซ่อนไว้' : 'ยังไม่มี Quiz ที่แชร์ในฟีด'}</EmptyState>
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
                    {post.question_count} ข้อ · ทำจนจบ {post.attempts.completed} จาก {post.attempts.total} ครั้ง ·{' '}
                    {post.attempts.players} คน · คะแนนเฉลี่ย {scoreLabel(post.attempts.avg_score_pct)}
                    {post.counts.cashback > 0 ? ` · คืนแต้มเจ้าของ ${post.counts.cashback}` : ''}
                    {' · '}
                    <PostCounts counts={post.counts} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-xs tabular-nums" title="จำนวนครั้งที่เล่น">
                    <Gamepad2 className="h-3.5 w-3.5 text-subtle-foreground" /> เล่น {post.counts.play} ครั้ง
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
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
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

        <Pager offset={offset} pageSize={PAGE} total={data?.total ?? 0} onChange={setOffset} />
      </CardContent>
    </Card>
  )
}
