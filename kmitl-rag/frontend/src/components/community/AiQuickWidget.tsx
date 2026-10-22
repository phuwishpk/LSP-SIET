'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUp, Bot, Coins, ExternalLink, FileText, Lock, RotateCcw, Users, X } from 'lucide-react'
import { AnswerReferences } from '@siet/kmitl-rag/components/community/AnswerReferences'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAsk, useCourses, useWallet, toastApiError } from '@siet/platform/lib/hooks/use-community'
import type { AskCitation, AskWebSource } from '@siet/platform/lib/api/community'
import { describeApiError } from '@siet/platform/lib/api/community'
import type { AskScope } from '@siet/platform/lib/api/library'
import { answerSourceNote, roomLabel } from '@siet/platform/lib/utils/community-format'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
  webSources?: AskWebSource[]
  charged?: number
  scopeLabel?: string
  grounded?: boolean
}

export interface AskFocus {
  id: number
  title: string
}

interface AiQuickWidgetProps {
  /** Course currently being browsed – offered as a one-click scope. */
  courseId?: number | null
  /** Restrict the quick widget to the viewer's enrolled course libraries. */
  enrolledCoursesOnly?: boolean
  /** A library document the user asked about ("ถาม AI จากเอกสารนี้"). */
  focusDocument?: AskFocus | null
  onClearFocus?: () => void
}

