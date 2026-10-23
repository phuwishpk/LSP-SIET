'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Check, Download, FileText, Play, Video } from 'lucide-react'
import { Avatar } from '@siet/platform/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import { communityApi, type CommunityPost, type Course } from '@siet/platform/lib/api/community'
import { useToggleSave } from '@siet/platform/lib/hooks/use-community'
import { displayName, formatBytes, roomLabel, timeAgo } from '@siet/platform/lib/utils/community-format'
import { toast } from 'sonner'

interface InstructorMediaViewProps {
  posts: CommunityPost[]
  courses: Course[]
  courseId: number | null
  isLoading: boolean
  isError: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onSelectCourse: (courseId: number | null) => void
  onLoadMore: () => void
}

export function InstructorMediaView({
  posts,
  courses,
  courseId,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onSelectCourse,
  onLoadMore,
}: InstructorMediaViewProps) {
  const courseOptions = courses.filter((course) => course.kind !== 'club')

  return (
    <div className="space-y-4">
      {/* MERGE-OWNER (undecided, Poh #4 vs SpriteUm 254a779): kept staging's version (Poh's community redesign).
      SpriteUm's version, to swap in if SpriteUm owns this:
        <Card className="rounded-2xl border border-rose-100/90 bg-gradient-to-r from-rose-50/80 via-pink-50/50 to-rose-50/30 shadow-2xs dark:border-rose-950/40 dark:bg-pink-950/20">
        <CardContent className="space-y-1 p-4">
        <h1 className="text-lg font-semibold tracking-tight">สื่อการสอน</h1>
        <p className="text-xs text-muted-foreground">
        ไฟล์สไลด์และการบันทึกเรียนที่อาจารย์ประจำวิชาแบ่งปัน
        </p>
        </CardContent>
        </Card>
      */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">สื่อการสอน</h1>
        <p className="text-xs text-muted-foreground">
          ไฟล์สไลด์และการบันทึกเรียนที่อาจารย์ประจำวิชาแบ่งปัน
        </p>
      </div>

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={courseId === null ? 'default' : 'outline'}
          className={`shrink-0 rounded-full ${courseId === null ? 'bg-rose-600 text-white hover:bg-rose-700' : 'border-pink-100'}`}
          onClick={() => onSelectCourse(null)}
        >
          ทุกวิชา
        </Button>
        {courseOptions.map((course) => (
          <Button
            key={course.id}
            size="sm"
            variant={courseId === course.id ? 'default' : 'outline'}
            className={`shrink-0 rounded-full ${courseId === course.id ? 'bg-rose-600 text-white hover:bg-rose-700' : 'border-pink-100'}`}
            onClick={() => onSelectCourse(course.id)}
          >
            {roomLabel(course)}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="h-52 w-full rounded-2xl" />
        </div>
      )}
      {isError && (
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            โหลดสื่อการสอนไม่สำเร็จ ลองรีเฟรชอีกครั้ง
          </CardContent>
        </Card>
      )}
      {!isLoading && !isError && posts.length === 0 && (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8" />
            ยังไม่มีสื่อการสอนในวิชานี้
          </CardContent>
        </Card>
      )}
      {!isLoading &&
        !isError &&
        posts.map((post) => <MediaCard key={post.id} post={post} />)}
      {!isLoading && !isError && hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดสื่อเพิ่มเติม'}
          </Button>
        </div>
      )}
    </div>
  )
}

function MediaCard({ post }: { post: CommunityPost }) {
  const save = useToggleSave()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoDuration, setVideoDuration] = useState<string | null>(null)
  const isVideo =
    post.attachment?.mime?.startsWith('video/') ??
    /\.(mp4|webm|mov|m4v)$/i.test(post.attachment?.name ?? '')
  const authorName = displayName(post.author)

  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    },
    [videoUrl]
  )

  const download = async () => {
    if (!post.attachment) return
    try {
      const blob = await communityApi.downloadAttachment(post.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = post.attachment.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      toast.error('ดาวน์โหลดไฟล์ไม่สำเร็จ')
    }
  }

  const playVideo = async () => {
    if (videoUrl) return
    setVideoLoading(true)
    try {
      const blob = await communityApi.downloadAttachment(post.id)
      setVideoUrl(URL.createObjectURL(blob))
    } catch {
      toast.error('เปิดวิดีโอไม่สำเร็จ')
    } finally {
      setVideoLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-pink-100 bg-white shadow-sm dark:bg-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Link
            href={`/community/profile/${post.author.id}`}
            aria-label={`ดูโปรไฟล์ ${authorName}`}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar src={post.author.avatar_url} name={authorName} size="sm" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/community/profile/${post.author.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold hover:text-pink-700"
            >
              <span className="truncate">{authorName}</span>
              {(post.author.role === 'teacher' || post.author.role === 'admin') && (
                <span
                  aria-label="ผู้สอนที่ยืนยันแล้ว"
                  className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300"
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {post.author.role === 'teacher' || post.author.role === 'admin'
                ? 'อาจารย์ประจำวิชา'
                : 'ผู้แบ่งปันสื่อ'}
              {' · '}
              {timeAgo(post.created_at)}
            </p>
          </div>
          {post.course && (
            <span className="max-w-[45%] truncate rounded-full bg-pink-100 px-2 py-1 text-xs font-medium text-pink-800 dark:bg-pink-950/50 dark:text-pink-200">
              {`${post.course.code ?? ''} ${post.course.name ?? ''}`.trim()}
            </span>
          )}
        </div>

        {post.title && <h2 className="text-sm font-semibold">{post.title}</h2>}
        {post.content && <p className="whitespace-pre-wrap text-xs leading-relaxed">{post.content}</p>}

        {post.attachment && isVideo ? (
          <div className="overflow-hidden rounded-xl bg-pink-50 dark:bg-pink-950/20">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                onLoadedMetadata={(event) => {
                  const seconds = Math.floor(event.currentTarget.duration)
                  if (!Number.isFinite(seconds)) return
                  setVideoDuration(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
                }}
                className="aspect-video w-full bg-black"
              />
            ) : (
              <button
                type="button"
                onClick={() => void playVideo()}
                disabled={videoLoading}
                aria-label={`เล่นวิดีโอ ${post.attachment.name}`}
                className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-pink-700 transition-colors hover:bg-pink-100/70 disabled:opacity-60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-pink-600 shadow-sm">
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
                <span className="max-w-[85%] truncate text-xs font-medium">
                  {videoLoading ? 'กำลังโหลดวิดีโอ…' : post.title || post.attachment.name}
                </span>
              </button>
            )}
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1 truncate">
                <Video className="h-3 w-3 shrink-0" /> {post.attachment.name}
              </span>
              <span className="shrink-0">
                {videoDuration ?? formatBytes(post.attachment.size)}
              </span>
            </div>
          </div>
        ) : post.attachment ? (
          <div className="flex items-center gap-3 rounded-xl bg-pink-50 p-3 dark:bg-pink-950/20">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-pink-600 dark:bg-pink-950/50 dark:text-pink-300">
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{post.attachment.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {post.attachment.mime || 'ไฟล์แนบ'}{post.attachment.size ? ` · ${formatBytes(post.attachment.size)}` : ''}
              </span>
            </span>
          </div>
        ) : null}

        {post.attachment && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void download()}
              className="h-8 rounded-full bg-pink-600 text-xs text-white hover:bg-pink-700"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> ดาวน์โหลด
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate(post.id)}
              className="h-8 rounded-full border-pink-100 text-xs"
            >
              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
              {post.viewer.saved ? 'บันทึกแล้ว' : 'บันทึก'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
