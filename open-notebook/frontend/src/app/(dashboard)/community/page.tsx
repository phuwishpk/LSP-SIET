'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  Inbox,
  ListChecks,
  Map as MapIcon,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useAuth } from '@/lib/hooks/use-auth'
import {
  COMMUNITY_KEYS,
  useAddPostToSavedCollection,
  useCourses,
  useCreateSavedCollection,
  useFeed,
  useJoinCourse,
  useSavedCollections,
  useWallet,
} from '@/lib/hooks/use-community'
import { communityApi, type FeedFilters } from '@/lib/api/community'
import { roomLabel } from '@/lib/utils/community-format'
import { CommunityHeader } from '@/components/community/CommunityHeader'
import { CourseSidebar, type FeedView } from '@/components/community/CourseSidebar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CreatorBox } from '@/components/community/CreatorBox'
import { PostCard } from '@/components/community/PostCard'
import { InstructorMediaView } from '@/components/community/InstructorMediaView'
import { SavedSummariesView, SavedSummaryTools } from '@/components/community/SavedSummariesView'
import { AiQuickWidget } from '@/components/community/AiQuickWidget'
import { ShareMyWorkButton } from '@/components/community/ShareMyWorkDialog'
import { LibraryPanel } from '@/components/community/LibraryPanel'
import {
  CommunityCreditsPanel,
  CommunityRulesContent,
} from '@/components/community/CommunityRulesView'
import type { AskFocus } from '@/components/community/AiQuickWidget'
import type { LibraryDocument } from '@/lib/api/library'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import { useGenerateQuiz } from '@/lib/hooks/use-features'
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

const VIEWS: FeedView[] = ['all', 'mine', 'saved', 'materials', 'popular', 'library', 'rules']

