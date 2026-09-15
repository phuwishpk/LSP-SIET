'use client'

import { useState } from 'react'
import { Coins, GraduationCap, Map, Share2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStudyQuiz, useStudyRoadmap } from '@/lib/hooks/use-library'
import { useCreatePost, useWallet } from '@/lib/hooks/use-community'
import type { ScopeSelection } from '@/lib/api/library'

interface StudyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'quiz' | 'roadmap'
  selection: ScopeSelection
  scopeLabel: string
  defaultTopic?: string
}

/**
 * Generate a quiz / roadmap grounded in a chosen slice of the knowledge library
 * (a course, the student's own uploads, or one specific document).
 */
export function StudyDialog({
  open,
  onOpenChange,
  kind,
  selection,
  scopeLabel,
  defaultTopic = '',
}: StudyDialogProps) {
  const isQuiz = kind === 'quiz'
  const { data: wallet } = useWallet(open)
  const quiz = useStudyQuiz()
  const roadmap = useStudyRoadmap()
  const createPost = useCreatePost()

  const [topic, setTopic] = useState(defaultTopic)
  const [count, setCount] = useState(isQuiz ? 10 : 12)
  const [shared, setShared] = useState(false)

  const cost = wallet?.rules.costs[isQuiz ? 'quiz_generate' : 'roadmap_generate'] ?? (isQuiz ? 8 : 15)
  const exempt = wallet?.exempt ?? false
  const balance = wallet?.balance ?? 0
  const pending = quiz.isPending || roadmap.isPending
  const quizResult = quiz.data
  const roadmapResult = roadmap.data
  const sessionId = isQuiz ? quizResult?.session_id : roadmapResult?.session_id

  const generate = () => {
    if (!topic.trim()) return
    setShared(false)
    if (isQuiz) {
      quiz.mutate({ ...selection, topic: topic.trim(), question_count: count, language: 'th' })
    } else {
      roadmap.mutate({
        ...selection,
        description: topic.trim(),
        node_count: count,
        language: 'th',
      })
    }
  }

  const share = () => {
    if (!sessionId) return
    createPost.mutate(
      {
        type: kind,
        embed_type: kind,
        embed_id: sessionId,
        title: isQuiz ? quizResult?.topic : roadmapResult?.title,
        content: `สร้างจาก ${scopeLabel}`,
        course_id: selection.course_id ?? null,
      },
      { onSuccess: () => setShared(true) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isQuiz ? (
              <GraduationCap className="h-5 w-5 text-emerald-600" />
            ) : (
              <Map className="h-5 w-5 text-orange-600" />
            )}
            {isQuiz ? 'สร้างควิซจากเนื้อหาที่เรียน' : 'สร้าง Roadmap จากเนื้อหาที่เรียน'}
          </DialogTitle>
          <DialogDescription>
            อ้างอิงจาก <span className="font-medium text-foreground">{scopeLabel}</span> ·{' '}
            {exempt ? 'ไม่ตัดแต้ม' : `ใช้ ${cost} แต้ม (คุณมี ${balance})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="study-topic">{isQuiz ? 'หัวข้อที่อยากทดสอบ' : 'สิ่งที่อยากวางแผน'}</Label>
            <Textarea
              id="study-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder={
                isQuiz
                  ? 'เช่น Memory management จากสไลด์สัปดาห์ที่ 5'
                  : 'เช่น แผนอ่านสอบกลางภาควิชานี้ภายใน 7 วัน'
              }
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="study-count">{isQuiz ? 'จำนวนข้อ' : 'จำนวนด่าน'}</Label>
              <Input
                id="study-count"
                type="number"
                className="w-24"
                min={isQuiz ? 1 : 3}
                max={isQuiz ? 20 : 50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || (isQuiz ? 10 : 12))}
              />
            </div>
            <Button className="ml-auto gap-1.5" disabled={pending || !topic.trim()} onClick={generate}>
              <Sparkles className="h-4 w-4" />
              {pending ? 'กำลังสร้าง…' : isQuiz ? 'สร้างควิซ' : 'สร้าง Roadmap'}
            </Button>
          </div>

          {(quizResult || roadmapResult) && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={(isQuiz ? quizResult : roadmapResult)?.grounded ? 'default' : 'secondary'}>
                  {(isQuiz ? quizResult : roadmapResult)?.grounded
                    ? 'อ้างอิงเอกสารในคลัง'
                    : 'ยังไม่มีเอกสารในขอบเขตนี้ (ใช้ความรู้ทั่วไป)'}
                </Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Coins className="h-3 w-3" />
                  {(isQuiz ? quizResult : roadmapResult)?.charged === 0
                    ? 'ไม่ตัดแต้ม'
                    : `ใช้ ${(isQuiz ? quizResult : roadmapResult)?.charged} แต้ม`}
                  {' · เหลือ '}
                  {(isQuiz ? quizResult : roadmapResult)?.balance}
                </span>
              </div>
              <ScrollArea className="max-h-52">
                <ol className="space-y-1.5 pr-3 text-sm">
                  {isQuiz
                    ? quizResult?.questions.map((q, i) => (
                        <li key={q.id ?? i} className="rounded border bg-background p-2">
                          <p className="font-medium">
                            {i + 1}. {q.question}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(q.options || []).join(' · ')}
                          </p>
                        </li>
                      ))
                    : roadmapResult?.nodes.map((n, i) => (
                        <li key={n.id ?? i} className="rounded border bg-background p-2">
                          <p className="font-medium">
                            {i + 1}. {n.label}
                          </p>
                          {n.description && (
                            <p className="text-xs text-muted-foreground">{n.description}</p>
                          )}
                        </li>
                      ))}
                </ol>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {sessionId && (
            <Button variant="outline" className="gap-1.5" disabled={createPost.isPending || shared} onClick={share}>
              <Share2 className="h-4 w-4" />
              {shared ? 'แชร์ลงฟีดแล้ว' : 'แชร์ลงฟีด Community'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
