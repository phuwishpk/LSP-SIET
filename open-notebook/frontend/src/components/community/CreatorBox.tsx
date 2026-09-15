'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FileText, GraduationCap, HelpCircle, Library, Map, Paperclip, Sparkles, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useCourses, useCreatePost, useWallet } from '@/lib/hooks/use-community'
import { useQuizSessions, useRoadmapSessions } from '@/lib/hooks/use-features'
import { displayName, formatBytes } from '@/lib/utils/community-format'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import { ShareMyWorkDialog } from './ShareMyWorkDialog'
import type { PostType } from '@/lib/api/community'
import { cn } from '@/lib/utils'

interface CreatorBoxProps {
  defaultCourseId: number | null
  isStaff: boolean
}

type Mode = 'summary' | 'embed' | 'question' | 'material'

export function CreatorBox({ defaultCourseId, isStaff }: CreatorBoxProps) {
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

  const { data: quizzes } = useQuizSessions()
  const { data: roadmaps } = useRoadmapSessions()

  const courseOptions = useMemo(() => courses ?? [], [courses])
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
      { onSuccess: reset }
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar src={user?.avatar_url} name={displayName(user)} />
          <div className="min-w-0 flex-1 space-y-3">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="h-9 w-full justify-start overflow-x-auto">
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
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="หัวข้อสรุป เช่น สรุปบทที่ 3 Linked List" maxLength={200} />
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="คุณกำลังเรียนหรือสงสัยอะไรอยู่? เล่าประเด็นสำคัญของสรุปนี้…" />
              </TabsContent>

              <TabsContent value="question" className="mt-3 space-y-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="คำถามสั้น ๆ เช่น ทำไม quicksort ถึง O(n log n)?" maxLength={200} />
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="อธิบายรายละเอียด สิ่งที่ลองทำแล้ว หรือแนบไฟล์การบ้าน" />
              </TabsContent>

              <TabsContent value="material" className="mt-3 space-y-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อสื่อการสอน เช่น สไลด์สัปดาห์ที่ 5" maxLength={200} />
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="คำอธิบายสั้น ๆ สำหรับนักศึกษา" />
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
                    ไปสร้างที่แอป {embedType === 'quiz' ? 'AI Quiz' : 'AI Roadmap'} ↗
                  </button>{' '}
                  หรือดู{' '}
                  <Link href="/features" className="text-primary hover:underline">
                    คลังของฉัน
                  </Link>{' '}
                  · แชร์ควิซแล้วเพื่อนเล่นจบ คุณได้แต้มคืน +1/คน
                </p>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="เขียนคำโปรย เช่น ควิซเตรียมสอบ OS ทำเสร็จภายใน 10 นาที" />
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={courseId ?? ''}
                onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">ไม่ระบุวิชา</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#แท็ก คั่นด้วยเว้นวรรค" className="h-8 w-44 text-xs" />
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
              <Button size="sm" className={cn('ml-auto h-8')} disabled={!canSubmit} onClick={submit}>
                {create.isPending ? 'กำลังโพสต์…' : 'โพสต์ลงฟีด'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
