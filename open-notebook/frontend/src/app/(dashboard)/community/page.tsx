'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useAuth } from '@/lib/hooks/use-auth'
import { COMMUNITY_KEYS, useFeed } from '@/lib/hooks/use-community'
import { communityApi, type FeedFilters } from '@/lib/api/community'
import { CommunityHeader } from '@/components/community/CommunityHeader'
import { CourseSidebar, type FeedView } from '@/components/community/CourseSidebar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CreatorBox } from '@/components/community/CreatorBox'
import { PostCard } from '@/components/community/PostCard'
import { AiQuickWidget } from '@/components/community/AiQuickWidget'
import { Leaderboard, PopularRoadmaps } from '@/components/community/Leaderboard'
import { ShareMyWorkButton } from '@/components/community/ShareMyWorkDialog'
import { LibraryPanel } from '@/components/community/LibraryPanel'
import type { AskFocus } from '@/components/community/AiQuickWidget'
import type { LibraryDocument } from '@/lib/api/library'

export default function CommunityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <CommunityContent />
    </Suspense>
  )
}

const VIEWS: FeedView[] = ['all', 'mine', 'saved', 'materials', 'popular', 'library']

function CommunityContent() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { user } = useAuth()

  const rawView = params.get('view') as FeedView | null
  const view: FeedView = rawView && VIEWS.includes(rawView) ? rawView : 'all'
  const courseId = params.get('course') ? Number(params.get('course')) : null
  const query = params.get('q') || ''
  const postId = params.get('post') ? Number(params.get('post')) : null
  const isStaff = user?.role === 'admin' || user?.role === 'teacher'
  const [askFocus, setAskFocus] = useState<AskFocus | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const setParams = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(params.toString())
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') next.delete(key)
        else next.set(key, String(value))
      })
      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [params, pathname, router]
  )

  const filters = useMemo<FeedFilters>(
    () => ({
      course_id: courseId ?? undefined,
      q: query || undefined,
      saved: view === 'saved' || undefined,
      my_courses: view === 'mine' || undefined,
      type: view === 'materials' ? 'material' : undefined,
      order: view === 'popular' ? 'popular' : 'newest',
    }),
    [courseId, query, view]
  )

  const feed = useFeed(filters)
  const posts = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data])

  const singlePost = useQuery({
    queryKey: COMMUNITY_KEYS.post(postId ?? 0),
    queryFn: () => communityApi.post(postId as number),
    enabled: postId !== null,
  })

  const openPost = (id: number) => setParams({ post: id })
  const goHome = () => router.push(pathname)

  const viewTitle: Record<FeedView, string> = {
    all: courseId ? 'ฟีดห้องวิชา' : 'ฟีดรวมทั้งหมด',
    mine: 'วิชาที่ลงเรียน',
    saved: 'สรุปที่บันทึกไว้',
    materials: 'คลังสื่ออาจารย์',
    popular: 'โพสต์ยอดนิยม',
    library: 'คลังความรู้',
  }

  const focusDocument = (doc: LibraryDocument) => {
    setAskFocus({ id: doc.id, title: doc.title })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <CommunityHeader
        query={query}
        onSearch={(q) => setParams({ q, post: null })}
        onOpenPost={openPost}
        onHome={goHome}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {/* Same sidebar, in a drawer, for screens narrower than lg. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent title="เมนู SIET Space" description="ห้องเรียน คลังความรู้ และเครื่องมือ AI">
          <CourseSidebar
            view={view}
            courseId={courseId}
            isStaff={isStaff}
            onSelectView={(v) => {
              setParams({ view: v === 'all' ? null : v, post: null, q: null })
              setMenuOpen(false)
            }}
            onSelectCourse={(id) => {
              setParams({ course: id, post: null, q: null })
              setMenuOpen(false)
            }}
          />
        </SheetContent>
      </Sheet>

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
        {/* Left column */}
        <div className="hidden lg:block">
          <div className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto pr-1">
            <CourseSidebar
              view={view}
              courseId={courseId}
              isStaff={isStaff}
              onSelectView={(v) => setParams({ view: v === 'all' ? null : v, post: null, q: null })}
              onSelectCourse={(id) => setParams({ course: id, post: null, q: null })}
            />
          </div>
        </div>

        {/* Center column */}
        <main className="min-w-0 space-y-4">
          {view === 'library' ? (
            <LibraryPanel isStaff={isStaff} courseId={courseId} onAskDocument={focusDocument} />
          ) : postId !== null ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setParams({ post: null })} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> กลับไปหน้าฟีด
              </Button>
              {singlePost.isLoading && <Skeleton className="h-48 w-full" />}
              {singlePost.isError && (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">ไม่พบโพสต์นี้</CardContent>
                </Card>
              )}
              {singlePost.data && (
                <PostCard post={singlePost.data} onSelectCourse={(id) => setParams({ course: id, post: null })} />
              )}
            </>
          ) : (
            <>
              {view !== 'materials' && view !== 'saved' && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200/70 bg-gradient-to-r from-orange-50 to-rose-50 px-4 py-3 dark:border-orange-900/60 dark:from-orange-950/30 dark:to-rose-950/30">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">มีควิซ Roadmap หรือสรุปที่ทำไว้แล้ว?</p>
                      <p className="text-xs text-muted-foreground">
                        เลือกผลงานของคุณขึ้นฟีดได้ทันที · เพื่อนเล่นควิซจบ ได้แต้มคืน +1/คน
                      </p>
                    </div>
                    <ShareMyWorkButton defaultCourseId={courseId} />
                  </div>
                  <CreatorBox defaultCourseId={courseId} isStaff={isStaff} />
                </>
              )}
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {query ? `ผลการค้นหา “${query}”` : viewTitle[view]}
                </h2>
                {(query || courseId || view !== 'all') && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goHome}>
                    ล้างตัวกรอง
                  </Button>
                )}
              </div>

              {feed.isLoading && (
                <div className="space-y-4">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
              {feed.isError && (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    โหลดฟีดไม่สำเร็จ ลองรีเฟรชอีกครั้ง
                  </CardContent>
                </Card>
              )}
              {!feed.isLoading && posts.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                    <Inbox className="h-8 w-8" />
                    {view === 'saved'
                      ? 'ยังไม่มีโพสต์ที่บันทึกไว้ กดปุ่ม “บันทึก” ใต้โพสต์ที่ชอบ'
                      : view === 'materials'
                      ? 'อาจารย์ยังไม่ได้อัปโหลดสื่อการสอน'
                      : 'ยังไม่มีโพสต์ในฟีดนี้ เริ่มแชร์สรุปหรือควิซชุดแรกได้เลย!'}
                  </CardContent>
                </Card>
              )}
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onSelectCourse={(id) => setParams({ course: id })} />
              ))}
              {feed.hasNextPage && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
                    {feed.isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดโพสต์เพิ่ม'}
                  </Button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Right column */}
        <div className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          <AiQuickWidget
            courseId={courseId}
            focusDocument={askFocus}
            onClearFocus={() => setAskFocus(null)}
          />
          <Leaderboard />
          <PopularRoadmaps onOpenPost={openPost} />
        </div>
      </div>
    </div>
  )
}
