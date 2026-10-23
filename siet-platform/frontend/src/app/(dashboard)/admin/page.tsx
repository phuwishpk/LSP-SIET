'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Coins,
  FileText,
  Flag,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsagePanel } from '@siet/platform/components/admin/UsagePanel'
import { HealthPanel } from '@siet/platform/components/admin/HealthPanel'
import { PointsLogPanel } from '@siet/platform/components/admin/PointsLogPanel'
import { ImportPanel } from '@siet/platform/components/admin/ImportPanel'
import { AuditPanel } from '@siet/platform/components/admin/AuditPanel'
import { CreateUserDialog } from '@siet/platform/components/admin/CreateUserDialog'
import { AdminPageHeader } from '@siet/platform/components/admin/AdminPageHeader'
import { StatTile } from '@siet/platform/components/admin/StatTile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import { Avatar } from '@siet/platform/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDebounce } from 'use-debounce'
import {
  useAdjustPoints,
  useAdminOverview,
  useAdminUser,
  useAdminUsers,
  useDeleteUser,
  useUpdateUser,
} from '@siet/platform/lib/hooks/use-admin'
import type { AdminUser, UserRole } from '@siet/platform/lib/api/admin'
import { displayName, kindLabel, roleLabel, timeAgo } from '@siet/platform/lib/utils/community-format'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

// Initials on a neutral disc instead of the app-wide coloured ones.
const AVATAR_STYLE = 'border bg-secondary text-foreground'

// Monochrome on purpose: the weight of the chip, not a hue, ranks the role.
const ROLE_STYLE: Record<UserRole, string> = {
  admin: 'bg-foreground text-background',
  teacher: 'border bg-card text-foreground',
  student: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
}

