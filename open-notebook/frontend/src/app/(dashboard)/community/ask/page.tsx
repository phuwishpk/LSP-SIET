'use client'

/**
 * KMITL RAG AI — full page.
 *
 * The right-hand widget on /community is for a quick one-liner; this page is
 * where a real study session happens: a roomy transcript, the retrieval scope
 * spelled out rather than hidden behind chips, citations you can actually read,
 * and the conversation kept in localStorage so navigating away does not lose it.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Bot,
  Coins,
  FileText,
  Globe2,
  Lock,
  RotateCcw,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CommunityHeader } from '@/components/community/CommunityHeader'
import { useAsk, useCourses, useWallet, toastApiError } from '@/lib/hooks/use-community'
import { useKnowledge, useLibrary } from '@/lib/hooks/use-library'
import { describeApiError, type AskCitation } from '@/lib/api/community'
import type { AskScope } from '@/lib/api/library'
import { answerSourceNote, roomLabel } from '@/lib/utils/community-format'
import { decodePick, pickFromParams, pickToAskFields } from '@/lib/utils/knowledge-pick'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
  charged?: number
  scopeLabel?: string
  grounded?: boolean
  at: number
}

const STORAGE_KEY = 'siet-rag-transcript'

const EXAMPLES = [
  'สรุปเงื่อนไข 4 ข้อของ deadlock พร้อมตัวอย่าง',
  'Paging กับ Segmentation ต่างกันอย่างไร',
  'ช่วยสรุปสไลด์สัปดาห์ที่แล้วเป็นหัวข้อย่อย',
  'ออกข้อสอบ 3 ข้อจากเนื้อหาที่อัปโหลดไว้',
]

export default function AskPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <AskContent />
    </Suspense>
  )
}

function AskContent() {
  const router = useRouter()
  const params = useSearchParams()
  const ask = useAsk()
  const { data: wallet } = useWallet()
  const { data: courses } = useCourses()
  const { data: library } = useLibrary()
  const { data: knowledge } = useKnowledge()

  const initialCourse = params.get('course') ? Number(params.get('course')) : null
  // ?doc=12, ?notebook=notebook:abc or ?source=source:xyz preselect the dropdown.
  const initialPick = pickFromParams(params)

  const [scope, setScope] = useState<AskScope>(
    initialPick ? 'document' : initialCourse ? 'course' : 'auto'
  )
  const [scopeCourseId, setScopeCourseId] = useState<number | null>(initialCourse)
  // Encoded dropdown value: an uploaded document, a whole notebook, or one source.
  const [pickValue, setPickValue] = useState<string | null>(initialPick)
  const [mode, setMode] = useState<'single' | 'session'>('single')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const costs = wallet?.rules.costs
  const sessionMessages = wallet?.rules.rag_session_messages ?? 5
  const exempt = wallet?.exempt ?? false

  // Only official course rooms have a shared library to search.
  const courseOptions = useMemo(
    () => (courses ?? []).filter((c) => c.kind !== 'club'),
    [courses]
  )
  const readyDocs = useMemo(
    () => (library?.items ?? []).filter((d) => d.status === 'ready'),
    [library]
  )
  const scopeCourse = courseOptions.find((c) => c.id === scopeCourseId)

  // Notebooks built by admins/teachers + course libraries: the same list for
  // every role, so a student can ask about material they cannot open in /notebooks.
  const sharedNotebooks = useMemo(() => knowledge?.notebooks ?? [], [knowledge])
  const pick = useMemo(() => decodePick(pickValue), [pickValue])
  // Course documents are already listed as sources of their course notebook, so
  // this group only carries the caller's own uploads (plus a deep-linked doc).
  const myDocs = useMemo(
    () =>
      readyDocs.filter(
        (d) => d.scope === 'personal' || (pick?.kind === 'doc' && pick.id === d.id)
      ),
    [pick, readyDocs]
  )
  const pickLabel = useMemo(() => {
    if (!pick) return null
    if (pick.kind === 'doc') {
      const doc = readyDocs.find((d) => d.id === pick.id)
      return doc ? { kind: 'document' as const, title: doc.title, count: 1 } : null
    }
    for (const nb of sharedNotebooks) {
      if (pick.kind === 'notebook' && nb.id === pick.id) {
        return { kind: 'notebook' as const, title: nb.name, count: nb.source_count }
      }
      const source = pick.kind === 'source' ? nb.sources.find((x) => x.id === pick.id) : undefined
      if (source) return { kind: 'document' as const, title: source.title, count: 1 }
    }
    return null
  }, [pick, readyDocs, sharedNotebooks])
  const nothingToPick = myDocs.length === 0 && sharedNotebooks.length === 0

  // --- keep the transcript across navigation (per browser, never sent anywhere)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setMessages(JSON.parse(raw) as Message[])
    } catch {
      /* private window or blocked storage – the page works without it */
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
    } catch {
      /* ignore */
    }
  }, [messages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, ask.isPending])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = useCallback(
    (raw?: string) => {
      const q = (raw ?? question).trim()
      if (!q || ask.isPending) return
      if (scope === 'course' && !scopeCourseId) {
        toastApiError({ message: 'เลือกวิชาก่อนถามแบบเจาะจงรายวิชา' }, 'เลือกวิชาก่อน')
        return
      }
      if (scope === 'document' && !pick) {
        toastApiError(
          { message: 'เลือก notebook หรือเอกสารก่อนถามแบบเจาะจงเอกสาร' },
          'เลือกเอกสารก่อน'
        )
        return
      }
      setMessages((prev) => [...prev, { role: 'user', content: q, at: Date.now() }])
      setQuestion('')
      ask.mutate(
        {
          question: q,
          session_id: sessionId,
          mode,
          scope,
          course_id: scope === 'course' ? scopeCourseId : null,
          document_ids: [],
          // A dropdown pick decides scope + ids together (whole notebook vs one document).
          ...(scope === 'document' ? pickToAskFields(pick) : {}),
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
                at: Date.now(),
              },
            ])
            if (data.session_id) {
              setSessionId(data.session_id)
              setCreditsLeft(data.credits_left)
            }
          },
          onError: (error) => {
            if (describeApiError(error).kind === 'rag_session_exhausted') {
              setSessionId(null)
              setCreditsLeft(null)
            }
            toastApiError(error)
            setMessages((prev) => prev.slice(0, -1))
            setQuestion(q)
          },
        }
      )
    },
    [ask, mode, pick, question, scope, scopeCourseId, sessionId]
  )

  const clearAll = () => {
    setMessages([])
    setSessionId(null)
    setCreditsLeft(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const nextCost = sessionId
    ? 0
    : mode === 'session'
    ? costs?.rag_session ?? 4
    : costs?.rag_question ?? 1

  return (
    <div className="min-h-screen bg-muted/30">
      <CommunityHeader
        query=""
        onSearch={(q) => router.push(q ? `/community?q=${encodeURIComponent(q)}` : '/community')}
        onOpenPost={(id) => router.push(`/community?post=${id}`)}
        onHome={() => router.push('/community')}
      />

      <div className="mx-auto max-w-[1200px] px-3 py-4 sm:px-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push('/community')}>
            <ArrowLeft className="h-4 w-4" /> กลับไปฟีด
          </Button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight">KMITL RAG AI</h1>
              <p className="text-xs text-muted-foreground">
                ถาม–ตอบจากเอกสารในคลังความรู้ พร้อมอ้างอิงแหล่งที่มา
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="ml-auto gap-1">
            <Coins className="h-3 w-3" /> {wallet?.balance ?? 0} แต้ม
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ---------------------------------------------------- settings */}
          <div className="space-y-3 lg:sticky lg:top-[72px] lg:self-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ค้นคำตอบจาก</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  <ScopeButton active={scope === 'auto'} icon={Globe2} onClick={() => setScope('auto')}>
                    ทุกแหล่งของฉัน
                  </ScopeButton>
                  <ScopeButton active={scope === 'course'} icon={Users} onClick={() => setScope('course')}>
                    รายวิชา
                  </ScopeButton>
                  <ScopeButton active={scope === 'personal'} icon={Lock} onClick={() => setScope('personal')}>
                    ไฟล์ของฉัน
                  </ScopeButton>
                  <ScopeButton active={scope === 'document'} icon={FileText} onClick={() => setScope('document')}>
                    เจาะจงเอกสาร
                  </ScopeButton>
                </div>

                {scope === 'course' && (
                  <select
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    value={scopeCourseId ?? ''}
                    onChange={(e) => setScopeCourseId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— เลือกวิชา —</option>
                    {courseOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {roomLabel(c)}
                      </option>
                    ))}
                  </select>
                )}

                {scope === 'document' && (
                  <select
                    aria-label="เลือก notebook หรือเอกสาร"
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    value={pickValue ?? ''}
                    onChange={(e) => setPickValue(e.target.value || null)}
                    disabled={nothingToPick}
                  >
                    <option value="">
                      {nothingToPick ? '— ยังไม่มีเอกสารให้เลือก —' : '— เลือก notebook หรือเอกสาร —'}
                    </option>
                    {myDocs.length > 0 && (
                      <optgroup label="ไฟล์ของฉัน">
                        {myDocs.map((d) => (
                          <option key={d.id} value={`doc:${d.id}`}>
                            {d.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {sharedNotebooks.map((nb) => (
                      <optgroup key={nb.id} label={`${nb.name} · ${nb.owner_label}`}>
                        <option value={`nb:${nb.id}`}>
                          ทั้ง notebook นี้ ({nb.source_count} เอกสาร)
                        </option>
                        {nb.sources.map((src) => (
                          <option key={src.id} value={`src:${src.id}`} disabled={src.chunks === 0}>
                            {src.title}
                            {src.chunks === 0 ? ' (ยังไม่พร้อมค้น)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}

                <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {scope === 'auto' &&
                    'ค้นจากไฟล์ของคุณเอง + คลังความรู้ของทุกวิชาที่คุณเข้าร่วม + notebook ที่อาจารย์และผู้ดูแลจัดทำไว้'}
                  {scope === 'course' &&
                    (scopeCourse
                      ? `ตอบจากเอกสารที่อาจารย์อัปโหลดในวิชา ${scopeCourse.code} เท่านั้น`
                      : 'เลือกวิชาที่ต้องการให้ AI อ่านเฉพาะเอกสารของวิชานั้น')}
                  {scope === 'personal' && 'ตอบจากไฟล์ที่คุณอัปโหลดเองเท่านั้น คนอื่นไม่เห็น'}
                  {scope === 'document' &&
                    (pickLabel
                      ? pickLabel.kind === 'notebook'
                        ? `ตอบจากทุกเอกสารใน notebook “${pickLabel.title}” (${pickLabel.count} เอกสาร)`
                        : `ตอบจากเอกสาร “${pickLabel.title}” เท่านั้น`
                      : nothingToPick
                      ? 'ยังไม่มี notebook จากอาจารย์/ผู้ดูแล และคุณยังไม่ได้อัปโหลดไฟล์'
                      : 'เลือก notebook ทั้งเล่ม หรือเอกสารหนึ่งฉบับ ให้ AI อ่านเฉพาะส่วนนั้น')}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  ถ้าขอบเขตที่เลือกยังไม่มีเอกสาร AI จะบอกตรง ๆ ว่าไม่มีข้อมูล ไม่เดาคำตอบ
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">รูปแบบการถาม</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sessionId ? (
                  <div className="space-y-2">
                    <Badge variant="secondary" className="w-full justify-center py-1">
                      เซสชันต่อเนื่อง · เหลือ {creditsLeft ?? 0}/{sessionMessages} ข้อความ
                    </Badge>
                    <p className="text-[11px] text-muted-foreground">
                      AI จำบทสนทนาก่อนหน้าได้จนกว่าโควตาจะหมด
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <ModeRow
                      active={mode === 'single'}
                      onClick={() => setMode('single')}
                      title="คำถามเดี่ยว"
                      desc="ถาม 1 ครั้ง จบในตัว"
                      cost={exempt ? 'ฟรี' : `${costs?.rag_question ?? 1} แต้ม`}
                    />
                    <ModeRow
                      active={mode === 'session'}
                      onClick={() => setMode('session')}
                      title={`เซสชัน ${sessionMessages} ข้อความ`}
                      desc="ถามต่อเนื่อง AI จำบริบทได้"
                      cost={exempt ? 'ฟรี' : `${costs?.rag_session ?? 4} แต้ม`}
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={clearAll}
                  disabled={messages.length === 0 && !sessionId}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> ล้างบทสนทนา
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------------------------------------- chat */}
          <Card className="flex min-h-[70vh] flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
              <div
                ref={listRef}
                className="min-h-[45vh] flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3"
              >
                {messages.length === 0 && !ask.isPending && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                      <Sparkles className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">เริ่มถามได้เลย</p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                        คำตอบจะอ้างอิงจากเอกสารในขอบเขตที่เลือกไว้ทางซ้าย ไม่เกิน 3 แหล่ง
                        และมีเลขอ้างอิงให้ตรวจย้อนได้
                      </p>
                    </div>
                    <div className="flex w-full max-w-lg flex-col gap-1.5">
                      {EXAMPLES.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => submit(e)}
                          className="rounded-lg border bg-background px-3 py-2 text-left text-xs transition hover:bg-accent"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={`${m.at}-${i}`} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                        m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>

                      {m.role === 'assistant' && m.scopeLabel && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {answerSourceNote(m.grounded, m.scopeLabel, m.citations?.length ?? 0)}
                        </p>
                      )}

                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          {m.citations.map((c) => (
                            <details key={c.index} className="group">
                              <summary className="cursor-pointer list-none text-[11px] text-violet-700 hover:underline dark:text-violet-300">
                                [{c.index}] {c.title}
                                <span className="ml-1 text-muted-foreground group-open:hidden">· ดูข้อความ</span>
                              </summary>
                              <p className="mt-1 rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
                                {c.snippet}
                              </p>
                            </details>
                          ))}
                        </div>
                      )}

                      {m.role === 'assistant' && (m.charged ?? 0) > 0 && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Coins className="h-3 w-3" /> ใช้ {m.charged} แต้ม
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {ask.isPending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border bg-background px-4 py-2.5 text-sm text-muted-foreground">
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
                className="space-y-2"
              >
                <Textarea
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  placeholder="พิมพ์คำถาม… (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {exempt
                      ? 'ไม่ตัดแต้ม (อาจารย์/ผู้ดูแล)'
                      : nextCost === 0
                      ? 'ใช้ข้อความในเซสชันที่เปิดไว้'
                      : `คำถามถัดไปจะตัด ${nextCost} แต้ม`}
                  </span>
                  <Button type="submit" disabled={!question.trim() || ask.isPending} className="gap-1.5">
                    <Send className="h-4 w-4" /> ถาม
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ScopeButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left text-[11px] transition',
        active
          ? 'border-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100'
          : 'hover:bg-accent'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

function ModeRow({
  active,
  onClick,
  title,
  desc,
  cost,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
  cost: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition',
        active
          ? 'border-violet-500 bg-violet-100 dark:bg-violet-950/50'
          : 'hover:bg-accent'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{cost}</span>
    </button>
  )
}
