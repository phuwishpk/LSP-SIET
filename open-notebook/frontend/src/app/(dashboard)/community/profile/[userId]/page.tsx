'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  BookOpen,
  FileImage,
  FileText,
  GraduationCap,
  Inbox,
  UserRound,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunityHeader } from '@/components/community/CommunityHeader'
import { PostCard } from '@/components/community/PostCard'
import { useAuth } from '@/lib/hooks/use-auth'
import { useCommunityMe, useFeed } from '@/lib/hooks/use-community'
import { displayName, roleLabel } from '@/lib/utils/community-format'
import type { CommunityPost } from '@/lib/api/community'

type ProfileTab = 'all' | 'summaries' | 'documents' | 'about'

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: 'all', label: 'โพสต์ทั้งหมด' },
  { id: 'summaries', label: 'สรุปที่แชร์' },
  { id: 'documents', label: 'เอกสาร' },
  { id: 'about', label: 'เกี่ยวกับฉัน' },
]

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<ProfileTab>('all')
  const isOwnProfile = params.userId === 'me' || params.userId === user?.id
  const userId = params.userId === 'me' ? user?.id : params.userId
  const authorId = Number(userId)
  const hasValidUserId = Boolean(userId && Number.isSafeInteger(authorId) && authorId > 0)
  const profile = useCommunityMe(isOwnProfile)
  const feed = useFeed(
    {
      author_id: hasValidUserId ? authorId : 0,
      profile_visibility: true,
      limit: 100,
    },
    hasValidUserId
  )
  const posts = useMemo(
    () =>
      (feed.data?.pages.flatMap((page) => page.items) ?? []).filter(
        (post) => String(post.author.id) === String(userId)
      ),
    [feed.data, userId]
  )
  const postAuthor = posts[0]?.author
  const profileUser = isOwnProfile
    ? profile.data?.user ?? user
    : postAuthor
  const visiblePosts = useMemo(() => {
    if (activeTab === 'summaries') return posts.filter((post) => post.type === 'summary')
    if (activeTab === 'documents') return posts.filter((post) => post.type === 'material')
    return posts
  }, [activeTab, posts])
  const summaryCount = posts.filter((post) => post.type === 'summary').length
  const courseCount = new Set(
    posts.map((post) => post.course?.id).filter((courseId): courseId is number => courseId !== undefined)
  ).size
  const totalPostCount = isOwnProfile ? profile.data?.stats.posts : undefined
  const totalCourseCount = isOwnProfile ? profile.data?.stats.courses : undefined
  const studentId = isOwnProfile ? profile.data?.user.student_id : undefined
  const postCount = totalPostCount ?? (feed.hasNextPage ? `${posts.length}+` : posts.length)
  const summaryStat = feed.hasNextPage ? `${summaryCount}+` : summaryCount
  const courseStat =
    totalCourseCount ?? (feed.hasNextPage ? `${courseCount}+` : courseCount)

  return (
    <div className="community-theme min-h-screen bg-[#FDF7F8] text-foreground dark:bg-background">
      <CommunityHeader
        query=""
        onSearch={(query) => router.push(query ? `/community?q=${encodeURIComponent(query)}` : '/community')}
        onOpenPost={(postId) => router.push(`/community?post=${postId}`)}
        onHome={() => router.push('/community')}
      />

      <main className="mx-auto w-full max-w-[1040px] space-y-5 px-3 py-5 sm:px-6 sm:py-8">
        <Card className="overflow-hidden border-pink-100/80 shadow-sm dark:border-border">
          <div className="relative flex h-36 items-center justify-center border-b border-pink-100/80 bg-[#FFF4F6] text-muted-foreground dark:border-border dark:bg-muted/40 sm:h-48">
            <div className="flex flex-col items-center gap-1 text-xs">
              <FileImage className="h-6 w-6" aria-hidden="true" />
              <span>รูปปก</span>
            </div>
            <div className="absolute -bottom-10 left-5 sm:left-8">
              <Avatar
                src={profileUser?.avatar_url}
                name={displayName(profileUser)}
                className="h-20 w-20 border-4 border-card bg-pink-200 text-xl font-semibold text-slate-700 sm:h-24 sm:w-24"
              />
            </div>
          </div>

          <CardContent className="flex flex-col gap-5 px-5 pb-5 pt-14 sm:px-8 sm:pt-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1 lg:pl-28">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {profileUser ? displayName(profileUser) : 'โปรไฟล์ผู้ใช้'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {studentId
                  ? `รหัสนักศึกษา ${studentId}`
                  : profileUser?.role
                    ? roleLabel(profileUser.role)
                    : 'สมาชิก SIET Space'}
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {isOwnProfile
                  ? 'แบ่งปันสรุปและไอเดียการเรียนรู้กับชุมชน SIET'
                  : 'โพสต์และสื่อการเรียนรู้ที่แบ่งปันในชุมชน SIET'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <StatCard value={postCount} label="โพสต์" />
              <StatCard value={summaryStat} label="สรุปที่แชร์" />
              <StatCard
                value={courseStat}
                label={isOwnProfile ? 'วิชาที่เข้าร่วม' : 'วิชาที่มีโพสต์'}
              />
            </div>
          </CardContent>

          <div
            role="tablist"
            aria-label="หมวดหมู่โปรไฟล์"
            className="flex gap-1 overflow-x-auto border-t border-pink-100/80 px-3 py-2 dark:border-border sm:px-5"
          >
            {PROFILE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === tab.id
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'text-muted-foreground hover:bg-pink-50 hover:text-foreground dark:hover:bg-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Card>

        {activeTab === 'about' ? (
          <Card className="border-pink-100/80 shadow-sm dark:border-border">
            <CardContent className="space-y-5 p-5 sm:p-7">
              <div>
                <h2 className="text-base font-semibold">เกี่ยวกับฉัน</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  ข้อมูลสมาชิกที่แสดงในชุมชน SIET Space
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileDetail
                  icon={UserRound}
                  label="ชื่อผู้ใช้"
                  value={profileUser?.username ? `@${profileUser.username}` : 'ยังไม่มีข้อมูล'}
                />
                <ProfileDetail
                  icon={GraduationCap}
                  label="บทบาท"
                  value={profileUser?.role ? roleLabel(profileUser.role) : 'สมาชิก'}
                />
                {studentId && (
                  <ProfileDetail
                    icon={BookOpen}
                    label="รหัสนักศึกษา"
                    value={studentId}
                  />
                )}
                {isOwnProfile && profile.data?.user.email && (
                  <ProfileDetail
                    icon={FileText}
                    label="อีเมล"
                    value={profile.data.user.email}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <section aria-label={PROFILE_TABS.find((tab) => tab.id === activeTab)?.label} className="mx-auto max-w-[720px] space-y-4">
            {feed.isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="h-44 w-full rounded-xl" />
              </div>
            )}
            {feed.isError && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  โหลดโพสต์ของผู้ใช้ไม่สำเร็จ ลองรีเฟรชอีกครั้ง
                </CardContent>
              </Card>
            )}
            {!feed.isLoading && !feed.isError && visiblePosts.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                  <Inbox className="h-8 w-8" aria-hidden="true" />
                  ยังไม่มีโพสต์ที่แชร์ในขณะนี้
                </CardContent>
              </Card>
            )}
            {visiblePosts.map((post: CommunityPost) => (
              <PostCard key={post.id} post={post} />
            ))}
            {feed.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => void feed.fetchNextPage()}
                  disabled={feed.isFetchingNextPage}
                >
                  {feed.isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดโพสต์เพิ่ม'}
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-pink-100/80 bg-card px-3 py-2.5 text-center dark:border-border">
      <p className="text-lg font-semibold leading-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}

function ProfileDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