function CommunityContent() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { user } = useAuth()
  const { data: courses } = useCourses()

  const rawView = params.get('view') as FeedView | null
  const view: FeedView = rawView && VIEWS.includes(rawView) ? rawView : 'all'
  const { data: wallet } = useWallet(view === 'materials' || view === 'saved')
  const { data: savedCollections = [] } = useSavedCollections(view === 'saved')
  const createSavedCollection = useCreateSavedCollection()
  const addPostToSavedCollection = useAddPostToSavedCollection()
  const generateQuiz = useGenerateQuiz()
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false)
  const courseId = params.get('course') ? Number(params.get('course')) : null
  const rawSavedCollectionId = params.get('collection')
  const parsedSavedCollectionId = Number(rawSavedCollectionId)
  const savedCollectionId =
    rawSavedCollectionId && Number.isInteger(parsedSavedCollectionId) && parsedSavedCollectionId > 0
      ? parsedSavedCollectionId
      : null
  const selectedSavedCollection =
    savedCollections.find((collection) => collection.id === savedCollectionId) ?? null
  const selectedCourse = courses?.find((course) => course.id === courseId) ?? null
  const query = params.get('q') || ''
  const postId = params.get('post') ? Number(params.get('post')) : null
  const isStaff = user?.role === 'admin' || user?.role === 'teacher'
  const [askFocus, setAskFocus] = useState<AskFocus | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const joinCourse = useJoinCourse()
  const joinedCourses = (courses ?? []).filter((course) => course.joined && course.kind !== 'club')
  const availableCourses = (courses ?? []).filter((course) => !course.joined && course.kind !== 'club')

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
      saved_collection_id:
        view === 'saved' && savedCollectionId !== null ? savedCollectionId : undefined,
      my_courses: view === 'mine' || undefined,
      type: view === 'materials' ? 'material' : undefined,
      order: view === 'popular' ? 'popular' : 'newest',
    }),
    [courseId, query, savedCollectionId, view]
  )

  const feed = useFeed(filters, view !== 'rules')
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
    rules: 'กฎชุมชน',
  }

  const focusDocument = (doc: LibraryDocument) => {
    setAskFocus({ id: doc.id, title: doc.title })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const generateSavedQuiz = () =>
    generateQuiz.mutate(
      {
        topic: selectedSavedCollection
          ? `แบบทดสอบจากคลัง ${selectedSavedCollection.name}`
          : 'แบบทดสอบจากสรุปและโน้ตที่บันทึกไว้',
        question_count: 5,
        language: 'th',
        use_saved_posts: !selectedSavedCollection,
        saved_collection_id: selectedSavedCollection?.id,
      },
      {
        onSuccess: (result) =>
          router.push(`/features?tab=quiz&id=${encodeURIComponent(result.session.id)}`),
      }
    )

  return (
    <div
      className="community-theme flex h-screen flex-col overflow-x-hidden overflow-y-hidden bg-white text-foreground dark:bg-zinc-950"
    >
      <CommunityHeader
        query={query}
        onSearch={(q) => setParams({ q, post: null })}
        onOpenPost={openPost}
        onHome={goHome}
        onOpenCommunityRules={() =>
          setParams({ view: 'rules', course: null, post: null, q: null })
        }
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
                collection: null,
                post: null,
                q: null,
              })
              setMenuOpen(false)
            }}
            onSelectCourse={(id) => {
              setParams({
                course: id,
                view: view === 'mine' ? 'mine' : null,
                collection: null,
                post: null,
                q: null,
              })
              setMenuOpen(false)
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent
          side="right"
          title="ถาม KMITL RAG AI"
          description="ถามจากเอกสารในคลังความรู้"
          className="community-theme no-scrollbar w-[min(100vw,420px)] overflow-x-hidden overflow-y-auto sm:max-w-md lg:hidden"
        >
          <AiQuickWidget
            courseId={courseId}
            focusDocument={askFocus}
            onClearFocus={() => setAskFocus(null)}
            enrolledCoursesOnly={view === 'mine'}
          />
        </SheetContent>
      </Sheet>

      <div className="no-scrollbar mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-4 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4 md:px-6 lg:h-[calc(100vh-64px)] lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:grid-rows-1 lg:gap-6 lg:overflow-hidden lg:px-6 lg:py-6">
        {/* Left column */}
        <div className="no-scrollbar hidden min-h-0 space-y-4 overflow-x-hidden overflow-y-auto lg:block">
          <CourseSidebar
            view={view}
            courseId={courseId}
            isStaff={isStaff}
            onSelectView={(v) =>
              setParams({
                view: v === 'all' ? null : v,
                course: ['all', 'popular', 'mine', 'saved', 'rules'].includes(v) ? null : undefined,
                collection: null,
                post: null,
                q: null,
              })
            }
            onSelectCourse={(id) =>
              setParams({
                course: id,
                view: view === 'mine' ? 'mine' : null,
                collection: null,
                post: null,
                q: null,
              })
            }
          />
        </div>

        {/* Center column */}
        <main className="no-scrollbar min-h-0 min-w-0 w-full space-y-4 overflow-x-hidden lg:overflow-y-auto">
          <div className="lg:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-start gap-2 rounded-xl border-pink-100 bg-white text-left shadow-sm hover:bg-pink-50"
              onClick={() => setAiOpen(true)}
            >
              <Bot className="h-4 w-4 text-primary" />
              <span className="flex-1">ถาม KMITL RAG AI</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          {view === 'rules' ? (
            <div className="space-y-4">
              <CommunityRulesContent />
              <CommunityCreditsPanel className="lg:hidden" />
            </div>
          ) : view === 'library' ? (
            <LibraryPanel isStaff={isStaff} courseId={courseId} onAskDocument={focusDocument} />
          ) : view === 'materials' && postId === null ? (
            <InstructorMediaView
              posts={posts}
              courses={courses ?? []}
              courseId={courseId}
              isLoading={feed.isLoading}
              isError={feed.isError}
              hasNextPage={feed.hasNextPage}
              isFetchingNextPage={feed.isFetchingNextPage}
              onSelectCourse={(id) => setParams({ course: id, view: 'materials', post: null })}
              onLoadMore={() => void feed.fetchNextPage()}
            />
          ) : view === 'saved' && postId === null ? (
            <SavedSummariesView
              posts={posts}
              collections={savedCollections}
              collectionId={savedCollectionId}
              savedCount={selectedSavedCollection?.item_count ?? wallet?.stats.saved ?? 0}
              wallet={wallet}
              isLoading={feed.isLoading}
              isError={feed.isError}
              hasNextPage={feed.hasNextPage}
              isFetchingNextPage={feed.isFetchingNextPage}
              isCreatingCollection={createSavedCollection.isPending}
              isGeneratingQuiz={generateQuiz.isPending}
              createOpen={createCollectionOpen}
              onSelectCollection={(id) => setParams({ collection: id, post: null })}
              onCreateOpenChange={setCreateCollectionOpen}
              onCreateCollection={(name) =>
                createSavedCollection.mutate(name, {
                  onSuccess: (collection) => {
                    setCreateCollectionOpen(false)
                    setParams({ collection: collection.id })
                  },
                })
              }
              onAddToCollection={(postId, collectionId) =>
                addPostToSavedCollection.mutate({ postId, collectionId })
              }
              onLoadMore={() => void feed.fetchNextPage()}
              onGenerateQuiz={() => void generateSavedQuiz()}
            />
          ) : view === 'mine' && postId === null ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h1 className="text-lg font-semibold tracking-tight">ชั้นเรียนของฉันและวิชาที่ลงเรียน</h1>
                <p className="text-xs text-muted-foreground">
                  อัปเดตจากชั้นเรียนที่ลงเรียน {joinedCourses.length} วิชาเท่านั้น
                </p>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                  <Button
                    variant={courseId === null ? 'default' : 'outline'}
                    size="sm"
                    className={`shrink-0 rounded-full ${courseId === null ? 'bg-pink-600 text-white hover:bg-pink-700' : 'border-pink-100'}`}
                    onClick={() => setParams({ course: null, post: null })}
                  >
                    ทั้งหมด
                  </Button>
                  {joinedCourses.map((course) => (
                    <Button
                      key={course.id}
                      variant={courseId === course.id ? 'default' : 'outline'}
                      size="sm"
                      className={`shrink-0 rounded-full ${courseId === course.id ? 'bg-pink-600 text-white hover:bg-pink-700' : 'border-pink-100'}`}
                      onClick={() => setParams({ course: course.id, post: null })}
                    >
                      {roomLabel(course)}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1 rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                  onClick={() => setJoinDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">เข้าร่วมชั้นเรียน</span>
                </Button>
              </div>
              <CreatorBox
                defaultCourseId={courseId}
                isStaff={isStaff}
                joinedCoursesOnly
                placeholder="แชร์ข้อความกับเพื่อนร่วมชั้น..."
              />
              <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                <DialogContent className="community-theme no-scrollbar max-h-[80vh] overflow-x-hidden overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>เข้าร่วมชั้นเรียน</DialogTitle>
                    <DialogDescription>เลือกวิชาที่ต้องการเข้าร่วมเพื่อดูและแบ่งปันโพสต์กับเพื่อนร่วมชั้น</DialogDescription>
                  </DialogHeader>
                  {availableCourses.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีชั้นเรียนอื่นให้เข้าร่วมในขณะนี้</p>
                  ) : (
                    <div className="space-y-2">
                      {availableCourses.map((course) => (
                        <div key={course.id} className="flex items-center gap-3 rounded-xl border p-3">
                          <BookOpen className="h-4 w-4 shrink-0 text-pink-600" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{roomLabel(course)}</p>
                            <p className="text-xs text-muted-foreground">{course.member_count} สมาชิก</p>
                          </div>
                          <Button
                            size="sm"
                            disabled={joinCourse.isPending}
                            onClick={() =>
                              joinCourse.mutate(
                                { courseId: course.id, join: true },
                                { onSuccess: () => setJoinDialogOpen(false) }
                              )
                            }
                          >
                            เข้าร่วม
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-foreground">โพสต์ในชั้นเรียน</h2>
                {courseId !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setParams({ course: null })}
                  >
                    ดูทุกวิชาที่ลงเรียน
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
                    ยังไม่มีโพสต์จากวิชาที่ลงเรียนในขณะนี้
                  </CardContent>
                </Card>
              )}
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onSelectCourse={(id) => setParams({ course: id })} />
              ))}
              {feed.hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => feed.fetchNextPage()}
                    disabled={feed.isFetchingNextPage}
                  >
                    {feed.isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดโพสต์เพิ่ม'}
                  </Button>
                </div>
              )}
            </div>
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
              {view !== 'materials' && view !== 'saved' && view !== 'mine' && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h1 className="text-lg font-semibold tracking-tight">
                        {query
                          ? `ผลการค้นหา “${query}”`
                          : view === 'all' && courseId
                            ? 'ฟีดห้องวิชา'
                            : viewTitle[view]}
                      </h1>
                      <p className="text-xs text-muted-foreground">
                        โพสต์และสื่อการเรียนรู้จากชุมชน SIET Space
                      </p>
                    </div>
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
                        className="hidden"
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
        <div className="no-scrollbar hidden min-h-0 w-full space-y-4 overflow-x-hidden lg:block lg:overflow-y-auto">
          {view === 'rules' ? (
            <CommunityCreditsPanel />
          ) : view === 'saved' ? (
            <SavedSummaryTools
              collections={savedCollections}
              collectionId={savedCollectionId}
              savedCount={selectedSavedCollection?.item_count ?? wallet?.stats.saved ?? 0}
              balance={wallet?.balance ?? 0}
              cost={wallet?.rules.costs.quiz_generate ?? 8}
              exempt={wallet?.exempt ?? false}
              remaining={
                wallet?.exempt
                  ? wallet.balance
                  : Math.max(
                      0,
                      (wallet?.balance ?? 0) - (wallet?.rules.costs.quiz_generate ?? 8)
                    )
              }
              isGenerating={generateQuiz.isPending}
              onSelectCollection={(id) => setParams({ collection: id, post: null })}
              onCreateCollection={() => setCreateCollectionOpen(true)}
              onGenerateQuiz={() => void generateSavedQuiz()}
            />
          ) : view === 'materials' ? (
            <>
              <Card className="rounded-2xl border-pink-100 bg-white shadow-sm dark:bg-card">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <h2 className="text-sm font-semibold">อาจารย์ประจำวิชา</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ผู้สอนและรายวิชาที่แบ่งปันสื่อ
                    </p>
                  </div>
                  {(() => {
                    const instructorCourses = (courses ?? [])
                      .filter(
                        (course) =>
                          course.kind !== 'club' &&
                          course.created_by !== null &&
                          course.created_by !== undefined &&
                          course.instructor_name
                      )
                      .filter((course) => courseId === null || course.id === courseId)
                    const instructors = Array.from(
                      new Map(
                        instructorCourses.map((course) => [
                          course.created_by!,
                          { id: course.created_by!, name: course.instructor_name!, course },
                        ])
                      ).values()
                    )
                    return instructors.length ? (
                      <div className="divide-y divide-pink-100">
                        {instructors.map((instructor) => (
                          <div key={instructor.id} className="flex items-start gap-2.5 py-3 first:pt-0 last:pb-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-[10px] font-semibold text-pink-700">
                              {instructor.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold">{instructor.name}</p>
                              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                {roomLabel(instructor.course)}
                              </p>
                              <Link
                                href={`/community/profile/${instructor.id}`}
                                className="mt-2 inline-flex h-7 items-center gap-1 rounded-full border border-pink-100 px-2.5 text-[10px] font-medium text-pink-700 transition-colors hover:bg-pink-50"
                              >
                                <UserRound className="h-3 w-3" /> ดูโปรไฟล์
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-pink-50 p-3 text-xs text-muted-foreground">
                        ยังไม่มีข้อมูลผู้สอนสำหรับวิชานี้
                      </p>
                    )
                  })()}
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-pink-100 bg-white shadow-sm dark:bg-card">
                <CardContent className="space-y-3 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4 text-pink-600" /> สรุปด้วย AI
                  </h2>
                  <div className="rounded-xl bg-pink-50 p-3 dark:bg-pink-950/20">
                    <p className="text-xs font-semibold">
                      สรุปสไลด์ด้วย KMITL RAG AI · {wallet?.exempt ? 'ฟรี' : `${wallet?.rules.costs.rag_question ?? 1} เครดิต`}
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      ถาม AI จากคลังเอกสารของวิชาเพื่อสรุปประเด็นสำคัญ
                    </p>
                  </div>
                  {(() => {
                    const targetCourseId =
                      courseId !== null
                        ? joinedCourses.find((course) => course.id === courseId)?.id ?? null
                        : joinedCourses[0]?.id ?? null
                    const prompt =
                      'ช่วยสรุปสไลด์หรือเอกสารของวิชานี้เป็นหัวข้อสำคัญ พร้อมอธิบายคำศัพท์หรือแนวคิดที่ควรรู้'
                    const askParams = new URLSearchParams({ prompt })
                    if (targetCourseId !== null) askParams.set('course', String(targetCourseId))
                    const askHref = `/community/ask?${askParams.toString()}`
                    return (
                      <Button asChild className="w-full rounded-full bg-pink-600 text-xs text-white hover:bg-pink-700">
                        <Link href={askHref}>สรุปสไลด์</Link>
                      </Button>
                    )
                  })()}
                  <p className="text-[10px] text-muted-foreground">
                    AI อาจคลาดเคลื่อน กรุณาตรวจสอบข้อมูลกับเนื้อหาต้นฉบับ
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
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
                    {view === 'mine'
                      ? 'ตอบจากคลังเอกสารของวิชาที่ลงเรียนเท่านั้น'
                      : 'ได้รับคำตอบจากคลังวิชาของคุณ · 1 เครดิต'}
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
                <MapIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
          {view === 'mine' && (
            <Card className="border-pink-100 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">วิชาที่ลงเรียน ({joinedCourses.length})</h2>
                    <p className="text-[11px] text-muted-foreground">กิจกรรมจากเพื่อนร่วมชั้น</p>
                  </div>
                  <BookOpen className="h-4 w-4 text-pink-600" />
                </div>
                {joinedCourses.length === 0 ? (
                  <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    ยังไม่มีวิชาที่ลงเรียน
                  </p>
                ) : (
                  <div className="space-y-2">
                    {joinedCourses.map((course) => (
                      <button
                        type="button"
                        key={course.id}
                        onClick={() => setParams({ course: course.id, view: 'mine', post: null })}
                        className="flex w-full items-start gap-2 rounded-xl border border-border p-3 text-left transition-colors hover:border-pink-200 hover:bg-pink-50/60"
                      >
                        <Users className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">{roomLabel(course)}</span>
                          <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                            ผู้สอน: {course.instructor_name || 'ไม่ระบุ'} · {course.member_count} สมาชิก
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-medium text-pink-700">
                          ลงเรียนแล้ว
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <AiQuickWidget
            courseId={courseId}
            focusDocument={askFocus}
            onClearFocus={() => setAskFocus(null)}
            enrolledCoursesOnly={view === 'mine'}
          />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
