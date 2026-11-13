import apiClient from '@/lib/api/client'
import type {
  CreateGlobalChatSessionRequest,
  ExecuteGlobalChatRequest,
  ExecuteGlobalChatResponse,
  GlobalChatSession,
  GlobalChatSessionWithMessages,
  UpdateGlobalChatSessionRequest,
} from '@siet/kmitl-rag/lib/types/global-chat'

/** Generated title for a notebook chat session (kmitl_rag.routers.global_chat). */
export async function autoTitleNotebookSession(sessionId: string) {
  const response = await apiClient.post<{ title: string }>(`/chat/sessions/${sessionId}/auto-title`)
  return response.data
}

// -----------------------------------------------------------------------------
// Global Chat API (Ask tab — not scoped to a notebook)
// -----------------------------------------------------------------------------

export const globalChatApi = {
  listSessions: async () => {
    const response = await apiClient.get<GlobalChatSession[]>(
      `/chat/global/sessions`
    )
    return response.data
  },

  createSession: async (data: CreateGlobalChatSessionRequest) => {
    const response = await apiClient.post<GlobalChatSession>(
      `/chat/global/sessions`,
      data
    )
    return response.data
  },

  getSession: async (sessionId: string) => {
    const response = await apiClient.get<GlobalChatSessionWithMessages>(
      `/chat/global/sessions/${sessionId}`
    )
    return response.data
  },

  updateSession: async (sessionId: string, data: UpdateGlobalChatSessionRequest) => {
    const response = await apiClient.put<GlobalChatSession>(
      `/chat/global/sessions/${sessionId}`,
      data
    )
    return response.data
  },

  deleteSession: async (sessionId: string) => {
    await apiClient.delete(`/chat/global/sessions/${sessionId}`)
  },

  autoTitleSession: async (sessionId: string) => {
    const response = await apiClient.post<{ title: string }>(
      `/chat/global/sessions/${sessionId}/auto-title`
    )
    return response.data
  },

  sendMessage: async (data: ExecuteGlobalChatRequest) => {
    const response = await apiClient.post<ExecuteGlobalChatResponse>(
      `/chat/global/execute`,
      data
    )
    return response.data
  },
}
