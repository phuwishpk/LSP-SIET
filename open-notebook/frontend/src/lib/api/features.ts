import apiClient from './client'

export interface QuizOptionPayload {
  text: string
  is_correct?: boolean
}

export interface QuizQuestionPayload {
  id: number
  question: string
  options: QuizOptionPayload[]
  correct_answer: string
  explanation: string
}

export interface QuizSessionResponse {
  id: string
  owner_id: string
  topic: string
  language: string
  question_count: number
  questions: QuizQuestionPayload[]
  notebook_id?: string | null
  model_id?: string | null
  prompt_hash: string
  created: string
  updated: string
}

export interface QuizSessionSummary {
  id: string
  topic: string
  language: string
  question_count: number
  created: string
}

export interface QuizGenerateRequest {
  topic: string
  question_count?: number
  language?: string
  notebook_id?: string
  model_id?: string
}

export interface QuizGenerateResponse {
  session: QuizSessionResponse
  cached: boolean
}

export interface RoadmapNodePayload {
  id: string
  label: string
  description?: string
  category?: string
  order?: number
}

export interface RoadmapEdgePayload {
  source: string
  target: string
}

export interface RoadmapSessionResponse {
  id: string
  owner_id: string
  title: string
  description: string
  language: string
  node_count: number
  nodes: RoadmapNodePayload[]
  edges: RoadmapEdgePayload[]
  notebook_id?: string | null
  model_id?: string | null
  prompt_hash: string
  created: string
  updated: string
}

export interface RoadmapSessionSummary {
  id: string
  title: string
  description: string
  language: string
  node_count: number
  created: string
}

export interface RoadmapGenerateRequest {
  description: string
  title?: string
  node_count?: number
  language?: string
  notebook_id?: string
  model_id?: string
}

export interface RoadmapGenerateResponse {
  session: RoadmapSessionResponse
  cached: boolean
}

export const featuresApi = {
  generateQuiz: async (data: QuizGenerateRequest) => {
    const response = await apiClient.post<QuizGenerateResponse>(
      '/features/quiz/generate',
      data
    )
    return response.data
  },

  listQuizSessions: async (limit = 50) => {
    const response = await apiClient.get<QuizSessionSummary[]>(
      '/features/quiz/sessions',
      { params: { limit } }
    )
    return response.data
  },

  getQuizSession: async (sessionId: string) => {
    const response = await apiClient.get<QuizSessionResponse>(
      `/features/quiz/sessions/${sessionId}`
    )
    return response.data
  },

  deleteQuizSession: async (sessionId: string) => {
    await apiClient.delete(`/features/quiz/sessions/${sessionId}`)
  },

  generateRoadmap: async (data: RoadmapGenerateRequest) => {
    const response = await apiClient.post<RoadmapGenerateResponse>(
      '/features/roadmap/generate',
      data
    )
    return response.data
  },

  listRoadmapSessions: async (limit = 50) => {
    const response = await apiClient.get<RoadmapSessionSummary[]>(
      '/features/roadmap/sessions',
      { params: { limit } }
    )
    return response.data
  },

  getRoadmapSession: async (sessionId: string) => {
    const response = await apiClient.get<RoadmapSessionResponse>(
      `/features/roadmap/sessions/${sessionId}`
    )
    return response.data
  },

  deleteRoadmapSession: async (sessionId: string) => {
    await apiClient.delete(`/features/roadmap/sessions/${sessionId}`)
  },
}
