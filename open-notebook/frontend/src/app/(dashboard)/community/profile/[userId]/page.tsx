'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  BookOpen,
  Camera,
  FileImage,
  FileText,
  GraduationCap,
  ImagePlus,
  Inbox,
  Pencil,
  Save,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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

interface ProfileEdits {
  displayName: string
  status: string
  major: string
  year: string
  bio: string
  avatarUrl: string
  coverUrl: string
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<ProfileTab>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [profileEdits, setProfileEdits] = useState<ProfileEdits | null>(null)
  const [draft, setDraft] = useState<ProfileEdits>({
    displayName: '',
    status: '',
    major: '',
    year: '',
    bio: '',
    avatarUrl: '',
    coverUrl: '',
  })
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<string[]>([])
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
  const displayedProfileUser = profileUser
    ? {
        ...profileUser,
        display_name: profileEdits?.displayName ?? profileUser.display_name,
        avatar_url: profileEdits?.avatarUrl ?? profileUser.avatar_url,
      }
    : undefined
  const displayedName = displayName(displayedProfileUser)
  const displayedAvatar = profileEdits?.avatarUrl ?? profileUser?.avatar_url
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

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  const openProfileEditor = () => {
    if (!isOwnProfile) return
    setDraft({
      displayName:
        profileEdits?.displayName ??
        profileUser?.display_name ??
        profileUser?.username ??
        '',
      status:
        profileEdits?.status ??
        (profileUser?.role ? roleLabel(profileUser.role) : ''),
      major: profileEdits?.major ?? '',
      year: profileEdits?.year ?? '',
      bio: profileEdits?.bio ?? '',
      avatarUrl: displayedAvatar ?? '',
      coverUrl: profileEdits?.coverUrl ?? '',
    })
    setEditOpen(true)
  }

