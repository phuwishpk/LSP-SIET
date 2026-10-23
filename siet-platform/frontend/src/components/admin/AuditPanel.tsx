'use client'

/**
 * The admin audit log: every change an admin (or a room owner acting on a
 * report) made - who, what, to which record, when. Append-only; filter by
 * action prefix such as `user.` or `report.`.
 */
import { useState } from 'react'
import { ScrollText, Search } from 'lucide-react'
import { useDebounce } from 'use-debounce'
import { EmptyState, Pager } from '@siet/platform/components/admin/controls'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import { useAuditLog } from '@siet/platform/lib/hooks/use-moderation'
import { timeAgo } from '@siet/platform/lib/utils/community-format'

const PAGE = 50

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'เข้าสู่ระบบสำเร็จ',
  'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ',
  'document.upload': 'อัปโหลดเอกสารใหม่',
  'user.update': 'แก้ไขบัญชี / ระงับ',
  'user.points': 'ปรับแต้ม',
  'user.reset_password': 'รีเซ็ตรหัสผ่าน',
  'user.create': 'สร้างบัญชี',
  'user.delete': 'ลบบัญชี',
  'user.bulk_delete': 'ลบบัญชีหลายรายการ',
  'post.hide': 'ซ่อนโพสต์',
  'post.restore': 'กู้คืนโพสต์',
  'comment.delete': 'ลบความคิดเห็น',
  'document.retry': 'ประมวลผลเอกสารใหม่',
  'document.delete': 'ลบเอกสาร',
  'category.create': 'เพิ่มหมวดหมู่',
  'category.delete': 'ลบหมวดหมู่',
  'roadmap.delete': 'ลบ Roadmap',
  'quiz.delete': 'ลบ Quiz',
  'room.purge': 'ลบห้องถาวร',
}

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  if (action.startsWith('report.')) return `รายงาน → ${action.slice(7).replace('_', ' ')}`
  if (action.startsWith('room.report.')) return `เจ้าของห้องจัดการรายงาน → ${action.slice(12).replace('_', ' ')}`
  return action
}

export function AuditPanel() {
  const [filter, setFilter] = useState('')
  const [debounced] = useDebounce(filter, 300)
  const [offset, setOffset] = useState(0)
  const { data, isLoading } = useAuditLog({ action: debounced.trim() || undefined, offset, limit: PAGE })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4" /> บันทึกประวัติการใช้งานและกิจกรรมระบบ
        </CardTitle>
        <CardDescription>
          บันทึกประวัติเหตุการณ์สำคัญ เช่น การเข้าสู่ระบบ การอัปโหลดเอกสาร และการกระทำเชิงบริหารของผู้ดูแลระบบอย่างถาวร — ใช้ตรวจสอบความปลอดภัยและร่องรอยการใช้งานย้อนหลัง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setOffset(0)
            }}
            placeholder="กรองด้วย action เช่น auth. หรือ user. หรือ document."
            className="pl-8"
          />
        </div>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState>ยังไม่มีบันทึก</EmptyState>}
        {(data?.items.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">เมื่อ</th>
                  <th className="py-2 pr-3 font-medium">ผู้กระทำ</th>
                  <th className="py-2 pr-3 font-medium">การกระทำ</th>
                  <th className="py-2 pr-3 font-medium">เป้าหมาย</th>
                  <th className="py-2 font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data!.items.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(e.created_at)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {e.actor_display_name || e.actor_username || (e.actor_id ? e.actor_id : 'ผู้ใช้ภายนอก')}
                      {e.actor_role && e.actor_role !== 'admin' && (
                        <Badge variant="outline" className="ml-1 h-4 text-[10px]">{e.actor_role}</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{actionLabel(e.action)}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">{e.action}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {e.target_type ? `${e.target_type} #${e.target_id ?? ''}` : '—'}
                    </td>
                    <td className="py-2 font-mono text-[11px] text-muted-foreground">
                      {e.detail ? JSON.stringify(e.detail).slice(0, 160) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager offset={offset} total={data?.total ?? 0} pageSize={PAGE} onChange={setOffset} />
      </CardContent>
    </Card>
  )
}
