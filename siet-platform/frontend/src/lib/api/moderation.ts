/**
 * Moderation (4.3.5): content reports and the admin audit log.
 */
import { apiClient } from '@/lib/api/client'

export type ReportTargetType = 'post' | 'comment' | 'user' | 'document'
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'copyright' | 'other'
export type ReportStatus = 'open' | 'dismissed' | 'actioned'
export type ReportAction = 'none' | 'hide_post' | 'restore_post' | 'delete_comment' | 'suspend_user' | 'delete_document'

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'สแปม / โฆษณา',
  harassment: 'กลั่นแกล้ง / คุกคาม',
  inappropriate: 'เนื้อหาไม่เหมาะสม',
  copyright: 'ละเมิดลิขสิทธิ์',
  other: 'อื่น ๆ',
}
export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  post: 'โพสต์',
  comment: 'ความคิดเห็น',
  user: 'ผู้ใช้',
  document: 'เอกสาร',
}
export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  none: 'ไม่ดำเนินการ',
  hide_post: 'ซ่อนโพสต์',
  restore_post: 'กู้คืนโพสต์',
  delete_comment: 'ลบความคิดเห็น',
  suspend_user: 'ระงับบัญชีเจ้าของ',
  delete_document: 'ลบเอกสาร',
}

export interface ReportCreateInput {
  target_type: ReportTargetType
  target_id: number
  reason: ReportReason
  detail?: string
}

export interface Report {
  id: number
  reporter_id: number
  reporter_username?: string | null
  reporter_display_name?: string | null
  target_type: ReportTargetType
  target_id: number
  target_title?: string | null
  target_owner_id?: number | null
  /** The target no longer exists / is already hidden or suspended. */
  target_gone: boolean
  post_id?: number | null
  room_id?: number | null
  room_code?: string | null
  room_name?: string | null
  reason: ReportReason
  reason_label: string
  detail?: string | null
  status: ReportStatus
  action?: ReportAction | null
  note?: string | null
  reviewed_by?: number | null
  reviewer_username?: string | null
  reviewed_at?: string | null
  created_at: string
  /** How many people reported this same target. */
  report_count: number
}

export interface ReportList {
  items: Report[]
  total: number
  offset: number
  stats?: { open_count: number; actioned: number; dismissed: number; last_7_days: number }
}

export interface ReportResolveInput {
  status: 'dismissed' | 'actioned'
  action?: ReportAction
  note?: string
  suspend_reason?: string
  /** YYYY-MM-DD; the suspension lifts itself at the start of that day. */
  suspended_until?: string
}

export interface AuditEntry {
  id: number
  actor_id: number
  actor_username?: string | null
  actor_display_name?: string | null
  actor_role?: string | null
  action: string
  target_type?: string | null
  target_id?: string | null
  detail?: Record<string, unknown> | null
  created_at: string
}

export interface AuditList {
  items: AuditEntry[]
  total: number
  offset: number
}

export const moderationApi = {
  /** Any signed-in user. */
  report: async (body: ReportCreateInput) =>
    (await apiClient.post<{ ok: boolean; report_id: number; message: string }>('/community/reports', body)).data,
  myReports: async (targetType: ReportTargetType, ids: number[]) =>
    (
      await apiClient.get<{ target_type: ReportTargetType; reported: number[] }>('/community/reports/mine', {
        params: { target_type: targetType, ids: ids.join(',') },
      })
    ).data,

  /** Room owner / TA. */
  roomReports: async (courseId: number, status: ReportStatus | 'all' = 'open') =>
    (await apiClient.get<ReportList>(`/community/courses/${courseId}/reports`, { params: { status } })).data,
  resolveRoomReport: async (courseId: number, reportId: number, body: { status: 'dismissed' | 'actioned'; action?: 'none' | 'hide_post' | 'delete_comment'; note?: string }) =>
    (await apiClient.post<{ ok: boolean; report: Report }>(`/community/courses/${courseId}/reports/${reportId}`, body)).data,

  /** Admin. */
  adminReports: async (params: { status?: ReportStatus | 'all'; target_type?: ReportTargetType; offset?: number; limit?: number }) =>
    (await apiClient.get<ReportList>('/admin/reports', { params })).data,
  resolveReport: async (reportId: number, body: ReportResolveInput) =>
    (await apiClient.post<{ ok: boolean; report: Report; siblings_closed: number }>(`/admin/reports/${reportId}`, body)).data,
  audit: async (params: { action?: string; actor_id?: number; offset?: number; limit?: number }) =>
    (await apiClient.get<AuditList>('/admin/audit', { params })).data,
}
