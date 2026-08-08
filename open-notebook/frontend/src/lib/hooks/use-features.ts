import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { featuresApi } from '@/lib/api/features'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  QuizGenerateRequest,
  RoadmapGenerateRequest,
} from '@/lib/api/features'

export const FEATURE_QUERY_KEYS = {
  quizSessions: ['features', 'quiz', 'sessions'] as const,
  quizSession: (id: string) => ['features', 'quiz', 'sessions', id] as const,
  roadmapSessions: ['features', 'roadmap', 'sessions'] as const,
  roadmapSession: (id: string) => ['features', 'roadmap', 'sessions', id] as const,
}

// ============================================================================
// Quiz hooks
// ============================================================================

export function useQuizSessions() {
  return useQuery({
    queryKey: FEATURE_QUERY_KEYS.quizSessions,
    queryFn: () => featuresApi.listQuizSessions(),
  })
}

export function useQuizSession(id?: string) {
  return useQuery({
    queryKey: FEATURE_QUERY_KEYS.quizSession(id ?? ''),
    queryFn: () => featuresApi.getQuizSession(id as string),
    enabled: !!id,
  })
}

export function useGenerateQuiz() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: QuizGenerateRequest) => featuresApi.generateQuiz(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURE_QUERY_KEYS.quizSessions })
      toast({
        title: t('common.success'),
        description: t('features.quizGenerated', 'Quiz generated successfully'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteQuizSession() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => featuresApi.deleteQuizSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURE_QUERY_KEYS.quizSessions })
      toast({
        title: t('common.success'),
        description: t('features.quizDeleted', 'Quiz deleted'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// Roadmap hooks
// ============================================================================

export function useRoadmapSessions() {
  return useQuery({
    queryKey: FEATURE_QUERY_KEYS.roadmapSessions,
    queryFn: () => featuresApi.listRoadmapSessions(),
  })
}

export function useRoadmapSession(id?: string) {
  return useQuery({
    queryKey: FEATURE_QUERY_KEYS.roadmapSession(id ?? ''),
    queryFn: () => featuresApi.getRoadmapSession(id as string),
    enabled: !!id,
  })
}

export function useGenerateRoadmap() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: RoadmapGenerateRequest) => featuresApi.generateRoadmap(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURE_QUERY_KEYS.roadmapSessions })
      toast({
        title: t('common.success'),
        description: t('features.roadmapGenerated', 'Roadmap generated successfully'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteRoadmapSession() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => featuresApi.deleteRoadmapSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURE_QUERY_KEYS.roadmapSessions })
      toast({
        title: t('common.success'),
        description: t('features.roadmapDeleted', 'Roadmap deleted'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}
