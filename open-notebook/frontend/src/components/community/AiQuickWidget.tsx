'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bot, Coins, ExternalLink, FileText, Lock, RotateCcw, Send, Users, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAsk, useCourses, useWallet, toastApiError } from '@/lib/hooks/use-community'
import type { AskCitation } from '@/lib/api/community'
import { describeApiError } from '@/lib/api/community'
import type { AskScope } from '@/lib/api/library'
import { answerSourceNote, roomLabel } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
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
  /** A library document the user asked about ("ถาม AI จากเอกสารนี้"). */
  focusDocument?: AskFocus | null
  onClearFocus?: () => void
}

export function AiQuickWidget({ courseId, focusDocument, onClearFocus }: AiQuickWidgetProps) {
  const ask = useAsk()
  const { data: wallet } = useWallet()
  const { data: courses } = useCourses()
  const [mode, setMode] = useState<'single' | 'session'>('single')
  const [scope, setScope] = useState<AskScope>('auto')
  const [scopeCourseId, setScopeCourseId] = useState<number | null>(courseId ?? null)
  const [sessionId, setSessionId] = useState<string | null>(null)
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
    if (!courseId) return
    // Discussion rooms have no library; selecting one must not silently become
    // a course scope the RAG cannot search.
    const room = (courses ?? []).find((c) => c.id === courseId)
    if (room && room.kind === 'club') return
    setScopeCourseId(courseId)
  }, [courseId, courses])

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
      },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.answer,
              citations: data.citations,
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
  }

  const nextCost = sessionId ? 0 : mode === 'session' ? costs?.rag_session ?? 4 : costs?.rag_question ?? 1

  return (
    <Card ref={cardRef} id="ai-quick-prompt" className="border-violet-200/70 dark:border-violet-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Bot className="h-4 w-4" />
          </span>
          AI Quick Prompt
          <Link
            href="/community/ask"
            className="ml-auto flex items-center gap-1 text-[11px] font-normal text-violet-700 hover:underline dark:text-violet-300"
          >
            เปิดหน้าเต็ม <ExternalLink className="h-3 w-3" />
          </Link>
        </CardTitle>

        {/* knowledge scope */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-medium text-muted-foreground">ค้นคำตอบจาก</p>
          {focusDocument ? (
            <div className="flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] dark:bg-violet-950/40">
              <FileText className="h-3.5 w-3.5 shrink-0 text-violet-600" />
              <span className="min-w-0 flex-1 truncate">{focusDocument.title}</span>
              <button type="button" onClick={onClearFocus} aria-label="ยกเลิกการเจาะจงเอกสาร">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <ScopeChip active={scope === 'auto'} onClick={() => setScope('auto')}>
                ทุกแหล่งของฉัน
              </ScopeChip>
              <ScopeChip active={scope === 'course'} onClick={() => setScope('course')} icon={Users}>
                รายวิชา
              </ScopeChip>
              <ScopeChip active={scope === 'personal'} onClick={() => setScope('personal')} icon={Lock}>
                ไฟล์ของฉัน
              </ScopeChip>
            </div>
          )}
          {!focusDocument && scope === 'course' && (
            <select
              className="h-7 w-full rounded-md border bg-background px-2 text-[11px]"
              value={scopeCourseId ?? ''}
              onChange={(e) => setScopeCourseId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— เลือกวิชา —</option>
              {(courses ?? [])
                .filter((c) => c.kind !== 'club')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {roomLabel(c)}
                  </option>
                ))}
            </select>
          )}
          {!focusDocument && scope === 'course' && scopeCourse && (
            <p className="text-[10px] text-muted-foreground">
              ตอบจากเอกสารที่อาจารย์อัปโหลดในวิชา {scopeCourse.code} เท่านั้น
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
        <div ref={listRef} className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-2">
          {messages.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">
              ถาม KMITL RAG AI ด่วน ๆ ได้เลย เช่น &ldquo;สรุป deadlock 4 เงื่อนไข&rdquo; คำตอบอ้างอิงจากเอกสาร
              ในขอบเขตที่เลือก (ไม่เกิน 3 แหล่ง, 150–300 คำ)
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border'
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === 'assistant' && m.scopeLabel && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {answerSourceNote(m.grounded, m.scopeLabel, m.citations?.length ?? 0)}
                  </p>
                )}
                {m.citations && m.citations.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 border-t pt-1.5 text-[10px] text-muted-foreground">
                    {m.citations.map((c) => (
                      <li key={c.index} className="truncate" title={c.snippet}>
                        [{c.index}] {c.title}
                      </li>
                    ))}
                  </ul>
                )}
                {m.role === 'assistant' && (m.charged ?? 0) > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Coins className="h-3 w-3" /> ใช้ {m.charged} แต้ม
                  </p>
                )}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border bg-background px-3 py-2 text-xs text-muted-foreground">
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
          <Textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="ถาม KMITL RAG AI ด่วน…"
            className="min-h-0 resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {exempt ? 'ไม่ตัดแต้ม (อาจารย์/ผู้ดูแล)' : nextCost === 0 ? 'ใช้ข้อความในเซสชัน' : `จะตัด ${nextCost} แต้ม`}
            </span>
            <Button type="submit" size="sm" disabled={!question.trim() || ask.isPending} className="gap-1">
              <Send className="h-3.5 w-3.5" /> ถาม
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
        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition',
        active
          ? 'border-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100'
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
        'rounded-full border px-2.5 py-0.5 text-[11px] transition',
        active ? 'border-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100' : 'hover:bg-accent'
      )}
    >
      {children}
    </button>
  )
}
