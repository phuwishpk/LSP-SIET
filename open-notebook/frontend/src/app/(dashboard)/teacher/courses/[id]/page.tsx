'use client'

/**
 * One course room, for the people who run it.
 *
 * The teacher console lists rooms; this page is where a room is actually set
 * up: which category and term it belongs to, whether students need a join
 * code, who is in it and who assists, and - at the end - archiving. Admins
 * additionally get the permanent delete, which takes the course documents
 * and notebook with it.
 */

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpen,
  Copy,
  ExternalLink,
  GraduationCap,
  Hash,
  KeyRound,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/hooks/use-auth'
import {
  useArchiveCourse,
  useCategories,
  useCourseDetail,
  useCourseMembers,
  usePurgeCourse,
  useRemoveMember,
  useSetMemberRole,
  useUpdateCourseSettings,
} from '@/lib/hooks/use-courses'
import { suggestJoinCode, type CourseDetail, type CourseMember } from '@/lib/api/courses'
import { displayName, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

export default function TeacherCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const courseId = Number(id) || 0
  const { user } = useAuth()
  const router = useRouter()
  const isStaff = user?.role === 'teacher' || user?.role === 'admin'
  const detail = useCourseDetail(courseId)
  const course = detail.data

  if (user && !isStaff && !course?.can_manage) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
          ส่วนนี้สำหรับอาจารย์ ผู้ช่วยสอน และผู้ดูแลระบบเท่านั้น
          <Button variant="link" onClick={() => router.push('/community')}>
            กลับไปหน้าชุมชน
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
            <Link href="/teacher">
              <ArrowLeft className="h-4 w-4" /> จัดการการสอน
            </Link>
          </Button>

          {detail.isLoading && <Skeleton className="h-24 w-full" />}
          {detail.isError && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                ไม่พบห้องนี้ หรือคุณไม่มีสิทธิ์ดู
              </CardContent>
            </Card>
          )}

          {course && !course.can_manage && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                ห้อง {course.code} {course.name} ไม่ใช่ห้องที่คุณสอนหรือช่วยสอน
              </CardContent>
            </Card>
          )}

          {course && course.can_manage && (
            <>
              <RoomHeader course={course} />
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-5">
                  <SettingsCard course={course} />
                  <MembersCard course={course} />
                </div>
                <div className="space-y-5">
                  <JoinCard course={course} />
                  <LifecycleCard course={course} isAdmin={user?.role === 'admin'} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

function RoomHeader({ course }: { course: CourseDetail }) {
  const isClub = course.kind === 'club'
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          isClub ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50' : 'bg-primary/10 text-primary'
        )}
      >
        <Hash className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold leading-tight">
          {isClub ? course.name : `${course.code} ${course.name}`}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {course.category_name && <Badge variant="secondary">{course.category_name}</Badge>}
          {course.term && <Badge variant="outline">เทอม {course.term}</Badge>}
          {course.archived && <Badge variant="destructive">เก็บถาวร</Badge>}
          {course.requires_code && (
            <Badge variant="outline" className="gap-1">
              <KeyRound className="h-3 w-3" /> ต้องใช้รหัสเข้าห้อง
            </Badge>
          )}
          {!course.is_owner && <Badge variant="outline">คุณเป็นผู้ช่วยสอน</Badge>}
          <span>{course.description || 'ไม่มีคำอธิบาย'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={`/community?course=${course.id}`}>
            <ExternalLink className="h-4 w-4" /> เปิดห้อง
          </Link>
        </Button>
        {!isClub && (
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/community?view=library&course=${course.id}`}>
              <BookOpen className="h-4 w-4" /> เนื้อหาในคลัง
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SettingsCard({ course }: { course: CourseDetail }) {
  const update = useUpdateCourseSettings(course.id)
  const categories = useCategories()
  const isClub = course.kind === 'club'
  const [code, setCode] = useState(course.code ?? '')
  const [name, setName] = useState(course.name)
  const [description, setDescription] = useState(course.description ?? '')
  const [categoryId, setCategoryId] = useState<number>(course.category_id ?? 0)
  const [term, setTerm] = useState(course.term ?? '')

  // Refill when the server copy changes (another save, a restore, ...).
  useEffect(() => {
    setCode(course.code ?? '')
    setName(course.name)
    setDescription(course.description ?? '')
    setCategoryId(course.category_id ?? 0)
    setTerm(course.term ?? '')
  }, [course.code, course.name, course.description, course.category_id, course.term])

  const dirty =
    name.trim() !== course.name ||
    description.trim() !== (course.description ?? '') ||
    categoryId !== (course.category_id ?? 0) ||
    term.trim() !== (course.term ?? '') ||
    (!isClub && code.trim().toUpperCase() !== course.code)
  const valid = name.trim().length >= 2 && (isClub || code.trim().length >= 2)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ข้อมูลห้อง</CardTitle>
        <CardDescription>
          {course.is_owner
            ? 'หมวดหมู่และเทอมช่วยให้นักศึกษาค้นหาวิชาเจอ — แก้รหัสวิชาได้ถ้ากรอกผิด สมาชิกและโพสต์เดิมยังอยู่ครบ'
            : 'เฉพาะผู้สร้างห้องเท่านั้นที่แก้ข้อมูลส่วนนี้ได้'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          {!isClub && (
            <div className="space-y-1">
              <Label htmlFor="room-code">รหัสวิชา</Label>
              <Input
                id="room-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!course.is_owner}
                className="font-mono uppercase"
              />
            </div>
          )}
          <div className={cn('space-y-1', isClub && 'sm:col-span-2')}>
            <Label htmlFor="room-name">ชื่อ{isClub ? 'ห้อง' : 'วิชา'}</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!course.is_owner}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="room-desc">คำอธิบาย</Label>
          <Input
            id="room-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!course.is_owner}
            placeholder="เนื้อหาโดยย่อของวิชา หรือกติกาของห้อง"
          />
        </div>
        {!isClub && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div className="space-y-1">
              <Label htmlFor="room-category">หมวดหมู่ (ภาควิชา/สาขา)</Label>
              <select
                id="room-category"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                disabled={!course.is_owner || categories.isLoading}
              >
                <option value={0}>— ไม่ระบุ —</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.name_en ? ` (${c.name_en})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="room-term">ภาคการศึกษา</Label>
              <Input
                id="room-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                disabled={!course.is_owner}
                placeholder="เช่น 1/2569"
              />
            </div>
          </div>
        )}
        {course.is_owner && (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!dirty || !valid || update.isPending}
              onClick={() =>
                update.mutate({
                  name: name.trim(),
                  code: isClub ? undefined : code.trim(),
                  description: description.trim(),
                  category_id: isClub ? undefined : categoryId,
                  term: isClub ? undefined : term.trim(),
                })
              }
            >
              บันทึก
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function JoinCard({ course }: { course: CourseDetail }) {
  const update = useUpdateCourseSettings(course.id)
  const [draft, setDraft] = useState(course.join_code ?? '')
  useEffect(() => setDraft(course.join_code ?? ''), [course.join_code])
  const current = course.join_code ?? ''
  const dirty = draft.trim().toUpperCase() !== current

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('คัดลอกแล้ว')
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> การเข้าร่วมห้อง
        </CardTitle>
        <CardDescription>
          {current
            ? 'นักศึกษาต้องกรอกรหัสนี้ครั้งเดียวตอนเข้าร่วม ผู้สอนและผู้ช่วยสอนไม่ต้องใช้'
            : 'ตอนนี้ใครก็เข้าร่วมได้ ตั้งรหัสถ้าอยากให้เฉพาะคนในชั้นเรียนเข้า'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="ไม่มีรหัส (เปิดให้ทุกคน)"
            className="font-mono tracking-widest"
            disabled={!course.is_owner}
            maxLength={32}
          />
          {current && (
            <Button variant="outline" size="icon" aria-label="คัดลอกรหัส" onClick={() => copy(current)}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
        {course.is_owner && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDraft(suggestJoinCode())}
            >
              <RefreshCw className="h-3.5 w-3.5" /> สุ่มรหัส
            </Button>
            {draft && (
              <Button variant="ghost" size="sm" onClick={() => setDraft('')}>
                ไม่ใช้รหัส
              </Button>
            )}
            <Button
              size="sm"
              className="ml-auto"
              disabled={!dirty || update.isPending}
              onClick={() => update.mutate({ join_code: draft.trim() })}
            >
              บันทึก
            </Button>
          </div>
        )}
        <div className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          ลิงก์ห้อง: <code className="break-all">/community?course={course.id}</code>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-6 px-1.5 text-[11px]"
            onClick={() => copy(`${window.location.origin}/community?course=${course.id}`)}
          >
            คัดลอก
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function MembersCard({ course }: { course: CourseDetail }) {
  const members = useCourseMembers(course.id)
  const setRole = useSetMemberRole(course.id)
  const remove = useRemoveMember(course.id)
  const [pendingRemove, setPendingRemove] = useState<CourseMember | null>(null)
  const items = members.data?.items ?? []
  const totals = members.data?.totals

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> สมาชิก
          {totals && (
            <span className="text-sm font-normal text-muted-foreground">
              {totals.members} คน · ผู้ช่วยสอน {totals.assistants}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          ผู้ช่วยสอนเพิ่มเนื้อหาเข้าคลังและดูรายชื่อนี้ได้เหมือนผู้สอน แต่แก้ข้อมูลห้องไม่ได้
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.isLoading && <Skeleton className="h-24 w-full" />}
        {!members.isLoading && items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีสมาชิก</p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">ชื่อ</th>
                  <th className="py-2 pr-3 font-medium">รหัสนักศึกษา</th>
                  <th className="py-2 pr-3 font-medium">บทบาท</th>
                  <th className="py-2 pr-3 text-right font-medium">โพสต์</th>
                  <th className="py-2 pr-3 font-medium">เข้าร่วม</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((m) => (
                  <tr key={m.user_id}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">{displayName(m)}</p>
                      <p className="text-xs text-muted-foreground">@{m.username}</p>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{m.student_code || '—'}</td>
                    <td className="py-2 pr-3">
                      {m.is_owner ? (
                        <Badge className="gap-1">
                          <GraduationCap className="h-3 w-3" /> ผู้สอน
                        </Badge>
                      ) : m.role === 'ta' ? (
                        <Badge variant="secondary">ผู้ช่วยสอน</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {m.user_role === 'student' ? 'นักศึกษา' : m.user_role}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.post_count}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{timeAgo(m.joined_at)}</td>
                    <td className="py-2 text-right">
                      {course.is_owner && !m.is_owner && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={setRole.isPending}
                            onClick={() =>
                              setRole.mutate({ userId: m.user_id, role: m.role === 'ta' ? 'member' : 'ta' })
                            }
                          >
                            {m.role === 'ta' ? 'ถอดผู้ช่วยสอน' : 'ตั้งเป็นผู้ช่วยสอน'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            aria-label="นำออกจากห้อง"
                            onClick={() => setPendingRemove(m)}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={pendingRemove !== null} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>นำ {pendingRemove ? displayName(pendingRemove) : ''} ออกจากห้อง?</AlertDialogTitle>
            <AlertDialogDescription>
              โพสต์ของเขาในห้องยังอยู่ เขาเข้าร่วมใหม่ได้ถ้าห้องเปิดอยู่
              {course.requires_code && ' (ต้องใช้รหัสเข้าห้อง)'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRemove) return
                remove.mutate(pendingRemove.user_id)
                setPendingRemove(null)
              }}
            >
              นำออก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function LifecycleCard({ course, isAdmin }: { course: CourseDetail; isAdmin: boolean }) {
  const archive = useArchiveCourse()
  const purge = usePurgeCourse()
  const router = useRouter()
  const [confirmPurge, setConfirmPurge] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">สถานะห้อง</CardTitle>
        <CardDescription>
          {course.archived
            ? 'ห้องนี้ถูกเก็บถาวร: ไม่ขึ้นในรายการให้เข้าร่วมและโพสต์เพิ่มไม่ได้ แต่สมาชิกเดิมยังอ่านได้'
            : 'เก็บถาวรเมื่อจบเทอม — ย้อนกลับได้เสมอ ไม่มีอะไรถูกลบ'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {course.is_owner && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={archive.isPending}
            onClick={() => archive.mutate({ courseId: course.id, archived: !course.archived })}
          >
            {course.archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" /> เปิดห้องกลับมาใช้งาน
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" /> เก็บถาวรห้องนี้
              </>
            )}
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-destructive/40 text-destructive hover:text-destructive"
            onClick={() => setConfirmPurge(true)}
          >
            <Trash2 className="h-4 w-4" /> ลบห้องถาวร (ผู้ดูแล)
          </Button>
        )}
      </CardContent>

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบห้อง “{course.name}” ถาวร?</AlertDialogTitle>
            <AlertDialogDescription>
              เอกสารในคลังของวิชานี้ ไฟล์ และ notebook ที่ AI ใช้อ้างอิงจะถูกลบทั้งหมด สมาชิกทุกคนออกจากห้อง
              โพสต์ไม่ถูกลบแต่ย้ายไปฟีดรวม — ย้อนกลับไม่ได้ ถ้าแค่จบเทอมให้ใช้ “เก็บถาวร” แทน
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmPurge(false)
                purge.mutate(course.id, { onSuccess: () => router.push('/teacher') })
              }}
            >
              ลบถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
