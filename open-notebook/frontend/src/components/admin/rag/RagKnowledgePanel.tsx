'use client'

/**
 * The notebooks the RAG can answer from, as the "เจาะจงเอกสาร" dropdown offers
 * them: shared ones every role may ask about, plus the private ones only an
 * admin sees. A source with no chunks is listed but cannot be searched yet.
 */
import { AlertTriangle, ChevronRight, Globe, Lock } from 'lucide-react'
import { EmptyState } from '@/components/admin/controls'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { KnowledgeNotebook } from '@/lib/api/library'
import { useKnowledge } from '@/lib/hooks/use-library'

const KIND_LABEL: Record<KnowledgeNotebook['kind'], string> = {
  staff: 'Notebook ของอาจารย์/ผู้ดูแล',
  course: 'คลังรายวิชา',
  personal: 'คลังส่วนตัวของผู้ใช้',
  student: 'Notebook ของนักศึกษา',
}

export function RagKnowledgePanel() {
  const { data, isLoading } = useKnowledge()
  const notebooks = data?.notebooks ?? []
  const shared = notebooks.filter((nb) => nb.visibility === 'shared')
  const unsearchable = notebooks.reduce((n, nb) => n + nb.sources.filter((s) => s.chunks === 0).length, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">แหล่งความรู้ที่ AI ตอบได้</CardTitle>
        <CardDescription>
          {data
            ? `${notebooks.length} Notebook · ${data.stats.sources.toLocaleString()} เอกสาร · ทุกคนถามได้ ${shared.length} · เห็นเฉพาะผู้ดูแล ${notebooks.length - shared.length}`
            : 'Notebook ที่อยู่ในตัวเลือก “เจาะจงเอกสาร” ของหน้า RAG AI'}
          {unsearchable > 0 ? ` · ยังค้นไม่ได้ ${unsearchable} เอกสาร` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && notebooks.length === 0 && <EmptyState>ยังไม่มี Notebook ที่มีเอกสารให้ AI อ่าน</EmptyState>}

        {notebooks.map((nb) => {
          const empty = nb.sources.filter((s) => s.chunks === 0).length
          return (
            <details key={nb.id} className="group rounded-lg border">
              {/* a flex summary loses the browser's own disclosure marker */}
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 text-sm [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle-foreground transition-transform group-open:rotate-90" />
                {nb.visibility === 'shared' ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{nb.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {KIND_LABEL[nb.kind]}
                </Badge>
                <Badge variant={nb.visibility === 'shared' ? 'secondary' : 'outline'} className="text-[10px]">
                  {nb.visibility === 'shared' ? 'ทุกคนถามได้' : 'เห็นเฉพาะผู้ดูแล'}
                </Badge>
                {empty > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-600" /> ยังค้นไม่ได้ {empty}
                  </span>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">{nb.source_count} เอกสาร</span>
              </summary>
              <div className="border-t px-3 py-2">
                <p className="mb-1.5 text-[11px] text-muted-foreground">
                  {nb.owner_label}
                  {nb.description ? ` · ${nb.description}` : ''}
                </p>
                <ul className="divide-y text-xs">
                  {nb.sources.map((source) => (
                    <li key={source.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate">{source.title}</span>
                      {source.chunks === 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                          <AlertTriangle className="h-3 w-3 text-amber-600" /> ยังไม่มีดัชนี
                        </span>
                      ) : (
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {source.chunks.toLocaleString()} ชิ้นข้อความ
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )
        })}

        {notebooks.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            ต้องการซ่อน Notebook จากตัวเลือกของผู้ใช้ ให้เก็บถาวร (archive) Notebook นั้นในหน้า Notebooks
          </p>
        )}
      </CardContent>
    </Card>
  )
}
