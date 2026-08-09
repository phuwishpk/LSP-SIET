'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { searchApi } from '@/lib/api/search'
import { AskStreamEvent, NotebookContextBlock } from '@/lib/types/search'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface AskModels {
  strategy: string
  answer: string
  finalAnswer: string
}

interface StrategyData {
  reasoning: string
  searches: Array<{ term: string; instructions: string }>
}

interface AskState {
  isStreaming: boolean
  strategy: StrategyData | null
  answers: string[]
  finalAnswer: string | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Global Ask hook (existing behaviour – no notebook scoping)
// ---------------------------------------------------------------------------

export function useAsk() {
  const { t } = useTranslation()
  const [state, setState] = useState<AskState>({
    isStreaming: false,
    strategy: null,
    answers: [],
    finalAnswer: null,
    error: null,
  })

  const sendAsk = useCallback(
    async (question: string, models: AskModels) => {
      if (!question.trim()) {
        toast.error(t('apiErrors.pleaseEnterQuestion'))
        return
      }

      if (!models.strategy || !models.answer || !models.finalAnswer) {
        toast.error(t('apiErrors.pleaseConfigureModels'))
        return
      }

      setState({
        isStreaming: true,
        strategy: null,
        answers: [],
        finalAnswer: null,
        error: null,
      })

      try {
        const response = await searchApi.askKnowledgeBase({
          question,
          strategy_model: models.strategy,
          answer_model: models.answer,
          final_answer_model: models.finalAnswer,
        })

        if (!response) {
          throw new Error('No response body received from server')
        }

        const reader = response.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6).trim()
                if (!jsonStr) continue
                const data: AskStreamEvent = JSON.parse(jsonStr)

                if (data.type === 'strategy') {
                  setState(prev => ({
                    ...prev,
                    strategy: {
                      reasoning: data.reasoning || '',
                      searches: data.searches || [],
                    },
                  }))
                } else if (data.type === 'answer') {
                  setState(prev => ({
                    ...prev,
                    answers: [...prev.answers, data.content || ''],
                  }))
                } else if (data.type === 'final_answer') {
                  setState(prev => ({
                    ...prev,
                    finalAnswer: data.content || '',
                    isStreaming: false,
                  }))
                } else if (data.type === 'complete') {
                  setState(prev => ({ ...prev, isStreaming: false }))
                } else if (data.type === 'error') {
                  throw new Error(data.message || 'Stream error occurred')
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
        }

        setState(prev => ({ ...prev, isStreaming: false }))
      } catch (error) {
        const err = error as { message?: string }
        const errorMessage = err.message || 'An unexpected error occurred'
        console.error('Ask error:', error)
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }))
        toast.error(t('apiErrors.askFailed'), {
          description: getApiErrorMessage(errorMessage, (key) => t(key)),
        })
      }
    },
    [t],
  )

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      strategy: null,
      answers: [],
      finalAnswer: null,
      error: null,
    })
  }, [])

  return { ...state, sendAsk, reset }
}

// ---------------------------------------------------------------------------
// Notebook-scoped Ask state
// ---------------------------------------------------------------------------

export interface NotebookAskStreamState {
  isStreaming: boolean
  resolvedNotebooks: NotebookContextBlock[]
  failedRefs: string[]
  globalFallbackUsed: boolean
  outOfRag: boolean
  strategy: StrategyData | null
  answers: string[]
  finalAnswer: string | null
  error: string | null
}

export function useNotebookAsk() {
  const { t } = useTranslation()
  const [state, setState] = useState<NotebookAskStreamState>({
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

  const sendAsk = useCallback(
    async (question: string, models: AskModels, notebookIds: string[]) => {
      if (!question.trim()) {
        toast.error(t('apiErrors.pleaseEnterQuestion'))
        return
      }

      abortRef.current?.abort()
      abortRef.current = new AbortController()

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
            strategy_model: models.strategy || undefined,
            answer_model: models.answer || undefined,
            final_answer_model: models.finalAnswer || undefined,
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

        if (!response.body) throw new Error('No response body received')

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
                  resolvedNotebooks: (event as any).resolved || [],
                  failedRefs: (event as any).failed_refs || [],
                  globalFallbackUsed: Boolean((event as any).global_fallback_used),
                  outOfRag: Boolean((event as any).out_of_rag),
                }))
              } else if (event.type === 'strategy') {
                setState(prev => ({
                  ...prev,
                  strategy: {
                    reasoning: event.reasoning || '',
                    searches: event.searches || [],
                  },
                }))
              } else if (event.type === 'answer') {
                setState(prev => ({
                  ...prev,
                  answers: [...prev.answers, event.content || ''],
                }))
              } else if (event.type === 'final_answer') {
                setState(prev => ({
                  ...prev,
                  finalAnswer: event.content || '',
                  outOfRag: Boolean((event as any).out_of_rag),
                  isStreaming: false,
                }))
              } else if (event.type === 'complete') {
                setState(prev => ({ ...prev, isStreaming: false }))
              } else if (event.type === 'error') {
                throw new Error(event.message || 'Stream error occurred')
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
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        const err = error as { message?: string }
        const errorMessage = err.message || 'An unexpected error occurred'
        console.error('Notebook-ask error:', error)
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }))
        toast.error(t('apiErrors.askFailed'), {
          description: getApiErrorMessage(errorMessage, (key) => t(key)),
        })
      }
    },
    [t],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState(prev => ({ ...prev, isStreaming: false }))
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({
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
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  return { ...state, sendAsk, cancel, reset }
}
