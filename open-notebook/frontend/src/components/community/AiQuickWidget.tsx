'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Coins, RotateCcw, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAsk, useWallet, toastApiError } from '@/lib/hooks/use-community'
import type { AskCitation } from '@/lib/api/community'
import { describeApiError } from '@/lib/api/community'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
  charged?: number
}

export function AiQuickWidget() {
  const ask = useAsk()
  const { data: wallet } = useWallet()
  const [mode, setMode] = useState<'single' | 'session'>('single')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const costs = wallet?.rules.costs
  const sessionMessages = wallet?.rules.rag_session_messages ?? 5
  const exempt = wallet?.exempt ?? false

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, ask.isPending])

  const submit = () => {
    const q = question.trim()
    if (!q || ask.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setQuestion('')
    ask.mutate(
      { question: q, session_id: sessionId, mode },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.answer, citations: data.citations, charged: data.charged },
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
    <Card className="border-violet-200/70 dark:border-violet-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Bot className="h-4 w-4" />
          </span>
          AI Quick Prompt
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">KMITL RAG AI</span>
        </CardTitle>
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
              ถาม KMITL RAG AI ด่วน ๆ ได้เลย เช่น &ldquo;สรุป deadlock 4 เงื่อนไข&rdquo; คำตอบอ้างอิงจากคลังความรู้
              (ไม่เกิน 3 แหล่ง, 150–300 คำ)
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
