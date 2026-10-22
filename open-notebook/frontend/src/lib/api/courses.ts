/**
 * Course-room management (4.3.1): categories, room settings, join codes,
 * archiving and the roster. The feed-side room calls (list / create / join
 * without a code) stay in `community.ts`; this module is what the teacher
 * console and the admin console use on top of them.
 */
import { apiClient } from './client'
import type { Course, TeacherCourse } from './community'

export type RoomStatus = 'active' | 'archived'
export type MemberRole = 'member' | 'ta'

export interface Category {
  id: number
  slug: string
  name: string
  name_en?: string | null
  sort_order: number
  course_count: number
  archived_count: number
  created_at?: string | null
}

/** Lifecycle + grouping fields every room now carries. */
export interface RoomMeta {
  category_id?: number | null
  category_name?: string | null
  category_slug?: string | null
  term?: string | null
  status: RoomStatus
  archived: boolean
  /** Posts and library visible to members only (plus the people who run the room). */
  is_private: boolean
  /** Students must type a code to join. The code itself is only sent to managers. */
  requires_code: boolean
  join_code?: string | null
  can_manage?: boolean
  membership_role?: MemberRole | null
}

export type RoomRow = Course & RoomMeta
export type TeacherRoom = TeacherCourse & RoomMeta

export interface CourseDetail extends RoomRow {
  is_owner: boolean
  notebook_id?: string | null
}

export interface CourseMember {
  user_id: number
  role: MemberRole
  joined_at?: string | null
  username: string
  display_name?: string | null
  avatar_url?: string | null
  user_role: string
  student_code?: string | null
  post_count: number
  is_owner: boolean
}

export interface CourseMembers {
  items: CourseMember[]
  owner_id: number | null
  totals: { members: number; assistants: number }
}

export interface CourseSettingsInput {
  name?: string
  code?: string
  description?: string
  /** 0 clears the category. */
  category_id?: number
  /** "" clears the term / join code. */
  term?: string
  join_code?: string
  is_private?: boolean
}

/** Who may read a post. Room privacy is applied on top by the server. */
export type PostVisibility = 'public' | 'course' | 'private'
export const POST_VISIBILITY_LABELS: Record<PostVisibility, string> = {
  public: 'ทุกคน',
  course: 'เฉพาะสมาชิกห้อง',
  private: 'เฉพาะฉัน',
}

export interface PurgeResult {
  ok: boolean
  id: number
  archived: boolean
  deleted: number | null
  purged?: { documents: number; notebooks: number }
}

export const coursesApi = {
  categories: async () => (await apiClient.get<Category[]>('/community/categories')).data,
  detail: async (courseId: number) =>
    (await apiClient.get<CourseDetail>(`/community/courses/${courseId}`)).data,
  update: async (courseId: number, body: CourseSettingsInput) =>
    (await apiClient.patch<CourseDetail>(`/community/courses/${courseId}`, body)).data,
  archive: async (courseId: number) =>
    (await apiClient.post<CourseDetail>(`/community/courses/${courseId}/archive`)).data,
  restore: async (courseId: number) =>
    (await apiClient.post<CourseDetail>(`/community/courses/${courseId}/restore`)).data,
  /** Owner: archives. Admin: removes the room, its documents and notebook for good. */
  remove: async (courseId: number) =>
    (await apiClient.delete<PurgeResult>(`/community/courses/${courseId}`)).data,
  join: async (courseId: number, code?: string) =>
    (await apiClient.post(`/community/courses/${courseId}/join`, code ? { code } : undefined)).data,
  members: async (courseId: number) =>
    (await apiClient.get<CourseMembers>(`/community/courses/${courseId}/members`)).data,
  setMemberRole: async (courseId: number, userId: number, role: MemberRole) =>
    (await apiClient.patch(`/community/courses/${courseId}/members/${userId}`, { role })).data,
  removeMember: async (courseId: number, userId: number) =>
    (await apiClient.delete(`/community/courses/${courseId}/members/${userId}`)).data,
}

export interface CategoryInput {
  name: string
  name_en?: string
  slug?: string
  sort_order?: number
}

export const adminCategoriesApi = {
  list: async () =>
    (await apiClient.get<{ items: Category[]; total: number }>('/admin/categories')).data,
  create: async (body: CategoryInput) =>
    (await apiClient.post<Category>('/admin/categories', body)).data,
  update: async (categoryId: number, body: Partial<CategoryInput>) =>
    (await apiClient.patch<Category>(`/admin/categories/${categoryId}`, body)).data,
  remove: async (categoryId: number) =>
    (
      await apiClient.delete<{ ok: boolean; deleted: number; rooms_uncategorised: number }>(
        `/admin/categories/${categoryId}`
      )
    ).data,
}

/** A short, readable join code a teacher can write on the board. */
export function suggestJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I look-alikes
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}
