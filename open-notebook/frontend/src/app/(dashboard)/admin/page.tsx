'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Coins,
  FileText,
  KeyRound,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HealthPanel } from '@/components/admin/HealthPanel'
import { ModerationPanel } from '@/components/admin/ModerationPanel'
import { RoomsPanel } from '@/components/admin/RoomsPanel'
import { PointsLogPanel } from '@/components/admin/PointsLogPanel'
import { ImportPanel } from '@/components/admin/ImportPanel'
import { CreateUserDialog } from '@/components/admin/CreateUserDialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDebounce } from 'use-debounce'
import {
  useAdjustPoints,
  useAdminOverview,
  useAdminUser,
  useAdminUsers,
  useBulkDeleteUsers,
  useDeleteUser,
  useResetPassword,
  useUpdateUser,
} from '@/lib/hooks/use-admin'
import type { AdminUser, UserRole } from '@/lib/api/admin'
import { displayName, kindLabel, roleLabel, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

const ROLE_STYLE: Record<UserRole, string> = {
  admin: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
  teacher: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  student: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
}

export default function AdminPage() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [role, setRole] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const bulkDelete = useBulkDeleteUsers()

  const { data: overview } = useAdminOverview()
  const { data, isLoading } = useAdminUsers({
    q: debounced,
    role,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  })

  const pages = useMemo(() => Math.ceil((data?.total ?? 0) / PAGE_SIZE), [data?.total])

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">จัดการระบบ</h1>
              <p className="text-sm text-muted-foreground">
                บัญชี เนื้อหา ห้อง แต้ม และสถานะระบบ — ทุกอย่างที่เคยต้องเข้า MariaDB เอง
              </p>
            </div>
            <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" /> สร้างบัญชี
            </Button>
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
              <TabsTrigger value="users">ผู้ใช้</TabsTrigger>
              <TabsTrigger value="content">เนื้อหา</TabsTrigger>
              <TabsTrigger value="rooms">ห้อง</TabsTrigger>
              <TabsTrigger value="points">แต้ม</TabsTrigger>
              <TabsTrigger value="import">นำเข้า CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
          {overview && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={Users} label="ผู้ใช้ทั้งหมด" value={overview.users} hint={`ใช้งานใน 7 วัน ${overview.active_week}`} />
              <StatCard icon={UserX} label="บัญชีที่ระงับ" value={overview.suspended} />
              <StatCard icon={FileText} label="โพสต์ในฟีด" value={overview.posts} hint={`${overview.courses} รายวิชา`} />
              <StatCard icon={BookOpen} label="เอกสารในคลัง" value={overview.documents} />
              <StatCard icon={Coins} label="แต้มคงเหลือรวม" value={overview.points_outstanding} hint={`ใช้ไป 7 วัน ${overview.points_spent_week}`} />
            </div>
          )}
              <HealthPanel />
            </TabsContent>

            <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">รายชื่อผู้ใช้</CardTitle>
              <CardDescription>
                {data ? `${data.total} บัญชี · ` : ''}
                {(['admin', 'teacher', 'student'] as UserRole[])
                  .map((r) => `${roleLabel(r)} ${data?.by_role?.[r] ?? 0}`)
                  .join(' · ')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(0)
                    }}
                    placeholder="ค้นหาชื่อผู้ใช้ ชื่อจริง อีเมล หรือรหัสนักศึกษา"
                    className="pl-9"
                  />
                </div>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value)
                    setPage(0)
                  }}
                >
                  <option value="">ทุกสิทธิ์</option>
                  <option value="student">นักศึกษา</option>
                  <option value="teacher">อาจารย์</option>
                  <option value="admin">ผู้ดูแล</option>
                </select>
              </div>

              {isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}
              {!isLoading && (data?.items.length ?? 0) === 0 && (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  ไม่พบบัญชีที่ตรงกับเงื่อนไข
                </p>
              )}

              {picked.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-sm">
                  <span>เลือกไว้ {picked.length} บัญชี</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPicked([])}>
                    ล้างการเลือก
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="ml-auto h-7 gap-1 text-xs"
                    disabled={bulkDelete.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `ลบ ${picked.length} บัญชีถาวร?\nโพสต์ของพวกเขาจะถูกซ่อน แต้มและการแจ้งเตือนจะถูกลบ และห้องที่เปิดไว้จะยังอยู่แต่ไม่มีเจ้าของ\nการลบย้อนกลับไม่ได้`
                        )
                      ) {
                        bulkDelete.mutate(picked, { onSuccess: () => setPicked([]) })
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> ลบบัญชีที่เลือก
                  </Button>
                </div>
              )}

              <div className="divide-y rounded-lg border">
                {data?.items.map((u) => (
                  <div
                    key={u.id}
                    className={cn(
                      'flex w-full items-center gap-3 p-3 transition hover:bg-accent',
                      picked.includes(u.id) && 'bg-destructive/5'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-destructive"
                      checked={picked.includes(u.id)}
                      disabled={u.id === data.me || u.role === 'admin'}
                      title={
                        u.id === data.me
                          ? 'ลบบัญชีของตัวเองไม่ได้'
                          : u.role === 'admin'
                          ? 'ลดสิทธิ์ผู้ดูแลก่อนจึงจะลบได้'
                          : 'เลือกเพื่อลบ'
                      }
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                        )
                      }
                      aria-label={`เลือก ${u.username}`}
                    />
                    <button
                      type="button"
                      onClick={() => setSelected(u)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                    <Avatar size="sm" src={u.avatar_url} name={displayName(u)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('truncate font-medium', u.disabled && 'line-through opacity-60')}>
                          {displayName(u)}
                        </span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', ROLE_STYLE[u.role])}>
                          {roleLabel(u.role)}
                        </span>
                        {u.disabled && (
                          <Badge variant="destructive" className="text-[10px]">
                            ระงับอยู่
                          </Badge>
                        )}
                        {u.id === data.me && <Badge variant="outline" className="text-[10px]">คุณ</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        @{u.username}
                        {u.email ? ` · ${u.email}` : ''}
                        {u.student_id ? ` · รหัส ${u.student_id}` : ''}
                        {u.last_login_at ? ` · เข้าล่าสุด ${timeAgo(u.last_login_at)}` : ' · ยังไม่เคยเข้าใช้'}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      <Coins className="h-3.5 w-3.5" />
                      {u.points_balance}
                    </span>
                    <UserCog className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    ก่อนหน้า
                  </Button>
                  <span className="text-muted-foreground">
                    หน้า {page + 1} จาก {pages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                    ถัดไป
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="content" className="mt-4">
              <ModerationPanel />
            </TabsContent>
            <TabsContent value="rooms" className="mt-4">
              <RoomsPanel />
            </TabsContent>
            <TabsContent value="points" className="mt-4">
              <PointsLogPanel />
            </TabsContent>
            <TabsContent value="import" className="mt-4">
              <ImportPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      {selected && (
        <UserDialog
          user={selected}
          isSelf={selected.id === data?.me}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </AppShell>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function UserDialog({
  user,
  isSelf,
  onOpenChange,
}: {
  user: AdminUser
  isSelf: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: detail } = useAdminUser(user.id)
  const update = useUpdateUser()
  const adjust = useAdjustPoints()
  const resetPassword = useResetPassword()
  const remove = useDeleteUser()

  const current = detail?.user ?? user
  const [role, setRole] = useState<UserRole>(current.role)
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [password, setPassword] = useState('')

  const busy = update.isPending || adjust.isPending || resetPassword.isPending

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar size="sm" src={current.avatar_url} name={displayName(current)} />
            {displayName(current)}
          </DialogTitle>
          <DialogDescription>
            @{current.username}
            {current.email ? ` · ${current.email}` : ''} · แต้มคงเหลือ {current.points_balance}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>สิทธิ์การใช้งาน</Label>
            <div className="flex flex-wrap gap-2">
              {(['student', 'teacher', 'admin'] as UserRole[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={role === r ? 'default' : 'outline'}
                  disabled={isSelf || busy}
                  onClick={() => setRole(r)}
                >
                  {roleLabel(r)}
                </Button>
              ))}
              <Button
                size="sm"
                variant="secondary"
                disabled={isSelf || busy || role === current.role}
                onClick={() => update.mutate({ id: current.id, role })}
              >
                บันทึกสิทธิ์
              </Button>
            </div>
            {isSelf && (
              <p className="text-xs text-muted-foreground">เปลี่ยนสิทธิ์หรือระงับบัญชีของตัวเองไม่ได้</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adm-points">ปรับแต้ม (ใส่ค่าติดลบเพื่อหัก)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="adm-points"
                type="number"
                className="w-28"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="เช่น 50"
              />
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เหตุผล เช่น รางวัลกิจกรรม"
                className="min-w-[160px] flex-1"
              />
              <Button
                size="sm"
                disabled={busy || !Number(delta)}
                onClick={() =>
                  adjust.mutate(
                    { id: current.id, delta: Number(delta), note: note.trim() || undefined },
                    { onSuccess: () => { setDelta(''); setNote('') } }
                  )
                }
              >
                ปรับแต้ม
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adm-pw">ตั้งรหัสผ่านใหม่</Label>
            <div className="flex gap-2">
              <Input
                id="adm-pw"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy || password.trim().length < 6}
                onClick={() =>
                  resetPassword.mutate(
                    { id: current.id, password: password.trim() },
                    { onSuccess: () => setPassword('') }
                  )
                }
              >
                <KeyRound className="h-4 w-4" /> ตั้งรหัส
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ใช้ได้เฉพาะบัญชีที่เข้าระบบด้วยชื่อผู้ใช้ บัญชีที่ผูก Google จะยังเข้าผ่าน Google ตามเดิม
            </p>
          </div>

          {detail?.points_history && detail.points_history.length > 0 && (
            <div className="space-y-1.5">
              <Label>ประวัติแต้มล่าสุด</Label>
              <ScrollArea className="max-h-40 rounded-md border">
                <ul className="divide-y text-xs">
                  {detail.points_history.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between px-3 py-1.5">
                      <span className="truncate">
                        {kindLabel(tx.kind)}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </span>
                      <span className={cn('ml-2 font-semibold tabular-nums', tx.delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                        {tx.delta >= 0 ? '+' : ''}
                        {tx.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={current.disabled ? 'outline' : 'destructive'}
              size="sm"
              disabled={isSelf || busy}
              onClick={() => update.mutate({ id: current.id, disabled: !current.disabled })}
            >
              <UserX className="mr-1.5 h-4 w-4" />
              {current.disabled ? 'คืนสิทธิ์การใช้งาน' : 'ระงับบัญชี'}
            </Button>
            {/* Suspending hides an account; deleting is for ones that should
                never have existed. Admins must be demoted first. */}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isSelf || busy || remove.isPending || current.role === 'admin'}
              title={
                current.role === 'admin' ? 'ลดสิทธิ์ผู้ดูแลคนนี้ก่อนจึงจะลบได้' : undefined
              }
              onClick={() => {
                if (
                  window.confirm(
                    `ลบบัญชี "${current.username}" ถาวร?\nโพสต์จะถูกซ่อน · แต้ม ประวัติ และการแจ้งเตือนจะถูกลบ · ห้องที่เปิดไว้จะยังอยู่แต่ไม่มีเจ้าของ\nการลบย้อนกลับไม่ได้`
                  )
                ) {
                  remove.mutate(current.id, { onSuccess: () => onOpenChange(false) })
                }
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> ลบบัญชีถาวร
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
