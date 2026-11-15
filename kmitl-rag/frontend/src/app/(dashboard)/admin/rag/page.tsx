'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Database } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { RagDocumentsPanel } from '@siet/kmitl-rag/components/admin/rag/RagDocumentsPanel'
import { RagKnowledgePanel } from '@siet/kmitl-rag/components/admin/rag/RagKnowledgePanel'
import { RagStatsPanel } from '@siet/kmitl-rag/components/admin/rag/RagStatsPanel'
import { RebuildEmbeddingsPanel } from '@siet/kmitl-rag/components/admin/rag/RebuildEmbeddingsPanel'

const TABS = ['overview', 'documents', 'knowledge', 'rebuild'] as const
type TabName = (typeof TABS)[number]

// `/admin/rag?tab=rebuild` opens the tab (the embedding-model dialog in Settings sends people there);
// no tab, or one that does not exist, opens the overview.
function tabFromQuery(raw: string | null | undefined): TabName {
  return TABS.find((name) => name === raw) ?? 'overview'
}

export default function AdminRagPage() {
  return (
    <Suspense fallback={null}>
      <AdminRagContent />
    </Suspense>
  )
}

function AdminRagContent() {
  const tab = tabFromQuery(useSearchParams()?.get('tab'))
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <AdminPageHeader
            icon={Database}
            title="จัดการ RAG AI"
            description="การใช้งาน KMITL RAG AI เอกสารที่ AI อ่าน และแหล่งความรู้ที่ใช้ตอบ — เห็นเฉพาะสถิติ ไม่เห็นบทสนทนาของใคร"
          />

          <Tabs key={tab} defaultValue={tab}>
            <TabsList className="flex-wrap whitespace-nowrap">
              <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
              <TabsTrigger value="documents">เอกสารที่ AI อ่าน</TabsTrigger>
              <TabsTrigger value="knowledge">แหล่งความรู้</TabsTrigger>
              <TabsTrigger value="rebuild">สร้าง Embedding ใหม่</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <RagStatsPanel />
            </TabsContent>
            <TabsContent value="documents" className="mt-4">
              <RagDocumentsPanel />
            </TabsContent>
            <TabsContent value="knowledge" className="mt-4">
              <RagKnowledgePanel />
            </TabsContent>
            <TabsContent value="rebuild" className="mt-4">
              <div className="max-w-4xl">
                <RebuildEmbeddingsPanel />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}
