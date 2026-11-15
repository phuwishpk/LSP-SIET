'use client'

/**
 * How KMITL RAG AI is used: questions per day, how well the library covered
 * them, what it cost, and the limits each user asks under.
 *
 * Counts and document titles only. What people asked and what the AI answered
 * is private to each user, and this page never shows it.
 */
import { useState } from 'react'
import { BookOpenCheck, Coins, Globe2, MessagesSquare, Timer, Users, Wallet, Zap } from 'lucide-react'
import { RangeSelect } from '@/components/admin/controls'
import { BarList, DailyColumns } from '@/components/admin/StatCharts'
import { StatTile } from '@/components/admin/StatTile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminRagStats } from '@/lib/hooks/use-admin'
import { displayName, roleLabel } from '@/lib/utils/community-format'

const fmtThb = (n: number) =>
  `฿${new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toLocaleString()

export function RagStatsPanel() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useAdminRagStats(days)

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <RangeSelect value={days} onChange={setDays} />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const { coverage, usage, library, policy, costs } = data
  const fullShare = data.answers > 0 ? `${Math.round((coverage.full / data.answers) * 100)}%` : '—'
  const coverageRows = [
    { label: 'ตอบได้ครบจากคลัง', value: coverage.full },
    { label: 'ตอบได้บางส่วน', value: coverage.partial },
    { label: 'ไม่พบในคลัง', value: coverage.none },
    // only answers saved before coverage was recorded
    ...(coverage.unknown > 0 ? [{ label: 'ไม่ได้บันทึกไว้', value: coverage.unknown }] : []),
  ]

  return (
    <div className="space-y-4">
      <RangeSelect value={days} onChange={setDays} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={MessagesSquare}
          accent
          label={`คำถามใน ${data.days} วัน`}
          value={data.questions}
          hint={`${data.conversations.toLocaleString()} บทสนทนา`}
        />
        <StatTile icon={Users} label={`ผู้ถามใน ${data.days} วัน`} value={data.askers} />
        <StatTile
          icon={BookOpenCheck}
          accent
          label="ตอบได้ครบจากคลัง"
          value={fullShare}
          hint={`${coverage.full.toLocaleString()} จาก ${data.answers.toLocaleString()} คำตอบ`}
        />
        <StatTile
          icon={Globe2}
          label="คำตอบที่ค้นเว็บเพิ่ม"
          value={data.web_used}
          hint={`ค้นเว็บ ${usage.search_queries.toLocaleString()} ครั้ง`}
        />
        <StatTile icon={Zap} label="ตอบจากแคช" value={data.cached} hint="ไม่เรียก AI ซ้ำ และไม่ตัดแต้ม" />
        <StatTile
          icon={Coins}
          accent
          label={`แต้มที่ใช้ใน ${data.days} วัน`}
          value={data.points_spent}
          hint={`คำถามละ ${costs.question} แต้ม · เซสชัน ${costs.session} แต้ม/${costs.session_messages} ข้อความ`}
        />
        <StatTile
          icon={Wallet}
          accent
          label="ค่าใช้จ่าย AI (ประมาณ)"
          value={fmtThb(usage.cost_thb)}
          hint={`${fmtTokens(usage.tokens)} โทเค็น · เรียกโมเดล ${usage.calls.toLocaleString()} ครั้ง`}
        />
        <StatTile
          icon={Timer}
          label="เวลาตอบเฉลี่ย"
          value={usage.avg_latency_ms === null ? '—' : `${(usage.avg_latency_ms / 1000).toFixed(1)} วินาที`}
          hint="ต่อการเรียกโมเดล 1 ครั้ง"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">คำถามต่อ{data.days > 31 ? 'สัปดาห์' : 'วัน'}</CardTitle>
          <CardDescription>
            นับจากประวัติแชตที่ผู้ใช้ยังเก็บไว้ · ผู้ดูแลเห็นเฉพาะจำนวน ไม่เห็นคำถามหรือคำตอบของใคร
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyColumns
            days={data.days}
            rows={data.per_day}
            unit="คำถาม"
            tableHeading="คำถาม"
            emptyLabel="ไม่มีคำถามในช่วงนี้"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">คลังความรู้ตอบได้แค่ไหน</CardTitle>
            <CardDescription>
              ถ้า “ไม่พบในคลัง” สูง แปลว่าคนถามเรื่องที่ยังไม่มีเอกสารรองรับ
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.answers === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีคำตอบในช่วงนี้</p>
            ) : (
              <BarList rows={coverageRows} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">เอกสารที่ถูกอ้างอิงมากที่สุด</CardTitle>
            <CardDescription>นับจำนวนคำตอบที่อ้างถึงเอกสารนั้นใน {data.days} วัน</CardDescription>
          </CardHeader>
          <CardContent>
            {data.top_documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีคำตอบที่อ้างอิงเอกสาร</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {data.top_documents.map((doc, index) => (
                  <li key={doc.id ?? doc.title} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 break-words font-medium">{doc.title}</span>
                    <span className="shrink-0 tabular-nums">{doc.count} คำตอบ</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ผู้ที่ถามมากที่สุด</CardTitle>
            <CardDescription>จำนวนคำถามใน {data.days} วัน</CardDescription>
          </CardHeader>
          <CardContent>
            {data.top_askers.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีคำถามในช่วงนี้</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {data.top_askers.map((row, index) => (
                  <li key={row.user.id} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{displayName(row.user)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        @{row.user.username} · {roleLabel(row.user.role)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{row.questions} คำถาม</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">คลังเอกสารและข้อจำกัดการถาม</CardTitle>
            <CardDescription>สิ่งที่ AI อ่านได้ตอนนี้ และเพดานการถามของผู้ใช้แต่ละคน</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Facts
              title="เอกสารในคลัง"
              rows={[
                ['พร้อมใช้งาน', library.ready],
                ['ของรายวิชา', library.course],
                ['ส่วนตัวของผู้ใช้', library.personal],
                ['กำลังประมวลผล', library.processing],
                ['ทำดัชนีไม่สำเร็จ', library.failed],
                ['ชิ้นข้อความที่ค้นได้', library.chunks],
              ]}
            />
            <Facts
              title="เพดานต่อผู้ใช้ 1 คน"
              rows={[
                ['เว้นระหว่างคำถาม', `${policy.cooldown_seconds} วินาที`],
                ['ต่อนาที', policy.per_minute],
                ['ต่อชั่วโมง', policy.per_hour],
                ['ต่อวัน', policy.per_day],
                ['อาจารย์และผู้ดูแล', `× ${policy.staff_multiplier}`],
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Facts({ title, rows }: { title: string; rows: [string, number | string][] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
