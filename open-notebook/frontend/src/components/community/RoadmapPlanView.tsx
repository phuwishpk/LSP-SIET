'use client'

import { useMemo, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Globe, Lock } from 'lucide-react'
import type { RoadmapNodePayload, RoadmapSource } from '@/lib/api/features'
import type { RoadmapGrounding } from '@/lib/api/community'

interface RoadmapPlanViewProps {
  nodes: RoadmapNodePayload[]
  grounding?: RoadmapGrounding | null
}

/** The five learning stages get their own colour; anything else stays neutral. */
const STAGE_CLASS: Record<string, string> = {
  พื้นฐาน: 'text-blue-700 dark:text-blue-300',
  แนวคิดหลัก: 'text-teal-700 dark:text-teal-300',
  ฝึกปฏิบัติ: 'text-amber-700 dark:text-amber-300',
  ประยุกต์: 'text-orange-700 dark:text-orange-300',
  'ทบทวน/ประเมิน': 'text-violet-700 dark:text-violet-300',
}

const byOrder = (a: RoadmapNodePayload, b: RoadmapNodePayload) => (a.order ?? 0) - (b.order ?? 0)

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function SourceList({ sources }: { sources?: RoadmapSource[] }) {
  if (!sources?.length) return null
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {sources.map((source, index) => (
        <li key={index} className="flex items-start gap-1.5 text-muted-foreground">
          {source.kind === 'web' && source.url ? (
            <>
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {source.title || hostOf(source.url)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : source.kind === 'private' ? (
            <>
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>ไฟล์ส่วนตัวของผู้สร้าง</span>
            </>
          ) : (
            <>
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {source.title}
                {source.origin ? ` · ${source.origin}` : ''}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

interface NodeRowProps {
  node: RoadmapNodePayload
  number?: number
  childrenOf: Map<string, RoadmapNodePayload[]>
}

/** One node, folded to its name; opening it shows the description, sources and sub-nodes. */
function NodeRow({ node, number, childrenOf }: NodeRowProps) {
  const [open, setOpen] = useState(false)
  const kids = childrenOf.get(node.id) ?? []
  const hasMore = Boolean(node.description) || kids.length > 0 || Boolean(node.sources?.length)

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={!hasMore}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm hover:bg-accent disabled:hover:bg-background"
      >
        {number !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
            {number}
          </span>
        )}
        <span className="min-w-0 flex-1 font-medium">{node.label}</span>
        {kids.length > 0 && (
          <span className="shrink-0 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
            +{kids.length} ด่านย่อย
          </span>
        )}
        {hasMore &&
          (open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ))}
      </button>
      {open && (
        <div className="ml-4 border-l border-dashed pl-4 pt-2">
          {node.description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{node.description}</p>
          )}
          <SourceList sources={node.sources} />
          {kids.length > 0 && (
            <ol className="mt-2 space-y-2">
              {kids.map((kid) => (
                <NodeRow key={kid.id} node={kid} childrenOf={childrenOf} />
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * A shared roadmap as a readable plan: main nodes grouped by learning stage,
 * with sub-nodes folded under the node they explain.
 */
export function RoadmapPlanView({ nodes, grounding }: RoadmapPlanViewProps) {
  const { lanes, childrenOf } = useMemo(() => {
    const ids = new Set(nodes.map((node) => node.id))
    const childrenOf = new Map<string, RoadmapNodePayload[]>()
    const mains: RoadmapNodePayload[] = []
    for (const node of nodes) {
      const parent = node.parent && ids.has(node.parent) ? node.parent : null
      if (parent === null) mains.push(node)
      else childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), node])
    }
    mains.sort(byOrder)
    childrenOf.forEach((list) => list.sort(byOrder))

    // Consecutive main nodes of one stage form a lane, so the order is kept.
    const lanes: { category: string; items: { node: RoadmapNodePayload; number: number }[] }[] = []
    mains.forEach((node, index) => {
      const category = node.category || 'ทั่วไป'
      const last = lanes[lanes.length - 1]
      if (last && last.category === category) last.items.push({ node, number: index + 1 })
      else lanes.push({ category, items: [{ node, number: index + 1 }] })
    })
    return { lanes, childrenOf }
  }, [nodes])

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground">Roadmap นี้ยังไม่มีด่าน</p>
  }

  const pages = grounding?.web_sources ?? []
  return (
    <div className="space-y-4">
      {lanes.map((lane, index) => (
        <section key={`${lane.category}-${index}`} className="space-y-2">
          <h4 className={`text-xs font-semibold ${STAGE_CLASS[lane.category.replace(/\s+/g, '')] ?? 'text-muted-foreground'}`}>
            {lane.category}
          </h4>
          <ol className="space-y-2">
            {lane.items.map(({ node, number }) => (
              <NodeRow key={node.id} node={node} number={number} childrenOf={childrenOf} />
            ))}
          </ol>
        </section>
      ))}
      {pages.length > 0 && (
        <section className="border-t pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground">หน้าเว็บที่ใช้อ้างอิง</h4>
          <SourceList sources={pages.map((page) => ({ kind: 'web' as const, ...page }))} />
          <p className="mt-2 text-xs text-muted-foreground">ข้อมูลจากเว็บ ควรตรวจสอบก่อนนำไปใช้</p>
        </section>
      )}
    </div>
  )
}
