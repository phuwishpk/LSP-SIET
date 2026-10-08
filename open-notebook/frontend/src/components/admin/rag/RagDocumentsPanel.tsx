'use client'

/**
 * Every document people gave the AI to read — course material and personal
 * uploads alike — with whether it was indexed.
 *
 * A document that failed to index is invisible to the RAG, and its owner may
 * never notice. From here it can be indexed again or removed, whoever owns it.
 * The list shows what a document is, never what is inside it.
 */
import { useState } from 'react'
import { useDebounce } from 'use-debounce'
import { AlertTriangle, CheckCircle2, Loader2, Lock, RotateCcw, Search, Trash2, Users } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState, Pager, Segmented } from '@/components/admin/controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminDocuments, useDocumentAction } from '@/lib/hooks/use-admin'
import type { AdminDocument, DocumentStatus } from '@/lib/api/admin'
import { formatBytes, timeAgo } from '@/lib/utils/community-format'

const PAGE = 25

const STATUS_LABEL: Record<DocumentStatus, string> = {
  ready: 'พร้อมใช้',
  processing: 'กำลังประมวลผล',
  failed: 'ไม่สำเร็จ',
}

const KIND_LABEL: Record<AdminDocument['kind'], string> = { file: 'ไฟล์', url: 'ลิงก์', text: 'ข้อความ' }

const ownerLabel = (doc: AdminDocument) =>
  doc.owner_username ? `${doc.owner_display_name || doc.owner_username} (@${doc.owner_username})` : 'บัญชีถูกลบแล้ว'

function StatusMark({ status }: { status: DocumentStatus }) {
  const Icon = status === 'ready' ? CheckCircle2 : status === 'processing' ? Loader2 : AlertTriangle
  const tone =
    status === 'ready' ? 'text-emerald-600' : status === 'processing' ? 'animate-spin text-subtle-foreground' : 'text-destructive'
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs">
      <Icon className={`h-3.5 w-3.5 ${tone}`} /> {STATUS_LABEL[status]}
    </span>
  )
}

export function RagDocumentsPanel() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [status, setStatus] = useState<DocumentStatus | ''>('')
  const [scope, setScope] = useState<'course' | 'personal' | ''>('')
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<AdminDocument | null>(null)
  const { data, isLoading } = useAdminDocuments({ q: debounced, status, scope, offset })
  const act = useDocumentAction()

  const counts = data?.by_status
  const statusOptions = [
    { value: '' as const, label: 'ทั้งหมด' },
    ...(['ready', 'processing', 'failed'] as const).map((value) => ({
      value,
      label: counts ? `${STATUS_LABEL[value]} ${counts[value]}` : STATUS_LABEL[value],
    })),
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">เอกสารที่ AI อ่าน</CardTitle>
        <CardDescription>
          {data ? `${data.total.toLocaleString()} รายการ · ` : ''}
          ทั้งของรายวิชาและที่ผู้ใช้อัปโหลดส่วนตัว · เห็นเฉพาะชื่อและสถานะ ไม่เห็นเนื้อหาข้างใน
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setOffset(0)
              }}
              placeholder="ค้นชื่อเอกสาร ชื่อไฟล์ เจ้าของ หรือรหัสวิชา"
              aria-label="ค้นเอกสาร"
              className="pl-9"
            />
          </div>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as typeof scope)
              setOffset(0)
            }}
            aria-label="ประเภทคลัง"
          >
            <option value="">ทุกคลัง</option>
            <option value="course">คลังรายวิชา</option>
            <option value="personal">คลังส่วนตัว</option>
          </select>
          <Segmented
            label="สถานะเอกสาร"
            value={status}
            options={statusOptions}
            onChange={(value) => {
              setStatus(value)
              setOffset(0)
            }}
          />
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState>ไม่พบเอกสารที่ตรงกับเงื่อนไข</EmptyState>}

        {(data?.items.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">เอกสาร</th>
                  <th className="py-2 pr-3 font-medium">คลัง</th>
                  <th className="py-2 pr-3 font-medium">เจ้าของ</th>
                  <th className="py-2 pr-3 font-medium">สถานะ</th>
                  <th className="py-2 pr-3 text-right font-medium">ชิ้นข้อความ</th>
                  <th className="py-2 pr-3 font-medium">อัปเดต</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.items.map((doc) => (
                  <tr key={doc.id} data-document-id={doc.id}>
                    <td className="max-w-[320px] py-2 pr-3">
                      <p className="truncate font-medium" title={doc.title}>
                        {doc.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[KIND_LABEL[doc.kind], doc.filename, formatBytes(doc.size)].filter(Boolean).join(' · ')}
                      </p>
                      {doc.status === 'failed' && doc.error && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-destructive">{doc.error}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {doc.scope === 'course' ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3 text-subtle-foreground" /> {doc.course_code || 'รายวิชา'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Lock className="h-3 w-3" /> ส่วนตัว
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">{ownerLabel(doc)}</td>
                    <td className="py-2 pr-3">
                      <StatusMark status={doc.status} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{doc.chunks.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{timeAgo(doc.updated_at || doc.created_at)}</td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* A pasted text has no file to read again: it must be uploaded anew. */}
                        {doc.status === 'failed' && doc.kind !== 'text' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ id: doc.id, action: 'retry' })}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> ลองใหม่
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => setPending(doc)}
                          aria-label={`ลบเอกสาร ${doc.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager offset={offset} pageSize={PAGE} total={data?.total ?? 0} onChange={setOffset} />
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบเอกสารนี้ถาวร?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pending?.title}” ของ {pending ? ownerLabel(pending) : ''} จะถูกลบพร้อมไฟล์และดัชนีทั้งหมด
              AI จะไม่ใช้เอกสารนี้ตอบอีก และกู้คืนไม่ได้
              {pending?.scope === 'personal' ? ' · นี่คือเอกสารส่วนตัวของผู้ใช้ เจ้าของจะไม่ได้รับการแจ้งเตือน' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={act.isPending}
              onClick={() => {
                if (pending) act.mutate({ id: pending.id, action: 'delete' })
                setPending(null)
              }}
            >
              ลบถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
