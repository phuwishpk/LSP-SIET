'use client'

/**
 * How much the quiz feature is used: headline numbers, new quizzes per day,
 * what they were generated from, and the most played shared quizzes.
 */
import { useState } from 'react'
import Link from 'next/link'
import { BrainCircuit, Coins, Download, Gamepad2, HandCoins, Share2, Sparkles, Target } from 'lucide-react'
import { RangeSelect } from '@/components/admin/controls'
import { BarList, DailyColumns } from '@/components/admin/StatCharts'
import { StatTile } from '@/components/admin/StatTile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminQuizStats } from '@/lib/hooks/use-admin'
import { displayName } from '@/lib/utils/community-format'

/** A score nobody has earned yet reads as a dash, not as 0%. */
export const scoreLabel = (pct: number | null) => (pct === null ? '—' : `${pct}%`)

export function QuizStatsPanel() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useAdminQuizStats(days)

  return (
    <div className="space-y-4">
      <RangeSelect value={days} onChange={setDays} />

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={BrainCircuit} label="Quiz ทั้งหมดในระบบ" value={data.total} />
            <StatTile icon={Sparkles} accent label={`สร้างใน ${data.days} วัน`} value={data.generated} />
            <StatTile icon={Download} label={`นำเข้าจากฟีดใน ${data.days} วัน`} value={data.imported} hint="สำเนาควิซของคนอื่น" />
            <StatTile icon={Share2} label="โพสต์ Quiz ในฟีด" value={data.shared_posts} hint={`เล่นสะสม ${data.plays.toLocaleString()} ครั้ง`} />
            <StatTile
              icon={Gamepad2}
              label={`ทำควิซใน ${data.days} วัน`}
              value={data.attempts}
              hint={`ทำจนจบ ${data.completed.toLocaleString()} ครั้ง · ${data.players.toLocaleString()} คน`}
            />
            <StatTile icon={Target} label={`คะแนนเฉลี่ยใน ${data.days} วัน`} value={scoreLabel(data.avg_score_pct)} hint="เฉพาะครั้งที่ทำจนจบ" />
            <StatTile icon={Coins} accent label={`แต้มที่ใช้ใน ${data.days} วัน`} value={data.points_spent} hint="หักคืนแต้มที่ refund แล้ว" />
            <StatTile icon={HandCoins} accent label="แต้มคืนให้เจ้าของควิซ" value={data.cashback_paid} hint="เมื่อมีคนทำควิซจนจบ" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quiz ที่สร้างต่อ{data.days > 31 ? 'สัปดาห์' : 'วัน'}</CardTitle>
              <CardDescription>นับเฉพาะที่ผู้ใช้สร้างเอง ไม่รวมสำเนาที่นำเข้าจากฟีด</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyColumns
                days={data.days}
                rows={data.per_day}
                unit="ชุด"
                tableHeading="Quiz ที่สร้าง"
                emptyLabel="ไม่มี Quiz ที่สร้างในช่วงนี้"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">สร้างจากอะไร</CardTitle>
                <CardDescription>Quiz ที่สร้างใน {data.days} วัน แยกตามแหล่งที่ใช้</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  rows={[
                    { label: 'คลังความรู้', value: data.grounding.library },
                    { label: 'ความรู้ทั่วไปของ AI', value: data.grounding.none },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quiz ที่มีคนเล่นมากที่สุด</CardTitle>
                <CardDescription>จากโพสต์ที่ยังแสดงอยู่ในฟีด</CardDescription>
              </CardHeader>
              <CardContent>
                {data.top_played.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มี Quiz ที่แชร์ในฟีด</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {data.top_played.map((post, index) => (
                      <li key={post.id} className="flex items-baseline gap-2">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/community?post=${post.id}`} target="_blank" className="font-medium hover:underline">
                            {post.title || '(ไม่มีหัวข้อ)'}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {displayName(post.author)} · {post.question_count} ข้อ · เฉลี่ย {scoreLabel(post.attempts.avg_score_pct)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{post.counts.play} ครั้ง</span>
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
