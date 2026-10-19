'use client'

/**
 * The reference list that closes every KMITL RAG AI answer.
 *
 * Two kinds of evidence, numbered the way the answer cites them:
 *   [n]  – passages from the knowledge library (expand to read the passage)
 *   [Wn] – web pages found by Google Search grounding (open in a new tab)
 * Passages the answer did not cite are kept, but folded away as further reading.
 */
import { BookOpen, ExternalLink, Globe2 } from 'lucide-react'
import type { AskCitation, AskWebSource } from '@/lib/api/community'
import { cn } from '@/lib/utils'

interface AnswerReferencesProps {
  citations?: AskCitation[]
  webSources?: AskWebSource[]
  /** Smaller type for the sidebar widget. */
  compact?: boolean
}

export function AnswerReferences({ citations = [], webSources = [], compact }: AnswerReferencesProps) {
  if (citations.length === 0 && webSources.length === 0) return null

  // Older answers (saved before `cited` existed) simply show every passage.
  const knowsUsage = citations.some((c) => c.cited !== undefined)
  const used = knowsUsage ? citations.filter((c) => c.cited) : citations
  const unused = knowsUsage ? citations.filter((c) => !c.cited) : []
  const size = compact ? 'text-[10px]' : 'text-[11px]'

  return (
    <div className={cn('mt-2 space-y-2 border-t pt-2', size)} aria-label="อ้างอิง">
      <p className="font-semibold text-foreground/80">อ้างอิง</p>

      {used.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-muted-foreground">
            <BookOpen className="h-3 w-3" /> จากคลังความรู้
          </p>
          {used.map((c) => (
            <Passage key={c.index} citation={c} />
          ))}
        </div>
      )}

      {webSources.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-muted-foreground">
            <Globe2 className="h-3 w-3" /> จากการค้นเว็บ (Google Search)
          </p>
          {webSources.map((w) => (
            <a
              key={w.index}
              href={w.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-1 text-sky-700 hover:underline dark:text-sky-300"
            >
              <span className="shrink-0">[W{w.index}]</span>
              <span className="min-w-0 truncate">{w.title}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ))}
        </div>
      )}

      {unused.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none text-muted-foreground hover:underline">
            ข้อความที่ค้นเจอแต่ไม่ได้ใช้อ้างอิง ({unused.length})
          </summary>
          <div className="mt-1 space-y-1">
            {unused.map((c) => (
              <Passage key={c.index} citation={c} muted />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function Passage({ citation, muted }: { citation: AskCitation; muted?: boolean }) {
  return (
    <details className="group">
      <summary
        className={cn(
          'cursor-pointer list-none hover:underline',
          muted ? 'text-muted-foreground' : 'text-violet-700 dark:text-violet-300'
        )}
      >
        [{citation.index}] {citation.title}
        <span className="ml-1 text-muted-foreground group-open:hidden">· ดูข้อความ</span>
      </summary>
      <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 p-2 leading-relaxed text-muted-foreground">
        {citation.snippet}
      </p>
    </details>
  )
}
