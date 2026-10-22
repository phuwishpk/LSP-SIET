'use client'

import { FileText, StickyNote, ExternalLink, Link as LinkIcon } from 'lucide-react'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useTranslation } from '@/lib/hooks/use-translation'
import { toast } from 'sonner'

interface ReferencesListProps {
  sources: Array<{ id: string; name?: string }>
  notes: Array<{ id: string; title?: string }>
  urls?: string[]
  className?: string
}

export function ReferencesList({
  sources,
  notes,
  urls = [],
  className
}: ReferencesListProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()

  const hasReferences = sources.length > 0 || notes.length > 0 || urls.length > 0

  if (!hasReferences) {
    return null
  }

  const handleSourceClick = (id: string) => {
    try {
      openModal('source', id)
    } catch {
      toast.error(t('common.noResults'))
    }
  }

  const handleNoteClick = (id: string) => {
    try {
      openModal('note', id)
    } catch {
      toast.error(t('common.noResults'))
    }
  }

  return (
    <div className={`mt-2 pt-2 border-t border-border/50 ${className || ''}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
        <ExternalLink className="h-3 w-3" />
        <span className="font-medium">{t('common.references') || 'References'}</span>
      </div>

      <div className="flex flex-col gap-1">
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => handleSourceClick(source.id)}
            className="flex items-center gap-2 text-xs text-left px-2 py-1 rounded hover:bg-muted transition-colors text-primary hover:underline"
          >
            <FileText className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{source.name || source.id}</span>
          </button>
        ))}

        {notes.map((note) => (
          <button
            key={note.id}
            onClick={() => handleNoteClick(note.id)}
            className="flex items-center gap-2 text-xs text-left px-2 py-1 rounded hover:bg-muted transition-colors text-primary hover:underline"
          >
            <StickyNote className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{note.title || note.id}</span>
          </button>
        ))}

        {urls.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-left px-2 py-1 rounded hover:bg-muted transition-colors text-primary hover:underline"
          >
            <LinkIcon className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{url}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
