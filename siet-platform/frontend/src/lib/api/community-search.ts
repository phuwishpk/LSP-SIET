/**
 * Advanced search (4.3.3): one query, four kinds of result, with the feed's
 * filters. The server applies post visibility and room privacy; documents are
 * found by meaning (the RAG's vectors) as well as by title.
 *
 * Not to be confused with `search.ts`, which is Open Notebook's own notebook
 * search (/api/search) used by the research surface.
 */
import { apiClient } from '@/lib/api/client'
import type { CommunityPost, CommunityUserBrief, PostType } from './community'
import type { RoomRow } from './courses'
import type { LibraryDocument } from './library'

export type SearchKind = 'all' | 'posts' | 'courses' | 'documents' | 'users'
export type SearchOrder = 'newest' | 'popular'

export interface SearchFilters {
  q: string
  kind?: SearchKind
  course_id?: number
  category_id?: number
  type?: PostType
  author?: string
  tag?: string
  /** ISO dates (YYYY-MM-DD); `until` is inclusive. */
  since?: string
  until?: string
  order?: SearchOrder
  before_id?: number
  limit?: number
}

export interface SearchCourse extends RoomRow {
  member_count: number
  joined: boolean
}

export interface SearchUser extends CommunityUserBrief {
  /** Only present for staff callers. */
  student_id?: string | null
}

export interface SearchDocument extends LibraryDocument {
  snippet?: string | null
  /** Cosine similarity 0–1 for semantic hits; null when matched by title only. */
  similarity?: number | null
  match?: 'semantic' | 'title'
}

export interface SearchResult {
  query: string
  kind: SearchKind
  posts: CommunityPost[]
  next_before_id: number | null
  courses: SearchCourse[]
  documents: SearchDocument[]
  users: SearchUser[]
  filters: Record<string, string | number | null>
}

export const communitySearchApi = {
  search: async (filters: SearchFilters) => {
    const params: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') params[k] = v as string | number
    }
    return (await apiClient.get<SearchResult>('/community/search', { params })).data
  },
}

/** Turn the page's query string into filters (and back) so searches are shareable links. */
export function filtersFromParams(sp: URLSearchParams): SearchFilters {
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) || undefined : undefined)
  const str = (k: string) => sp.get(k) || undefined
  return {
    q: sp.get('q') ?? '',
    kind: (str('kind') as SearchKind) || 'all',
    course_id: num('course_id'),
    category_id: num('category_id'),
    type: str('type') as PostType | undefined,
    author: str('author'),
    tag: str('tag'),
    since: str('since'),
    until: str('until'),
    order: (str('order') as SearchOrder) || 'newest',
  }
}

export function paramsFromFilters(f: SearchFilters): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (k === 'before_id' || k === 'limit') continue
    if (v === undefined || v === null || v === '' || (k === 'kind' && v === 'all') || (k === 'order' && v === 'newest')) continue
    sp.set(k, String(v))
  }
  return sp
}
