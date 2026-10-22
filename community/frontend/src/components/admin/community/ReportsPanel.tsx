'use client'

/**
 * The moderation queue: what members flagged, how many agree, and one place
 * to settle it - dismiss, hide/restore the post, remove the comment, suspend
 * the person or delete the document. Nothing here happens automatically.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Flag, ShieldCheck } from 'lucide-react'
import { EmptyState, Pager, Segmented } from '@siet/platform/components/admin/controls'
import { StatTile } from '@siet/platform/components/admin/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import {
  REPORT_ACTION_LABELS,
  REPORT_TARGET_LABELS,
  type Report,
  type ReportAction,
  type ReportStatus,
} from '@siet/platform/lib/api/moderation'
import { useAdminReports, useResolveReport } from '@siet/platform/lib/hooks/use-moderation'
import { timeAgo } from '@siet/platform/lib/utils/community-format'
import { cn } from '@/lib/utils'

const PAGE = 25
const ACTIONS_FOR: Record<Report['target_type'], ReportAction[]> = {
  post: ['none', 'hide_post', 'restore_post', 'suspend_user'],
  comment: ['none', 'delete_comment', 'suspend_user'],
  user: ['none', 'suspend_user'],
  document: ['none', 'delete_document', 'suspend_user'],
}

export function ReportsPanel() {
  const [status, setStatus] = useState<ReportStatus | 'all'>('open')
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<Report | null>(null)
  const { data, isLoading } = useAdminReports({ status, offset, limit: PAGE })
  const stats = data?.stats

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon={Flag} label="รอตรวจ" value={stats.open_count} />
          <StatTile icon={ShieldCheck} label="ดำเนินการแล้ว" value={stats.actioned} />
          <StatTile icon={ShieldCheck} label="ปัดตก" value={stats.dismissed} />
          <StatTile icon={Flag} label="รายงานใหม่ 7 วัน" value={stats.last_7_days} />
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">รายงานเนื้อหา</CardTitle>
          <CardDescription>
            สมาชิกรายงานได้คนละครั้งต่อรายการ ระบบไม่ซ่อนอะไรเอง — ทุกการตัดสินใจที่นี่ถูกบันทึกในบันทึกผู้ดูแล
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Segmented
            label="สถานะรายงาน"
            value={status}
            onChange={(v) => {
              setStatus(v)
              setOffset(0)
            }}
            options={[
              { value: 'open', label: 'รอตรวจ' },
              { value: 'actioned', label: 'ดำเนินการแล้ว' },
              { value: 'dismissed', label: 'ปัดตก' },
              { value: 'all', label: 'ทั้งหมด' },
            ]}
          />
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState>ไม่มีรายงานในสถานะนี้</EmptyState>}
          {(data?.items.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">รายการ</th>
                    <th className="py-2 pr-3 font-medium">เหตุผล</th>
                    <th className="py-2 pr-3 font-medium">ผู้รายงาน</th>
                    <th className="py-2 pr-3 text-right font-medium">รายงาน</th>
                    <th className="py-2 pr-3 font-medium">สถานะ</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data!.items.map((r) => (
                    <tr key={r.id} className={cn(r.status !== 'open' && 'text-muted-foreground')}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {REPORT_TARGET_LABELS[r.target_type]}
                          </Badge>
                          <span className="line-clamp-1 font-medium text-foreground">{r.target_title || `#${r.target_id}`}</span>
                          {r.target_gone && (
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              {r.target_type === 'user' ? 'ระงับอยู่' : 'ซ่อน/ลบแล้ว'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {r.room_code ? `ห้อง ${r.room_code} · ` : ''}
                          {timeAgo(r.created_at)}
                          {r.detail ? ` · “${r.detail}”` : ''}
                        </p>
                      </td>
                      <td className="py-2 pr-3 text-xs">{r.reason_label}</td>
                      <td className="py-2 pr-3 text-xs">{r.reporter_display_name || r.reporter_username}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <Badge variant={r.report_count > 1 ? 'default' : 'secondary'}>{r.report_count}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.status === 'open' ? (
                          <span className="text-amber-600">รอตรวจ</span>
                        ) : (
                          <>
                            {r.status === 'actioned' ? 'ดำเนินการ' : 'ปัดตก'}
                            {r.action && r.action !== 'none' ? ` · ${REPORT_ACTION_LABELS[r.action]}` : ''}
                            <span className="block text-[11px] text-muted-foreground">
                              {r.reviewer_username ? `โดย @${r.reviewer_username}` : ''} {r.note ? `· ${r.note}` : ''}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-1">
                          {r.post_id && (
                            <Button asChild variant="ghost" size="sm" className="h-7 px-2" aria-label="เปิดโพสต์">
                              <Link href={`/community?post=${r.post_id}`} target="_blank">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          )}
                          {r.status === 'open' && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPending(r)}>
                              จัดการ
                            </Button>
                          )}
                        </div>
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
      {pending && <ResolveDialog report={pending} onClose={() => setPending(null)} />}
    </div>
  )
}

function ResolveDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const resolve = useResolveReport()
  const [action, setAction] = useState<ReportAction>('none')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(report.reason_label)
  const [until, setUntil] = useState('')
  const actions = ACTIONS_FOR[report.target_type]

  const submit = (status: 'dismissed' | 'actioned') =>
    resolve.mutate(
      {
        reportId: report.id,
        status,
        action: status === 'dismissed' ? 'none' : action,
        note: note.trim() || undefined,
        suspend_reason: action === 'suspend_user' ? reason.trim() || undefined : undefined,
        suspended_until: action === 'suspend_user' ? until || undefined : undefined,
      },
      { onSuccess: onClose }
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>จัดการรายงาน: {REPORT_TARGET_LABELS[report.target_type]}</DialogTitle>
          <DialogDescription>
            “{report.target_title || `#${report.target_id}`}” · {report.reason_label}
            {report.report_count > 1 ? ` · มี ${report.report_count} คนรายงาน` : ''}
            {report.detail ? ` · ${report.detail}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>การดำเนินการ</Label>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((a) => (
                <Button key={a} type="button" size="sm" variant={action === a ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setAction(a)}>
                  {REPORT_ACTION_LABELS[a]}
                </Button>
              ))}
            </div>
          </div>
          {action === 'suspend_user' && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
              <div className="space-y-1">
                <Label htmlFor="rs-reason">เหตุผลที่แจ้งผู้ใช้</Label>
                <Input id="rs-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rs-until">ปล่อยอัตโนมัติวันที่</Label>
                <Input id="rs-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="rs-note">บันทึกของผู้ดูแล (ไม่บังคับ)</Label>
            <Input id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="เช่น ตรวจแล้วเป็นสแปมจริง" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" disabled={resolve.isPending} onClick={() => submit('dismissed')}>
            ปัดตก (ไม่ผิดกฎ)
          </Button>
          <Button disabled={resolve.isPending} onClick={() => submit('actioned')}>
            {action === 'none' ? 'ปิดรายงาน' : REPORT_ACTION_LABELS[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
