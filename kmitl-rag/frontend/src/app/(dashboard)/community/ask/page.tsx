'use client'

/**
 * KMITL RAG AI — full page.
 *
 * The right-hand widget on /community is for a quick one-liner; this page is
 * where a real study session happens: a roomy transcript, the retrieval scope
 * spelled out rather than hidden behind chips, citations you can actually read,
 * and every exchange stored on the server (per account, any device): the
 * history panel reopens, continues, renames or deletes past conversations.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Coins,
  Plus,
  RotateCcw,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { PinkOwlMascot } from '@shared/mascot'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { AnswerReferences } from '@siet/kmitl-rag/components/community/AnswerReferences'
import { AskHistoryPanel } from '@siet/kmitl-rag/components/community/AskHistoryPanel'
import { AskWebButton } from '@siet/kmitl-rag/components/community/AskWebButton'
import { UploadCard } from '@/components/community/LibraryPanel'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ASK_HISTORY_KEYS,
  useAsk,
  useAskConversation,
  useAskWeb,
  useCourses,
  useWallet,
  toastApiError,
} from '@/lib/hooks/use-community'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useKnowledge, useLibrary } from '@/lib/hooks/use-library'
import {
  describeApiError,
  type AskCitation,
  type AskWebMode,
  type AskWebSource,
  type RagStoredMessage,
} from '@/lib/api/community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { isStaff, type Role } from '@/lib/roles'
import { answerSourceNote } from '@/lib/utils/community-format'
import {
  choiceFromParams,
  choiceToAskFields,
  describeChoice,
  type SourceChoice,
} from '@siet/kmitl-rag/lib/utils/source-choice'
import { SourcePicker } from '@siet/kmitl-rag/components/community/SourcePicker'
import { avatarIsStill } from '@siet/kmitl-rag/lib/utils/ask-avatar'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
  webSources?: AskWebSource[]
  coverage?: 'full' | 'partial' | 'none'
  cached?: boolean
  cacheMatch?: 'exact' | 'similar' | null
  charged?: number
  scopeLabel?: string
  grounded?: boolean
  /** stored assistant message id ("ค้นเว็บเพิ่ม" targets it) */
  messageId?: number | null
  webOffer?: boolean
  webAdded?: boolean
  at: number
}

