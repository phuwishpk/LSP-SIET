'use client'

/**
 * How much the roadmap feature is used: headline numbers, new roadmaps per day,
 * what they were grounded on, and the most followed shared plans.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Coins, Footprints, GitBranch, Map as MapIcon, Share2, Sparkles } from 'lucide-react'
import { RangeSelect } from '@/components/admin/controls'
import { BarList, DailyColumns } from '@/components/admin/StatCharts'
import { StatTile } from '@/components/admin/StatTile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminRoadmapStats } from '@/lib/hooks/use-admin'
import { displayName } from '@/lib/utils/community-format'

export function RoadmapStatsPanel() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useAdminRoadmapStats(days)

  return (
    <div className="space-y-4">
      <RangeSelect value={days} onChange={setDays} />

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile icon={MapIcon} label="Roadmap ทั้งหมดในระบบ" value={data.total} />
            <StatTile icon={Sparkles} accent label={`สร้างใน ${data.days} วัน`} value={data.generated} />
            <StatTile icon={Footprints} label={`เดินตามใน ${data.days} วัน`} value={data.followed} hint={`ยอดเดินตามสะสม ${data.follows.toLocaleString()}`} />
            <StatTile icon={Share2} label="โพสต์ Roadmap ในฟีด" value={data.shared_posts} />
            <StatTile icon={Coins} accent label={`แต้มที่ใช้ใน ${data.days} วัน`} value={data.points_spent} hint="หักคืนแต้มที่ refund แล้ว" />
            <StatTile icon={GitBranch} label={`ขยายด่านใน ${data.days} วัน`} value={data.expansions} hint="นับจากรายการหักแต้ม (ไม่รวมอาจารย์/ผู้ดูแล)" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Roadmap ที่สร้างต่อ{data.days > 31 ? 'สัปดาห์' : 'วัน'}
              </CardTitle>
              <CardDescription>นับเฉพาะที่ผู้ใช้สร้างเอง ไม่รวมสำเนาจากการเดินตาม</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyColumns
                days={data.days}
                rows={data.per_day}
                unit="แผน"
                tableHeading="Roadmap ที่สร้าง"
                emptyLabel="ไม่มี Roadmap ที่สร้างในช่วงนี้"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">อ้างอิงจากอะไร</CardTitle>
                <CardDescription>Roadmap ที่สร้างใน {data.days} วัน แยกตามแหล่งที่ใช้</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  rows={[
                    { label: 'คลังความรู้', value: data.grounding.library },
                    { label: 'คลังความรู้ + เว็บ', value: data.grounding.library_web },
                    { label: 'เว็บ', value: data.grounding.web },
                    { label: 'ความรู้ทั่วไปของ AI', value: data.grounding.none },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Roadmap ที่มีคนเดินตามมากที่สุด</CardTitle>
                <CardDescription>จากโพสต์ที่ยังแสดงอยู่ในฟีด</CardDescription>
              </CardHeader>
              <CardContent>
                {data.top_followed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มี Roadmap ที่แชร์ในฟีด</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {data.top_followed.map((post, index) => (
                      <li key={post.id} className="flex items-baseline gap-2">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/community?post=${post.id}`} target="_blank" className="font-medium hover:underline">
                            {post.title || '(ไม่มีหัวข้อ)'}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {displayName(post.author)} · {post.node_count} ด่าน
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{post.counts.follow} คน</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
