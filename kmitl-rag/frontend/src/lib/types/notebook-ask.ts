import type { AskStreamEvent } from '@/lib/types/search'

/** Extra SSE event of POST /search/ask/notebooks (kmitl_rag.routers.notebook_ask). */
export type NotebookAskStreamEvent = Omit<AskStreamEvent, 'type'> & {
  type: AskStreamEvent['type'] | 'resolved_notebooks'
  resolved?: NotebookContextBlock[]
  failed_refs?: string[]
  global_fallback_used?: boolean
  out_of_rag?: boolean
  notebook_id?: string
  notebook_name?: string
  chunk_count?: number
  total_chars?: number
}

export interface NotebookContextBlock {
  notebook_id: string
  notebook_name: string
  chunk_count: number
  total_chars: number
}
