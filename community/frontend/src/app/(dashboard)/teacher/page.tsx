'use client'

/**
 * Teacher console.
 *
 * The teaching side of SIET Space used to be scattered: rooms were created from
 * the community sidebar, material was uploaded in the library panel, and there
 * was nowhere at all to see how students did on a quiz. This page gathers the
 * three things a teacher owns — their rooms, the material in them, and student
 * quiz results — without touching the admin console, which stays about accounts.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  FileText,
  GraduationCap,
  Hash,
  Library,
  Archive,
  ArchiveRestore,
  Download,
  KeyRound,
  Lock,
  MessagesSquare,
  Pencil,
  Plus,
  Settings2,
  Upload,
  Users,
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useAuth } from '@/lib/hooks/use-auth'
import {
  useFeed,
  useTeacherOverview,
  useTeacherQuizResults,
  useUpdateCourse,
} from '@siet/platform/lib/hooks/use-community'
import { useArchiveCourse } from '@siet/platform/lib/hooks/use-courses'
import { useLibrary } from '@siet/platform/lib/hooks/use-library'
import { libraryDownloadUrl } from '@siet/platform/lib/api/library'
import { useAuthStore } from '@/lib/stores/auth-store'
import type { TeacherCourse } from '@siet/platform/lib/api/community'
import type { TeacherRoom } from '@siet/platform/lib/api/courses'
import { formatBytes, timeAgo } from '@siet/platform/lib/utils/community-format'
import { cn } from '@/lib/utils'

export default function TeacherPage() {
  const { user } = useAuth()
  const router = useRouter()
  const isStaff = user?.role === 'teacher' || user?.role === 'admin'

  const overview = useTeacherOverview(isStaff)
  const [editing, setEditing] = useState<TeacherCourse | null>(null)
  const [pendingArchive, setPendingArchive] = useState<TeacherRoom | null>(null)
  const archive = useArchiveCourse()

  if (user && !isStaff) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
          ส่วนนี้สำหรับอาจารย์และผู้ดูแลระบบเท่านั้น
          <Button variant="link" onClick={() => router.push('/community')}>
            กลับไปหน้าชุมชน
          </Button>
        </div>
      </AppShell>
    )
  }

  // The overview now carries category / term / status for every room.
  const courses = (overview.data?.courses ?? []) as TeacherRoom[]
  const rooms = courses.filter((c) => c.kind !== 'club' && !c.archived)
  const archived = courses.filter((c) => c.archived)
  const clubs = courses.filter((c) => c.kind === 'club' && !c.archived)
  const totals = overview.data?.totals

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <GraduationCap className="h-6 w-6 text-primary" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">จัดการการสอน</h1>
              <p className="text-sm text-muted-foreground">
                ห้องวิชาของคุณ เนื้อหาในคลัง และผลการเล่นควิซของนักศึกษา รวมไว้ที่เดียว
              </p>
            </div>
            <Button asChild size="sm" className="ml-auto gap-1.5">
              <Link href="/community?view=library">
                <Upload className="h-4 w-4" /> เพิ่มเนื้อหาเข้าคลัง
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={Hash} label="ห้องวิชาของฉัน" value={totals?.courses} />
            <StatCard icon={Users} label="สมาชิกรวม" value={totals?.members} />
            <StatCard icon={BookOpen} label="เอกสารในคลัง" value={totals?.documents} />
            <StatCard icon={FileText} label="โพสต์ในห้องของฉัน" value={totals?.posts} />
          </div>

          <Tabs defaultValue="courses">
            <TabsList>
              <TabsTrigger value="courses">ห้องของฉัน</TabsTrigger>
              <TabsTrigger value="documents">เอกสารแยกตามวิชา</TabsTrigger>
              <TabsTrigger value="quiz">ผลการเล่นควิซ</TabsTrigger>
              <TabsTrigger value="materials">สื่อการสอนของฉัน</TabsTrigger>
            </TabsList>

            {/* ------------------------------------------------------ rooms */}
            <TabsContent value="courses" className="mt-4 space-y-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">ห้องวิชา</CardTitle>
                  <CardDescription>
                    ห้องที่คุณสร้างหรือช่วยสอน — “ตั้งค่า” เพื่อจัดหมวดหมู่ เทอม รหัสเข้าห้อง และสมาชิก;
                    จบเทอมแล้วเก็บถาวรได้ ไม่มีอะไรถูกลบ
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.isLoading && <Skeleton className="h-16 w-full" />}
                  {!overview.isLoading && rooms.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      คุณยังไม่ได้สร้างห้องวิชา — สร้างได้จากแถบซ้ายของหน้าชุมชน
                    </p>
                  )}
                  {rooms.map((c) => (
                    <RoomRow
                      key={c.id}
                      course={c}
                      onEdit={() => setEditing(c)}
                      onArchive={() => setPendingArchive(c)}
                    />
                  ))}
                  <Button asChild variant="outline" size="sm" className="mt-1 gap-1.5">
                    <Link href="/community">
                      <Plus className="h-4 w-4" /> สร้างห้องวิชาใหม่
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {clubs.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">ห้องพูดคุยที่คุณเปิด</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {clubs.map((c) => (
                      <RoomRow
                        key={c.id}
                        course={c}
                        onEdit={() => setEditing(c)}
                        onArchive={() => setPendingArchive(c)}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {archived.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">ห้องที่เก็บถาวร</CardTitle>
                    <CardDescription>
                      ไม่ขึ้นในรายการให้เข้าร่วมและโพสต์เพิ่มไม่ได้ สมาชิกเดิมยังอ่านได้ — เปิดกลับมาใช้ได้ทุกเมื่อ
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {archived.map((c) => (
                      <RoomRow
                        key={c.id}
                        course={c}
                        onEdit={() => setEditing(c)}
                        onArchive={() => archive.mutate({ courseId: c.id, archived: false })}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* -------------------------------------------------- documents */}
            <TabsContent value="documents" className="mt-4">
              <DocumentsByCourse courses={rooms} loading={overview.isLoading} />
            </TabsContent>

            {/* ------------------------------------------------------- quiz */}
            <TabsContent value="quiz" className="mt-4">
              <QuizResultsPanel courses={rooms} enabled={isStaff} />
            </TabsContent>

            {/* -------------------------------------------------- materials */}
            <TabsContent value="materials" className="mt-4">
              <MyMaterials userId={user?.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EditRoomDialog course={editing} onClose={() => setEditing(null)} />
      <AlertDialog open={pendingArchive !== null} onOpenChange={(o) => !o && setPendingArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>เก็บถาวรห้อง “{pendingArchive?.name}” ?</AlertDialogTitle>
            <AlertDialogDescription>
              ห้องจะหายจากรายการให้เข้าร่วมและรับโพสต์ใหม่ไม่ได้ สมาชิก {pendingArchive?.member_count ?? 0} คน
              ยังอ่านโพสต์ {pendingArchive?.post_count ?? 0} รายการ
              {(pendingArchive?.document_count ?? 0) > 0 &&
                ` และเอกสาร ${pendingArchive?.document_count} ฉบับ`}{' '}
              ได้ตามเดิม — เปิดกลับมาใช้ได้ทุกเมื่อ ไม่มีอะไรถูกลบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingArchive) return
                const id = pendingArchive.id
                setPendingArchive(null)
                archive.mutate({ courseId: id, archived: true })
              }}
            >
              เก็บถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value?: number
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value ?? '—'}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function RoomRow({
  course,
  onEdit,
  onArchive,
}: {
  course: TeacherRoom
  onEdit: () => void
  /** Archive an active room; restore an archived one. */
  onArchive: () => void
}) {
  const isClub = course.kind === 'club'
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border p-3',
        course.archived && 'bg-muted/40 text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          isClub ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50' : 'bg-primary/10 text-primary'
        )}
      >
        {isClub ? <MessagesSquare className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{isClub ? course.name : `${course.code} ${course.name}`}</span>
          {course.category_name && (
            <Badge variant="outline" className="h-5 font-normal">
              {course.category_name}
            </Badge>
          )}
          {course.term && (
            <Badge variant="outline" className="h-5 font-normal">
              {course.term}
            </Badge>
          )}
          {course.is_private && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="ห้องส่วนตัว" />}
          {course.requires_code && <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-label="ต้องใช้รหัสเข้าห้อง" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {course.description || 'ไม่มีคำอธิบาย'}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" /> {course.member_count}
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <FileText className="h-3 w-3" /> {course.post_count}
        </Badge>
        {!isClub && (
          <Badge variant="secondary" className="gap-1">
            <BookOpen className="h-3 w-3" /> {course.document_count}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
          <Link href={`/community?course=${course.id}`}>เปิดห้อง</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
          <Link href={`/teacher/courses/${course.id}`}>
            <Settings2 className="h-3.5 w-3.5" /> ตั้งค่า
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onEdit} aria-label="แก้ไขห้อง">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={onArchive}
          aria-label={course.archived ? 'เปิดห้องกลับมาใช้งาน' : 'เก็บถาวรห้อง'}
        >
          {course.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

function EditRoomDialog({ course, onClose }: { course: TeacherCourse | null; onClose: () => void }) {
  const update = useUpdateCourse()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loadedFor, setLoadedFor] = useState<number | null>(null)

  // Fill the form the first time a given room opens the dialog.
  if (course && loadedFor !== course.id) {
    setLoadedFor(course.id)
    setCode(course.code ?? '')
    setName(course.name)
    setDescription(course.description ?? '')
  }

  const isClub = course?.kind === 'club'

  return (
    <Dialog
      open={course !== null}
      onOpenChange={(o) => {
        if (!o) {
          setLoadedFor(null)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แก้ไข{isClub ? 'ห้องพูดคุย' : 'ห้องวิชา'}</DialogTitle>
          <DialogDescription>
            {isClub
              ? 'รหัสห้องพูดคุยระบบสร้างให้อัตโนมัติ จึงแก้ไม่ได้'
              : 'แก้รหัสวิชาได้ถ้ากรอกผิด — สมาชิกและโพสต์เดิมยังอยู่ครบ'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!isClub && (
            <div className="space-y-1">
              <Label htmlFor="edit-code">รหัสวิชา</Label>
              <Input id="edit-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="edit-name">ชื่อ{isClub ? 'ห้อง' : 'วิชา'}</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-desc">คำอธิบาย</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={update.isPending || name.trim().length < 2 || (!isClub && code.trim().length < 2)}
            onClick={() => {
              if (!course) return
              update.mutate(
                {
                  courseId: course.id,
                  name: name.trim(),
                  code: isClub ? undefined : code.trim(),
                  description: description.trim(),
                },
                {
                  onSuccess: () => {
                    setLoadedFor(null)
                    onClose()
                  },
                }
              )
            }}
          >
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentsByCourse({ courses, loading }: { courses: TeacherCourse[]; loading: boolean }) {
  const { data, isLoading } = useLibrary({ scope: 'course' })
  const token = useAuthStore((s) => s.token)

  const grouped = useMemo(() => {
    const byCourse = new Map<number, typeof docs>()
    const docs = data?.items ?? []
    for (const doc of docs) {
      const cid = doc.course?.id
      if (!cid) continue
      if (!byCourse.has(cid)) byCourse.set(cid, [])
      byCourse.get(cid)!.push(doc)
    }
    return byCourse
  }, [data])

  if (loading || isLoading) return <Skeleton className="h-40 w-full" />

  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          ยังไม่มีห้องวิชาของคุณ จึงยังไม่มีคลังความรู้แยกตามวิชา
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {courses.map((c) => {
        const docs = grouped.get(c.id) ?? []
        return (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Hash className="h-4 w-4" /> {c.code} {c.name}
                <Badge variant="secondary">{docs.length} ฉบับ</Badge>
                <Button asChild variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs">
                  <Link href={`/community?view=library&course=${c.id}`}>
                    <Upload className="h-3.5 w-3.5" /> เพิ่ม/จัดการ
                  </Link>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docs.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  ยังไม่มีเอกสาร — AI จะยังตอบคำถามของวิชานี้ไม่ได้จนกว่าจะอัปโหลด
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                      <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.is_media ? 'สื่อ' : d.chunks > 0 ? `${d.chunks} ชิ้น` : ''} {formatBytes(d.size)}
                      </span>
                      <Badge
                        variant={d.status === 'ready' ? 'secondary' : 'outline'}
                        className={cn(
                          'text-[10px]',
                          d.status === 'failed' && 'border-destructive text-destructive'
                        )}
                      >
                        {d.status === 'ready' ? (d.is_media ? 'เก็บแล้ว' : 'พร้อมใช้') : d.status === 'processing' ? 'กำลังประมวลผล' : 'ล้มเหลว'}
                      </Badge>
                      {d.download_url && (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2" aria-label="ดาวน์โหลด">
                          <a href={libraryDownloadUrl(d, token) ?? '#'} target="_blank" rel="noreferrer">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function QuizResultsPanel({ courses, enabled }: { courses: TeacherCourse[]; enabled: boolean }) {
  const [courseId, setCourseId] = useState<number | null>(null)
  const { data, isLoading } = useTeacherQuizResults(courseId, enabled)
  const summary = data?.summary

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ผลการเล่นควิซของนักศึกษา</CardTitle>
        <CardDescription>
          ทุกครั้งที่นักศึกษาเล่นควิซในห้องที่คุณสร้าง หรือควิซที่คุณโพสต์เอง
        </CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={courseId ?? ''}
            onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">ทุกวิชา</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
          {summary && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">เล่น {summary.attempts} ครั้ง</Badge>
              <Badge variant="secondary">เล่นจบ {summary.finished}</Badge>
              <Badge variant="secondary">{summary.students} คน</Badge>
              {summary.average_percent !== null && (
                <Badge variant="secondary">เฉลี่ย {summary.average_percent}%</Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            ยังไม่มีใครเล่นควิซในห้องของคุณ
          </p>
        )}
        {(data?.items.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">นักศึกษา</th>
                  <th className="py-2 pr-3 font-medium">ควิซ</th>
                  <th className="py-2 pr-3 font-medium">วิชา</th>
                  <th className="py-2 pr-3 font-medium">คะแนน</th>
                  <th className="py-2 font-medium">เมื่อ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.items.map((row) => {
                  const pct =
                    row.completed && row.total
                      ? Math.round(((row.score ?? 0) / row.total) * 100)
                      : null
                  return (
                    <tr key={row.id}>
                      <td className="py-2 pr-3">
                        <p className="font-medium">
                          {row.student_display_name || row.student_username}
                        </p>
                        {row.student_code && (
                          <p className="text-xs text-muted-foreground">{row.student_code}</p>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate py-2 pr-3">
                        <Link
                          href={`/community?post=${row.post_id}`}
                          className="hover:underline"
                        >
                          {row.post_title || `โพสต์ #${row.post_id}`}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {row.course_code ? `${row.course_code}` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {row.completed ? (
                          <span
                            className={cn(
                              'font-medium',
                              pct !== null && pct >= 50 ? 'text-emerald-600' : 'text-orange-600'
                            )}
                          >
                            {row.score}/{row.total}
                            {pct !== null && <span className="ml-1 text-xs">({pct}%)</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">ยังเล่นไม่จบ</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {timeAgo(row.completed_at || row.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MyMaterials({ userId }: { userId?: string }) {
  const feed = useFeed({
    author_id: userId ? Number(userId) : undefined,
    type: 'material',
    limit: 50,
  })
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">สื่อการสอนที่คุณโพสต์</CardTitle>
        <CardDescription>
          โพสต์ชนิด &ldquo;สื่อการสอน&rdquo; ของคุณ — นักศึกษาเห็นรวมกันที่เมนู &ldquo;คลังสื่ออาจารย์&rdquo;
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {feed.isLoading && <Skeleton className="h-24 w-full" />}
        {!feed.isLoading && posts.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            ยังไม่มีสื่อการสอน — โพสต์ได้จากกล่องเขียนโพสต์ในหน้าชุมชน แล้วเลือกชนิด
            &ldquo;สื่อการสอน&rdquo;
          </p>
        )}
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/community?post=${post.id}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border p-3 transition hover:bg-accent"
          >
            <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {post.title || 'ไม่มีหัวข้อ'}
            </span>
            {post.course && (
              <Badge variant="outline" className="text-[10px]">
                {post.course.code} {post.course.name}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              ❤️ {post.counts.like} · 💬 {post.counts.comment} · {timeAgo(post.created_at)}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
