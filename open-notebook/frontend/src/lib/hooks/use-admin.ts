'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminApi, type UserUpdateInput } from '@/lib/api/admin'
import { toastApiError } from '@/lib/hooks/use-community'

export const ADMIN_KEYS = {
  overview: ['admin', 'overview'] as const,
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
