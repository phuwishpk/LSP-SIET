'use client'

import { useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  Lock,
  Map,
  MessageCircleQuestion,
  RefreshCw,
  Trash2,
  Type,
  Upload,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useCourses } from '@/lib/hooks/use-community'
import {
  useDeleteDocument,
  useLibrary,
  useRetryDocument,
  useUploadDocument,
} from '@/lib/hooks/use-library'
import type { LibraryDocument, LibraryScope } from '@/lib/api/library'
import { displayName, formatBytes, roleLabel, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'
import { StudyDialog } from './StudyDialog'

interface LibraryPanelProps {
  isStaff: boolean
  courseId: number | null
  onAskDocument: (doc: LibraryDocument) => void
}

type UploadMode = 'file' | 'url' | 'text'

export function LibraryPanel({ isStaff, courseId, onAskDocument }: LibraryPanelProps) {
  const [tab, setTab] = useState<'all' | 'course' | 'personal'>('all')
  const scope = tab === 'all' ? undefined : (tab as LibraryScope)
  const { data, isLoading } = useLibrary({ scope })
  const remove = useDeleteDocument()
  const retry = useRetryDocument()
  const [study, setStudy] = useState<{ doc: LibraryDocument; kind: 'quiz' | 'roadmap' } | null>(null)

  const items = data?.items ?? []
  const stats = data?.stats

  return (
    <div className="space-y-4">
      <UploadCard isStaff={isStaff} defaultCourseId={courseId} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" /> เอกสารในคลังความรู้
              </CardTitle>
              <CardDescription>
                AI จะอ้างอิงเฉพาะเอกสารที่คุณมีสิทธิ์เห็น เอกสารส่วนตัวไม่ถูกแชร์ให้ใคร
              </CardDescription>
            </div>
            {stats && (
              <div className="flex gap-2 text-xs">
                <Badge variant="secondary">วิชา {stats.course_docs}</Badge>
                <Badge variant="secondary">ของฉัน {stats.my_docs}</Badge>
                {stats.processing > 0 && (
                  <Badge className="gap-1 bg-amber-500 hover:bg-amber-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> กำลังประมวลผล {stats.processing}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
              <TabsTrigger value="course" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> ของรายวิชา
              </TabsTrigger>
              <TabsTrigger value="personal" className="gap-1.5">
                <Lock className="h-3.5 w-3.5" /> ของฉัน
              </TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-3 space-y-2">
              {isLoading && (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              )}
              {!isLoading && items.length === 0 && (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  ยังไม่มีเอกสารในคลังนี้ — อัปโหลดไฟล์ด้านบนเพื่อให้ AI ใช้เป็นแหล่งอ้างอิง
                </p>
              )}
              {items.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  busy={remove.isPending || retry.isPending}
                  onAsk={() => onAskDocument(doc)}
                  onQuiz={() => setStudy({ doc, kind: 'quiz' })}
                  onRoadmap={() => setStudy({ doc, kind: 'roadmap' })}
                  onDelete={() => {
                    if (window.confirm(`ลบ "${doc.title}" ออกจากคลังความรู้?`)) remove.mutate(doc.id)
                  }}
                  onRetry={() => retry.mutate(doc.id)}
                />
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {study && (
        <StudyDialog
          open
          onOpenChange={(open) => !open && setStudy(null)}
          kind={study.kind}
          selection={{ scope: 'document', document_ids: [study.doc.id] }}
          scopeLabel={study.doc.title}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function UploadCard({ isStaff, defaultCourseId }: { isStaff: boolean; defaultCourseId: number | null }) {
  const { data: courses } = useCourses()
  const upload = useUploadDocument()
  const fileRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<UploadMode>('file')
  const [scope, setScope] = useState<LibraryScope>(isStaff ? 'course' : 'personal')
  const [courseId, setCourseId] = useState<number | null>(defaultCourseId)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [shareToFeed, setShareToFeed] = useState(isStaff)

  const courseOptions = useMemo(() => courses ?? [], [courses])
  const needsCourse = scope === 'course'
  const canSubmit =
    !upload.isPending &&
    (!needsCourse || !!courseId) &&
    ((mode === 'file' && !!file) ||
      (mode === 'url' && url.trim().length > 8) ||
      (mode === 'text' && content.trim().length > 20))

  const reset = () => {
    setTitle('')
    setUrl('')
    setContent('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = () => {
    upload.mutate(
      {
        scope,
        courseId: needsCourse ? courseId : null,
        title: title.trim() || undefined,
        file: mode === 'file' ? file : null,
        url: mode === 'url' ? url.trim() : undefined,
        content: mode === 'text' ? content : undefined,
        shareToFeed,
      },
      { onSuccess: reset }
    )
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4 text-primary" />
          {isStaff ? 'เพิ่มเนื้อหาการเรียนเข้าคลัง' : 'อัปโหลดเอกสารของคุณเพื่อถาม AI'}
        </CardTitle>
        <CardDescription>
          {isStaff
            ? 'ไฟล์ที่อัปเข้าคลังของรายวิชาจะกลายเป็นแหล่งอ้างอิงให้นักศึกษาทุกคนถาม AI สร้างควิซ และทำ Roadmap ได้'
            : 'ไฟล์ของคุณเป็นความลับ เห็นเฉพาะคุณคนเดียว และใช้เป็นแหล่งอ้างอิงเวลาถาม AI'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <ScopeChip active={scope === 'course'} onClick={() => setScope('course')} icon={Users}>
              คลังของรายวิชา · ทุกคนใช้ได้
            </ScopeChip>
            <ScopeChip active={scope === 'personal'} onClick={() => setScope('personal')} icon={Lock}>
              ส่วนตัว · เห็นคนเดียว
            </ScopeChip>
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as UploadMode)}>
          <TabsList className="h-9">
            <TabsTrigger value="file" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" /> ไฟล์ / PDF
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5 text-xs">
              <Link2 className="h-3.5 w-3.5" /> ลิงก์
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1.5 text-xs">
              <Type className="h-3.5 w-3.5" /> วางข้อความ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-3">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.markdown,.docx,.pptx,.xlsx,.csv,.html,.htm,.epub,.rtf,.odt"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                setFile(picked)
                if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''))
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed p-6 text-sm text-muted-foreground transition hover:bg-accent"
            >
              <Upload className="h-5 w-5" />
              {file ? (
                <span className="font-medium text-foreground">
                  {file.name} <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                </span>
              ) : (
                <>
                  <span>คลิกเพื่อเลือกไฟล์</span>
                  <span className="text-xs">PDF, Word, PowerPoint, Excel, CSV, Markdown, text (สูงสุด 100 MB)</span>
                </>
              )}
            </button>
          </TabsContent>

          <TabsContent value="url" className="mt-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… เช่น บทความ หรือหน้าเอกสารประกอบการสอน"
            />
          </TabsContent>

          <TabsContent value="text" className="mt-3">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="วางเนื้อหา เช่น สรุปที่พิมพ์เอง เนื้อหาจากสไลด์ หรือโจทย์ที่อยากให้ AI อ้างอิง"
            />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อเอกสาร เช่น สไลด์สัปดาห์ที่ 5 – Memory Management"
            className="h-9 min-w-[220px] flex-1"
            maxLength={200}
          />
          <select
            className={cn(
              'h-9 rounded-md border bg-background px-2 text-sm',
              needsCourse && !courseId && 'border-destructive'
            )}
            value={courseId ?? ''}
            onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{needsCourse ? '— เลือกรายวิชา —' : 'ไม่ระบุวิชา'}</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={shareToFeed}
              onChange={(e) => setShareToFeed(e.target.checked)}
            />
            ประกาศลงฟีดด้วย
          </label>
          <Button size="sm" className="ml-auto h-9" disabled={!canSubmit} onClick={submit}>
            {upload.isPending ? 'กำลังอัปโหลด…' : 'เพิ่มเข้าคลัง'}
          </Button>
        </div>
        {needsCourse && !courseId && (
          <p className="text-xs text-destructive">เลือกรายวิชาก่อนจึงจะเผยแพร่เข้าคลังของวิชาได้</p>
        )}
      </CardContent>
    </Card>
  )
}

function ScopeChip({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition',
        active ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-accent'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

const STATUS_META: Record<
  LibraryDocument['status'],
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  processing: { label: 'กำลังประมวลผล', className: 'text-amber-600', icon: Loader2 },
  ready: { label: 'พร้อมใช้', className: 'text-emerald-600', icon: CheckCircle2 },
  failed: { label: 'ไม่สำเร็จ', className: 'text-rose-600', icon: AlertCircle },
}

function DocumentRow({
  doc,
  busy,
  onAsk,
  onQuiz,
  onRoadmap,
  onDelete,
  onRetry,
}: {
  doc: LibraryDocument
  busy: boolean
  onAsk: () => void
  onQuiz: () => void
  onRoadmap: () => void
  onDelete: () => void
  onRetry: () => void
}) {
  const meta = STATUS_META[doc.status]
  const StatusIcon = meta.icon
  const ready = doc.status === 'ready'
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            doc.scope === 'course'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40'
              : 'bg-violet-100 text-violet-700 dark:bg-violet-950/40'
          )}
        >
          {doc.kind === 'url' ? (
            <Link2 className="h-4 w-4" />
          ) : doc.kind === 'text' ? (
            <Type className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium">{doc.title}</span>
            {doc.scope === 'course' ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Users className="h-3 w-3" /> {doc.course?.code ?? 'รายวิชา'}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Lock className="h-3 w-3" /> ส่วนตัว
              </Badge>
            )}
            <span className={cn('flex items-center gap-1 text-[11px]', meta.className)}>
              <StatusIcon className={cn('h-3 w-3', doc.status === 'processing' && 'animate-spin')} />
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {doc.scope === 'course' && (
              <>
                โดย {displayName(doc.owner)} ({roleLabel(doc.owner.role)}) ·{' '}
              </>
            )}
            {ready && `${doc.chunks} ชิ้นความรู้ · ${doc.chars.toLocaleString()} ตัวอักษร · `}
            {timeAgo(doc.created_at)}
          </p>
          {doc.status === 'failed' && doc.error && (
            <p className="mt-1 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
              {doc.error}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!ready} onClick={onAsk}>
          <MessageCircleQuestion className="h-3.5 w-3.5" /> ถาม AI จากเอกสารนี้
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!ready} onClick={onQuiz}>
          <GraduationCap className="h-3.5 w-3.5" /> สร้างควิซ
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!ready} onClick={onRoadmap}>
          <Map className="h-3.5 w-3.5" /> สร้าง Roadmap
        </Button>
        {doc.status === 'failed' && doc.can_manage && doc.kind !== 'text' && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> ลองใหม่
          </Button>
        )}
        {doc.can_manage && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 text-xs text-rose-600"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> ลบ
          </Button>
        )}
      </div>
    </div>
  )
}
