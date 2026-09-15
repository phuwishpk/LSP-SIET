'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, FileText, GraduationCap, Map, Share2, Sparkles, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuizSessions, useRoadmapSessions } from '@/lib/hooks/use-features'
import { useCourses, useCreatePost } from '@/lib/hooks/use-community'
import { notesApi } from '@/lib/api/notes'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import { timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

type WorkKind = 'quiz' | 'roadmap' | 'note'

interface SelectedWork {
  kind: WorkKind
  id: string
  title: string
  subtitle: string
  content?: string | null
}

interface ShareMyWorkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCourseId?: number | null
  initialKind?: WorkKind
}

const MAX_NOTE_CHARS = 20000

/**
 * "เลือกผลงาน AI ของฉันขึ้น Community" – lets a student pick one of their own
 * quizzes / roadmaps / notes and post it to the feed with a caption.
 */
export function ShareMyWorkDialog({
  open,
  onOpenChange,
  defaultCourseId = null,
  initialKind = 'quiz',
}: ShareMyWorkDialogProps) {
  const [kind, setKind] = useState<WorkKind>(initialKind)
  const [selected, setSelected] = useState<SelectedWork | null>(null)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [courseId, setCourseId] = useState<number | null>(defaultCourseId)

  const { data: quizzes, isLoading: loadingQuizzes } = useQuizSessions()
  const { data: roadmaps, isLoading: loadingRoadmaps } = useRoadmapSessions()
  const { data: notes, isLoading: loadingNotes } = useQuery({
    queryKey: ['community', 'my-notes'],
    queryFn: () => notesApi.list(),
    enabled: open,
  })
  const { data: courses } = useCourses()
  const create = useCreatePost()

  useEffect(() => {
    if (open) {
      setKind(initialKind)
      setSelected(null)
      setCaption('')
      setTags('')
      setCourseId(defaultCourseId)
    }
  }, [open, initialKind, defaultCourseId])

  const items = useMemo<SelectedWork[]>(() => {
    if (kind === 'quiz') {
      return (quizzes ?? []).map((q) => ({
        kind: 'quiz',
        id: q.id,
        title: q.topic,
        subtitle: `${q.question_count} ข้อ · ${timeAgo(q.created)}`,
      }))
    }
    if (kind === 'roadmap') {
      return (roadmaps ?? []).map((r) => ({
        kind: 'roadmap',
        id: r.id,
        title: r.title,
        subtitle: `${r.node_count} ด่าน · ${timeAgo(r.created)}`,
        content: r.description,
      }))
    }
    return (notes ?? [])
      .filter((n) => (n.content || '').trim().length > 0)
      .map((n) => ({
        kind: 'note',
        id: n.id,
        title: n.title || 'โน้ตไม่มีชื่อ',
        subtitle: `${(n.content || '').length.toLocaleString()} ตัวอักษร · ${timeAgo(n.created)}`,
        content: n.content,
      }))
  }, [kind, quizzes, roadmaps, notes])

  const loading =
    (kind === 'quiz' && loadingQuizzes) ||
    (kind === 'roadmap' && loadingRoadmaps) ||
    (kind === 'note' && loadingNotes)

  const submit = () => {
    if (!selected) return
    const base = {
      course_id: courseId,
      tags: tags.trim() || undefined,
    }
    if (selected.kind === 'note') {
      create.mutate(
        {
          ...base,
          type: 'summary',
          title: selected.title,
          content: [caption.trim(), (selected.content || '').slice(0, MAX_NOTE_CHARS)]
            .filter(Boolean)
            .join('\n\n'),
        },
        { onSuccess: () => onOpenChange(false) }
      )
      return
    }
    create.mutate(
      {
        ...base,
        type: selected.kind,
        embed_type: selected.kind,
        embed_id: selected.id,
        title: selected.title,
        content: caption.trim() || undefined,
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  const emptyState: Record<WorkKind, { text: string; action: () => void; label: string }> = {
    quiz: {
      text: 'ยังไม่มีควิซที่คุณสร้าง',
      action: () => void openQuizApp(),
      label: 'ไปสร้างที่แอป AI Quiz (8 แต้ม) ↗',
    },
    roadmap: {
      text: 'ยังไม่มี Roadmap ที่คุณสร้าง',
      action: () => void openRoadmapApp(),
      label: 'ไปสร้างที่แอป AI Roadmap (15 แต้ม) ↗',
    },
    note: {
      text: 'ยังไม่มีโน้ตสรุปของคุณ · ใช้แท็บ “แชร์สรุป” ในกล่องโพสต์เพื่อพิมพ์หรือแนบไฟล์สรุปได้เลย',
      action: () => undefined,
      label: '',
    },
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> เลือกผลงาน AI ของฉันขึ้น Community
          </DialogTitle>
          <DialogDescription>
            เลือกควิซ Roadmap หรือโน้ตสรุปที่คุณสร้างไว้ แล้วโพสต์ให้เพื่อนในฟีด · แชร์ควิซแล้วเพื่อนเล่นจบได้แต้มคืน +1/คน
            · แชร์โน้ตสรุปได้ Creator Points +2
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={kind}
          onValueChange={(v) => {
            setKind(v as WorkKind)
            setSelected(null)
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="quiz" className="flex-1 gap-1.5">
              <GraduationCap className="h-4 w-4" /> ควิซของฉัน
              {quizzes && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{quizzes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="roadmap" className="flex-1 gap-1.5">
              <Map className="h-4 w-4" /> Roadmap ของฉัน
              {roadmaps && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{roadmaps.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="note" className="flex-1 gap-1.5">
              <FileText className="h-4 w-4" /> โน้ตสรุปของฉัน
              {notes && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{notes.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {(['quiz', 'roadmap', 'note'] as WorkKind[]).map((k) => (
            <TabsContent key={k} value={k} className="mt-3">
              <ScrollArea className="h-64 rounded-lg border">
                <div className="space-y-1 p-2">
                  {loading && (
                    <>
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </>
                  )}
                  {!loading && items.length === 0 && (
                    <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                      <Sparkles className="h-6 w-6" />
                      {emptyState[k].text}
                      {emptyState[k].label && (
                        <Button size="sm" variant="outline" onClick={emptyState[k].action}>
                          {emptyState[k].label}
                        </Button>
                      )}
                    </div>
                  )}
                  {!loading &&
                    items.map((item) => {
                      const active = selected?.id === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelected(item)}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-md border p-3 text-left transition hover:bg-accent',
                            active && 'border-primary bg-primary/5'
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                              k === 'quiz' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40',
                              k === 'roadmap' && 'bg-orange-100 text-orange-700 dark:bg-orange-950/40',
                              k === 'note' && 'bg-blue-100 text-blue-700 dark:bg-blue-950/40'
                            )}
                          >
                            {k === 'quiz' ? <GraduationCap className="h-4 w-4" /> : k === 'roadmap' ? <Map className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            <span className="block text-xs text-muted-foreground">{item.subtitle}</span>
                            {item.content && (
                              <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{item.content}</span>
                            )}
                          </span>
                          {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                        </button>
                      )
                    })}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        <div className="space-y-2">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            placeholder={
              selected
                ? `เขียนคำโปรยให้ "${selected.title}" เช่น ทำไว้เตรียมสอบกลางภาค ลองทำกันดู`
                : 'เลือกผลงานด้านบนก่อน แล้วเขียนคำโปรยสั้น ๆ'
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={courseId ?? ''}
              onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">ไม่ระบุวิชา</option>
              {(courses ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#แท็ก คั่นด้วยเว้นวรรค"
              className="h-8 w-44 text-xs"
            />
            {selected && (
              <span className="text-xs text-muted-foreground">
                เลือกแล้ว: <span className="font-medium text-foreground">{selected.title}</span>
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button disabled={!selected || create.isPending} onClick={submit} className="gap-1.5">
              <Share2 className="h-4 w-4" />
              {create.isPending ? 'กำลังโพสต์…' : 'โพสต์ขึ้น Community'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Prominent trigger button for the dialog. */
export function ShareMyWorkButton({
  defaultCourseId = null,
  className,
  size = 'default',
}: {
  defaultCourseId?: number | null
  className?: string
  size?: 'default' | 'sm' | 'lg'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size={size}
        onClick={() => setOpen(true)}
        className={cn(
          'gap-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow hover:from-orange-600 hover:to-rose-600',
          className
        )}
      >
        <Upload className="h-4 w-4" /> เลือกผลงาน AI ของฉันขึ้น Community
      </Button>
      <ShareMyWorkDialog open={open} onOpenChange={setOpen} defaultCourseId={defaultCourseId} />
    </>
  )
}
