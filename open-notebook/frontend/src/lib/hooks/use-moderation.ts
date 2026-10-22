'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  moderationApi,
  type ReportCreateInput,
  type ReportResolveInput,
  type ReportStatus,
  type ReportTargetType,
} from '@/lib/api/moderation'
import { toastApiError } from '@/lib/hooks/use-community'

export const MODERATION_KEYS = {
  mine: (t: ReportTargetType, ids: number[]) => ['community', 'reports', 'mine', t, ids] as const,
  room: (courseId: number, status: string) => ['community', 'course', courseId, 'reports', status] as const,
  roomRoot: (courseId: number) => ['community', 'course', courseId, 'reports'] as const,
  adminRoot: ['admin', 'reports'] as const,
  admin: (p: Record<string, unknown>) => ['admin', 'reports', p] as const,
  auditRoot: ['admin', 'audit'] as const,
  audit: (p: Record<string, unknown>) => ['admin', 'audit', p] as const,
}

export function useReportContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ReportCreateInput) => moderationApi.report(body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['community', 'reports', 'mine'] })
      toast.success(res.message || 'ส่งรายงานแล้ว')
    },
    onError: (error) => toastApiError(error, 'ส่งรายงานไม่สำเร็จ'),
  })
}

export function useMyReports(targetType: ReportTargetType, ids: number[]) {
  return useQuery({
    queryKey: MODERATION_KEYS.mine(targetType, ids),
    queryFn: () => moderationApi.myReports(targetType, ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

export function useRoomReports(courseId: number | null, status: ReportStatus | 'all' = 'open', enabled = true) {
  return useQuery({
    queryKey: MODERATION_KEYS.room(courseId ?? 0, status),
    queryFn: () => moderationApi.roomReports(courseId as number, status),
    enabled: enabled && courseId !== null && courseId > 0,
  })
}

export function useResolveRoomReport(courseId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, ...body }: { reportId: number; status: 'dismissed' | 'actioned'; action?: 'none' | 'hide_post' | 'delete_comment'; note?: string }) =>
      moderationApi.resolveRoomReport(courseId, reportId, body),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: MODERATION_KEYS.roomRoot(courseId) })
      queryClient.invalidateQueries({ queryKey: ['community', 'feed'] })
      toast.success(vars.status === 'actioned' ? 'ดำเนินการแล้ว' : 'ปัดตกรายงานแล้ว')
    },
    onError: (error) => toastApiError(error, 'จัดการรายงานไม่สำเร็จ'),
  })
}

export function useAdminReports(params: { status?: ReportStatus | 'all'; target_type?: ReportTargetType; offset?: number; limit?: number }) {
  return useQuery({
    queryKey: MODERATION_KEYS.admin(params),
    queryFn: () => moderationApi.adminReports(params),
  })
}

export function useResolveReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, ...body }: ReportResolveInput & { reportId: number }) =>
      moderationApi.resolveReport(reportId, body),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: MODERATION_KEYS.adminRoot })
      queryClient.invalidateQueries({ queryKey: MODERATION_KEYS.auditRoot })
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'rag'] })
      const extra = res.siblings_closed > 0 ? ` (ปิดรายงานซ้ำอีก ${res.siblings_closed})` : ''
      toast.success((vars.status === 'actioned' ? 'ดำเนินการแล้ว' : 'ปัดตกรายงานแล้ว') + extra)
    },
    onError: (error) => toastApiError(error, 'จัดการรายงานไม่สำเร็จ'),
  })
}

export function useAuditLog(params: { action?: string; actor_id?: number; offset?: number; limit?: number }) {
  return useQuery({
    queryKey: MODERATION_KEYS.audit(params),
    queryFn: () => moderationApi.audit(params),
  })
}
