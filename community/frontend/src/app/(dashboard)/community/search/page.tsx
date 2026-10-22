'use client'

/**
 * Advanced search for the community (4.3.3).
 *
 * The header search box filters the feed by text only. This page is where a
 * search becomes precise: one query across posts, rooms, library documents and
 * people, with the filters a student actually asks for (which room, which
 * programme, what kind of post, who wrote it, which tag, when) - and documents
 * found by meaning, not only by title. The URL carries every filter, so a
 * search can be shared.
 */

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  BookOpen,
  Download,
  FileText,
  Hash,
  Lock,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  filtersFromParams,
  paramsFromFilters,
  type SearchCourse,
  type SearchDocument,
  type SearchFilters,
  type SearchKind,
  type SearchUser,
} from '@siet/platform/lib/api/community-search'
import type { CommunityPost, PostType } from '@siet/platform/lib/api/community'
import { libraryDownloadUrl } from '@siet/platform/lib/api/library'
import { useAdvancedSearch, useAdvancedSearchPosts } from '@siet/platform/lib/hooks/use-advanced-search'
import { useCategories } from '@siet/platform/lib/hooks/use-courses'
import { useCourses } from '@siet/platform/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { displayName, formatBytes, postTypeLabel, roleLabel, timeAgo } from '@siet/platform/lib/utils/community-format'
import { cn } from '@/lib/utils'

const KINDS: { value: SearchKind; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'posts', label: 'โพสต์' },
  { value: 'courses', label: 'รายวิชา' },
  { value: 'documents', label: 'เอกสาร' },
  { value: 'users', label: 'ผู้ใช้' },
]
const POST_TYPES: PostType[] = ['summary', 'question', 'material', 'quiz', 'roadmap']

export default function CommunitySearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchScreen />
    </Suspense>
  )
}

function SearchScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params])
  const [draft, setDraft] = useState(filters.q)
  const [showFilters, setShowFilters] = useState(
    Boolean(filters.course_id || filters.category_id || filters.type || filters.author || filters.tag || filters.since || filters.until)
  )
  useEffect(() => setDraft(filters.q), [filters.q])

  const apply = (next: Partial<SearchFilters>) => {
    const merged: SearchFilters = { ...filters, ...next }
    router.push(`/community/search?${paramsFromFilters(merged).toString()}`)
  }
  const activeFilters = [
    filters.course_id && 'course_id',
    filters.category_id && 'category_id',
    filters.type && 'type',
    filters.author && 'author',
    filters.tag && 'tag',
    filters.since && 'since',
    filters.until && 'until',
  ].filter(Boolean).length

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
              <Link href="/community">
                <ArrowLeft className="h-4 w-4" /> ฟีด
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">ค้นหาขั้นสูง</h1>
            <p className="text-sm text-muted-foreground">โพสต์ รายวิชา เอกสารในคลัง และผู้คน — กรองได้ละเอียด</p>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              apply({ q: draft.trim() })
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="คำค้น เช่น deadlock, สรุปบทที่ 3, 03376117"
                className="pl-9"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!draft.trim()}>
              ค้นหา
            </Button>
            <Button
              type="button"
              variant={showFilters ? 'secondary' : 'outline'}
              className="gap-1.5"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="h-4 w-4" /> ตัวกรอง
              {activeFilters > 0 && <Badge className="h-5 px-1.5">{activeFilters}</Badge>}
            </Button>
          </form>

          {showFilters && <FilterBar filters={filters} onChange={apply} />}

          <Tabs value={filters.kind ?? 'all'} onValueChange={(v) => apply({ kind: v as SearchKind })}>
            <TabsList className="flex-wrap">
              {KINDS.map((k) => (
                <TabsTrigger key={k.value} value={k.value}>
                  {k.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {!filters.q.trim() ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                พิมพ์คำค้นแล้วกด Enter — เอกสารจะถูกค้นด้วยความหมาย ไม่ต้องสะกดตรงทุกคำ
              </CardContent>
            </Card>
          ) : filters.kind === 'posts' ? (
            <PostsTab filters={filters} />
          ) : (
            <OverviewOrKind filters={filters} onKind={(k) => apply({ kind: k })} />
          )}
        </div>
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

function FilterBar({ filters, onChange }: { filters: SearchFilters; onChange: (f: Partial<SearchFilters>) => void }) {
  const courses = useCourses()
  const categories = useCategories()
  const [author, setAuthor] = useState(filters.author ?? '')
  const [tag, setTag] = useState(filters.tag ?? '')
  useEffect(() => setAuthor(filters.author ?? ''), [filters.author])
  useEffect(() => setTag(filters.tag ?? ''), [filters.tag])
  const select = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="f-course">รายวิชา / ห้อง</Label>
          <select
            id="f-course"
            className={select}
            value={filters.course_id ?? ''}
            onChange={(e) => onChange({ course_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">ทุกห้อง</option>
            {(courses.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'club' ? c.name : `${c.code} ${c.name}`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-category">หมวดหมู่ (สาขา)</Label>
          <select
            id="f-category"
            className={select}
            value={filters.category_id ?? ''}
            onChange={(e) => onChange({ category_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">ทุกหมวด</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-type">ประเภทโพสต์</Label>
          <select
            id="f-type"
            className={select}
            value={filters.type ?? ''}
            onChange={(e) => onChange({ type: (e.target.value || undefined) as PostType | undefined })}
          >
            <option value="">ทุกประเภท</option>
            {POST_TYPES.map((t) => (
              <option key={t} value={t}>
                {postTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-order">เรียงลำดับ</Label>
          <select
            id="f-order"
            className={select}
            value={filters.order ?? 'newest'}
            onChange={(e) => onChange({ order: e.target.value as SearchFilters['order'] })}
          >
            <option value="newest">ใหม่ล่าสุด</option>
            <option value="popular">ยอดนิยม</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-author">ผู้เขียน (@username)</Label>
          <Input
            id="f-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onBlur={() => onChange({ author: author.trim() || undefined })}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onChange({ author: author.trim() || undefined }))}
            placeholder="เช่น demo.teacher1"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-tag">แท็ก</Label>
          <Input
            id="f-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onBlur={() => onChange({ tag: tag.trim() || undefined })}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onChange({ tag: tag.trim() || undefined }))}
            placeholder="เช่น OS"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-since">ตั้งแต่วันที่</Label>
          <Input id="f-since" type="date" className="h-9" value={filters.since ?? ''} onChange={(e) => onChange({ since: e.target.value || undefined })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-until">ถึงวันที่</Label>
          <Input id="f-until" type="date" className="h-9" value={filters.until ?? ''} onChange={(e) => onChange({ until: e.target.value || undefined })} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onChange({ course_id: undefined, category_id: undefined, type: undefined, author: undefined, tag: undefined, since: undefined, until: undefined, order: 'newest' })}
          >
            <X className="h-3.5 w-3.5" /> ล้างตัวกรอง
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function OverviewOrKind({ filters, onKind }: { filters: SearchFilters; onKind: (k: SearchKind) => void }) {
  const kind = filters.kind ?? 'all'
  const result = useAdvancedSearch({ ...filters, kind, limit: kind === 'all' ? undefined : 30 })
  if (result.isLoading) return <Skeleton className="h-40 w-full" />
  if (result.isError) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-destructive">
          ค้นหาไม่สำเร็จ {(result.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? ''}
        </CardContent>
      </Card>
    )
  }
  const data = result.data
  if (!data) return null
  const sections: { key: SearchKind; title: string; icon: React.ComponentType<{ className?: string }>; count: number; body: React.ReactNode }[] = []
  if (kind === 'all' || kind === 'posts')
    sections.push({ key: 'posts', title: 'โพสต์', icon: MessageSquare, count: data.posts.length, body: <PostList posts={data.posts} /> })
  if (kind === 'all' || kind === 'courses')
    sections.push({ key: 'courses', title: 'รายวิชา', icon: Hash, count: data.courses.length, body: <CourseList courses={data.courses} /> })
  if (kind === 'all' || kind === 'documents')
    sections.push({ key: 'documents', title: 'เอกสารในคลัง', icon: BookOpen, count: data.documents.length, body: <DocumentList docs={data.documents} /> })
  if (kind === 'all' || kind === 'users')
    sections.push({ key: 'users', title: 'ผู้ใช้', icon: Users, count: data.users.length, body: <UserList users={data.users} /> })

  const total = sections.reduce((n, s) => n + s.count, 0)
  if (total === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          ไม่พบอะไรที่ตรงกับ “{data.query}” — ลองคำอื่น ลดตัวกรอง หรือค้นในแท็บเอกสารซึ่งหาด้วยความหมาย
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      {sections
        .filter((s) => s.count > 0)
        .map((s) => (
          <section key={s.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{s.title}</h2>
              <Badge variant="secondary">{s.count}</Badge>
              {kind === 'all' && s.count >= 5 && (
                <Button variant="link" size="sm" className="h-6 px-1 text-xs" onClick={() => onKind(s.key)}>
                  ดูทั้งหมด
                </Button>
              )}
            </div>
            {s.body}
          </section>
        ))}
    </div>
  )
}

function PostsTab({ filters }: { filters: SearchFilters }) {
  const pages = useAdvancedSearchPosts(filters)
  const posts = pages.data?.pages.flatMap((p) => p.posts) ?? []
  if (pages.isLoading) return <Skeleton className="h-40 w-full" />
  if (posts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">ไม่พบโพสต์ที่ตรงกับคำค้นและตัวกรอง</CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      <PostList posts={posts} />
      {pages.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()}>
            โหลดเพิ่ม
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// result rows

function PostList({ posts }: { posts: CommunityPost[] }) {
  return (
    <ul className="space-y-2">
      {posts.map((p) => (
        <li key={p.id}>
          <Link href={`/community?post=${p.id}`} className="block rounded-lg border bg-card p-3 transition hover:bg-accent">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline" className="h-5">{postTypeLabel(p.type)}</Badge>
              {p.course && (
                <Badge variant="secondary" className="h-5 gap-1">
                  <Hash className="h-3 w-3" /> {p.course.code}
                </Badge>
              )}
              {(p as CommunityPost & { visibility?: string }).visibility && (p as CommunityPost & { visibility?: string }).visibility !== 'public' && (
                <Lock className="h-3 w-3" aria-label="ไม่ใช่โพสต์สาธารณะ" />
              )}
              <span>{displayName(p.author)}</span>
              <span>· {timeAgo(p.created_at)}</span>
            </div>
            {p.title && <p className="mt-1 text-sm font-medium">{p.title}</p>}
            {p.content && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{p.content}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.tags.slice(0, 5).map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">#{t}</span>
              ))}
              <span className="ml-auto text-[11px] text-muted-foreground">
                ❤ {p.counts.like} · 💬 {p.counts.comment}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CourseList({ courses }: { courses: SearchCourse[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {courses.map((c) => (
        <li key={c.id}>
          <Link href={`/community?course=${c.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:bg-accent">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hash className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.kind === 'club' ? c.name : `${c.code} ${c.name}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {c.category_name ? `${c.category_name} · ` : ''}
                {c.term ? `เทอม ${c.term} · ` : ''}สมาชิก {c.member_count}
                {c.is_private ? ' · ห้องส่วนตัว' : ''}
              </p>
            </div>
            {c.joined && <Badge variant="secondary">เข้าร่วมแล้ว</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DocumentList({ docs }: { docs: SearchDocument[] }) {
  const token = useAuthStore((s) => s.token)
  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li key={d.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-medium">{d.title}</p>
              {d.course && (
                <Badge variant="secondary" className="h-5 gap-1">
                  <Hash className="h-3 w-3" /> {d.course.code}
                </Badge>
              )}
              {d.similarity != null ? (
                <Badge variant="outline" className={cn('h-5', d.similarity >= 0.6 && 'border-primary text-primary')}>
                  ตรง {Math.round(d.similarity * 100)}%
                </Badge>
              ) : (
                <Badge variant="outline" className="h-5">ตรงชื่อ</Badge>
              )}
              {d.is_media && <Badge variant="outline" className="h-5">สื่อ</Badge>}
            </div>
            {d.snippet && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">…{d.snippet}…</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {d.owner.display_name || d.owner.username} · {formatBytes(d.size)} · {timeAgo(d.created_at)}
            </p>
          </div>
          {d.download_url && (
            <Button asChild variant="ghost" size="sm" className="h-8 px-2" aria-label="ดาวน์โหลด">
              <a href={libraryDownloadUrl(d, token) ?? '#'} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function UserList({ users }: { users: SearchUser[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((u) => (
        <li key={String(u.id)}>
          <Link href={`/community/profile/${u.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:bg-accent">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(u.display_name || u.username || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName(u)}</p>
              <p className="truncate text-xs text-muted-foreground">
                @{u.username} · {roleLabel(u.role)}
                {u.student_id ? ` · ${u.student_id}` : ''}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
