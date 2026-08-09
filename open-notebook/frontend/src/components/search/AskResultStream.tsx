/**
 * AskResultStream
 *
 * Consumes the SSE stream from /api/search/ask/notebooks and renders:
 * - Resolved notebook chips (once)
 * - Strategy / answers / final_answer (streaming)
 * - Out-of-RAG disclaimer chip
 *
 * Drop-in replacement for StreamingResponse when notebook-scoped ask is active.
 */
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { BookOpen, AlertTriangle, CheckCircle, Lightbulb, Sparkles } from 'lucide-react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useTranslation } from '@/lib/hooks/use-translation'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types (mirroring the SSE event types from the backend)
// ---------------------------------------------------------------------------

export interface NotebookContextBlock {
  notebook_id: string
  notebook_name: string
  chunk_count: number
  total_chars: number
}

export interface ResolvedNotebooksEvent {
  type: 'resolved_notebooks'
  resolved: NotebookContextBlock[]
  failed_refs: string[]
  global_fallback_used: boolean
  out_of_rag: boolean
}

export interface StrategyEvent {
  type: 'strategy'
  reasoning: string
  searches: Array<{ term: string; instructions: string }>
}

export interface AnswerEvent {
  type: 'answer'
  content: string
}

export interface FinalAnswerEvent {
  type: 'final_answer'
  content: string
  out_of_rag?: boolean
}

export interface CompleteEvent {
  type: 'complete'
  final_answer: string | null
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export type AskStreamEvent =
  | ResolvedNotebooksEvent
  | StrategyEvent
  | AnswerEvent
  | FinalAnswerEvent
  | CompleteEvent
  | ErrorEvent

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AskResultStreamProps {
  question: string
  notebookIds: string[]
  strategyModel: string
  answerModel: string
  finalAnswerModel: string
  onComplete?: (answer: string) => void
}

// ---------------------------------------------------------------------------
// SSE consumer hook
// ---------------------------------------------------------------------------

interface AskStreamState {
  isStreaming: boolean
  resolvedNotebooks: NotebookContextBlock[]
  failedRefs: string[]
  globalFallbackUsed: boolean
  outOfRag: boolean
  strategy: StrategyEvent | null
  answers: AnswerEvent[]
  finalAnswer: string | null
  error: string | null
}

function useAskStream(question: string, notebookIds: string[], strategyModel: string, answerModel: string, finalAnswerModel: string) {
  const [state, setState] = useState<AskStreamState>({
    isStreaming: false,
    resolvedNotebooks: [],
    failedRefs: [],
    globalFallbackUsed: false,
    outOfRag: false,
    strategy: null,
    answers: [],
    finalAnswer: null,
    error: null,
  })

  const abortRef = useRef<AbortController | null>(null)

  const startStream = useCallback(async () => {
    // Cancel any existing stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    // Reset state
    setState({
      isStreaming: true,
      resolvedNotebooks: [],
      failedRefs: [],
      globalFallbackUsed: false,
      outOfRag: false,
      strategy: null,
      answers: [],
      finalAnswer: null,
      error: null,
    })

    try {
      // Get auth token
      let token: string | null = null
      if (typeof window !== 'undefined') {
        const authStorage = localStorage.getItem('auth-storage')
        if (authStorage) {
          try {
            const { state: authState } = JSON.parse(authStorage)
            token = authState?.token ?? null
          } catch {}
        }
      }

      const response = await fetch('/api/search/ask/notebooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question,
          notebook_refs: notebookIds,
          strategy_model: strategyModel || undefined,
          answer_model: answerModel || undefined,
          final_answer_model: finalAnswerModel || undefined,
          language: 'th',
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        let msg = `HTTP ${response.status}`
        try {
          const data = await response.json()
          msg = data.detail || data.message || msg
        } catch {}
        throw new Error(msg)
      }

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event: AskStreamEvent = JSON.parse(jsonStr)

            if (event.type === 'resolved_notebooks') {
              setState(prev => ({
                ...prev,
                resolvedNotebooks: event.resolved,
                failedRefs: event.failed_refs,
                globalFallbackUsed: event.global_fallback_used,
                outOfRag: event.out_of_rag,
              }))
            } else if (event.type === 'strategy') {
              setState(prev => ({ ...prev, strategy: event }))
            } else if (event.type === 'answer') {
              setState(prev => ({ ...prev, answers: [...prev.answers, event] }))
            } else if (event.type === 'final_answer') {
              setState(prev => ({
                ...prev,
                finalAnswer: event.content,
                outOfRag: Boolean(event.out_of_rag),
                isStreaming: false,
              }))
            } else if (event.type === 'complete') {
              setState(prev => ({ ...prev, isStreaming: false }))
            } else if (event.type === 'error') {
              setState(prev => ({ ...prev, error: event.message, isStreaming: false }))
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.warn('Malformed SSE line:', line)
            } else {
              throw e
            }
          }
        }
      }

      setState(prev => ({ ...prev, isStreaming: false }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const msg = (e as Error).message || 'Stream error'
      setState(prev => ({ ...prev, error: msg, isStreaming: false }))
    }
  }, [question, notebookIds, strategyModel, answerModel, finalAnswerModel])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState(prev => ({ ...prev, isStreaming: false }))
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  return { state, startStream, cancel }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AskResultStream({
  question,
  notebookIds,
  strategyModel,
  answerModel,
  finalAnswerModel,
  onComplete,
}: AskResultStreamProps) {
  const { state, startStream, cancel } = useAskStream(
    question,
    notebookIds,
    strategyModel,
    answerModel,
    finalAnswerModel,
  )
  const { openModal } = useModalManager()
  const { t } = useTranslation()

  // Notify parent of completion
  useEffect(() => {
    if (state.finalAnswer && !state.isStreaming) {
      onComplete?.(state.finalAnswer)
    }
  }, [state.finalAnswer, state.isStreaming, onComplete])

  const handleReferenceClick = useCallback((type: string, id: string) => {
    const modalType = type === 'source_insight' ? 'insight' : type as 'source' | 'note' | 'insight'
    try {
      openModal(modalType, id)
    } catch {
      toast.error(t('common.itemNotFound'))
    }
  }, [openModal, t])

  return (
    <div className="space-y-4 mt-4" role="region" aria-live="polite">
      {/* Resolved Notebooks chips */}
      {state.resolvedNotebooks.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            Scoped to:
          </span>
          {state.resolvedNotebooks.map(nb => (
            <Badge
              key={nb.notebook_id}
              variant="secondary"
              className="text-xs flex items-center gap-1"
              title={`${nb.chunk_count} chunks, ${nb.total_chars} chars`}
            >
              <BookOpen className="h-3 w-3" />
              {nb.notebook_name}
            </Badge>
          ))}
          {state.globalFallbackUsed && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              + Global fallback
            </Badge>
          )}
          {state.failedRefs.length > 0 && (
            <Badge variant="destructive" className="text-xs flex items-center gap-1">
              {state.failedRefs.length} unresolved
            </Badge>
          )}
        </div>
      )}

