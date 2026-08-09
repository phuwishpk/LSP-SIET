/**
 * NotebookScopePicker
 *
 * Multi-select dropdown that lets users pick up to 3 notebooks to scope RAG against.
 * Parses @mentions from the question text and highlights them as chips.
 *
 * Usage:
 *   <NotebookScopePicker
 *     value={selected}
 *     onChange={setSelected}
 *     questionText={question}
 *     onQuestionChange={setQuestion}
 *   />
 */
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Search, BookOpen, ChevronDown, ChevronUp, AtSign } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { notebooksApi } from '@/lib/api/notebooks'
import { NotebookResponse } from '@/lib/types/api'

const MAX_NOTEBOOKS = 3

interface NotebookScopePickerProps {
  value: NotebookResponse[]
  onChange: (notebooks: NotebookResponse[]) => void
  questionText: string
  onQuestionChange: (text: string) => void
  disabled?: boolean
}

interface MentionMatch {
  slug: string      // the raw @slug text
  start: number     // index in the string
  end: number
}

function extractMentions(text: string): MentionMatch[] {
  const matches: MentionMatch[] = []
  const regex = /@([\w\s-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      slug: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

function highlightMentions(
  text: string,
  mentions: MentionMatch[],
  notebooks: NotebookResponse[],
  onRemove: (slug: string) => void,
): React.ReactNode[] {
  if (!mentions.length) return [text]

  const slugSet = new Set(mentions.map(m => m.slug.toLowerCase()))
  const matched: NotebookResponse[] = notebooks.filter(nb =>
    slugSet.has(nb.name.toLowerCase())
  )
  const matchedSlugs = new Set(matched.map(nb => nb.name.toLowerCase()))
  const unmatched = mentions.filter(m => !matchedSlugs.has(m.slug.toLowerCase()))

  const nodes: React.ReactNode[] = []
  let lastEnd = 0

  const allRanges = [
    ...mentions.map(m => ({ ...m, type: 'mention' as const })),
  ].sort((a, b) => a.start - b.start)

  for (const range of allRanges) {
    if (range.start > lastEnd) {
      nodes.push(text.slice(lastEnd, range.start))
    }
    const isMatched = matchedSlugs.has(range.slug.toLowerCase())
    nodes.push(
      <Badge
        key={`mention-${range.start}`}
        variant={isMatched ? 'default' : 'destructive'}
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5"
        title={isMatched ? 'Notebook referenced' : 'Notebook not found'}
      >
        <AtSign className="h-3 w-3" />
        {range.slug}
        <button
          type="button"
          className="hover:opacity-70 ml-0.5"
          onClick={() => onRemove(range.slug)}
          aria-label={`Remove @${range.slug}`}
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
    )
    lastEnd = range.end
  }

  if (lastEnd < text.length) {
    nodes.push(text.slice(lastEnd))
  }

  return nodes
}

export function NotebookScopePicker({
  value,
  onChange,
  questionText,
  onQuestionChange,
  disabled = false,
}: NotebookScopePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notebooks, setNotebooks] = useState<NotebookResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch notebooks when dropdown opens
  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    notebooksApi
      .list({})
      .then(data => setNotebooks(data || []))
      .catch(err => console.error('Failed to load notebooks:', err))
      .finally(() => setIsLoading(false))
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus()
  }, [isOpen])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return notebooks
    const q = searchQuery.toLowerCase()
    return notebooks.filter(
      nb => nb.name.toLowerCase().includes(q) || nb.description.toLowerCase().includes(q)
    )
  }, [notebooks, searchQuery])

  const selectedIds = new Set(value.map(nb => nb.id))

  function toggleNotebook(nb: NotebookResponse) {
    if (selectedIds.has(nb.id)) {
      onChange(value.filter(n => n.id !== nb.id))
    } else if (value.length < MAX_NOTEBOOKS) {
      onChange([...value, nb])
    }
  }

  function removeNotebook(nb: NotebookResponse) {
    onChange(value.filter(n => n.id !== nb.id))
  }

  // Derive @mention slug from question text and auto-add matched notebooks
  const mentions = useMemo(() => extractMentions(questionText), [questionText])

  return (
    <div className="space-y-2" ref={dropdownRef}>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          Scope to notebooks
          <span className="ml-1 text-[10px] opacity-60">(max {MAX_NOTEBOOKS})</span>
        </Label>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-0 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(nb => (
            <Badge
              key={nb.id}
              variant="secondary"
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs"
            >
              <BookOpen className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{nb.name}</span>
              <button
                type="button"
                className="hover:opacity-70 rounded-sm"
                onClick={() => removeNotebook(nb)}
                disabled={disabled}
                aria-label={`Remove ${nb.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-xs h-8"
          onClick={() => setIsOpen(v => !v)}
          disabled={disabled || value.length >= MAX_NOTEBOOKS}
          type="button"
        >
          <span className="flex items-center gap-1.5">
            <AtSign className="h-3 w-3 text-muted-foreground" />
            {isOpen ? 'Close picker' : value.length === 0 ? 'Pick notebooks' : `${value.length} selected`}
          </span>
          {isOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>

        {/* Dropdown panel */}
        {isOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search notebooks..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-7 h-8 text-xs"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-52 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Loading notebooks...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No notebooks found
                </div>
              ) : (
                filtered.map(nb => {
                  const isSelected = selectedIds.has(nb.id)
                  const isDisabled = !isSelected && value.length >= MAX_NOTEBOOKS
                  return (
                    <button
                      key={nb.id}
                      type="button"
                      disabled={isDisabled}
                      className={`
                        w-full text-left px-3 py-2 text-xs flex items-start gap-2
                        hover:bg-accent transition-colors
                        ${isSelected ? 'bg-accent' : ''}
                        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                      onClick={() => toggleNotebook(nb)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="mt-0.5 accent-primary flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{nb.name}</p>
                        {nb.description && (
                          <p className="text-muted-foreground truncate mt-0.5">{nb.description}</p>
                        )}
                        <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span>{nb.source_count} sources</span>
                          <span>{nb.note_count} notes</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {value.length > 0 && (
              <div className="p-2 border-t bg-muted/30">
                <p className="text-[10px] text-muted-foreground text-center">
                  {value.length}/{MAX_NOTEBOOKS} selected &mdash; type @notebook-name in your question to reference notebooks
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mention helper below textarea */}
      {mentions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <AtSign className="h-3 w-3" />
            Mentions detected in question:
          </p>
          <div
            className="text-xs leading-relaxed p-2 rounded bg-muted/50 border min-h-[2rem] cursor-text"
            onClick={() => {
              // Focus the question textarea
              document.getElementById('ask-question')?.focus()
            }}
          >
            {highlightMentions(
              questionText,
              mentions,
              value,
              (slug) => {
                // Remove @slug from question text
                const regex = new RegExp(`@${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
                onQuestionChange(questionText.replace(regex, ' ').trim())
              }
            )}
          </div>
        </div>
      )}
    </div>
  )
}