/** Stored messages -> the shape the transcript renders. */
function fromStored(stored: RagStoredMessage[]): Message[] {
  return stored.map((m) => {
    const at = m.created_at ? new Date(m.created_at).getTime() || m.id : m.id
    if (m.role === 'user') return { role: 'user', content: m.content, at }
    return {
      role: 'assistant',
      content: m.content,
      citations: m.meta.citations,
      webSources: m.meta.web_sources,
      coverage: m.meta.coverage,
      charged: m.meta.charged,
      cached: m.meta.cached,
      cacheMatch: m.meta.cache_match,
      scopeLabel: m.meta.scope_label,
      grounded: m.meta.grounded,
      messageId: m.id,
      webOffer: m.meta.web_offer,
      webAdded: m.meta.web_added,
      at,
    }
  })
}

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
        <div className="flex min-h-full items-center justify-center">
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
  const askWeb = useAskWeb()
  // the answer whose "ค้นเว็บเพิ่ม" is running
  const [webPendingId, setWebPendingId] = useState<number | null>(null)
  const { data: wallet } = useWallet()
  const { data: courses } = useCourses()
  const { data: library } = useLibrary()
  const { data: knowledge } = useKnowledge()

  // ?course=7, ?doc=12, ?notebook=notebook:abc or ?source=source:xyz open the matching tab.
  const [choice, setChoice] = useState<SourceChoice>(() => choiceFromParams(params, []))
  const [mode, setMode] = useState<'single' | 'session'>('single')
  // Google Search grounding: auto = only when the library does not cover the question.
  const [webMode, setWebMode] = useState<AskWebMode>('auto')
  const [addOpen, setAddOpen] = useState(false)
  const role = useAuthStore((s) => s.user?.role) as Role
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  // ?c=<id> reopens a stored conversation; a new one starts without it.
  const [conversationId, setConversationId] = useState<string | null>(params.get('c'))
  const stored = useAskConversation(conversationId)
  const queryClient = useQueryClient()
  const [question, setQuestion] = useState(params.get('prompt') ?? '')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // One automatic retry when the server says it is overloaded (503 / 429 with
  // Retry-After); the ref lets the error handler call the latest submit.
  const submitRef = useRef<(raw?: string) => void>(() => {})
  const autoRetried = useRef(false)

  const costs = wallet?.rules.costs
  const sessionMessages = wallet?.rules.rag_session_messages ?? 5
  const exempt = wallet?.exempt ?? false

  const readyDocs = useMemo(
    () => (library?.items ?? []).filter((d) => d.status === 'ready'),
    [library]
  )
  // Notebooks built by admins/teachers + course libraries: the same list for
  // every role, so a student can ask about material they cannot open in /notebooks.
  const sharedNotebooks = useMemo(() => knowledge?.notebooks ?? [], [knowledge])
  // Course documents are already listed under their course, so "ไฟล์ของฉัน"
  // only carries the caller's own uploads (plus a deep-linked doc).
  const myDocs = useMemo(
    () =>
      readyDocs.filter(
        (d) => d.scope === 'personal' || (choice.tab === 'mine' && choice.docId === d.id)
      ),
    [choice, readyDocs]
  )
  const choiceText = describeChoice(choice, {
    notebooks: sharedNotebooks,
    myDocs,
    courseCode: (id) => (courses ?? []).find((c) => c.id === id)?.code,
  })

  // A ?notebook= / ?source= link can only be placed in its tab once the list is in.
  const placedFromLink = useRef(false)
  useEffect(() => {
    if (placedFromLink.current || !knowledge) return
    placedFromLink.current = true
    if (params.get('notebook') || params.get('source')) setChoice(choiceFromParams(params, knowledge.notebooks))
  }, [knowledge, params])

  // --- a reopened conversation replaces the transcript (and resumes an open session)
  useEffect(() => {
    if (!conversationId) return
    if (stored.isError) {
      toastApiError(stored.error, 'ไม่พบบทสนทนานี้')
      setConversationId(null)
      router.replace('/community/ask')
      return
    }
    if (!stored.data) return
    setMessages(fromStored(stored.data.messages))
    const last = [...stored.data.messages].reverse().find((m) => m.role === 'assistant')
    const credits = last?.meta.credits_left ?? 0
    if (last?.meta.session_id && credits > 0) {
      setSessionId(last.meta.session_id)
      setCreditsLeft(credits)
    } else {
      setSessionId(null)
      setCreditsLeft(null)
    }
  }, [conversationId, stored.data, stored.isError, stored.error, router])

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
      const scopeFields = choiceToAskFields(choice)
      if (!scopeFields) {
        toastApiError(
          { message: choice.tab === 'course' ? 'เลือกวิชาก่อนถาม' : 'เลือก notebook หรือเอกสารก่อนถาม' },
          'เลือกแหล่งข้อมูลก่อนถาม'
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
          // the picked tab decides scope + ids together (whole course/notebook vs one document)
          ...scopeFields,
          web: webMode,
          conversation_id: conversationId,
        },
        {
          onSuccess: (data) => {
            autoRetried.current = false
            if (data.conversation_id && data.conversation_id !== conversationId) {
              setConversationId(data.conversation_id)
              router.replace(`/community/ask?c=${encodeURIComponent(data.conversation_id)}`)
            }
            if (data.conversation_id) {
              // keep a reopened conversation's cache in step without a refetch
              queryClient.invalidateQueries({ queryKey: ASK_HISTORY_KEYS.detail(data.conversation_id) })
            }
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: data.answer,
                citations: data.citations,
                webSources: data.web_sources ?? [],
                coverage: data.coverage,
                cached: data.cached,
                cacheMatch: data.cache_match,
                charged: data.charged,
                scopeLabel: data.scope_label,
                grounded: data.grounded,
                messageId: data.message_id,
                webOffer: data.web_offer,
                at: Date.now(),
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
            setMessages((prev) => prev.slice(0, -1))
            const overloaded = info.kind === 'llm_busy' || info.kind === 'provider_rate_limit'
            if (overloaded && !autoRetried.current) {
              autoRetried.current = true
              const wait = Math.min(Math.max(info.retryAfter ?? 5, 2), 15)
              toast.info('ระบบมีผู้ใช้พร้อมกันจำนวนมาก', {
                description: `กำลังส่งคำถามใหม่อัตโนมัติในอีก ${wait} วินาที`,
              })
              window.setTimeout(() => submitRef.current(q), wait * 1000)
              return
            }
            autoRetried.current = false
            toastApiError(error)
            setQuestion(q)
          },
        }
      )
    },
    [ask, choice, conversationId, mode, queryClient, question, router, sessionId, webMode]
  )

  submitRef.current = submit

  // "ค้นเว็บเพิ่ม": add KMITL web info under one partly covered answer.
  const addWeb = useCallback(
    (messageId: number) => {
      if (!conversationId) return
      setWebPendingId(messageId)
      askWeb.mutate(
        { conversationId, messageId },
        {
          onSuccess: (data) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.messageId === messageId
                  ? { ...m, content: data.answer, webSources: data.web_sources, webAdded: true }
                  : m
              )
            ),
          onError: (error) => toastApiError(error, 'ค้นเว็บเพิ่มไม่สำเร็จ'),
          onSettled: () => setWebPendingId(null),
        }
      )
    },
    [askWeb, conversationId]
  )

  // "แชทใหม่": the old conversation stays in the history, the transcript resets.
  const startNew = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setCreditsLeft(null)
    setConversationId(null)
    router.replace('/community/ask')
    inputRef.current?.focus()
  }, [router])

  const openConversation = useCallback(
    (id: string) => {
      if (id === conversationId) return
      setMessages([])
      setSessionId(null)
      setCreditsLeft(null)
      setConversationId(id)
      router.replace(`/community/ask?c=${encodeURIComponent(id)}`)
    },
    [conversationId, router]
  )

  const nextCost = sessionId
    ? 0
    : mode === 'session'
    ? costs?.rag_session ?? 4
    : costs?.rag_question ?? 1

  return (
    <div className="theme-adventure min-h-screen bg-canvas">

      <div className="mx-auto max-w-[1200px] px-3 py-4 sm:px-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push('/community')}>
            <ArrowLeft className="h-4 w-4" /> กลับไปฟีด
          </Button>
          <div className="flex items-center gap-2">
            <PinkOwlMascot mood={ask.isPending ? 'study' : 'idle'} size={40} className="shrink-0" />
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
                <SourcePicker
                  value={choice}
                  onChange={setChoice}
                  notebooks={sharedNotebooks}
                  myDocs={myDocs}
                  seesEverything={knowledge?.sees_everything ?? false}
                />

                <p
                  aria-live="polite"
                  className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground"
                >
                  {choiceText}
                </p>
                {knowledge?.sees_everything && (
                  <p className="text-[11px] text-muted-foreground">
                    🔒 สิทธิ์ผู้ดูแล: เห็น notebook ส่วนตัวของผู้ใช้ทุกคนด้วย ผู้ใช้อื่นไม่เห็นรายการเหล่านี้
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> เพิ่มเนื้อหาให้ AI อ่าน
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ค้นเว็บเสริม (Google Search)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['auto', 'อัตโนมัติ'],
                      ['always', 'ทุกครั้ง'],
                      ['off', 'ปิด'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={webMode === value}
                      onClick={() => setWebMode(value)}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-[11px] transition',
                        webMode === value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'hover:bg-accent'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {webMode === 'auto' &&
                    'ตอบจากเอกสารก่อน ค้นเว็บเองเมื่อเอกสารไม่มีข้อมูลเลย ถ้าตอบได้บางส่วนจะมีปุ่ม “ค้นเว็บเพิ่ม” ให้กดเอง'}
                  {webMode === 'always' && 'ตอบจากเอกสาร แล้วค้นเว็บมาสนับสนุนเพิ่มทุกคำถาม'}
                  {webMode === 'off' && 'ตอบจากเอกสารเท่านั้น ถ้าไม่มีข้อมูล AI จะบอกตรง ๆ'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  ค้นเฉพาะเว็บไซต์ของ สจล. (kmitl.ac.th) และตรวจว่าทุกลิงก์เปิดได้จริง ท้ายคำตอบมีรายการอ้างอิงเสมอ:
                  [n] จากคลังความรู้ และ [Wn] จากเว็บ สจล.
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
                  onClick={startNew}
                  disabled={messages.length === 0 && !sessionId}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> เริ่มแชทใหม่
                </Button>
              </CardContent>
            </Card>

            <AskHistoryPanel activeId={conversationId} onOpen={openConversation} onNew={startNew} />
          </div>

          {/* ------------------------------------------------------- chat */}
          <Card className="flex min-h-[70vh] flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
              <div
                ref={listRef}
                className="no-scrollbar min-h-[45vh] flex-1 space-y-3 overflow-x-hidden overflow-y-auto rounded-lg border bg-muted/30 p-3"
              >
                {conversationId && stored.isLoading && messages.length === 0 && (
                  <div className="flex h-full items-center justify-center py-8">
                    <LoadingSpinner />
                  </div>
                )}
                {messages.length === 0 && !ask.isPending && !(conversationId && stored.isLoading) && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
                    <PinkOwlMascot mood="wave" size={120} label="น้องฮูก ผู้ช่วย AI" />
                    <div>
                      <p className="text-sm font-medium">เริ่มถามได้เลย</p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                        คำตอบจะอ้างอิงจากเอกสารในขอบเขตที่เลือกไว้ทางซ้าย ไม่เกิน 6 ข้อความ
                        ถ้าถามนอกขอบเขตจะค้นเว็บเสริม และมีรายการอ้างอิงท้ายคำตอบให้ตรวจย้อนได้
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
                    {m.role === 'assistant' && (
                      <PinkOwlMascot
                        mood="idle"
                        size={36}
                        label="น้องฮูก ผู้ช่วย AI"
                        still={avatarIsStill(i, messages)}
                        className="mr-2 mt-1 shrink-0 self-start"
                      />
                    )}
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                        m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background'
                      )}
                    >
                      {m.role === 'assistant' ? (
                        // The model answers in Markdown (bold, bullet lists); as plain
                        // text the ** markers showed up literally.
                        <div className="[&_.prose]:text-sm [&_p:last-child]:mb-0">
                          <MarkdownRenderer>{m.content}</MarkdownRenderer>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}

                      {m.role === 'assistant' && m.scopeLabel && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {answerSourceNote(m.grounded, m.scopeLabel, m.citations?.length ?? 0)}
                        </p>
                      )}

                      {m.role === 'assistant' && (
                        <AnswerReferences citations={m.citations} webSources={m.webSources} />
                      )}

                      {m.role === 'assistant' && m.webOffer && m.messageId && conversationId && (
                        <AskWebButton
                          pending={webPendingId === m.messageId}
                          webAdded={Boolean(m.webAdded)}
                          onAsk={() => addWeb(m.messageId as number)}
                        />
                      )}

                      {m.role === 'assistant' && m.cached && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {m.cacheMatch === 'similar'
                            ? 'ใช้คำตอบของคำถามที่คล้ายกัน ไม่ตัดแต้ม'
                            : 'คำตอบเดียวกับที่เพิ่งถามไปเมื่อสักครู่ ไม่ตัดแต้ม'}
                        </p>
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
                    <PinkOwlMascot
                      mood="study"
                      size={36}
                      label="น้องฮูกกำลังคิดคำตอบ"
                      className="mr-2 mt-1 shrink-0 self-start"
                    />
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

      {/* Every role can add content: students to their private library, staff also
          to a course library. New documents show up in the dropdown once ready. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="community-theme no-scrollbar max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>เพิ่มเนื้อหาให้ AI อ่าน</DialogTitle>
            <DialogDescription>
              {isStaff(role)
                ? 'เผยแพร่เข้าคลังรายวิชา (ทุกคนถามได้) หรือเก็บเป็นไฟล์ส่วนตัว'
                : 'ไฟล์ที่อัปโหลดเป็นของคุณคนเดียว จะขึ้นในกลุ่ม “ไฟล์ของฉัน” เมื่อประมวลผลเสร็จ'}
            </DialogDescription>
          </DialogHeader>
          <UploadCard isStaff={isStaff(role)} defaultCourseId={choice.tab === 'course' ? choice.courseId : null} />
        </DialogContent>
      </Dialog>
    </div>
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
          ? 'border-primary bg-primary/10'
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
