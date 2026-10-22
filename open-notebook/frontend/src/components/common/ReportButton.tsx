'use client'

/**
 * "รายงาน" for a post, comment, person or document: a small dialog that asks
 * why and sends it to the moderation queue. Drop it next to any content;
 * `alreadyReported` greys it out (see `useMyReports`).
 */
import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { REPORT_REASON_LABELS, REPORT_TARGET_LABELS, type ReportReason, type ReportTargetType } from '@/lib/api/moderation'
import { useReportContent } from '@/lib/hooks/use-moderation'
import { cn } from '@/lib/utils'

interface ReportButtonProps {
  targetType: ReportTargetType
  targetId: number
  /** Shown in the dialog so the person knows what they are reporting. */
  targetLabel?: string
  alreadyReported?: boolean
  size?: 'sm' | 'icon'
  className?: string
}

export function ReportButton({ targetType, targetId, targetLabel, alreadyReported, size = 'sm', className }: ReportButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('inappropriate')
  const [detail, setDetail] = useState('')
  const report = useReportContent()
  const done = alreadyReported || report.isSuccess

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size === 'icon' ? 'icon' : 'sm'}
        className={cn('text-muted-foreground', size === 'sm' && 'h-7 gap-1 px-2 text-xs', className)}
        disabled={done}
        onClick={() => setOpen(true)}
        aria-label={done ? 'รายงานแล้ว' : `รายงาน${REPORT_TARGET_LABELS[targetType]}`}
        title={done ? 'คุณรายงานรายการนี้แล้ว' : undefined}
      >
        <Flag className="h-3.5 w-3.5" />
        {size === 'sm' && (done ? 'รายงานแล้ว' : 'รายงาน')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>รายงาน{REPORT_TARGET_LABELS[targetType]}</DialogTitle>
            <DialogDescription>
              {targetLabel ? `“${targetLabel}” — ` : ''}
              รายงานจะส่งถึงผู้สอนของห้องและผู้ดูแลระบบ ไม่มีอะไรถูกซ่อนอัตโนมัติจนกว่าจะมีคนตรวจ
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>เหตุผล</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={reason === r ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setReason(r)}
                  >
                    {REPORT_REASON_LABELS[r]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-detail">รายละเอียด (ไม่บังคับ)</Label>
              <Textarea
                id="report-detail"
                rows={3}
                maxLength={500}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="บอกผู้ตรวจว่าตรงไหนมีปัญหา"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              disabled={report.isPending}
              onClick={() =>
                report.mutate(
                  { target_type: targetType, target_id: targetId, reason, detail: detail.trim() || undefined },
                  { onSuccess: () => setOpen(false) }
                )
              }
            >
              ส่งรายงาน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
