'use client'

import { useState } from 'react'
import {
  Bookmark,
  BookOpen,
  Flame,
  Hash,
  Library,
  MessagesSquare,
  Newspaper,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
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
} from '@siet/platform/lib/hooks/use-community'
import type { Course, RoomKind } from '@siet/platform/lib/api/community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { cn } from '@/lib/utils'

export type FeedView =
  | 'all'
  | 'mine'
  | 'saved'
  | 'materials'
  | 'popular'
  | 'library'
  | 'rules'

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
        'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500',
        active
          ? 'bg-rose-50/80 font-bold text-rose-700 shadow-2xs border-l-4 border-rose-600 pl-2.5 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-500'
          : 'text-foreground hover:bg-accent'
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
      onSelectCourse(c.id)
    }
    return (
      <>
        {joined.length > 0 && (
          <div className="space-y-0.5">
            {joined.map((c) => (
              <NavButton
                key={c.id}
                active={(view === 'all' || view === 'mine') && courseId !== null && courseId === c.id}
                icon={icon}
                label={label(c)}
                onClick={() => open(c)}
                badge={
                  c.post_count > 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                      {view === 'mine' ? `${c.post_count} โพสต์` : c.post_count}
                    </span>
                  ) : null
                }
              />
            ))}
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-2 space-y-0.5">
            <p className="px-3 text-xs text-muted-foreground">ห้องอื่น ๆ (กด + เพื่อเข้าร่วม)</p>
            {others.map((c) => (
              <div key={c.id} className="flex items-center gap-1 pr-1">
                <NavButton
                  active={(view === 'all' || view === 'mine') && courseId !== null && courseId === c.id}
                  icon={icon}
                  label={label(c)}
                  onClick={() => open(c)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 min-w-11 px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
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
      <nav className="space-y-0.5 rounded-xl border bg-card p-3 shadow-sm">
        <p className="mb-2 px-2 text-sm font-semibold text-foreground">พื้นที่การเรียนของฉัน</p>
        <NavButton
          active={view === 'all' && courseId === null}
          icon={Newspaper}
          label="ฟีดสาธารณะ"
          onClick={() => onSelectView('all')}
        />
        <div className="hidden">
          <NavButton
            active={view === 'popular'}
            icon={Flame}
            label="ยอดนิยม"
            onClick={() => onSelectView('popular')}
          />
        </div>
        <NavButton
          active={view === 'mine'}
          icon={Users}
          label="ชั้นเรียนของฉัน"
          onClick={() => onSelectView('mine')}
        />
        <NavButton
          active={view === 'library'}
          icon={BookOpen}
          label={isStaff ? 'คลังเอกสาร / เพิ่มเนื้อหา' : 'คลังเอกสาร & สไลด์เรียน'}
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
          onClick={() => onSelectView('saved')}
        />
        <NavButton
          active={view === 'rules'}
          icon={ShieldCheck}
          label="กฎชุมชน"
          onClick={() => onSelectView('rules')}
        />
      </nav>

      {/* ------------------------------------------------ official course rooms */}
      <div className="rounded-xl border bg-card p-3 shadow-sm">
        <p className="mb-2 px-2 text-sm font-semibold text-foreground">
          {view === 'mine' ? 'กิจกรรมในชั้นเรียนของฉัน' : 'ชั้นเรียนของฉัน'}
        </p>
        <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">ห้องวิชา</p>
        {isLoading && (
          <div className="space-y-1 px-3">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        )}
        <RoomList
          rooms={view === 'mine' ? courseRooms.filter((course) => course.joined) : courseRooms}
          icon={Hash}
          showCode
        />
        {!isLoading &&
          (view === 'mine' ? !courseRooms.some((course) => course.joined) : courseRooms.length === 0) && (
          <p className="px-3 text-xs text-muted-foreground">
            {isStaff ? 'ยังไม่มีห้องวิชา — สร้างห้องแรกได้เลย' : 'ยังไม่มีห้องวิชา'}
          </p>
          )}
        {isStaff && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-11 w-full justify-start gap-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setCreateKind('course')}
          >
            <Plus className="h-3.5 w-3.5" /> สร้างห้องวิชาใหม่
          </Button>
        )}
        {/* Student discussion rooms share the enrolled-rooms card. */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
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
            className="mt-2 h-11 w-full justify-start gap-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setCreateKind('club')}
          >
            <Plus className="h-3.5 w-3.5" /> เปิดห้องพูดคุยใหม่
          </Button>
        </div>
      </div>

      {selected && (selected.joined || canManageSelected) && (
        <div className="space-y-1">
          {selected.joined && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start px-3 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => join.mutate({ courseId: selected.id, join: false })}
            >
              ออกจาก{selected.kind === 'club' ? 'ห้องพูดคุย' : 'ห้องวิชา'}นี้
            </Button>
          )}
          {canManageSelected && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start gap-2 px-3 text-xs text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setPendingDelete(selected)}
            >
              <Trash2 className="h-3.5 w-3.5" /> ปิดห้องนี้
            </Button>
          )}
        </div>
      )}

      <CreateRoomDialog
        kind={createKind}
        onClose={() => setCreateKind(null)}
        onCreated={(room) => {
          onSelectCourse(room.id)
        }}
      />
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="community-theme">
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
      <DialogContent className="community-theme">
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
