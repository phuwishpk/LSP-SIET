'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminApi, type UserCreateInput, type UserUpdateInput } from '@/lib/api/admin'
import { toastApiError } from '@/lib/hooks/use-community'

export const ADMIN_KEYS = {
  root: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  health: ['admin', 'health'] as const,
  posts: (params: Record<string, unknown>) => ['admin', 'posts', params] as const,
  postsRoot: ['admin', 'posts'] as const,
  courses: ['admin', 'courses'] as const,
  pointsLog: (params: Record<string, unknown>) => ['admin', 'points', params] as const,
  users: (q: string, role: string, offset: number) =>
    ['admin', 'users', q, role, offset] as const,
  usersRoot: ['admin', 'users'] as const,
  user: (id: number) => ['admin', 'user', id] as const,
}

export function useAdminOverview() {
  return useQuery({ queryKey: ADMIN_KEYS.overview, queryFn: () => adminApi.overview() })
}

export function useAdminUsers(params: { q?: string; role?: string; offset?: number; limit?: number }) {
  const { q = '', role = '', offset = 0, limit = 50 } = params
  return useQuery({
    queryKey: ADMIN_KEYS.users(q, role, offset),
    queryFn: () =>
      adminApi.listUsers({
        q: q || undefined,
        role: role || undefined,
        offset,
        limit,
      }),
    placeholderData: (previous) => previous,
  })
}

export function useAdminUser(id: number | null) {
  return useQuery({
    queryKey: ADMIN_KEYS.user(id ?? 0),
    queryFn: () => adminApi.getUser(id as number),
    enabled: id !== null,
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.usersRoot })
    queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.overview })
  }
}

export function useUpdateUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdateInput & { id: number }) =>
      adminApi.updateUser(id, body),
    onSuccess: (data) => {
      invalidate()
      toast.success(`บันทึกการเปลี่ยนแปลงของ ${data.user.username} แล้ว`)
    },
    onError: (error) => toastApiError(error, 'แก้ไขบัญชีไม่สำเร็จ'),
  })
}

export function useAdjustPoints() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, delta, note }: { id: number; delta: number; note?: string }) =>
      adminApi.adjustPoints(id, delta, note),
    onSuccess: (data, vars) => {
      invalidate()
      toast.success(
        `${vars.delta > 0 ? 'เติม' : 'หัก'}แต้มให้ ${data.user.username} แล้ว · คงเหลือ ${data.balance}`
      )
    },
    onError: (error) => toastApiError(error, 'ปรับแต้มไม่สำเร็จ'),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      adminApi.resetPassword(id, password),
    onSuccess: () => toast.success('ตั้งรหัสผ่านใหม่แล้ว'),
    onError: (error) => toastApiError(error, 'ตั้งรหัสผ่านไม่สำเร็จ'),
  })
}

// ---------------------------------------------------------------------------
// Accounts: create and delete (suspending was never enough for cleaning up)
// ---------------------------------------------------------------------------

export function useCreateUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UserCreateInput) => adminApi.createUser(body),
    onSuccess: (data) => {
      invalidate()
      toast.success(`สร้างบัญชี ${data.user.username} แล้ว`)
    },
    onError: (error) => toastApiError(error, 'สร้างบัญชีไม่สำเร็จ'),
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      invalidate()
      toast.success('ลบบัญชีแล้ว')
    },
    onError: (error) => toastApiError(error, 'ลบบัญชีไม่สำเร็จ'),
  })
}

export function useBulkDeleteUsers() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ids: number[]) => adminApi.bulkDeleteUsers(ids),
    onSuccess: (data) => {
      invalidate()
      const skipped = data.skipped.length ? ` · ข้าม ${data.skipped.length}` : ''
      toast.success(`ลบ ${data.deleted.length} บัญชีแล้ว${skipped}`)
    },
    onError: (error) => toastApiError(error, 'ลบบัญชีไม่สำเร็จ'),
  })
}

// ---------------------------------------------------------------------------
// Moderation, rooms, points ledger, health
// ---------------------------------------------------------------------------

export function useAdminPosts(params: {
  q?: string
  type?: string
  state?: 'visible' | 'deleted' | 'all'
  offset?: number
}) {
  const { q = '', type = '', state = 'visible', offset = 0 } = params
  return useQuery({
    queryKey: ADMIN_KEYS.posts({ q, type, state, offset }),
    queryFn: () =>
      adminApi.posts({
        q: q || undefined,
        type: type || undefined,
        state,
        offset,
        limit: 25,
      }),
    placeholderData: (previous) => previous,
  })
}

export function useModeratePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'delete' | 'restore' }) =>
      action === 'delete' ? adminApi.deletePost(id) : adminApi.restorePost(id),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.postsRoot })
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.overview })
      toast.success(vars.action === 'delete' ? 'ซ่อนโพสต์แล้ว' : 'กู้คืนโพสต์แล้ว')
    },
    onError: (error) => toastApiError(error, 'ดำเนินการกับโพสต์ไม่สำเร็จ'),
  })
}

export function useAdminCourses() {
  return useQuery({ queryKey: ADMIN_KEYS.courses, queryFn: () => adminApi.courses() })
}

export function usePointsLog(params: { days?: number; kind?: string }) {
  const { days = 7, kind = '' } = params
  return useQuery({
    queryKey: ADMIN_KEYS.pointsLog({ days, kind }),
    queryFn: () => adminApi.pointsLog({ days, kind: kind || undefined, limit: 200 }),
    placeholderData: (previous) => previous,
  })
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ADMIN_KEYS.health,
    queryFn: () => adminApi.health(),
    refetchInterval: 60_000,
  })
}

export function useCsvImport(kind: 'courses' | 'users') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ csv, dryRun }: { csv: string; dryRun: boolean }) =>
      kind === 'courses' ? adminApi.importCourses(csv, dryRun) : adminApi.importUsers(csv, dryRun),
    onSuccess: (data) => {
      if (data.dry_run) {
        toast.info(`ตรวจแล้ว: จะเพิ่ม ${data.created.length} · ข้าม ${data.skipped.length} · ผิดพลาด ${data.errors.length}`)
        return
      }
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.root })
      queryClient.invalidateQueries({ queryKey: ['community', 'courses'] })
      toast.success(`นำเข้า ${data.created.length} รายการแล้ว`)
    },
    onError: (error) => toastApiError(error, 'นำเข้าไม่สำเร็จ'),
  })
}
