/**
 * Admin console API: the user directory, roles, wallets and suspensions that
 * previously needed direct MariaDB access.
 */
import { apiClient } from '@/lib/api/client'
import type { PointTransaction } from '@/lib/api/community'

export type UserRole = 'student' | 'teacher' | 'admin'

export interface AdminUser {
  id: number
  username: string
  display_name?: string | null
  role: UserRole
  email?: string | null
  student_id?: string | null
  avatar_url?: string | null
  points_balance: number
  disabled: boolean
  created_at?: string | null
  last_login_at?: string | null
}

export interface AdminUserList {
  items: AdminUser[]
  total: number
  by_role: Partial<Record<UserRole, number>>
  /** Id of the signed-in admin, so the UI can protect their own row. */
  me: number
}

export interface AdminOverview {
  users: number
  suspended: number
  active_week: number
  posts: number
  courses: number
  documents: number
  points_outstanding: number
  points_spent_week: number
}

export interface AdminUserDetail {
  user: AdminUser
  points_history: PointTransaction[]
}

export interface UserUpdateInput {
  role?: UserRole
  display_name?: string
  student_id?: string
  disabled?: boolean
}

export const adminApi = {
  overview: async () => (await apiClient.get<AdminOverview>('/admin/overview')).data,

  listUsers: async (params: { q?: string; role?: string; limit?: number; offset?: number }) =>
    (await apiClient.get<AdminUserList>('/admin/users', { params })).data,

  getUser: async (id: number) =>
    (await apiClient.get<AdminUserDetail>(`/admin/users/${id}`)).data,

  updateUser: async (id: number, body: UserUpdateInput) =>
    (await apiClient.patch<{ user: AdminUser }>(`/admin/users/${id}`, body)).data,

  adjustPoints: async (id: number, delta: number, note?: string) =>
    (
      await apiClient.post<{ user: AdminUser; balance: number }>(`/admin/users/${id}/points`, {
        delta,
        note,
      })
    ).data,

  resetPassword: async (id: number, password: string) =>
    (await apiClient.post<{ ok: boolean }>(`/admin/users/${id}/reset-password`, { password }))
      .data,
}