      {/* Out-of-RAG disclaimer */}
      {state.outOfRag && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">(out of RAG source)</p>
            <p className="text-xs mt-0.5 opacity-80">
              No relevant documents were found in the selected notebooks or the global knowledge base.
              The answer below comes from the language model&apos;s own knowledge.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{state.error}</p>
        </div>
      )}

      {/* Strategy */}
      {state.strategy && (
        <div className="rounded-md border p-3 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t('common.strategy')}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{t('common.reasoning')}:</p>
          <p className="text-sm">{state.strategy.reasoning}</p>
          {state.strategy.searches.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-muted-foreground">{t('common.searchTerms')}:</p>
              {state.strategy.searches.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className="mt-0.5 flex-shrink-0">{i + 1}</Badge>
                  <div>
                    <p className="font-medium">{s.term}</p>
                    <p className="text-muted-foreground">{s.instructions}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Individual answers */}
      {state.answers.length > 0 && (
        <div className="rounded-md border p-3 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {t('common.individualAnswers').replace('{count}', String(state.answers.length))}
            </span>
          </div>
          <div className="space-y-2">
            {state.answers.map((a, i) => (
              <div key={i} className="p-2 rounded bg-muted text-sm">
                {a.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final answer */}
      {state.finalAnswer && (
        <div className="rounded-md border border-primary p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t('common.finalAnswer')}</span>
          </div>
          <MarkdownRenderer
            components={{
              a: (props) => {
                // Handle source reference links
                const href = String(props.href || '')
                if (href.startsWith('ref:')) {
                  const [, type, id] = href.split(':')
                  return (
                    <button
                      className="text-primary hover:underline"
                      onClick={() => handleReferenceClick(type, id)}
                      type="button"
                    >
                      {props.children}
                    </button>
                  )
                }
                return <a {...props} target="_blank" rel="noopener noreferrer" />
              },
            }}
          >
            {state.finalAnswer}
          </MarkdownRenderer>
        </div>
      )}
    </div>
  )
}
