'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { communitySearchApi, type SearchFilters } from '@/lib/api/community-search'

export const ADVANCED_SEARCH_KEYS = {
  root: ['community', 'advanced-search'] as const,
  result: (f: SearchFilters) => ['community', 'advanced-search', f] as const,
}

/** The overview (`kind=all`) or a single non-post kind. */
export function useAdvancedSearch(filters: SearchFilters, enabled = true) {
  return useQuery({
    queryKey: ADVANCED_SEARCH_KEYS.result(filters),
    queryFn: () => communitySearchApi.search(filters),
    enabled: enabled && filters.q.trim().length > 0,
    staleTime: 60_000,
  })
}

/** The posts tab pages with the feed's `before_id` cursor. */
export function useAdvancedSearchPosts(filters: SearchFilters, enabled = true) {
  const base: SearchFilters = { ...filters, kind: 'posts', limit: 20 }
  return useInfiniteQuery({
    queryKey: [...ADVANCED_SEARCH_KEYS.result(base), 'pages'] as const,
    queryFn: ({ pageParam }) => communitySearchApi.search({ ...base, before_id: pageParam ?? undefined }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_before_id ?? undefined,
    enabled: enabled && filters.q.trim().length > 0,
    staleTime: 60_000,
  })
}
