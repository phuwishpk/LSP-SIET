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

/** One aggregated bucket of provider usage (a day, a feature, a model, a user...). */
export interface UsageBucket {
  calls: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  thinking_tokens: number
  search_queries: number
  tokens: number
  cost_usd: number
  cost_thb: number
  day?: string
  feature?: string
  kind?: 'chat' | 'embedding'
  model?: string
  estimated?: number
  user_id?: number
  username?: string | null
  display_name?: string | null
  role?: string | null
  search_cost_usd?: number
  total_cost_usd?: number
  total_cost_thb?: number
}

export interface AdminUsage {
  generated_at: string
  tz_offset_hours: number
  days: number
  today: UsageBucket
  month: UsageBucket
  window: UsageBucket
  all_time: UsageBucket
  by_day: UsageBucket[]
  by_feature: UsageBucket[]
  by_model: UsageBucket[]
  top_users: UsageBucket[]
  search: {
    queries_this_month: number
    free_per_month: number
    free_remaining: number
    usd_per_1000: number
    cost_usd_this_month: number
  }
  pricing: {
    models: Record<string, { input: number; output: number; cached?: number; note?: string }>
    search: { free_per_month: number; usd_per_1000: number }
    usd_thb_rate: number
    source: string
  }
  note: string
}

export interface LlmThrottle {
  uptime_s: number
  queue_timeout_s: number
  retry: { attempts: number; base_s: number; max_delay_s: number; retry_after_cap_s: number }
  lanes: Record<
    string,
    {
      limit: number
      in_flight: number
      calls: number
      waited: number
      wait_avg_s: number
      wait_max_s: number
      queue_timeouts: number
      rate_limit_retries: number
      rate_limit_failures: number
      other_failures: number
      last_rate_limit_at: number | null
    }
  >
  per_user_ask_policy: { cooldown_seconds: number; per_minute: number; per_hour: number; per_day: number; staff_multiplier: number }
}

export const adminApi = {
  overview: async () => (await apiClient.get<AdminOverview>('/admin/overview')).data,
  usage: async (days = 30) => (await apiClient.get<AdminUsage>('/admin/usage', { params: { days } })).data,
  throttle: async () => (await apiClient.get<LlmThrottle>('/admin/llm-throttle')).data,

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