export function AiQuickWidget({
  courseId,
  enrolledCoursesOnly = false,
  focusDocument,
  onClearFocus,
}: AiQuickWidgetProps) {
  const ask = useAsk()
  const { data: wallet } = useWallet()
  const { data: courses } = useCourses()
  const [mode, setMode] = useState<'single' | 'session'>('single')
  const [scope, setScope] = useState<AskScope>('auto')
  const [scopeCourseId, setScopeCourseId] = useState<number | null>(courseId ?? null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  // The widget's exchanges are stored too; they show up in the history on /community/ask.
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const costs = wallet?.rules.costs
  const sessionMessages = wallet?.rules.rag_session_messages ?? 5
  const exempt = wallet?.exempt ?? false
  // Only official course rooms carry a shared library, so discussion rooms
  // are not offered as a retrieval scope.
  const myCourses = useMemo(
    () => (courses ?? []).filter((c) => c.joined && c.kind !== 'club'),
    [courses]
  )

  useEffect(() => {
    if (enrolledCoursesOnly) {
      setScope('course')
      if (courseId && myCourses.some((course) => course.id === courseId)) {
        setScopeCourseId(courseId)
      } else if (!myCourses.some((course) => course.id === scopeCourseId)) {
        setScopeCourseId(myCourses[0]?.id ?? null)
      }
      return
    }
    if (!courseId) return
    // Discussion rooms have no library; selecting one must not silently become
    // a course scope the RAG cannot search.
    const room = (courses ?? []).find((c) => c.id === courseId)
    if (room && room.kind === 'club') return
    setScopeCourseId(courseId)
  }, [courseId, courses, enrolledCoursesOnly, myCourses, scopeCourseId])

  // Clicking "ask about this document" in the library switches the widget scope.
  useEffect(() => {
    if (focusDocument) {
      setScope('document')
      setSessionId(null)
      setCreditsLeft(null)
    }
  }, [focusDocument])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, ask.isPending])

  const activeScope: AskScope = focusDocument ? 'document' : scope
  const scopeCourse =
    myCourses.find((c) => c.id === scopeCourseId) ??
    (courses ?? []).find((c) => c.id === scopeCourseId && c.kind !== 'club')

  const submit = () => {
    const q = question.trim()
    if (!q || ask.isPending) return
    if (activeScope === 'course' && !scopeCourseId) {
      toastApiError({ message: 'เลือกวิชาก่อนถามแบบเจาะจงรายวิชา' }, 'เลือกวิชาก่อน')
      return
    }
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setQuestion('')
    ask.mutate(
      {
        question: q,
        session_id: sessionId,
        mode,
        scope: activeScope,
        course_id: activeScope === 'course' ? scopeCourseId : null,
        document_ids: focusDocument ? [focusDocument.id] : [],
        conversation_id: conversationId,
      },
      {
        onSuccess: (data) => {
          if (data.conversation_id) setConversationId(data.conversation_id)
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.answer,
              citations: data.citations,
              webSources: data.web_sources ?? [],
              charged: data.charged,
              scopeLabel: data.scope_label,
              grounded: data.grounded,
            },
          ])
          if (data.session_id) {
            setSessionId(data.session_id)
            setCreditsLeft(data.credits_left)
          }
        },
        onError: (error) => {
          const info = describeApiError(error)
          if (info.kind === 'rag_session_exhausted') {
            setSessionId(null)
            setCreditsLeft(null)
          }
          toastApiError(error)
          setMessages((prev) => prev.slice(0, -1))
          setQuestion(q)
        },
      }
    )
  }

  const resetSession = () => {
    setSessionId(null)
    setCreditsLeft(null)
    setMessages([])
    setConversationId(null)
  }

  const nextCost = sessionId ? 0 : mode === 'session' ? costs?.rag_session ?? 4 : costs?.rag_question ?? 1

  return (
    <Card ref={cardRef} id="ai-quick-prompt" className="relative w-full border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-2xs">
            <Bot className="h-4 w-4" />
          </span>
          ถาม KMITL RAG AI
          <Link
            href={conversationId ? `/community/ask?c=${encodeURIComponent(conversationId)}` : '/community/ask'}
            className="ml-auto flex items-center gap-1 text-xs font-normal text-primary hover:underline"
          >
            {conversationId ? 'ถามต่อในหน้าเต็ม' : 'เปิดหน้าเต็ม'} <ExternalLink className="h-3 w-3" />
          </Link>
        </CardTitle>

        {/* knowledge scope */}
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground">ค้นคำตอบจาก</p>
          {focusDocument ? (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{focusDocument.title}</span>
              <button type="button" onClick={onClearFocus} aria-label="ยกเลิกการเจาะจงเอกสาร">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {!enrolledCoursesOnly && (
                <ScopeChip active={scope === 'auto'} onClick={() => setScope('auto')}>
                  ทุกแหล่งของฉัน
                </ScopeChip>
              )}
              <ScopeChip active={scope === 'course'} onClick={() => setScope('course')} icon={Users}>
                {enrolledCoursesOnly ? 'วิชาที่ลงเรียน' : 'รายวิชา'}
              </ScopeChip>
              {!enrolledCoursesOnly && (
                <ScopeChip active={scope === 'personal'} onClick={() => setScope('personal')} icon={Lock}>
                  ไฟล์ของฉัน
                </ScopeChip>
              )}
            </div>
          )}
          {!focusDocument && scope === 'course' && (
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              value={scopeCourseId ?? ''}
              onChange={(e) => setScopeCourseId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— เลือกวิชา —</option>
              {(enrolledCoursesOnly ? myCourses : (courses ?? []).filter((c) => c.kind !== 'club'))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {roomLabel(c)}
                  </option>
                ))}
            </select>
          )}
          {!focusDocument && scope === 'course' && scopeCourse && (
            <p className="text-[11px] font-medium text-muted-foreground">
              ตอบจากเอกสารที่อาจารย์อัปโหลดในวิชา {scopeCourse.code} เท่านั้น
            </p>
          )}
          {!focusDocument && enrolledCoursesOnly && myCourses.length === 0 && (
            <p className="text-[11px] font-medium text-muted-foreground">
              เข้าร่วมชั้นเรียนก่อนเพื่อถามจากคลังเอกสารรายวิชา
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {sessionId ? (
            <>
              <Badge variant="secondary" className="gap-1">
                เซสชันต่อเนื่อง · เหลือ {creditsLeft ?? 0}/{sessionMessages} ข้อความ
              </Badge>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetSession}>
                <RotateCcw className="mr-1 h-3 w-3" /> เริ่มใหม่
              </Button>
            </>
          ) : (
            <>
              <ModeChip active={mode === 'single'} onClick={() => setMode('single')}>
                คำถามเดี่ยว · {exempt ? 'ฟรี' : `${costs?.rag_question ?? 1} แต้ม`}
              </ModeChip>
              <ModeChip active={mode === 'session'} onClick={() => setMode('session')}>
                เซสชัน {sessionMessages} ข้อความ · {exempt ? 'ฟรี' : `${costs?.rag_session ?? 4} แต้ม`}
              </ModeChip>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        <div ref={listRef} className="no-scrollbar max-h-72 space-y-2 overflow-x-hidden overflow-y-auto rounded-lg border bg-muted/30 p-2">
          {messages.length === 0 && (
            <p className="p-2 text-[11px] font-medium text-muted-foreground">
              ถาม KMITL RAG AI ด่วน ๆ ได้เลย เช่น &ldquo;สรุป deadlock 4 เงื่อนไข&rdquo; คำตอบอ้างอิงจากเอกสาร
              ในขอบเขตที่เลือก (ไม่เกิน 6 ข้อความ, 150–350 คำ)
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  m.role === 'user' ? 'bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-2xs' : 'bg-background border'
                )}
              >
                {m.role === 'assistant' ? (
                  <div className="[&_.prose]:text-xs [&_p:last-child]:mb-0">
                    <MarkdownRenderer>{m.content}</MarkdownRenderer>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
                {m.role === 'assistant' && m.scopeLabel && (
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                    {answerSourceNote(m.grounded, m.scopeLabel, m.citations?.length ?? 0)}
                  </p>
                )}
                {m.role === 'assistant' && (
                  <AnswerReferences citations={m.citations} webSources={m.webSources} compact />
                )}
                {m.role === 'assistant' && (m.charged ?? 0) > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Coins className="h-3 w-3" /> ใช้ {m.charged} แต้ม
                  </p>
                )}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50/70 via-pink-50/50 to-rose-50/70 px-3.5 py-2.5 text-[11px] font-semibold text-rose-800 shadow-2xs dark:border-rose-900/60 dark:from-rose-950/40 dark:to-pink-950/30 dark:text-rose-300">
                กำลังค้นคลังความรู้และเรียบเรียงคำตอบ…
              </div>
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="space-y-1.5"
        >
          <div className="relative rounded-2xl border border-slate-200/90 bg-slate-50/70 p-2.5 transition-all focus-within:border-rose-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-rose-500/10 dark:border-zinc-800 dark:bg-zinc-800/50">
            <Textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="ถาม KMITL RAG AI..."
              className="min-h-0 resize-none border-0 bg-transparent pr-12 pb-8 text-sm shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <span className="absolute bottom-3 left-3 text-[11px] font-medium text-muted-foreground">
              {exempt ? 'ไม่ตัดแต้ม (อาจารย์/ผู้ดูแล)' : nextCost === 0 ? 'ใช้ข้อความในเซสชัน' : `${nextCost} เครดิตต่อคำถาม`}
            </span>
            <Button
              type="submit"
              size="icon"
              aria-label="ส่งคำถาม"
              disabled={!question.trim() || ask.isPending}
              className="absolute bottom-2 right-2 h-8 w-8 rounded-full"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </form>
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
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-9 items-center gap-1 rounded-full border px-2 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-2xs'
          : 'hover:bg-accent'
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </button>
  )
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-accent text-primary' : 'hover:bg-accent'
      )}
    >
      {children}
    </button>
  )
}
