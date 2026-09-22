/**
 * Knowledge library API: course material published by teachers and the
 * private documents a student uploads to ask questions about.
 */
import { apiClient } from '@/lib/api/client'
import type { QuizEmbedQuestion } from '@/lib/api/community'
import type { RoadmapEdgePayload, RoadmapNodePayload } from '@/lib/api/features'

export type LibraryScope = 'course' | 'personal'
export type AskScope = 'auto' | 'course' | 'personal' | 'document' | 'notebook'
export type DocumentStatus = 'processing' | 'ready' | 'failed'
export type DocumentKind = 'file' | 'url' | 'text'

export interface LibraryDocument {
  id: number
  title: string
  scope: LibraryScope
  kind: DocumentKind
  status: DocumentStatus
  error?: string | null
  chunks: number
  chars: number
  filename?: string | null
  mime?: string | null
  size?: number | null
  created_at: string
  course?: { id: number; code?: string | null; name?: string | null } | null
  owner: {
    id: number
    username?: string | null
    display_name?: string | null
    role?: string | null
  }
  is_owner: boolean
  can_manage: boolean
}

export interface LibraryListResponse {
  items: LibraryDocument[]
  stats: { course_docs: number; my_docs: number; processing: number }
  can_publish_course: boolean
}

/** One source inside a shared notebook. `chunks === 0` means it is not searchable yet. */
export interface KnowledgeSource {
  id: string
  title: string
  chunks: number
}

/**
 * A notebook every role may ask about: research notebooks built by
 * admins/teachers (`kind: 'staff'`) and live course libraries (`kind: 'course'`).
 */
export interface KnowledgeNotebook {
  id: string
  name: string
  description: string
  /** staff/course are shared with everyone; personal/student only reach an admin. */
  kind: 'staff' | 'course' | 'personal' | 'student'
  visibility: 'shared' | 'private'
  archived: boolean
  owner_label: string
  source_count: number
  sources: KnowledgeSource[]
}

export interface KnowledgeResponse {
  notebooks: KnowledgeNotebook[]
  /** True for admins: the list also contains every private notebook. */
  sees_everything: boolean
  stats: { notebooks: number; sources: number }
}

export interface UploadDocumentInput {
  scope: LibraryScope
  courseId?: number | null
  title?: string
  file?: File | null
  url?: string
  content?: string
  shareToFeed?: boolean
}

export interface UploadDocumentResponse {
  document: LibraryDocument
  post_id: number | null
  message: string
}

export interface StudyQuizResponse {
  session_id: string
  topic: string
  questions: QuizEmbedQuestion[]
  scope_label: string
  grounded: boolean
  cached: boolean
  charged: number
  balance: number
}

export interface StudyRoadmapResponse {
  session_id: string
  title: string
  nodes: RoadmapNodePayload[]
  edges: RoadmapEdgePayload[]
  scope_label: string
  grounded: boolean
  cached: boolean
  charged: number
  balance: number
}

export interface ScopeSelection {
  scope: AskScope
  course_id?: number | null
  document_ids?: number[]
}

export const libraryApi = {
  list: async (params?: { scope?: LibraryScope; course_id?: number }) =>
    (await apiClient.get<LibraryListResponse>('/community/library', { params })).data,

  get: async (id: number) =>
    (await apiClient.get<LibraryDocument>(`/community/library/${id}`)).data,

  /** Shared notebooks (+ their sources) offered by the "เจาะจงเอกสาร" dropdown. */
  knowledge: async () =>
    (await apiClient.get<KnowledgeResponse>('/community/knowledge')).data,

  upload: async (input: UploadDocumentInput) => {
    const form = new FormData()
    form.append('scope', input.scope)
    if (input.courseId) form.append('course_id', String(input.courseId))
    if (input.title) form.append('title', input.title)
    if (input.url) form.append('url', input.url)
    if (input.content) form.append('content', input.content)
    if (input.shareToFeed) form.append('share_to_feed', 'true')
    if (input.file) form.append('file', input.file)
    return (await apiClient.post<UploadDocumentResponse>('/community/library', form)).data
  },

  remove: async (id: number) =>
    (await apiClient.delete(`/community/library/${id}`)).data,

  retry: async (id: number) =>
    (await apiClient.post(`/community/library/${id}/retry`)).data,

  studyQuiz: async (
    body: ScopeSelection & { topic: string; question_count?: number; language?: string }
  ) => (await apiClient.post<StudyQuizResponse>('/community/study/quiz', body)).data,

  studyRoadmap: async (
    body: ScopeSelection & {
      description: string
      title?: string
      node_count?: number
      language?: string
    }
  ) => (await apiClient.post<StudyRoadmapResponse>('/community/study/roadmap', body)).data,
}
