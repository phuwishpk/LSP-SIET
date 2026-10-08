'use client'

import { BrainCircuit } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { QuizListPanel } from '@/components/admin/quiz/QuizListPanel'
import { QuizStatsPanel } from '@/components/admin/quiz/QuizStatsPanel'
import { SharedQuizzesPanel } from '@/components/admin/quiz/SharedQuizzesPanel'

export default function AdminQuizPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <AdminPageHeader
            icon={BrainCircuit}
            title="จัดการ Quiz AI"
            description="การใช้งาน AI Quiz ทั้งระบบ รายการของผู้ใช้ทุกคน และโพสต์ Quiz ที่อยู่ในฟีดพร้อมผลการทำ"
          />

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap whitespace-nowrap">
              <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
              <TabsTrigger value="all">Quiz ทั้งหมด</TabsTrigger>
              <TabsTrigger value="shared">ที่แชร์ในฟีด</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <QuizStatsPanel />
            </TabsContent>
            <TabsContent value="all" className="mt-4">
              <QuizListPanel />
            </TabsContent>
            <TabsContent value="shared" className="mt-4">
              <SharedQuizzesPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}
