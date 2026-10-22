'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, GraduationCap, HelpCircle, Library, Map, Paperclip, Sparkles, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@siet/platform/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useCourses, useCreatePost, useShareableRoadmaps, useWallet } from '@siet/platform/lib/hooks/use-community'
import { useQuizSessions } from '@siet/platform/lib/hooks/use-features'
import { displayName, formatBytes, roomLabel } from '@siet/platform/lib/utils/community-format'
import { openQuizApp, openRoadmapApp } from '@siet/platform/lib/external-apps'
import { ShareMyWorkDialog } from './ShareMyWorkDialog'
import type { PostType } from '@siet/platform/lib/api/community'

interface CreatorBoxProps {
  defaultCourseId: number | null
  isStaff: boolean
  placeholder?: string
  joinedCoursesOnly?: boolean
}

type Mode = 'summary' | 'embed' | 'question' | 'material'

export function CreatorBox({
  defaultCourseId,
  isStaff,
  placeholder = 'แบ่งปันบันทึก คำถาม หรือไฟล์...',
  joinedCoursesOnly = false,
}: CreatorBoxProps) {
  const user = useAuthStore((s) => s.user)
  const { data: courses } = useCourses()
  const { data: wallet } = useWallet()
  const create = useCreatePost()
  const fileRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('summary')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [courseId, setCourseId] = useState<number | null>(defaultCourseId)
  const [file, setFile] = useState<File | null>(null)
  const [embedType, setEmbedType] = useState<'quiz' | 'roadmap'>('quiz')
  const [embedId, setEmbedId] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const { data: quizzes } = useQuizSessions()
  const { data: roadmaps } = useShareableRoadmaps()

  useEffect(() => {
    setCourseId(defaultCourseId)
  }, [defaultCourseId])

  const courseOptions = useMemo(
    () =>
      (courses ?? []).filter(
        (course) => !joinedCoursesOnly || (course.joined && course.kind !== 'club')
      ),
    [courses, joinedCoursesOnly]
  )
  const bonus = wallet?.rules.creator_bonus_summary ?? 2

  const reset = () => {
    setTitle('')
    setContent('')
    setTags('')
    setFile(null)
    setEmbedId('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const canSubmit = (() => {
    if (create.isPending) return false
    if (mode === 'embed') return !!embedId
    if (mode === 'question') return content.trim().length > 0 || title.trim().length > 0
    return content.trim().length > 0 || !!file
  })()

  const submit = () => {
    const type: PostType = mode === 'embed' ? embedType : mode
    create.mutate(
      {
        type,
        title: title.trim() || undefined,
        content: content.trim() || undefined,
        course_id: courseId,
        tags: tags.trim() || undefined,
        embed_type: mode === 'embed' ? embedType : undefined,
        embed_id: mode === 'embed' ? embedId : undefined,
        file: mode === 'embed' ? null : file,
      },
      {
        onSuccess: () => {
          reset()
          setIsOpen(false)
        },
      }
    )
  }

  return (
    <>
      <Card className="overflow-hidden rounded-2xl border border-slate-200/90 bg-card shadow-xs transition-shadow hover:shadow-md">
        <CardContent className="p-2.5">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="สร้างโพสต์"
            /* MERGE-OWNER (undecided, Poh #4 vs SpriteUm 254a779): kept staging's version (Poh's community redesign).
            SpriteUm's version, to swap in if SpriteUm owns this:
              className="flex w-full items-center gap-3 rounded-2xl bg-slate-100/70 dark:bg-muted/80 px-3.5 py-3 text-left transition-all hover:bg-slate-100 hover:ring-1 hover:ring-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            */
            className="group flex w-full cursor-pointer items-center gap-3 rounded-full border border-transparent bg-muted/80 px-2.5 py-2 text-left transition-all duration-200 hover:border-pink-200/80 hover:bg-slate-50/80 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
          >
            <Avatar size="sm" src={user?.avatar_url} name={displayName(user)} />
            <span className="min-w-0 flex-1 truncate px-1 text-sm text-muted-foreground">
              {placeholder}
            </span>
          </button>
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-border/60">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMode('embed')
                  setEmbedType('quiz')
                  setIsOpen(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100/90 active:scale-95 dark:bg-rose-950/40 dark:text-rose-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>แชร์ควิซ AI</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('summary')
                  setIsOpen(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition-all hover:bg-amber-100/90 active:scale-95 dark:bg-amber-950/40 dark:text-amber-300"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>สรุปบทเรียน</span>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('embed')
                  setEmbedType('roadmap')
                  setIsOpen(true)
                }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                title="แชร์ Roadmap"
              >
                <Map className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Roadmap</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('question')
                  setIsOpen(true)
                }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                title="ถามข้อสงสัย"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ถาม</span>
              </button>
            </div>
          </div>
          {joinedCoursesOnly && (
            <label className="mt-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <span className="shrink-0">โพสต์ไปยัง:</span>
              <select
                aria-label="เลือกวิชาสำหรับโพสต์"
                className="h-7 min-w-0 flex-1 rounded-full border border-pink-100 bg-background px-2 text-xs text-foreground"
                value={courseId ?? ''}
                onChange={(event) =>
                  setCourseId(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">เลือกวิชา</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {roomLabel(course)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="community-theme max-h-[90vh] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="text-center text-base">สร้างโพสต์</DialogTitle>
          </DialogHeader>
          <div className="no-scrollbar space-y-4 overflow-x-hidden overflow-y-auto px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Avatar src={user?.avatar_url} name={displayName(user)} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName(user)}</p>
                <p className="text-xs text-muted-foreground">แบ่งปันกับชุมชนการเรียนรู้</p>
              </div>
            </div>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="no-scrollbar h-9 w-full justify-start overflow-x-auto rounded-lg border-border bg-muted/70 shadow-none">
                <TabsTrigger value="summary" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" /> แชร์สรุป
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">+{bonus}</Badge>
                </TabsTrigger>
                <TabsTrigger value="embed" className="gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5" /> ฝัง Quiz / Roadmap
                </TabsTrigger>
                <TabsTrigger value="question" className="gap-1.5 text-xs">
                  <HelpCircle className="h-3.5 w-3.5" /> ตั้งกระทู้ถาม
                </TabsTrigger>
                {isStaff && (
                  <TabsTrigger value="material" className="gap-1.5 text-xs">
                    <Library className="h-3.5 w-3.5" /> สื่อการสอน
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="summary" className="mt-3 space-y-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="หัวข้อสรุป (ไม่บังคับ)" maxLength={200} className="rounded-lg bg-background" />
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="คุณกำลังเรียนหรือสงสัยอะไรอยู่? เล่าประเด็นสำคัญของสรุปนี้…" className="rounded-lg bg-background" />
              </TabsContent>

              <TabsContent value="question" className="mt-3 space-y-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="คำถามสั้น ๆ (ไม่บังคับ)" maxLength={200} className="rounded-lg bg-background" />
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="อธิบายรายละเอียด สิ่งที่ลองทำแล้ว หรือแนบไฟล์การบ้าน" className="rounded-lg bg-background" />
              </TabsContent>

              <TabsContent value="material" className="mt-3 space-y-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อสื่อการสอน" maxLength={200} className="rounded-lg bg-background" />
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="คำอธิบายสั้น ๆ สำหรับนักศึกษา" className="rounded-lg bg-background" />
              </TabsContent>

              <TabsContent value="embed" className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={embedType === 'quiz' ? 'default' : 'outline'} onClick={() => { setEmbedType('quiz'); setEmbedId('') }}>
                    <GraduationCap className="mr-1 h-4 w-4" /> AI Quiz
                  </Button>
                  <Button type="button" size="sm" variant={embedType === 'roadmap' ? 'default' : 'outline'} onClick={() => { setEmbedType('roadmap'); setEmbedId('') }}>
                    <Map className="mr-1 h-4 w-4" /> AI Roadmap
                  </Button>
                  <Button type="button" size="sm" variant="secondary" className="ml-auto" onClick={() => setPickerOpen(true)}>
                    <Sparkles className="mr-1 h-4 w-4" /> เลือกจากผลงานของฉัน
                  </Button>
                </div>
                <ShareMyWorkDialog
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  defaultCourseId={courseId}
                  initialKind={embedType}
                />
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={embedId}
                  onChange={(e) => setEmbedId(e.target.value)}
                >
                  <option value="">— เลือก{embedType === 'quiz' ? 'ควิซ' : 'Roadmap'}ที่คุณสร้างไว้ —</option>
                  {embedType === 'quiz'
                    ? quizzes?.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.topic} ({q.question_count} ข้อ)
                        </option>
                      ))
                    : roadmaps?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} ({r.node_count} โหนด)
                        </option>
                      ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  ยังไม่มี?{' '}
                  <button
                    type="button"
                    onClick={() => void (embedType === 'quiz' ? openQuizApp() : openRoadmapApp())}
                    className="text-primary hover:underline"
                  >
                    ไปสร้างที่แอป {embedType === 'quiz' ? 'AI Quiz ↗' : 'AI Roadmap'}
                  </button>{' '}
                  · แชร์ควิซแล้วเพื่อนเล่นจบ คุณได้แต้มคืน +1/คน
                </p>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="เขียนคำโปรย เช่น ควิซเตรียมสอบ OS ทำเสร็จภายใน 10 นาที" className="rounded-lg bg-background" />
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={courseId ?? ''}
                onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">ไม่ระบุห้อง</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {roomLabel(c)}
                  </option>
                ))}
              </select>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#แท็ก คั่นด้วยเว้นวรรค" className="h-8 w-44 rounded-lg bg-background text-xs" />
              {mode !== 'embed' && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt,.docx,.pptx,.zip"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="h-3.5 w-3.5" /> แนบไฟล์ (PDF)
                  </Button>
                  {file && (
                    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {file.name} <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                      <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <DialogFooter className="border-t border-border px-5 py-4 sm:px-6">
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="w-full"
            >
              {create.isPending ? 'กำลังโพสต์…' : 'โพสต์'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
