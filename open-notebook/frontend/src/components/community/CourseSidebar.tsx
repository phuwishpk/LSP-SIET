'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BookMarked,
  BookOpen,
  Bookmark,
  Flame,
  GraduationCap,
  Hash,
  Library,
  Map,
  Newspaper,
  Plus,
  ScrollText,
  Sparkles,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCourses, useCreateCourse, useJoinCourse, useWallet } from '@/lib/hooks/use-community'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import { cn } from '@/lib/utils'

export type FeedView = 'all' | 'mine' | 'saved' | 'materials' | 'popular'

interface CourseSidebarProps {
  view: FeedView
  courseId: number | null
  isStaff: boolean
  onSelectView: (view: FeedView) => void
  onSelectCourse: (courseId: number | null) => void
}

export function CourseSidebar({
  view,
  courseId,
  isStaff,
  onSelectView,
  onSelectCourse,
}: CourseSidebarProps) {
  const { data: courses, isLoading } = useCourses()
  const join = useJoinCourse()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const joined = (courses ?? []).filter((c) => c.joined)
  const others = (courses ?? []).filter((c) => !c.joined)

  const NavButton = ({
    active,
    icon: Icon,
    label,
    onClick,
    badge,
  }: {
    active: boolean
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick: () => void
    badge?: React.ReactNode
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
        active ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-accent'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">{label}</span>
      {badge}
    </button>
  )

  return (
    <aside className="space-y-4">
      <nav className="space-y-0.5">
        <NavButton
          active={view === 'all' && courseId === null}
          icon={Newspaper}
          label="ฟีดรวมทั้งหมด"
          onClick={() => {
            onSelectCourse(null)
            onSelectView('all')
          }}
        />
        <NavButton
          active={view === 'popular'}
          icon={Flame}
          label="ยอดนิยม"
          onClick={() => {
            onSelectCourse(null)
            onSelectView('popular')
          }}
        />
        <NavButton
          active={view === 'mine'}
          icon={Users}
          label="เฉพาะวิชาที่ลงเรียน"
          onClick={() => {
            onSelectCourse(null)
            onSelectView('mine')
          }}
        />
        <NavButton
          active={view === 'materials'}
          icon={Library}
          label="คลังสื่ออาจารย์"
          onClick={() => onSelectView('materials')}
        />
        <NavButton
          active={view === 'saved'}
          icon={Bookmark}
          label="สรุปที่บันทึกไว้"
          onClick={() => {
            onSelectCourse(null)
            onSelectView('saved')
          }}
        />
        <NavButton active={false} icon={ScrollText} label="กฎชุมชน & แต้ม" onClick={() => setRulesOpen(true)} />
      </nav>

      <div>
        <div className="mb-1 flex items-center justify-between px-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            ห้องวิชา
          </p>
          {isStaff && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {isLoading && (
          <div className="space-y-1 px-3">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        )}
        {joined.length > 0 && (
          <div className="space-y-0.5">
            {joined.map((c) => (
              <NavButton
                key={c.id}
                active={courseId === c.id}
                icon={Hash}
                label={`${c.code} ${c.name}`}
                onClick={() => {
                  onSelectView('all')
                  onSelectCourse(c.id)
                }}
                badge={
                  c.post_count > 0 ? (
                    <span className="text-[10px] text-muted-foreground">{c.post_count}</span>
                  ) : null
                }
              />
            ))}
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-2 space-y-0.5">
            <p className="px-3 text-[11px] text-muted-foreground">ห้องอื่น ๆ (กด + เพื่อเข้าร่วม)</p>
            {others.map((c) => (
              <div key={c.id} className="flex items-center gap-1 pr-1">
                <NavButton
                  active={courseId === c.id}
                  icon={Hash}
                  label={`${c.code} ${c.name}`}
                  onClick={() => {
                    onSelectView('all')
                    onSelectCourse(c.id)
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={join.isPending}
                  onClick={() => join.mutate({ courseId: c.id, join: true })}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {!isLoading && (courses?.length ?? 0) === 0 && (
          <p className="px-3 text-xs text-muted-foreground">ยังไม่มีห้องวิชา</p>
        )}
        {courseId !== null && joined.some((c) => c.id === courseId) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 w-full justify-start px-3 text-xs text-muted-foreground"
            onClick={() => join.mutate({ courseId, join: false })}
          >
            ออกจากห้องวิชานี้
          </Button>
        )}
      </div>

      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          เครื่องมือ AI
        </p>
        <nav className="space-y-0.5">
          <button
            type="button"
            onClick={() => void openQuizApp()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <GraduationCap className="h-4 w-4 text-emerald-600" /> สร้าง AI Quiz
            <span className="ml-auto text-[10px] text-muted-foreground">8 แต้ม ↗</span>
          </button>
          <button
            type="button"
            onClick={() => void openRoadmapApp()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <Map className="h-4 w-4 text-orange-600" /> สร้าง AI Roadmap
            <span className="ml-auto text-[10px] text-muted-foreground">15 แต้ม ↗</span>
          </button>
          <Link href="/features" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent">
            <Sparkles className="h-4 w-4" /> คลัง Quiz / Roadmap ของฉัน
          </Link>
          <Link href="/search?mode=ask" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent">
            <GraduationCap className="h-4 w-4" /> KMITL RAG AI
          </Link>
          <Link href="/notebooks" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent">
            <BookOpen className="h-4 w-4" /> Open Notebook
          </Link>
          <Link href="/sources" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent">
            <BookMarked className="h-4 w-4" /> อัปโหลดเอกสารเข้าคลัง
          </Link>
        </nav>
      </div>

      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
      {isStaff && <CreateCourseDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </aside>
  )
}

function RulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: wallet } = useWallet(open)
  const rules = wallet?.rules
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>กฎชุมชน SIET Space</DialogTitle>
          <DialogDescription>แชร์ความรู้ เคารพเพื่อน และใช้ AI อย่างคุ้มค่า</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>โพสต์เฉพาะเนื้อหาที่เกี่ยวกับการเรียน ไม่ละเมิดลิขสิทธิ์ ไม่แชร์ข้อสอบจริงที่ยังไม่เปิดเผย</li>
            <li>ให้เครดิตเจ้าของสรุป และกด Helpful เมื่อโพสต์ช่วยคุณได้จริง</li>
            <li>ห้ามใช้บัญชีคนอื่น ทุกบัญชีผูกกับอีเมล @kmitl.ac.th</li>
            <li>ผู้ดูแลสามารถลบโพสต์ที่ผิดกฎได้โดยไม่แจ้งล่วงหน้า</li>
          </ol>
          {rules && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 font-semibold">ระบบแต้ม (Token Economy)</p>
              <ul className="space-y-1 text-xs">
                <li>🎁 เข้าใช้ครั้งแรกรับ {rules.welcome} แต้ม</li>
                <li>💬 KMITL RAG AI {rules.costs.rag_question} แต้ม/คำถาม หรือ {rules.costs.rag_session} แต้ม/เซสชัน {rules.rag_session_messages} ข้อความ</li>
                <li>📝 AI Quiz {rules.costs.quiz_generate} แต้ม/ชุด · 🗺️ AI Roadmap {rules.costs.roadmap_generate} แต้ม/แผน</li>
                <li>🔁 แชร์ควิซแล้วเพื่อนเล่นจบ ได้คืน +{rules.cashback_per_play}/คน (สูงสุด {rules.cashback_max_per_post})</li>
                <li>🆓 Roadmap ของเพื่อนดู/บันทึกฟรี · ควิซของเพื่อนเล่นฟรี 1 ครั้ง นำเข้าคลัง {rules.costs.quiz_import} แต้ม</li>
                <li>⭐ แชร์สรุป +{rules.creator_bonus_summary} · ถูกกด Helpful +{rules.helpful_bonus}</li>
                <li>👩‍🏫 อาจารย์และผู้ดูแลไม่ถูกตัดแต้ม</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateCourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateCourse()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>สร้างห้องวิชาใหม่</DialogTitle>
          <DialogDescription>นักศึกษาจะเห็นห้องนี้ในแถบด้านซ้ายและเข้าร่วมได้ทันที</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="course-code">รหัสวิชา</Label>
            <Input id="course-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น CS401" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="course-name">ชื่อวิชา</Label>
            <Input id="course-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Software Engineering" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="course-desc">คำอธิบาย (ไม่บังคับ)</Label>
            <Input id="course-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={create.isPending || code.trim().length < 2 || name.trim().length < 2}
            onClick={() =>
              create.mutate(
                { code: code.trim(), name: name.trim(), description: description.trim() || undefined },
                {
                  onSuccess: () => {
                    setCode('')
                    setName('')
                    setDescription('')
                    onOpenChange(false)
                  },
                }
              )
            }
          >
            สร้างห้องวิชา
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CourseBadge({ code, name }: { code?: string | null; name?: string | null }) {
  if (!code && !name) return null
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Hash className="h-3 w-3" />
      {code} {name}
    </Badge>
  )
}
