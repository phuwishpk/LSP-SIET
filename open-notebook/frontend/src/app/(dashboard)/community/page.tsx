'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Bot, ChevronRight, Inbox, ListChecks, Map, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useAuth } from '@/lib/hooks/use-auth'
import { COMMUNITY_KEYS, useCourses, useFeed } from '@/lib/hooks/use-community'
import { communityApi, type FeedFilters } from '@/lib/api/community'
import { CommunityHeader } from '@/components/community/CommunityHeader'
import { CourseSidebar, type FeedView } from '@/components/community/CourseSidebar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CreatorBox } from '@/components/community/CreatorBox'
import { PostCard } from '@/components/community/PostCard'
import { AiQuickWidget } from '@/components/community/AiQuickWidget'
import { ShareMyWorkButton } from '@/components/community/ShareMyWorkDialog'
import { LibraryPanel } from '@/components/community/LibraryPanel'
import type { AskFocus } from '@/components/community/AiQuickWidget'
import type { LibraryDocument } from '@/lib/api/library'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import Link from 'next/link'

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
  const { data: courses } = useCourses()

  const rawView = params.get('view') as FeedView | null
  const view: FeedView = rawView && VIEWS.includes(rawView) ? rawView : 'all'
  const courseId = params.get('course') ? Number(params.get('course')) : null
  const selectedCourse = courses?.find((course) => course.id === courseId) ?? null
  const query = params.get('q') || ''
  const postId = params.get('post') ? Number(params.get('post')) : null
  const isStaff = user?.role === 'admin' || user?.role === 'teacher'
  const [askFocus, setAskFocus] = useState<AskFocus | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)

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
    all: 'ฟีดสาธารณะ',
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
    <div className="community-theme flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <CommunityHeader
        query={query}
        onSearch={(q) => setParams({ q, post: null })}
        onOpenPost={openPost}
        onHome={goHome}
        onOpenCommunityRules={() => setRulesOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {/* Same sidebar, in a drawer, for screens narrower than lg. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          title="เมนู SIET Space"
          description="ห้องเรียน คลังความรู้ และเครื่องมือ AI"
          className="community-theme"
        >
          <CourseSidebar
            view={view}
            courseId={courseId}
            isStaff={isStaff}
            onSelectView={(v) => {
              setParams({
                view: v === 'all' ? null : v,
                course: ['all', 'popular', 'mine', 'saved'].includes(v) ? null : undefined,
                post: null,
                q: null,
              })
              setMenuOpen(false)
            }}
            onSelectCourse={(id) => {
              setParams({ course: id, view: null, post: null, q: null })
              setMenuOpen(false)
            }}
          />
        </SheetContent>
      </Sheet>

      <div className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-4 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 lg:h-[calc(100vh-64px)] lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:grid-rows-1 lg:gap-6 lg:overflow-hidden lg:px-6 lg:py-6">
        {/* Left column */}
        <div className="no-scrollbar hidden min-h-0 space-y-4 overflow-y-auto lg:block">
          <CourseSidebar
            view={view}
            courseId={courseId}
            isStaff={isStaff}
            rulesOpen={rulesOpen}
            onRulesOpenChange={setRulesOpen}
            onSelectView={(v) =>
              setParams({
                view: v === 'all' ? null : v,
                course: ['all', 'popular', 'mine', 'saved'].includes(v) ? null : undefined,
                post: null,
                q: null,
              })
            }
            onSelectCourse={(id) => setParams({ course: id, view: null, post: null, q: null })}
          />
        </div>

        {/* Center column */}
        <main className="no-scrollbar min-h-0 min-w-0 w-full space-y-4 lg:overflow-y-auto">
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-lg font-semibold tracking-tight">
                      {query
                        ? `ผลการค้นหา “${query}”`
                        : view === 'all' && courseId
                          ? 'ฟีดห้องวิชา'
                          : viewTitle[view]}
                    </h1>
                    <div className="flex items-center gap-2">
                      {view === 'all' || view === 'popular' ? (
                        <select
                          aria-label="เรียงโพสต์"
                          value={view === 'popular' ? 'popular' : 'latest'}
                          onChange={(event) =>
                            setParams({
                              view: event.target.value === 'popular' ? 'popular' : null,
                              post: null,
                            })
                          }
                          className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm"
                        >
                          <option value="latest">โพสต์ล่าสุด</option>
                          <option value="popular">โพสต์ยอดนิยม</option>
                        </select>
                      ) : null}
                      <ShareMyWorkButton
                        defaultCourseId={courseId}
                        size="sm"
                        className="h-9 rounded-lg bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
                      />
                    </div>
                  </div>
                  <CreatorBox defaultCourseId={courseId} isStaff={isStaff} />
                </>
              )}
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-foreground">โพสต์ในชุมชน</h2>
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
        <div className="no-scrollbar hidden min-h-0 w-full space-y-4 lg:block lg:overflow-y-auto">
          <Card className="border-border shadow-sm">
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center gap-2 px-1 pb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">เครื่องมือ AI</h2>
              </div>
              <Link
                href="/community/ask"
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
              >
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                    ถาม KMITL RAG AI <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                    ได้รับคำตอบจากคลังวิชาของคุณ · 1 เครดิต
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void openQuizApp()}
                className="group flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                    สร้างแบบทดสอบ AI <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                    ทดสอบความเข้าใจด้วยคำถามฝึกหัด · 8 เครดิต
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void openRoadmapApp({
                    course: selectedCourse && selectedCourse.kind !== 'club' ? selectedCourse.id : null,
                  })
                }
                className="group flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <Map className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                    สร้างแผนการเรียน AI <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                    แปลงเป้าหมายการเรียนของคุณเป็นแผนการเรียน · 15 เครดิต
                  </span>
                </span>
              </button>
            </CardContent>
          </Card>
          <AiQuickWidget
            courseId={courseId}
            focusDocument={askFocus}
            onClearFocus={() => setAskFocus(null)}
          />
        </div>
      </div>
    </div>
  )
}
