'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { globalChatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useAuthStore } from '@/lib/stores/auth-store'
import {
  GlobalChatSession,
  GlobalChatMessage,
  CreateGlobalChatSessionRequest,
  UpdateGlobalChatSessionRequest,
} from '@/lib/types/api'

interface UseGlobalChatParams {
  // Optional: if provided, context will be built from selected notebooks/sources/notes.
  // If not provided, chat runs in "global" mode (no RAG context).
  notebookId?: string
  sources?: Array<{ id: string; name?: string }>
  notes?: Array<{ id: string; title?: string }>
  contextSelections?: {
    sources: Record<string, 'insights' | 'full' | 'off'>
    notes: Record<string, 'full' | 'off'>
  }
}

// SSE event types emitted by the streaming endpoint
type SSEEvent =
  | { type: 'user_message'; content: string }
  | { type: 'ai_message'; content: string }
  | { type: 'complete' }
  | { type: 'error'; message: string }

export function useGlobalChat(params: UseGlobalChatParams = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<GlobalChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [pendingModelOverride, setPendingModelOverride] = useState<string | null>(null)
  // Accumulated streaming text for the current AI response (ref for closure-safe reads)
  const streamingContentRef = useRef('')
  const abortControllerRef = useRef<AbortController | null>(null)

  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  // Fetch sessions
  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions
  } = useQuery({
    queryKey: QUERY_KEYS.globalChatSessions,
    queryFn: () => globalChatApi.listSessions(),
    enabled: hasHydrated,
    retry: (failureCount, error) => {
      // Don't retry on 401 — auth interceptor redirects to /login
      const status = (error as { response?: { status?: number } })?.response?.status
      return status !== 401 && failureCount < 2
    },
  })

  // Fetch current session with messages
  const {
    data: currentSession,
    refetch: refetchCurrentSession
  } = useQuery({
    queryKey: QUERY_KEYS.globalChatSession(currentSessionId!),
    queryFn: () => globalChatApi.getSession(currentSessionId!),
    enabled: !!currentSessionId && hasHydrated,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      return status !== 401 && failureCount < 2
    },
  })

  // Update messages when current session changes
  useEffect(() => {
    if (currentSession?.messages) {
      setMessages(currentSession.messages)
    }
  }, [currentSession])

  // Auto-select most recent session when sessions are loaded
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      const mostRecentSession = sessions[0]
      setCurrentSessionId(mostRecentSession.id)
    }
  }, [sessions, currentSessionId])

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (data: CreateGlobalChatSessionRequest) =>
      globalChatApi.createSession(data),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalChatSessions
      })
      setCurrentSessionId(newSession.id)
      toast.success(t('chat.sessionCreated'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(
        error.response?.data?.detail || error.message,
        (key) => t(key),
        'apiErrors.failedToCreateSession'
      ))
    }
  })

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, data }: {
      sessionId: string
      data: UpdateGlobalChatSessionRequest
    }) => globalChatApi.updateSession(sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalChatSessions
      })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalChatSession(currentSessionId!)
      })
      toast.success(t('chat.sessionUpdated'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(
        error.response?.data?.detail || error.message,
        (key) => t(key),
        'apiErrors.failedToUpdateSession'
      ))
    }
  })

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      globalChatApi.deleteSession(sessionId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalChatSessions
      })
      if (currentSessionId === deletedId) {
        setCurrentSessionId(null)
        setMessages([])
      }
      toast.success(t('chat.sessionDeleted'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(
        error.response?.data?.detail || error.message,
        (key) => t(key),
        'apiErrors.failedToDeleteSession'
      ))
    }
  })

  // Build context — returns empty context if no notebook scope is configured
  const buildContext = useCallback(async () => {
    if (!params.notebookId || !params.sources || !params.notes || !params.contextSelections) {
      return { sources: [], notes: [] }
    }

    const context_config: { sources: Record<string, string>, notes: Record<string, string> } = {
      sources: {},
      notes: {}
    }

    params.sources.forEach(source => {
      const mode = params.contextSelections!.sources[source.id]
      if (mode === 'insights') {
        context_config.sources[source.id] = 'insights'
      } else if (mode === 'full') {
        context_config.sources[source.id] = 'full content'
      } else {
        context_config.sources[source.id] = 'not in'
      }
    })

    params.notes.forEach(note => {
      const mode = params.contextSelections!.notes[note.id]
      if (mode === 'full') {
        context_config.notes[note.id] = 'full content'
      } else {
        context_config.notes[note.id] = 'not in'
      }
    })

    const response = await fetch('/api/chat/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notebook_id: params.notebookId,
        context_config
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to build context: ${response.status}`)
    }

    return await response.json()
  }, [params])

  // Parse an SSE line "data: {...}" into a typed event
  const parseSSEEvent = (line: string): SSEEvent | null => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data: ')) return null
    const json = trimmed.slice(6)
    try {
      return JSON.parse(json) as SSEEvent
    } catch {
      return null
    }
  }

  // Send message via SSE streaming
  const sendMessage = useCallback(async (message: string, modelOverride?: string) => {
    let sessionId = currentSessionId

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    // Auto-create session if none exists
    if (!sessionId) {
      try {
        const defaultTitle = message.length > 30
          ? `${message.substring(0, 30)}...`
          : message
        const newSession = await globalChatApi.createSession({
          title: defaultTitle,
          model_override: pendingModelOverride ?? undefined
        })
        sessionId = newSession.id
        setCurrentSessionId(sessionId)
        setPendingModelOverride(null)
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.globalChatSessions
        })
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } }, message?: string };
        toast.error(getApiErrorMessage(
          error.response?.data?.detail || error.message,
          (key) => t(key),
          'apiErrors.failedToCreateSession'
        ))
        return
      }
    }

    // Add user message optimistically
    const userMessage: GlobalChatMessage = {
      id: `temp-${Date.now()}`,
      type: 'human',
      content: message,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    // Reset streaming content
    streamingContentRef.current = ''
    setIsSending(true)

    try {
      const context = await buildContext()
      const model = modelOverride ?? (currentSession?.model_override ?? undefined)

      // Build auth headers from localStorage (same as apiClient interceptor)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const authStorage = window.localStorage.getItem('auth-storage')
      if (authStorage) {
        try {
          const { state } = JSON.parse(authStorage)
          if (state?.token) {
            headers['Authorization'] = `Bearer ${state.token}`
          }
          if (state?.user?.id) {
            headers['X-Owner-Id'] = state.user.id
          }
        } catch {}
      }

      const response = await fetch('/api/chat/global/execute/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          message,
          context,
          model_override: model,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Request failed: ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last (potentially incomplete) line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const event = parseSSEEvent(line)
          if (!event) continue

          if (event.type === 'ai_message') {
            streamingContentRef.current += event.content
            // Append incremental chunk to streaming message
            setMessages(prev => {
              const withoutTemp = prev.filter(msg => !msg.id.startsWith('temp-'))
              const existingStreaming = withoutTemp.find(msg => msg.id === '__streaming__')
              if (existingStreaming) {
                return withoutTemp.map(msg =>
                  msg.id === '__streaming__'
                    ? { ...msg, content: msg.content + event.content }
                    : msg
                )
              } else {
                return [...withoutTemp, {
                  id: '__streaming__',
                  type: 'ai' as const,
                  content: streamingContentRef.current,
                  timestamp: null
                }]
              }
            })
          } else if (event.type === 'complete') {
            // Replace streaming placeholder with final message
            const finalContent = streamingContentRef.current
            const aiMessage: GlobalChatMessage = {
              id: `ai-${Date.now()}`,
              type: 'ai',
              content: finalContent,
              timestamp: new Date().toISOString()
            }
            setMessages(prev => {
              const withoutTemp = prev.filter(msg => !msg.id.startsWith('temp-') && msg.id !== '__streaming__')
              return [...withoutTemp, aiMessage]
            })
            streamingContentRef.current = ''
            // Refetch session to update metadata
            await refetchCurrentSession()
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.globalChatSessions })
          } else if (event.type === 'error') {
            toast.error(event.message)
            // Remove optimistic messages on error
            setMessages(prev => prev.filter(msg => !msg.id.startsWith('temp-') && msg.id !== '__streaming__'))
            streamingContentRef.current = ''
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      console.error('Error sending message:', error)
      toast.error(getApiErrorMessage(
        error.response?.data?.detail || error.message,
        (key) => t(key),
        'apiErrors.failedToSendMessage'
      ))
      // Remove optimistic messages on error
      setMessages(prev => prev.filter(msg => !msg.id.startsWith('temp-') && msg.id !== '__streaming__'))
      streamingContentRef.current = ''
    } finally {
      setIsSending(false)
      abortControllerRef.current = null
    }
  }, [
    currentSessionId,
    currentSession,
    pendingModelOverride,
    buildContext,
    refetchCurrentSession,
    queryClient,
    t,
  ])

  // Switch session
  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
  }, [])

  // Create session (manual trigger, e.g. from sidebar "New Chat")
  const createSession = useCallback((title?: string) => {
    return createSessionMutation.mutate({ title })
  }, [createSessionMutation])

  // Update session
  const updateSession = useCallback((sessionId: string, data: UpdateGlobalChatSessionRequest) => {
    return updateSessionMutation.mutate({ sessionId, data })
  }, [updateSessionMutation])

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    return deleteSessionMutation.mutate(sessionId)
  }, [deleteSessionMutation])

  // Set model override
  const setModelOverride = useCallback((model: string | null) => {
    if (currentSessionId) {
      updateSessionMutation.mutate({
        sessionId: currentSessionId,
        data: { model_override: model }
      })
    } else {
      setPendingModelOverride(model)
    }
  }, [currentSessionId, updateSessionMutation])

  return {
    // State
    sessions,
    currentSession: currentSession || sessions.find(s => s.id === currentSessionId),
    currentSessionId,
    messages,
    isSending,
    loadingSessions,
    pendingModelOverride,

    // Actions
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    setModelOverride,
    refetchSessions
  }
}
