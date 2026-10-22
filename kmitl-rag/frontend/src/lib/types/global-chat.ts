import type { BaseChatSession } from '@/lib/types/api'

// =============================================================================
// Global Chat Types (Ask tab — not scoped to a notebook)
// =============================================================================

export interface GlobalChatSession extends BaseChatSession {
  // No notebook_id — independent of any notebook
}

export interface GlobalChatMessage {
  id: string
  type: 'human' | 'ai'
  content: string
  timestamp?: string | null
}

export interface GlobalChatSessionWithMessages extends GlobalChatSession {
  messages: GlobalChatMessage[]
}

export interface CreateGlobalChatSessionRequest {
  title?: string
  model_override?: string
}

export interface UpdateGlobalChatSessionRequest {
  title?: string
  model_override?: string | null
}

export interface ExecuteGlobalChatRequest {
  session_id?: string
  message: string
  context?: {
    sources: Array<Record<string, unknown>>
    notes: Array<Record<string, unknown>>
  }
  model_override?: string
  title?: string
}

export interface ExecuteGlobalChatResponse {
  session_id: string
  messages: GlobalChatMessage[]
}
