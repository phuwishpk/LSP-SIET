'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Bookmark,
  BookOpen,
  Bot,
  Flame,
  GraduationCap,
  Hash,
  Library,
  Map,
  MessagesSquare,
  Newspaper,
  Plus,
  ScrollText,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useCourses,
  useCreateCourse,
  useDeleteCourse,
  useJoinCourse,
  useWallet,
} from '@/lib/hooks/use-community'
import type { Course, RoomKind } from '@/lib/api/community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import { cn } from '@/lib/utils'

export type FeedView = 'all' | 'mine' | 'saved' | 'materials' | 'popular' | 'library'

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
  const me = useAuthStore((s) => s.user)
  const join = useJoinCourse()
  const remove = useDeleteCourse()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [createKind, setCreateKind] = useState<RoomKind | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null)

  // Official course rooms are run by staff; discussion rooms are opened by
  // whoever wants to talk about something. They share one table, so split here.
  const courseRooms = (courses ?? []).filter((c) => c.kind !== 'club')
  const clubRooms = (courses ?? []).filter((c) => c.kind === 'club')
  const selected = (courses ?? []).find((c) => c.id === courseId) ?? null
  // Admins manage every room; everyone else manages the rooms they opened —
  // including the course rooms a teacher created.
  const canManageSelected =
    selected !== null &&
    (me?.role === 'admin' || Number(me?.id ?? -1) === selected.created_by)

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

  const RoomList = ({
    rooms,
    icon,
    showCode,
  }: {
    rooms: Course[]
    icon: React.ComponentType<{ className?: string }>
    showCode: boolean
  }) => {
    const joined = rooms.filter((c) => c.joined)
    const others = rooms.filter((c) => !c.joined)
    const label = (c: Course) => (showCode ? `${c.code} ${c.name}` : c.name)
    const open = (c: Course) => {
      onSelectView('all')
      onSelectCourse(c.id)
    }
    return (
      <>
        {joined.length > 0 && (
          <div className="space-y-0.5">
            {joined.map((c) => (
              <NavButton
                key={c.id}
                active={courseId === c.id}
                icon={icon}
                label={label(c)}
                onClick={() => open(c)}
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
                  icon={icon}
                  label={label(c)}
                  onClick={() => open(c)}
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
      </>
    )
  }

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
          label="เฉพาะห้องที่เข้าร่วม"
          onClick={() => {
            onSelectCourse(null)
            onSelectView('mine')
          }}
        />
        <NavButton
          active={view === 'library'}
          icon={BookOpen}
          label={isStaff ? 'คลังความรู้ / เพิ่มเนื้อหา' : 'คลังความรู้ & ไฟล์ของฉัน'}
          onClick={() => onSelectView('library')}
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

      {/* ------------------------------------------------ official course rooms */}
      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ห้องวิชา
        </p>
        {isLoading && (
          <div className="space-y-1 px-3">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        )}
        <RoomList rooms={courseRooms} icon={Hash} showCode />
        {!isLoading && courseRooms.length === 0 && (
          <p className="px-3 text-xs text-muted-foreground">
            {isStaff ? 'ยังไม่มีห้องวิชา — สร้างห้องแรกได้เลย' : 'ยังไม่มีห้องวิชา'}
          </p>
        )}
        {isStaff && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-8 w-full justify-start gap-2 text-xs"
            onClick={() => setCreateKind('course')}
          >
            <Plus className="h-3.5 w-3.5" /> สร้างห้องวิชาใหม่
          </Button>
        )}
      </div>

      {/* --------------------------------------------- student discussion rooms */}
      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ห้องพูดคุย
        </p>
        <RoomList rooms={clubRooms} icon={MessagesSquare} showCode={false} />
        {!isLoading && clubRooms.length === 0 && (
          <p className="px-3 text-xs text-muted-foreground">
            ยังไม่มีห้องพูดคุย — เปิดห้องแรกได้เลย
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-8 w-full justify-start gap-2 text-xs"
          onClick={() => setCreateKind('club')}
        >
          <Plus className="h-3.5 w-3.5" /> เปิดห้องพูดคุยใหม่
        </Button>
      </div>

      {selected && (selected.joined || canManageSelected) && (
        <div className="space-y-1">
          {selected.joined && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start px-3 text-xs text-muted-foreground"
              onClick={() => join.mutate({ courseId: selected.id, join: false })}
            >
              ออกจาก{selected.kind === 'club' ? 'ห้องพูดคุย' : 'ห้องวิชา'}นี้
            </Button>
          )}
          {canManageSelected && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-2 px-3 text-xs text-destructive hover:text-destructive"
              onClick={() => setPendingDelete(selected)}
            >
              <Trash2 className="h-3.5 w-3.5" /> ปิดห้องนี้
            </Button>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          เครื่องมือ AI
        </p>
        <nav className="space-y-0.5">
          <Link
            href="/community/ask"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <Bot className="h-4 w-4 text-violet-600" /> ถาม KMITL RAG AI
            <span className="ml-auto text-[10px] text-muted-foreground">1 แต้ม →</span>
          </Link>
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
        </nav>
      </div>

      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
      <CreateRoomDialog
        kind={createKind}
        onClose={() => setCreateKind(null)}
        onCreated={(room) => {
          onSelectView('all')
          onSelectCourse(room.id)
        }}
      />
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดห้อง “{pendingDelete?.name}” ?</AlertDialogTitle>
            <AlertDialogDescription>
              สมาชิกทุกคนจะออกจากห้องนี้ โพสต์ที่เคยอยู่ในห้องจะไม่ถูกลบ แต่จะย้ายไปอยู่ในฟีดรวมแทน
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return
                const id = pendingDelete.id
                setPendingDelete(null)
                remove.mutate(id, { onSuccess: () => onSelectCourse(null) })
              }}
            >
              ปิดห้อง
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            <li>ห้องพูดคุยเปิดได้ทุกคน แต่ห้องวิชาสร้างได้เฉพาะอาจารย์และผู้ดูแล</li>
            <li>ผู้ดูแลสามารถลบโพสต์หรือปิดห้องที่ผิดกฎได้โดยไม่แจ้งล่วงหน้า</li>
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

/**
 * One dialog for both room types. A discussion room only asks for a name –
 * the server generates its handle – while a course room needs its real code.
 */
function CreateRoomDialog({
  kind,
  onClose,
  onCreated,
}: {
  kind: RoomKind | null
  onClose: () => void
  onCreated: (room: Course) => void
}) {
  const create = useCreateCourse()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const isClub = kind === 'club'

  const reset = () => {
    setCode('')
    setName('')
    setDescription('')
  }

  const disabled =
    create.isPending || name.trim().length < 2 || (!isClub && code.trim().length < 2)

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isClub ? 'เปิดห้องพูดคุยใหม่' : 'สร้างห้องวิชาใหม่'}</DialogTitle>
          <DialogDescription>
            {isClub
              ? 'ห้องพูดคุยเปิดได้ทุกคน เพื่อน ๆ จะเห็นในแถบซ้ายและเข้าร่วมได้ทันที (ไม่มีคลังความรู้ของห้อง)'
              : 'นักศึกษาจะเห็นห้องนี้ในแถบด้านซ้ายและเข้าร่วมได้ทันที'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!isClub && (
            <div className="space-y-1">
              <Label htmlFor="room-code">รหัสวิชา</Label>
              <Input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น CS401" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="room-name">{isClub ? 'ชื่อห้อง' : 'ชื่อวิชา'}</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isClub ? 'เช่น ติวเลข 1 ก่อนสอบ' : 'เช่น Software Engineering'}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="room-desc">คำอธิบาย (ไม่บังคับ)</Label>
            <Input id="room-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={disabled}
            onClick={() =>
              create.mutate(
                {
                  kind: isClub ? 'club' : 'course',
                  name: name.trim(),
                  code: isClub ? undefined : code.trim(),
                  description: description.trim() || undefined,
                },
                {
                  onSuccess: (room) => {
                    reset()
                    onClose()
                    onCreated(room)
                  },
                }
              )
            }
          >
            {isClub ? 'เปิดห้อง' : 'สร้างห้องวิชา'}
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
