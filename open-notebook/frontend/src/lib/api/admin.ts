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

export interface AdminPost {
  id: number
  type: 'summary' | 'quiz' | 'roadmap' | 'question' | 'material'
  title?: string | null
  excerpt: string
  is_deleted: boolean
  created_at: string
  has_attachment: boolean
  counts: { like: number; helpful: number; comment: number; share: number }
  author: { id: number; username?: string | null; display_name?: string | null; role?: string | null }
  course?: { id: number; code?: string | null; name?: string | null; kind?: 'course' | 'club' } | null
}

export interface AdminPostList {
  items: AdminPost[]
  total: number
  offset: number
}

export interface AdminCourse {
  id: number
  code: string
  name: string
  description?: string | null
  kind: 'course' | 'club'
  created_by?: number | null
  owner_username?: string | null
  owner_display_name?: string | null
  owner_role?: string | null
  member_count: number
  post_count: number
  document_count: number
  created_at?: string | null
  last_post_at?: string | null
}

export interface AdminCourseList {
  items: AdminCourse[]
  totals: { courses: number; clubs: number; empty: number; ownerless: number }
}

export interface PointsLogRow {
  id: number
  user_id: number
  username?: string | null
  display_name?: string | null
  role?: string | null
  delta: number
  balance_after: number
  kind: string
  note?: string | null
  created_at: string
}

export interface PointsLog {
  items: PointsLogRow[]
  by_kind: { kind: string; rows_count: number; granted: number; spent: number }[]
  top_spenders: {
    id: number
    username?: string | null
    display_name?: string | null
    role?: string | null
    spent: number
    earned: number
  }[]
  days: number
}

export interface HealthCheck {
  name: string
  label: string
  ok: boolean
  detail: string
}

export interface SystemHealth {
  checks: HealthCheck[]
  healthy: boolean
  content: {
    failed_documents: number
    processing_documents: number
    deleted_posts: number
    ownerless_rooms: number
  }
}

export interface ImportRow {
  line: number
  code?: string
  name?: string
  username?: string
  role?: string
  id?: number
  reason?: string
}

export interface ImportResult {
  created: ImportRow[]
  skipped: ImportRow[]
  errors: ImportRow[]
  dry_run: boolean
}

export interface UserCreateInput {
  username: string
  password: string
  display_name?: string
  role: UserRole
  student_id?: string
}

export interface UserUpdateInput {
  role?: UserRole
  display_name?: string
  student_id?: string
  disabled?: boolean
}

/** A roadmap as the admin console sees it: who, when, how grounded - never its nodes. */
export interface AdminRoadmap {
  id: string
  title: string | null
  node_count: number
  origin: 'own' | 'followed'
  source_post_id: number | null
  /** null when the account no longer exists. */
  owner: { id: number; username: string; display_name?: string | null; role: string } | null
  owner_id: string
  grounding_label?: string | null
  scope?: string | null
  shared_post: { post_id: number; is_deleted: boolean; follow_count: number } | null
  created_at: string | null
}

export interface AdminRoadmapList {
  items: AdminRoadmap[]
  total: number
  offset: number
}

export interface AdminRoadmapPost {
  id: number
  title?: string | null
  session_id?: string | null
  is_deleted: boolean
  created_at: string
  node_count: number
  sub_node_count: number
  grounding_label?: string | null
  counts: { follow: number; like: number; helpful: number; comment: number; share: number }
  author: { id: number; username: string; display_name?: string | null; role?: string | null }
  room: { id: number; code?: string | null; name?: string | null } | null
}

export interface AdminRoadmapPostList {
  items: AdminRoadmapPost[]
  total: number
  offset: number
}

export interface AdminRoadmapStats {
  days: number
  total: number
  generated: number
  followed: number
  per_day: { day: string; count: number }[]
  grounding: { library: number; library_web: number; web: number; none: number }
  points_spent: number
  expansions: number
  shared_posts: number
  follows: number
  top_followed: Pick<AdminRoadmapPost, 'id' | 'title' | 'author' | 'counts' | 'node_count'>[]
}

export const adminApi = {
  overview: async () => (await apiClient.get<AdminOverview>('/admin/overview')).data,

  roadmaps: async (params: { q?: string; origin?: string; limit?: number; offset?: number }) =>
    (await apiClient.get<AdminRoadmapList>('/admin/roadmaps', { params })).data,
  deleteRoadmap: async (id: string) =>
    (await apiClient.delete(`/admin/roadmaps/${encodeURIComponent(id)}`)).data,
  roadmapPosts: async (params: { state?: 'visible' | 'deleted' | 'all'; limit?: number; offset?: number }) =>
    (await apiClient.get<AdminRoadmapPostList>('/admin/roadmaps/shared', { params })).data,
  roadmapStats: async (days: number) =>
    (
      await apiClient.get<AdminRoadmapStats>('/admin/roadmaps/stats', {
        // Days are counted in the viewer's time zone, not the server's.
        params: { days, tz_offset: -new Date().getTimezoneOffset() },
      })
    ).data,

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

  createUser: async (body: UserCreateInput) =>
    (await apiClient.post<{ user: AdminUser }>('/admin/users', body)).data,
  deleteUser: async (id: number) =>
    (await apiClient.delete<{ ok: boolean; removed: Record<string, number> }>(`/admin/users/${id}`))
      .data,
  bulkDeleteUsers: async (ids: number[]) =>
    (
      await apiClient.post<{ deleted: number[]; skipped: { id: number; reason: string }[] }>(
        '/admin/users/bulk-delete',
        { ids }
      )
    ).data,

  posts: async (params: {
    q?: string
    type?: string
    course_id?: number
    author_id?: number
    state?: 'visible' | 'deleted' | 'all'
    limit?: number
    offset?: number
  }) => (await apiClient.get<AdminPostList>('/admin/posts', { params })).data,
  deletePost: async (id: number) =>
    (await apiClient.delete(`/admin/posts/${id}`)).data,
  restorePost: async (id: number) =>
    (await apiClient.post(`/admin/posts/${id}/restore`)).data,

  courses: async () => (await apiClient.get<AdminCourseList>('/admin/courses')).data,

  pointsLog: async (params: { days?: number; kind?: string; user_id?: number; limit?: number }) =>
    (await apiClient.get<PointsLog>('/admin/points/log', { params })).data,

  health: async () => (await apiClient.get<SystemHealth>('/admin/health')).data,

  importCourses: async (csv: string, dryRun: boolean) =>
    (await apiClient.post<ImportResult>('/admin/import/courses', { csv, dry_run: dryRun })).data,
  importUsers: async (csv: string, dryRun: boolean) =>
    (await apiClient.post<ImportResult>('/admin/import/users', { csv, dry_run: dryRun })).data,
}