  const selectImage =
    (field: 'avatarUrl' | 'coverUrl') => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return
      if (!file.type.startsWith('image/')) {
        toast.error('กรุณาเลือกไฟล์รูปภาพ')
        return
      }
      const imageUrl = URL.createObjectURL(file)
      objectUrlsRef.current.push(imageUrl)
      setDraft((current) => ({ ...current, [field]: imageUrl }))
    }

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextProfile = {
      ...draft,
      displayName: draft.displayName.trim(),
      status: draft.status.trim(),
      major: draft.major.trim(),
      year: draft.year.trim(),
      bio: draft.bio.trim(),
    }
    if (!nextProfile.displayName) {
      toast.error('กรุณาระบุชื่อที่ต้องการแสดง')
      return
    }
    setProfileEdits(nextProfile)
    setEditOpen(false)
    toast.success('บันทึกการเปลี่ยนแปลงในหน้านี้แล้ว')
  }

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
          <div
            className="relative flex h-36 items-center justify-center border-b border-pink-100/80 bg-[#FFF4F6] bg-cover bg-center text-muted-foreground dark:border-border dark:bg-muted/40 sm:h-48"
            style={
              profileEdits?.coverUrl
                ? { backgroundImage: `url("${profileEdits.coverUrl}")` }
                : undefined
            }
          >
            {!profileEdits?.coverUrl && (
              <div className="flex flex-col items-center gap-1 text-xs">
                <FileImage className="h-6 w-6" aria-hidden="true" />
                <span>รูปปก</span>
              </div>
            )}
            {isOwnProfile && (
              <button
                type="button"
                onClick={openProfileEditor}
                className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm backdrop-blur-sm transition-colors hover:bg-white dark:border-zinc-700/70 dark:bg-zinc-800/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                แก้ไขรูปหน้าปก
              </button>
            )}
            <div className="absolute -bottom-10 left-5 sm:left-8">
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={openProfileEditor}
                  aria-label="แก้ไขรูปโปรไฟล์"
                  className="group relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <Avatar
                    src={displayedAvatar}
                    name={displayedName}
                    className="h-20 w-20 border-4 border-card bg-pink-200 text-xl font-semibold text-slate-700 sm:h-24 sm:w-24"
                  />
                  <span className="absolute inset-1 flex items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Camera className="h-5 w-5" aria-hidden="true" />
                  </span>
                </button>
              ) : (
                <Avatar
                  src={profileUser?.avatar_url}
                  name={displayName(profileUser)}
                  className="h-20 w-20 border-4 border-card bg-pink-200 text-xl font-semibold text-slate-700 sm:h-24 sm:w-24"
                />
              )}
            </div>
          </div>

          <CardContent className="flex flex-col gap-5 px-5 pb-5 pt-14 sm:px-8 sm:pt-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1 lg:pl-28">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-xl font-semibold tracking-tight">
                  {profileUser ? displayedName : 'โปรไฟล์ผู้ใช้'}
                </h1>
                {isOwnProfile && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openProfileEditor}
                    className="min-h-11 rounded-xl border-pink-200/80 bg-white/70 px-4 text-xs font-medium hover:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    แก้ไขโปรไฟล์
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {profileEdits?.status ||
                (studentId
                  ? `รหัสนักศึกษา ${studentId}`
                  : profileUser?.role
                    ? roleLabel(profileUser.role)
                    : 'สมาชิก SIET Space')}
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {profileEdits?.bio ||
                (isOwnProfile
                  ? 'แบ่งปันสรุปและไอเดียการเรียนรู้กับชุมชน SIET'
                  : 'โพสต์และสื่อการเรียนรู้ที่แบ่งปันในชุมชน SIET')}
              </p>
              {(profileEdits?.major || profileEdits?.year) && (
                <p className="text-xs text-muted-foreground">
                  {[profileEdits.major, profileEdits.year && `ชั้นปี ${profileEdits.year}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
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
            className="no-scrollbar flex gap-1 overflow-x-auto border-t border-pink-100/80 px-3 py-2 dark:border-border sm:px-5"
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
                {profileEdits?.status && (
                  <ProfileDetail icon={UserRound} label="สถานะ" value={profileEdits.status} />
                )}
                {profileEdits?.major && (
                  <ProfileDetail icon={BookOpen} label="สาขา" value={profileEdits.major} />
                )}
                {profileEdits?.year && (
                  <ProfileDetail icon={GraduationCap} label="ชั้นปี" value={profileEdits.year} />
                )}
                {profileEdits?.bio && (
                  <div className="rounded-xl border border-border/70 p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">แนะนำตัว</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
                      {profileEdits.bio}
                    </p>
                  </div>
                )}
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
            {visiblePosts.map((post: CommunityPost) => {
              const displayedPost =
                isOwnProfile && profileEdits
                  ? {
                      ...post,
                      author: {
                        ...post.author,
                        display_name: profileEdits.displayName,
                        avatar_url: profileEdits.avatarUrl || post.author.avatar_url,
                      },
                    }
                  : post
              return <PostCard key={post.id} post={displayedPost} />
            })}
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

      {isOwnProfile && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="community-theme flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-pink-100 bg-white p-0 dark:border-border dark:bg-card sm:max-w-xl">
            <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 text-left sm:px-6">
              <DialogTitle>แก้ไขโปรไฟล์</DialogTitle>
              <DialogDescription>
                ปรับรูปภาพและข้อมูลที่แสดงบนโปรไฟล์ของคุณ
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={saveProfile} className="flex min-h-0 flex-col">
              <div className="min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
                <section aria-label="จัดการรูปภาพ" className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar
                      src={draft.avatarUrl || undefined}
                      name={draft.displayName || displayedName}
                      className="h-16 w-16 border border-border bg-pink-100 text-lg"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">รูปโปรไฟล์</p>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={selectImage('avatarUrl')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => avatarInputRef.current?.click()}
                        className="min-h-11 rounded-xl px-3 text-xs"
                      >
                        <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        เปลี่ยนรูปโปรไฟล์
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">รูปหน้าปก</p>
                    <div
                      className="flex h-24 items-center justify-center rounded-xl border border-border bg-[#FFF4F6] bg-cover bg-center dark:bg-muted/40"
                      style={
                        draft.coverUrl
                          ? { backgroundImage: `url("${draft.coverUrl}")` }
                          : undefined
                      }
                    >
                      {!draft.coverUrl && (
                        <FileImage className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={selectImage('coverUrl')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => coverInputRef.current?.click()}
                      className="min-h-11 rounded-xl px-3 text-xs"
                    >
                      <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                      เปลี่ยนรูปปก
                    </Button>
                  </div>
                </section>

                <section aria-label="ข้อมูลโปรไฟล์" className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="profile-display-name" className="text-sm font-medium">
                      ชื่อ-นามสกุล
                    </label>
                    <Input
                      id="profile-display-name"
                      value={draft.displayName}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, displayName: event.target.value }))
                      }
                      maxLength={100}
                      required
                      className="rounded-xl"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="profile-status" className="text-sm font-medium">
                        สถานะ
                      </label>
                      <Input
                        id="profile-status"
                        value={draft.status}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, status: event.target.value }))
                        }
                        maxLength={80}
                        placeholder="เช่น นักศึกษา"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="profile-major" className="text-sm font-medium">
                        สาขา
                      </label>
                      <Input
                        id="profile-major"
                        value={draft.major}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, major: event.target.value }))
                        }
                        maxLength={100}
                        placeholder="ระบุสาขาของคุณ"
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-year" className="text-sm font-medium">
                      ชั้นปี
                    </label>
                    <Input
                      id="profile-year"
                      value={draft.year}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, year: event.target.value }))
                      }
                      maxLength={40}
                      placeholder="ระบุชั้นปี"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-bio" className="text-sm font-medium">
                      แนะนำตัว
                    </label>
                    <Textarea
                      id="profile-bio"
                      value={draft.bio}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, bio: event.target.value }))
                      }
                      maxLength={500}
                      rows={4}
                      placeholder="เล่าเกี่ยวกับตัวคุณสั้นๆ"
                      className="resize-y rounded-xl"
                    />
                  </div>
                </section>
              </div>
              <div className="shrink-0 border-t border-border/70 p-4 sm:px-6">
                <Button
                  type="submit"
                  className="min-h-11 w-full rounded-xl bg-pink-500 font-semibold text-white hover:bg-pink-600"
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  บันทึกข้อมูล
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
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
