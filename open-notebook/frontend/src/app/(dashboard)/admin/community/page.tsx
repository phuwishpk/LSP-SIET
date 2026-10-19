'use client'

import { MessageSquare } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CommentsPanel } from '@/components/admin/community/CommentsPanel'
import { CommunityStatsPanel } from '@/components/admin/community/CommunityStatsPanel'
import { ModerationPanel } from '@/components/admin/ModerationPanel'
import { RoomsPanel } from '@/components/admin/RoomsPanel'

export default function AdminCommunityPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <AdminPageHeader
            icon={MessageSquare}
            title="จัดการ Community"
            description="ความเคลื่อนไหวในฟีด โพสต์ ความคิดเห็น และห้องทั้งหมดของ SIET Space"
          />

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap whitespace-nowrap">
              <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
              <TabsTrigger value="posts">โพสต์</TabsTrigger>
              <TabsTrigger value="comments">ความคิดเห็น</TabsTrigger>
              <TabsTrigger value="rooms">ห้อง</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <CommunityStatsPanel />
            </TabsContent>
            <TabsContent value="posts" className="mt-4">
              <ModerationPanel />
            </TabsContent>
            <TabsContent value="comments" className="mt-4">
              <CommentsPanel />
            </TabsContent>
            <TabsContent value="rooms" className="mt-4">
              <RoomsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}
