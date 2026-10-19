'use client'

/**
 * How lively the feed is: what was posted, how people responded, who takes
 * part and which posts drew the most response.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Bookmark, DoorOpen, EyeOff, FileText, Heart, MessageCircle, Repeat2, Users } from 'lucide-react'
import { RangeSelect } from '@/components/admin/controls'
import { PostCounts } from '@/components/admin/PostCounts'
import { BarList, DailyColumns } from '@/components/admin/StatCharts'
import { StatTile } from '@/components/admin/StatTile'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminCommunityStats } from '@/lib/hooks/use-admin'
import { displayName, POST_TYPE_LABELS, postTypeLabel, roleLabel } from '@/lib/utils/community-format'

export function CommunityStatsPanel() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useAdminCommunityStats(days)

  return (
    <div className="space-y-4">
      <RangeSelect value={days} onChange={setDays} />

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={FileText} label={`โพสต์ใหม่ใน ${data.days} วัน`} value={data.posts} hint="ไม่นับโพสต์ที่ถูกซ่อน" />
            <StatTile icon={MessageCircle} label="ความคิดเห็น" value={data.comments} />
            <StatTile icon={Heart} label="ถูกใจและ Helpful" value={data.reactions} />
            <StatTile icon={Repeat2} label="แชร์" value={data.shares} />
            <StatTile icon={Users} label="ผู้มีส่วนร่วม" value={data.contributors} hint="โพสต์หรือแสดงความคิดเห็นอย่างน้อย 1 ครั้ง" />
            <StatTile icon={Bookmark} label="บันทึกโพสต์" value={data.saves} />
            <StatTile icon={DoorOpen} label="เข้าร่วมห้อง" value={data.room_joins} />
            <StatTile icon={EyeOff} label="โพสต์ที่ซ่อนไว้ทั้งหมด" value={data.hidden_posts} hint="กู้คืนได้ในแท็บโพสต์" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">โพสต์ใหม่ต่อ{data.days > 31 ? 'สัปดาห์' : 'วัน'}</CardTitle>
              <CardDescription>ทุกชนิดรวมกัน ไม่นับโพสต์ที่ถูกซ่อน</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyColumns
                days={data.days}
                rows={data.per_day}
                unit="โพสต์"
                tableHeading="โพสต์ใหม่"
                emptyLabel="ไม่มีโพสต์ใหม่ในช่วงนี้"
                tone="neutral"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">โพสต์แยกตามชนิด</CardTitle>
                <CardDescription>โพสต์ใหม่ใน {data.days} วัน</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  tone="neutral"
                  rows={Object.keys(POST_TYPE_LABELS).map((type) => ({
                    label: postTypeLabel(type),
                    value: data.by_type[type as keyof typeof data.by_type] ?? 0,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ผู้มีส่วนร่วมมากที่สุด</CardTitle>
                <CardDescription>นับโพสต์และความคิดเห็นใน {data.days} วัน</CardDescription>
              </CardHeader>
              <CardContent>
                {data.top_contributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีความเคลื่อนไหวในช่วงนี้</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {data.top_contributors.map((row, index) => (
                      <li key={row.user.id} className="flex items-baseline gap-2">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{displayName(row.user)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            @{row.user.username} · {roleLabel(row.user.role)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {row.posts} โพสต์ · {row.comments} ความคิดเห็น
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">โพสต์ที่มีคนตอบรับมากที่สุด</CardTitle>
              <CardDescription>รวมถูกใจ Helpful ความคิดเห็น และแชร์ ของโพสต์ใหม่ใน {data.days} วัน</CardDescription>
            </CardHeader>
            <CardContent>
              {data.top_posts.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีโพสต์ที่มีคนตอบรับในช่วงนี้</p>
              ) : (
                <ol className="divide-y text-sm">
                  {data.top_posts.map((post) => (
                    <li key={post.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                      <Badge variant="outline" className="text-[10px]">
                        {postTypeLabel(post.type)}
                      </Badge>
                      <Link
                        href={`/community?post=${post.id}`}
                        target="_blank"
                        className="min-w-0 flex-1 truncate font-medium hover:underline"
                      >
                        {post.title || '(ไม่มีหัวข้อ)'}
                      </Link>
                      <span className="text-xs text-muted-foreground">{displayName(post.author)}</span>
                      <span className="text-xs text-muted-foreground">
                        <PostCounts counts={post.counts} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
