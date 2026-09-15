'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  libraryApi,
  type LibraryScope,
  type UploadDocumentInput,
} from '@/lib/api/library'
import { COMMUNITY_KEYS, toastApiError } from '@/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'

export const LIBRARY_KEYS = {
  root: ['community', 'library'] as const,
  list: (scope?: LibraryScope, courseId?: number) =>
    ['community', 'library', scope ?? 'all', courseId ?? 'all'] as const,
  doc: (id: number) => ['community', 'library', 'doc', id] as const,
}

export function useLibrary(params?: { scope?: LibraryScope; courseId?: number }) {
  const hasProcessing = (data?: { items: { status: string }[] }) =>
    (data?.items ?? []).some((d) => d.status === 'processing')

  return useQuery({
    queryKey: LIBRARY_KEYS.list(params?.scope, params?.courseId),
    queryFn: () =>
      libraryApi.list({ scope: params?.scope, course_id: params?.courseId }),
    // Ingestion runs in the background – poll while anything is still processing.
    refetchInterval: (query) => (hasProcessing(query.state.data) ? 3000 : false),
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => libraryApi.upload(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIBRARY_KEYS.root })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      toast.success('อัปโหลดแล้ว', { description: data.message })
    },
    onError: (error) => toastApiError(error, 'อัปโหลดไม่สำเร็จ'),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => libraryApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARY_KEYS.root })
      toast.success('ลบเอกสารออกจากคลังแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useRetryDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => libraryApi.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARY_KEYS.root })
      toast.success('กำลังประมวลผลใหม่')
    },
    onError: (error) => toastApiError(error),
  })
}

function refreshWallet(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.wallet })
  queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.me })
  void useAuthStore.getState().refreshUser()
}

export function useStudyQuiz() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: libraryApi.studyQuiz,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['features', 'quiz', 'sessions'] })
      refreshWallet(queryClient)
      toast.success(
        data.grounded
          ? `สร้างควิซจาก ${data.scope_label} แล้ว`
          : 'สร้างควิซแล้ว (ยังไม่มีเอกสารในขอบเขตนี้ จึงใช้ความรู้ทั่วไป)'
      )
    },
    onError: (error) => toastApiError(error, 'สร้างควิซไม่สำเร็จ'),
  })
}

export function useStudyRoadmap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: libraryApi.studyRoadmap,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['features', 'roadmap', 'sessions'] })
      refreshWallet(queryClient)
      toast.success(
        data.grounded
          ? `สร้าง Roadmap จาก ${data.scope_label} แล้ว`
          : 'สร้าง Roadmap แล้ว (ยังไม่มีเอกสารในขอบเขตนี้ จึงใช้ความรู้ทั่วไป)'
      )
    },
    onError: (error) => toastApiError(error, 'สร้าง Roadmap ไม่สำเร็จ'),
  })
}