export default function AdminPage() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [role, setRole] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const deleteUser = useDeleteUser()

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
          <AdminPageHeader
            icon={ShieldCheck}
            title="จัดการระบบ"
            description="บัญชีผู้ใช้ แต้ม การใช้ AI และสถานะระบบ — เรื่องที่ใช้ร่วมกันทั้ง Community, AI และ Quiz"
          >
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild className="gap-1.5 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <Link href="/admin/community">
                  <Flag className="h-4 w-4" /> ดูรายงานเนื้อหา Community
                </Link>
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" /> สร้างบัญชี
              </Button>
            </div>
          </AdminPageHeader>

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap whitespace-nowrap">
              <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
              <TabsTrigger value="users">ผู้ใช้</TabsTrigger>
              <TabsTrigger value="points">แต้ม</TabsTrigger>
              <TabsTrigger value="usage">การใช้ AI</TabsTrigger>
              <TabsTrigger value="import">นำเข้า CSV</TabsTrigger>
              <TabsTrigger value="audit">บันทึกประวัติระบบ</TabsTrigger>
              <TabsTrigger value="reports_link" asChild>
                <Link href="/admin/community" className="gap-1 text-amber-700 hover:text-amber-800 dark:text-amber-400">
                  <Flag className="h-3.5 w-3.5" /> รายงานเนื้อหา ↗
                </Link>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
          {overview && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <StatTile icon={Users} label="ผู้ใช้ทั้งหมด" value={overview.users} hint={`ใช้งานใน 7 วัน ${overview.active_week}`} />
              <StatTile icon={UserX} label="บัญชีที่ระงับ" value={overview.suspended} />
              <StatTile icon={FileText} label="โพสต์ในฟีด" value={overview.posts} hint={`${overview.courses} รายวิชา`} />
              <StatTile icon={BookOpen} label="เอกสารในคลัง" value={overview.documents} />
              <StatTile icon={Coins} accent label="แต้มคงเหลือรวม" value={overview.points_outstanding} hint={`ใช้ไป 7 วัน ${overview.points_spent_week}`} />
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
                {(['admin', 'teacher', 'student', 'pending'] as UserRole[])
                  .map((r) => `${roleLabel(r)} ${data?.by_role?.[r] ?? 0}`)
                  .join(' · ')}
                {data?.by_role?.suspended ? ` · ระงับอยู่ ${data.by_role.suspended}` : ''}
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
                  <option value="pending">รออนุมัติ</option>
                  <option value="suspended">บัญชีที่ถูกระงับ</option>
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

              <div className="divide-y rounded-lg border">
                {data?.items.map((u) => (
                  <div
                    key={u.id}
                    className="group flex w-full items-center gap-3 p-3 text-left transition hover:bg-accent/60"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelected(u)
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer"
                    >
                      <Avatar size="sm" src={u.avatar_url} name={displayName(u)} className={AVATAR_STYLE} />
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
                      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-ai">
                        <Coins className="h-3.5 w-3.5" />
                        {u.points_balance}
                      </span>
                      <UserCog className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      disabled={u.id === data.me || u.role === 'admin'}
                      title={
                        u.id === data.me
                          ? 'ไม่สามารถลบบัญชีตัวเองได้'
                          : u.role === 'admin'
                          ? 'ลดสิทธิ์ผู้ดูแลคนนี้ก่อนจึงจะลบได้'
                          : `ลบบัญชี ${displayName(u)} ถาวร`
                      }
                      onClick={() => setUserToDelete(u)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

            <TabsContent value="points" className="mt-4">
              <PointsLogPanel />
            </TabsContent>
            <TabsContent value="usage" className="mt-4">
              <UsagePanel />
            </TabsContent>
            <TabsContent value="import" className="mt-4">
              <ImportPanel />
            </TabsContent>
            <TabsContent value="audit" className="mt-4">
              <AuditPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      {userToDelete && (
        <Dialog open onOpenChange={(open) => !open && setUserToDelete(null)}>
          <DialogContent className="sm:max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" /> ยืนยันการลบบัญชีถาวร
              </DialogTitle>
              <DialogDescription className="space-y-2 pt-2 text-left">
                <span className="block text-foreground font-medium">
                  คุณต้องการลบบัญชี &quot;{displayName(userToDelete)}&quot; (@{userToDelete.username}) หรือไม่?
                </span>
                <span className="block text-xs text-muted-foreground leading-relaxed">
                  การกระทำนี้ไม่สามารถย้อนกลับได้ ข้อมูลแต้ม ประวัติการใช้งาน เอกสาร และการแจ้งเตือนทั้งหมดจะถูกลบออกจากระบบอย่างถาวร
                </span>
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:justify-end pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleteUser.isPending}
                onClick={() => setUserToDelete(null)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteUser.isPending}
                onClick={async () => {
                  try {
                    await deleteUser.mutateAsync(userToDelete.id)
                    setUserToDelete(null)
                  } catch {
                    // error handled by mutation toast
                  }
                }}
              >
                {deleteUser.isPending ? 'กำลังลบ…' : 'ยืนยันลบบัญชี'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {selected && (
        <UserDialog
          key={selected.id}
          user={selected}
          isSelf={selected.id === data?.me}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </AppShell>
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

  const isSuspended = Boolean(detail?.user ? detail.user.disabled : user.disabled)
  const current = {
    ...user,
    ...(detail?.user ?? {}),
    disabled: isSuspended,
  }

  const [role, setRole] = useState<UserRole>(current.role)
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [suspendUntil, setSuspendUntil] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setRole(current.role)
    setDelta('')
    setNote('')
    setSuspendReason(current.suspend_reason || '')
    setSuspendUntil(current.suspended_until ? current.suspended_until.slice(0, 10) : '')
  }, [current.id, current.role, current.disabled, current.suspend_reason, current.suspended_until])

  const busy = update.isPending || adjust.isPending || isSaving

  const handleRestore = async () => {
    try {
      await update.mutateAsync({ id: current.id, disabled: false })
      onOpenChange(false)
    } catch {
      // toast shown by mutation
    }
  }

  const handleSuspend = async () => {
    try {
      await update.mutateAsync({
        id: current.id,
        disabled: true,
        suspend_reason: suspendReason.trim() || undefined,
        suspended_until: suspendUntil || undefined,
      })
      onOpenChange(false)
    } catch {
      // toast shown by mutation
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    const promises: Promise<any>[] = []

    if (role !== current.role) {
      promises.push(update.mutateAsync({ id: current.id, role }))
    }

    const numericDelta = Number(delta)
    if (numericDelta) {
      promises.push(
        adjust.mutateAsync({
          id: current.id,
          delta: numericDelta,
          note: note.trim() || undefined,
        })
      )
    }

    try {
      if (promises.length > 0) {
        await Promise.all(promises)
      }
      onOpenChange(false)
    } catch {
      // errors handled by mutation onError toasts
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar size="sm" src={current.avatar_url} name={displayName(current)} className={AVATAR_STYLE} />
            {displayName(current)}
          </DialogTitle>
          <DialogDescription>
            @{current.username}
            {current.email ? ` · ${current.email}` : ''} · แต้มคงเหลือ {current.points_balance}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label>สิทธิ์การใช้งาน</Label>
            <div className="flex flex-wrap gap-2">
              {(['student', 'teacher', 'admin', 'pending'] as UserRole[]).map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={role === r ? 'default' : 'outline'}
                  disabled={isSelf || busy}
                  onClick={() => setRole(r)}
                >
                  {roleLabel(r)}
                </Button>
              ))}
            </div>
            {isSelf && (
              <p className="text-xs text-muted-foreground">เปลี่ยนสิทธิ์หรือระงับบัญชีของตัวเองไม่ได้</p>
            )}
          </div>

          {/* Suspension Box - จัดกลุ่มอยู่ใต้สิทธิ์การใช้งาน */}
          {!isSelf && (
            <div
              className={cn(
                'rounded-xl border p-3.5 space-y-3 transition-colors',
                current.disabled
                  ? 'border-destructive/30 bg-destructive/[0.04]'
                  : 'border-border/80 bg-muted/20'
              )}
            >
              <div className="flex items-center justify-between">
                <Label
                  className={cn(
                    'font-semibold flex items-center gap-1.5 text-xs',
                    current.disabled ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  <UserX className="h-4 w-4" />
                  {current.disabled ? 'สถานะการระงับบัญชี' : 'ระงับบัญชีการใช้งาน'}
                </Label>
                {current.disabled ? (
                  <Badge variant="destructive" className="text-[10px]">
                    ระงับอยู่
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10 font-normal"
                  >
                    ใช้งานได้ปกติ
                  </Badge>
                )}
              </div>

              {current.disabled ? (
                <div className="space-y-2.5">
                  <p className="rounded-md bg-background/80 border p-2.5 text-xs text-muted-foreground">
                    ระงับอยู่{current.suspend_reason ? ` · เหตุผล ${current.suspend_reason}` : ''}
                    {current.suspended_until
                      ? ` · ปล่อยอัตโนมัติ ${current.suspended_until.slice(0, 10)}`
                      : ' · ไม่มีกำหนดเวลา'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-foreground hover:bg-background border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-medium"
                    disabled={busy}
                    onClick={handleRestore}
                  >
                    <UserCheck className="mr-1.5 h-4 w-4" />
                    คืนสิทธิ์การใช้งาน (ปลดระงับ)
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="space-y-1">
                      <Label htmlFor="adm-suspend-reason" className="text-xs text-muted-foreground">
                        เหตุผลที่ระงับ (แจ้งผู้ใช้)
                      </Label>
                      <Input
                        id="adm-suspend-reason"
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        maxLength={255}
                        placeholder="เช่น ทำผิดกฎระเบียบชุมชน"
                        className="bg-background text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="adm-suspend-until" className="text-xs text-muted-foreground">
                        ปล่อยอัตโนมัติวันที่
                      </Label>
                      <Input
                        id="adm-suspend-until"
                        type="date"
                        value={suspendUntil}
                        onChange={(e) => setSuspendUntil(e.target.value)}
                        className="bg-background text-sm"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="w-full shadow-sm"
                    disabled={busy}
                    onClick={handleSuspend}
                  >
                    <UserX className="mr-1.5 h-4 w-4" />
                    ระงับบัญชี
                  </Button>
                </div>
              )}
            </div>
          )}

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
            </div>
          </div>

          {detail?.points_history && detail.points_history.length > 0 && (
            <div className="space-y-1.5">
              <Label>ประวัติแต้มล่าสุด</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                <ul className="divide-y text-xs">
                  {detail.points_history.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between px-3 py-1.5">
                      <span className="min-w-0 truncate">
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
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || (isSelf && role !== current.role)}
            onClick={handleSave}
          >
            {busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
