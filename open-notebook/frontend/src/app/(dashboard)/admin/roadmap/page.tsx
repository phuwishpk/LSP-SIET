'use client'

import { Map as MapIcon } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { RoadmapListPanel } from '@/components/admin/roadmap/RoadmapListPanel'
import { RoadmapStatsPanel } from '@/components/admin/roadmap/RoadmapStatsPanel'
import { SharedRoadmapsPanel } from '@/components/admin/roadmap/SharedRoadmapsPanel'

export default function AdminRoadmapPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <AdminPageHeader
            icon={MapIcon}
            title="จัดการ Road Map"
            description="การใช้งาน AI Roadmap ทั้งระบบ รายการของผู้ใช้ทุกคน และโพสต์ Roadmap ที่อยู่ในฟีด"
          />

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview" className="whitespace-nowrap">ภาพรวม</TabsTrigger>
              <TabsTrigger value="all" className="whitespace-nowrap">Roadmap ทั้งหมด</TabsTrigger>
              <TabsTrigger value="shared" className="whitespace-nowrap">ที่แชร์ในฟีด</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <RoadmapStatsPanel />
            </TabsContent>
            <TabsContent value="all" className="mt-4">
              <RoadmapListPanel />
            </TabsContent>
            <TabsContent value="shared" className="mt-4">
              <SharedRoadmapsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}
