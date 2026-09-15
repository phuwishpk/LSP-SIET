'use client'

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  communityApi,
  describeApiError,
  type AskRequest,
  type CreatePostInput,
  type CreateRoomInput,
  type UpdateRoomInput,
  type EditPostInput,
  type FeedFilters,
  type ReactionKind,
} from '@/lib/api/community'
import { useAuthStore } from '@/lib/stores/auth-store'

export const COMMUNITY_KEYS = {
  me: ['community', 'me'] as const,
  wallet: ['community', 'wallet'] as const,
  courses: ['community', 'courses'] as const,
  teacher: ['community', 'teacher'] as const,
  teacherOverview: ['community', 'teacher', 'overview'] as const,
  teacherQuiz: (courseId: number | null) =>
    ['community', 'teacher', 'quiz', courseId] as const,
  feed: (filters: FeedFilters) => ['community', 'feed', filters] as const,
  feedRoot: ['community', 'feed'] as const,
  post: (id: number) => ['community', 'post', id] as const,
  comments: (id: number) => ['community', 'comments', id] as const,
  leaderboard: ['community', 'leaderboard'] as const,
  popularRoadmaps: ['community', 'popular-roadmaps'] as const,
  notifications: ['community', 'notifications'] as const,
  search: (q: string) => ['community', 'search', q] as const,
  materials: (courseId?: number) => ['community', 'materials', courseId ?? 'all'] as const,
}

/**
 * Show a toast for an API error.
 *
 * 402 (not enough points), 429 (too fast / over quota) and 409 (duplicate
 * content) are the three the community hits most, so each gets wording that
 * tells the user what to do instead of a generic failure.
 */
export function toastApiError(error: unknown, fallback = 'เกิดข้อผิดพลาด') {
  const info = describeApiError(error)
  if (info.status === 402) {
    toast.warning('แต้มไม่พอ', { description: info.message || fallback })
  } else if (info.status === 429) {
    const wait =
      info.retryAfter && info.retryAfter <= 120
        ? `ลองใหม่ในอีก ${info.retryAfter} วินาที`
        : undefined
    toast.warning('ส่งถี่เกินไป', { description: [info.message, wait].filter(Boolean).join(' · ') })
  } else if (info.status === 409) {
    toast.warning('เนื้อหาซ้ำ', { description: info.message || fallback })
  } else {
    toast.error(info.message || fallback)
  }
  return info
}

function useRefreshWallet() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.wallet })
    queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.me })
    // Keep the header badge (auth store) in sync with the server balance.
    void useAuthStore.getState().refreshUser()
  }
}

// ---------------------------------------------------------------------------
// Profile / wallet
// ---------------------------------------------------------------------------

export function useCommunityMe() {
  return useQuery({ queryKey: COMMUNITY_KEYS.me, queryFn: () => communityApi.me() })
}

export function useWallet(enabled = true) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.wallet,
    queryFn: () => communityApi.wallet(40),
    enabled,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export function useCourses() {
  return useQuery({ queryKey: COMMUNITY_KEYS.courses, queryFn: () => communityApi.courses() })
}

export function useJoinCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, join }: { courseId: number; join: boolean }) =>
      communityApi.joinCourse(courseId, join),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.courses })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      toast.success(vars.join ? 'เข้าร่วมห้องวิชาแล้ว' : 'ออกจากห้องวิชาแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useCreateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRoomInput) => communityApi.createCourse(body),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.courses })
      toast.success(course.kind === 'club' ? 'เปิดห้องพูดคุยแล้ว' : 'สร้างห้องวิชาแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useUpdateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, ...body }: UpdateRoomInput & { courseId: number }) =>
      communityApi.updateCourse(courseId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.courses })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.teacher })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      toast.success('บันทึกการแก้ไขห้องแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useTeacherOverview(enabled = true) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.teacherOverview,
    queryFn: () => communityApi.teacherOverview(),
    enabled,
  })
}

export function useTeacherQuizResults(courseId: number | null, enabled = true) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.teacherQuiz(courseId),
    queryFn: () => communityApi.teacherQuizResults({ course_id: courseId ?? undefined }),
    enabled,
  })
}

export function useDeleteCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (courseId: number) => communityApi.deleteCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.courses })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.teacher })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      toast.success('ปิดห้องแล้ว โพสต์ในห้องถูกย้ายไปฟีดรวม')
    },
    onError: (error) => toastApiError(error),
  })
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export function useFeed(filters: FeedFilters) {
  return useInfiniteQuery({
    queryKey: COMMUNITY_KEYS.feed(filters),
    queryFn: ({ pageParam }) => communityApi.feed({ limit: 15, ...filters }, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before_id,
  })
}

export function useCreatePost() {
  const queryClient = useQueryClient()
  const refresh = useRefreshWallet()
  return useMutation({
    mutationFn: (input: CreatePostInput) => communityApi.createPost(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.popularRoadmaps })
      refresh()
      toast.success(
        data.creator_bonus > 0
          ? `โพสต์แล้ว! ได้รับ Creator Points +${data.creator_bonus}`
          : 'โพสต์ลงฟีดแล้ว'
      )
    },
    onError: (error) => toastApiError(error, 'โพสต์ไม่สำเร็จ'),
  })
}

