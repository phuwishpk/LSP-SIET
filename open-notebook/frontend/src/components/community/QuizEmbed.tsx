'use client'

import { useState } from 'react'
import { CheckCircle2, Coins, Gamepad2, GraduationCap, Sparkles, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  communityApi,
  describeApiError,
  type CommunityPost,
  type QuizEmbed as QuizEmbedData,
  type QuizEmbedQuestion,
  type QuizSubmitResponse,
} from '@/lib/api/community'
import { useQuizImport, toastApiError } from '@/lib/hooks/use-community'
import { useQueryClient } from '@tanstack/react-query'
import { COMMUNITY_KEYS } from '@/lib/hooks/use-community'
import { cn } from '@/lib/utils'

interface QuizEmbedProps {
  post: CommunityPost
  embed: QuizEmbedData
}

type Phase = 'idle' | 'playing' | 'done'

export function QuizEmbed({ post, embed }: QuizEmbedProps) {
  const queryClient = useQueryClient()
  const importQuiz = useQuizImport()
  const [phase, setPhase] = useState<Phase>('idle')
  const [playId, setPlayId] = useState<number | null>(null)
  const [questions, setQuestions] = useState<QuizEmbedQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizSubmitResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [importedSession, setImportedSession] = useState<string | null>(null)

  const total = embed.question_count || embed.questions.length
  const freeUsed = !post.is_author && post.viewer.plays >= 1 && !post.viewer.imported

  const start = async () => {
    setBusy(true)
    setBlocked(null)
    try {
      const data = await communityApi.quizStart(post.id)
      setPlayId(data.play_id)
      setQuestions(data.questions)
      setAnswers({})
      setResult(null)
      setPhase('playing')
    } catch (error) {
      const info = describeApiError(error)
      if (info.status === 402) {
        setBlocked(info.message)
      } else {
        toastApiError(error)
      }
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!playId) return
    setBusy(true)
    try {
      const data = await communityApi.quizSubmit(post.id, playId, answers)
      setResult(data)
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
    } catch (error) {
      toastApiError(error)
    } finally {
      setBusy(false)
    }
  }

  const answered = Object.keys(answers).length
  const allAnswered = questions.length > 0 && answered === questions.length

  return (
    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
          <GraduationCap className="h-3 w-3" /> AI Quiz
        </Badge>
        <p className="font-semibold">{embed.topic || post.title}</p>
        <span className="text-xs text-muted-foreground">
          {total} ข้อ · เล่นแล้ว {post.counts.play} ครั้ง
        </span>
        {post.is_author && post.counts.cashback > 0 && (
          <Badge variant="outline" className="gap-1 text-emerald-700">
            <Coins className="h-3 w-3" /> ได้แต้มคืน +{post.counts.cashback}
          </Badge>
        )}
      </div>

      {phase === 'idle' && (
        <div className="mt-3 space-y-2">
          {blocked && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {blocked}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={start} disabled={busy} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <Gamepad2 className="h-4 w-4" />
              {post.is_author
                ? `ทดสอบควิซของฉัน ${total} ข้อ`
                : freeUsed
                ? `เล่นอีกครั้ง (${total} ข้อ)`
                : `ลองทำควิซ ${total} ข้อตรงนี้ · ฟรี 1 ครั้ง`}
            </Button>
            {!post.is_author && !post.viewer.imported && !importedSession && (
              <Button
                size="sm"
                variant="outline"
                disabled={importQuiz.isPending}
                onClick={() =>
                  importQuiz.mutate(post.id, {
                    onSuccess: (data) => setImportedSession(data.session_id),
                  })
                }
                className="gap-1.5"
              >
                <Coins className="h-4 w-4" /> นำเข้าคลังส่วนตัว (1 แต้ม)
              </Button>
            )}
            {(post.viewer.imported || importedSession) && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4 text-emerald-500" /> นำเข้าแล้ว · เล่นซ้ำตรงนี้ได้ไม่จำกัด
              </span>
            )}
          </div>
          {post.viewer.completed_plays > 0 && (
            <p className="text-xs text-muted-foreground">คุณทำควิซนี้จบแล้ว {post.viewer.completed_plays} ครั้ง</p>
          )}
        </div>
      )}

      {phase === 'playing' && (
        <div className="mt-3 space-y-3">
          {questions.map((q, index) => (
            <div key={q.id} className="rounded-lg border bg-background p-3">
              <p className="mb-2 text-sm font-medium">
                {index + 1}. {q.question}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {q.options.map((option, i) => {
                  const selected = answers[String(q.id)] === option
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: option }))}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition',
                        selected ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40' : 'hover:bg-accent'
                      )}
                    >
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!allAnswered || busy} className="bg-emerald-600 hover:bg-emerald-700">
              {allAnswered ? 'ส่งคำตอบ' : `ตอบให้ครบ (${answered}/${questions.length})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPhase('idle')}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border bg-background p-4 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-amber-500" />
            <p className="mt-1 text-2xl font-bold">
              {result.score} / {result.total}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.cashback_paid ? 'เจ้าของควิซได้รับแต้มคืน +1 จากการเล่นของคุณ 🎉' : 'ทำเสร็จแล้ว!'}
            </p>
          </div>
          {result.results.map((r, index) => {
            const q = questions.find((x) => x.id === r.id)
            return (
              <div key={r.id} className={cn('rounded-lg border p-3 text-sm', r.correct ? 'border-emerald-300' : 'border-rose-300')}>
                <div className="flex items-start gap-2">
                  {r.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {index + 1}. {q?.question}
                    </p>
                    <p className="mt-1 text-xs">
                      คำตอบของคุณ: <span className={r.correct ? 'text-emerald-700' : 'text-rose-700'}>{r.your_answer || '—'}</span>
                      {!r.correct && (
                        <>
                          {' '}· เฉลย: <span className="text-emerald-700">{r.correct_answer}</span>
                        </>
                      )}
                    </p>
                    {r.explanation && <p className="mt-1 text-xs text-muted-foreground">{r.explanation}</p>}
                  </div>
                </div>
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPhase('idle')}>
              ปิดผล
            </Button>
            {!post.is_author && !post.viewer.imported && !importedSession && (
              <Button
                size="sm"
                variant="outline"
                disabled={importQuiz.isPending}
                onClick={() => importQuiz.mutate(post.id, { onSuccess: (data) => setImportedSession(data.session_id) })}
                className="gap-1.5"
              >
                <Coins className="h-4 w-4" /> นำเข้าคลังเพื่อซ้อมซ้ำ (1 แต้ม)
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
