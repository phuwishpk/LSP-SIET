'use client'

import { ReferencesList } from '@siet/kmitl-rag/components/common/ReferencesList'
import { parseSourceReferences } from '@/lib/utils/source-references'

export interface MessageReferencesProps {
  content: string
  /** what was fed to the model as context (AskChatView passes it) */
  references?: {
    sources: Array<{ id: string; name?: string }>
    notes: Array<{ id: string; title?: string }>
  }
}

/**
 * Unified reference list under one AI message (the "chat.message-footer" slot
 * of open-notebook's ChatPanel):
 *   - every notebook source/note that was fed as CONTEXT (the primary RAG
 *     references - shown even if the AI forgot an inline [source:xxx]);
 *   - plus any AI-cited source/note IDs that are not already in the context;
 *   - plus URLs the AI cited that survived the backend allowlist filter.
 */
export function MessageReferences({ content, references }: MessageReferencesProps) {
  const contextSources = references?.sources ?? []
  const contextNotes = references?.notes ?? []
  const cited = extractCitedReferences(content)

  const seenSources = new Set(contextSources.map((s) => s.id))
  const extraCitedSources = cited.sources
    .map((id) => (id.startsWith('source:') ? id : `source:${id}`))
    .filter((id) => !seenSources.has(id))
    .map((id) => ({ id }))

  const seenNotes = new Set(contextNotes.map((n) => n.id))
  const extraCitedNotes = cited.notes
    .map((id) => (id.startsWith('note:') ? id : `note:${id}`))
    .filter((id) => !seenNotes.has(id))
    .map((id) => ({ id }))

  const allSources = [...contextSources, ...extraCitedSources]
  const allNotes = [...contextNotes, ...extraCitedNotes]

  const hasAny = allSources.length > 0 || allNotes.length > 0 || cited.urls.length > 0
  return hasAny ? <ReferencesList sources={allSources} notes={allNotes} urls={cited.urls} /> : null
}

/**
 * Extract the sources / notes / URLs actually cited in a message, deduplicated
 * and preserving first-appearance order. IDs are stripped of the `source:` /
 * `note:` prefix so callers can join them with a display name from a lookup.
 */
export function extractCitedReferences(text: string): {
  sources: string[]
  notes: string[]
  urls: string[]
} {
  const parsed = parseSourceReferences(text)
  const sources = new Set<string>()
  const notes = new Set<string>()
  const urls = new Set<string>()
  for (const ref of parsed) {
    if (ref.type === 'source' || ref.type === 'source_insight') {
      sources.add(ref.id)
    } else if (ref.type === 'note') {
      notes.add(ref.id)
    } else if (ref.type === 'url') {
      urls.add(ref.id)
    }
  }
  return {
    sources: [...sources],
    notes: [...notes],
    urls: [...urls],
  }
}
