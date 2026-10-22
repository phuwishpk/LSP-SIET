'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  adminCategoriesApi,
  coursesApi,
  type CategoryInput,
  type CourseSettingsInput,
  type MemberRole,
} from '@/lib/api/courses'
import { COMMUNITY_KEYS, toastApiError } from '@/lib/hooks/use-community'

export const COURSE_KEYS = {
  categories: ['community', 'categories'] as const,
  detail: (id: number) => ['community', 'course', id] as const,
  members: (id: number) => ['community', 'course', id, 'members'] as const,
  adminCategories: ['admin', 'categories'] as const,
}

export function useCategories(enabled = true) {
  return useQuery({ queryKey: COURSE_KEYS.categories, queryFn: () => coursesApi.categories(), enabled })
}

export function useCourseDetail(courseId: number | null) {
  return useQuery({
    queryKey: COURSE_KEYS.detail(courseId ?? 0),
    queryFn: () => coursesApi.detail(courseId as number),
    enabled: courseId !== null && courseId > 0,
  })
}

export function useCourseMembers(courseId: number | null, enabled = true) {
  return useQuery({
    queryKey: COURSE_KEYS.members(courseId ?? 0),
    queryFn: () => coursesApi.members(courseId as number),
    enabled: enabled && courseId !== null && courseId > 0,
  })
}

/** Everything the sidebar, the teacher console and this room's page cache about rooms. */
function useInvalidateRooms() {
  const queryClient = useQueryClient()
  return (courseId?: number) => {
    queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.courses })
    queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.teacher })
    queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
    queryClient.invalidateQueries({ queryKey: COURSE_KEYS.categories })
    if (courseId) queryClient.invalidateQueries({ queryKey: COURSE_KEYS.detail(courseId) })
  }
}

export function useUpdateCourseSettings(courseId: number) {
  const invalidate = useInvalidateRooms()
  return useMutation({
    mutationFn: (body: CourseSettingsInput) => coursesApi.update(courseId, body),
    onSuccess: () => {
      invalidate(courseId)
      toast.success('บันทึกการตั้งค่าห้องแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useArchiveCourse() {
  const invalidate = useInvalidateRooms()
  return useMutation({
    mutationFn: ({ courseId, archived }: { courseId: number; archived: boolean }) =>
      archived ? coursesApi.archive(courseId) : coursesApi.restore(courseId),
    onSuccess: (_room, vars) => {
      invalidate(vars.courseId)
      toast.success(vars.archived ? 'เก็บถาวรห้องแล้ว สมาชิกเดิมยังอ่านได้' : 'เปิดห้องกลับมาใช้งานแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

/** Admin only: the room, its course documents and notebook are gone for good. */
export function usePurgeCourse() {
  const invalidate = useInvalidateRooms()
  return useMutation({
    mutationFn: (courseId: number) => coursesApi.remove(courseId),
    onSuccess: (result) => {
      invalidate(result.id)
      toast.success(
        result.deleted
          ? `ลบห้องถาวรแล้ว (เอกสาร ${result.purged?.documents ?? 0} ฉบับ)`
          : 'เก็บถาวรห้องแล้ว'
      )
    },
    onError: (error) => toastApiError(error),
  })
}

export function useJoinWithCode() {
  const invalidate = useInvalidateRooms()
  return useMutation({
    mutationFn: ({ courseId, code }: { courseId: number; code?: string }) =>
      coursesApi.join(courseId, code),
    onSuccess: (_data, vars) => {
      invalidate(vars.courseId)
      toast.success('เข้าร่วมห้องวิชาแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useSetMemberRole(courseId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: MemberRole }) =>
      coursesApi.setMemberRole(courseId, userId, role),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: COURSE_KEYS.members(courseId) })
      toast.success(vars.role === 'ta' ? 'ตั้งเป็นผู้ช่วยสอนแล้ว' : 'เปลี่ยนกลับเป็นสมาชิกแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useRemoveMember(courseId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => coursesApi.removeMember(courseId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSE_KEYS.members(courseId) })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.teacher })
      toast.success('นำออกจากห้องแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

// ---------------------------------------------------------------------------
// Admin: categories
// ---------------------------------------------------------------------------

export function useAdminCategories() {
  return useQuery({ queryKey: COURSE_KEYS.adminCategories, queryFn: () => adminCategoriesApi.list() })
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: COURSE_KEYS.adminCategories })
    queryClient.invalidateQueries({ queryKey: COURSE_KEYS.categories })
    queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] })
  }
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (body: CategoryInput) => adminCategoriesApi.create(body),
    onSuccess: (category) => {
      invalidate()
      toast.success(`เพิ่มหมวดหมู่ “${category.name}” แล้ว`)
    },
    onError: (error) => toastApiError(error),
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ categoryId, ...body }: Partial<CategoryInput> & { categoryId: number }) =>
      adminCategoriesApi.update(categoryId, body),
    onSuccess: () => {
      invalidate()
      toast.success('บันทึกหมวดหมู่แล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (categoryId: number) => adminCategoriesApi.remove(categoryId),
    onSuccess: (result) => {
      invalidate()
      toast.success(
        result.rooms_uncategorised > 0
          ? `ลบหมวดหมู่แล้ว · ห้อง ${result.rooms_uncategorised} ห้องกลายเป็นไม่มีหมวด`
          : 'ลบหมวดหมู่แล้ว'
      )
    },
    onError: (error) => toastApiError(error),
  })
}