export function useEditPost() {
  const queryClient = useQueryClient()
  const refresh = useRefreshWallet()
  return useMutation({
    mutationFn: ({ postId, ...body }: EditPostInput & { postId: number }) =>
      communityApi.editPost(postId, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      refresh()
      toast.success(
        data.edit_bonus > 0 ? `แก้ไขแล้ว ได้ +${data.edit_bonus} แต้ม` : 'แก้ไขโพสต์แล้ว'
      )
    },
    onError: (error) => toastApiError(error, 'แก้ไขไม่สำเร็จ'),
  })
}

export function useDeletePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) => communityApi.deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      toast.success('ลบโพสต์แล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useReact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, kind }: { postId: number; kind: ReactionKind }) =>
      communityApi.react(postId, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
    },
    onError: (error) => toastApiError(error),
  })
}

export function useComments(postId: number, enabled: boolean) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.comments(postId),
    queryFn: () => communityApi.comments(postId),
    enabled,
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, content }: { postId: number; content: string }) =>
      communityApi.addComment(postId, content),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(COMMUNITY_KEYS.comments(vars.postId), data.comments)
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
    },
    onError: (error) => toastApiError(error),
  })
}

export function useToggleSave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) => communityApi.toggleSave(postId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      toast.success(data.saved ? 'บันทึกไว้แล้ว' : 'เอาออกจากรายการที่บันทึกแล้ว')
    },
    onError: (error) => toastApiError(error),
  })
}

export function useSharePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) => communityApi.share(postId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      // A person only counts once per post; say so instead of pretending the
      // second click did something.
      if (data.already_shared) {
        toast.info('คัดลอกลิงก์แล้ว', { description: 'คุณแชร์โพสต์นี้ไปแล้ว จึงไม่นับซ้ำ' })
      } else {
        toast.success('คัดลอกลิงก์และแชร์แล้ว')
      }
    },
    onError: (error) => toastApiError(error),
  })
}

// ---------------------------------------------------------------------------
// Interactive embeds
// ---------------------------------------------------------------------------

export function useQuizImport() {
  const queryClient = useQueryClient()
  const refresh = useRefreshWallet()
  return useMutation({
    mutationFn: (postId: number) => communityApi.quizImport(postId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      queryClient.invalidateQueries({ queryKey: ['features', 'quiz', 'sessions'] })
      refresh()
      toast.success(
        data.charged > 0
          ? `นำเข้าคลังส่วนตัวแล้ว (ใช้ ${data.charged} แต้ม, เหลือ ${data.balance})`
          : 'นำเข้าคลังส่วนตัวแล้ว'
      )
    },
    onError: (error) => toastApiError(error),
  })
}

export function useRoadmapFollow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) => communityApi.roadmapFollow(postId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.feedRoot })
      queryClient.invalidateQueries({ queryKey: ['features', 'roadmap', 'sessions'] })
      toast.success(
        data.created ? 'บันทึก Roadmap นี้ไว้ในคลังของคุณแล้ว (ฟรี)' : 'คุณเดินตาม Roadmap นี้อยู่แล้ว'
      )
    },
    onError: (error) => toastApiError(error),
  })
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

export function useLeaderboard(days = 7) {
  return useQuery({
    queryKey: [...COMMUNITY_KEYS.leaderboard, days],
    queryFn: () => communityApi.leaderboard(days),
    staleTime: 60_000,
  })
}

export function usePopularRoadmaps() {
  return useQuery({
    queryKey: COMMUNITY_KEYS.popularRoadmaps,
    queryFn: () => communityApi.popularRoadmaps(5),
    staleTime: 60_000,
  })
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.notifications,
    queryFn: () => communityApi.notifications(20),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: number[]) => communityApi.markNotificationsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMUNITY_KEYS.notifications }),
  })
}

export function useCommunitySearch(q: string) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.search(q),
    queryFn: () => communityApi.search(q),
    enabled: q.trim().length > 0,
  })
}

export function useMaterials(courseId?: number, enabled = true) {
  return useQuery({
    queryKey: COMMUNITY_KEYS.materials(courseId),
    queryFn: () => communityApi.materials(courseId),
    enabled,
  })
}

export function useAsk() {
  const refresh = useRefreshWallet()
  return useMutation({
    mutationFn: (body: AskRequest) => communityApi.ask(body),
    onSuccess: () => refresh(),
  })
}
