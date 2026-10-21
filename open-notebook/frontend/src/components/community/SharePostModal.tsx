'use client'

import { useState } from 'react'
import {
  Check,
  Eye,
  Globe2,
  Link2,
  LockKeyhole,
  MessageCircle,
  FileText,
  Play,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useSharePost, useCourses } from '@/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { displayName, formatBytes, roleLabel, timeAgo } from '@/lib/utils/community-format'
import type { CommunityPost } from '@/lib/api/community'
import { cn } from '@/lib/utils'

type ShareAudience = 'public' | 'course' | 'private'

interface SharePostModalProps {
  post: CommunityPost
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SharePostModal({ post, open, onOpenChange }: SharePostModalProps) {
  const user = useAuthStore((state) => state.user)
  const { data: courses = [] } = useCourses()
  const joinedCourses = courses.filter((course) => course.joined)
  const share = useSharePost()
  const [audience, setAudience] = useState<ShareAudience>('public')
  const [courseId, setCourseId] = useState('')
  const [caption, setCaption] = useState('')
  const url =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/community?post=${post.id}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      share.mutate(post.id)
    } catch {
      toast.error('คัดลอกลิงก์ไม่สำเร็จ')
    }
  }

  const submitShare = () => {
    if (audience === 'course' || audience === 'private') {
      toast.info(
        audience === 'course'
          ? 'ขณะนี้ยังไม่รองรับการแชร์โพสต์ลงวิชา'
          : 'ขณะนี้ยังไม่รองรับการส่งโพสต์ทางข้อความส่วนตัว'
      )
      return
    }

    if (caption.trim() && typeof navigator.share === 'function') {
      void navigator.share({ title: 'แชร์โพสต์', text: caption.trim(), url }).then(
        () => share.mutate(post.id, { onSuccess: () => onOpenChange(false) }),
        (error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          toast.error('แชร์โพสต์ไม่สำเร็จ')
        }
      )
      return
    }

    share.mutate(post.id, {
      onSuccess: () => onOpenChange(false),
    })
  }

  const chooseQuickAction = (nextAudience: ShareAudience) => {
    setAudience(nextAudience)
    if (nextAudience === 'public') {
      share.mutate(post.id, { onSuccess: () => onOpenChange(false) })
    } else {
      toast.info(
        nextAudience === 'course'
          ? 'ขณะนี้ยังไม่รองรับการแชร์โพสต์ลงวิชา'
          : 'ขณะนี้ยังไม่รองรับการส่งโพสต์ทางข้อความส่วนตัว'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="community-theme max-h-[min(92dvh,900px)] w-[calc(100%-1.25rem)] max-w-[520px] gap-0 overflow-hidden rounded-2xl border-pink-100 bg-white p-0 shadow-md dark:bg-card sm:w-[calc(100%-2rem)]"
      >
        <header className="relative flex items-center justify-center border-b border-pink-100 px-12 py-4">
          <DialogTitle className="text-base font-semibold">แชร์โพสต์</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="ปิดหน้าต่างแชร์โพสต์"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-pink-100 text-pink-600 hover:bg-pink-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="no-scrollbar max-h-[calc(min(92dvh,900px)-140px)] space-y-3 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Avatar size="sm" src={user?.avatar_url} name={displayName(user)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName(user)}</p>
              <p className="text-[11px] text-muted-foreground">กำลังแชร์โพสต์</p>
            </div>
            <Select value={audience} onValueChange={(value) => setAudience(value as ShareAudience)}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-pink-200 bg-pink-50 px-3 text-xs text-pink-700 shadow-none hover:bg-pink-100">
                <SelectValue>{audienceLabel(audience)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="community-theme">
                <SelectItem value="public"><Globe2 className="h-3.5 w-3.5" />สาธารณะ</SelectItem>
                <SelectItem value="course"><Users className="h-3.5 w-3.5" />ชั้นเรียนที่เลือก</SelectItem>
                <SelectItem value="private"><LockKeyhole className="h-3.5 w-3.5" />เฉพาะฉัน</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            role="tablist"
            aria-label="เลือกกลุ่มเป้าหมาย"
            className="grid grid-cols-3 rounded-xl border border-pink-100 bg-pink-50/70 p-1"
          >
            <AudienceButton
              active={audience === 'public'}
              onClick={() => setAudience('public')}
              icon={<Globe2 className="h-3.5 w-3.5" />}
            >
              สาธารณะ
            </AudienceButton>
            <AudienceButton
              active={audience === 'course'}
              onClick={() => setAudience('course')}
              icon={<Users className="h-3.5 w-3.5" />}
            >
              ชั้นเรียนที่เลือก
            </AudienceButton>
            <AudienceButton
              active={audience === 'private'}
              onClick={() => setAudience('private')}
              icon={<LockKeyhole className="h-3.5 w-3.5" />}
            >
              เฉพาะฉัน
            </AudienceButton>
          </div>

          {audience === 'course' && (
            <select
              aria-label="เลือกชั้นเรียนหรือวิชา"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="h-9 w-full rounded-xl border border-pink-100 bg-white px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">เลือกชั้นเรียนหรือวิชา</option>
              {joinedCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code ? `${course.code} · ${course.name}` : course.name}
                </option>
              ))}
            </select>
          )}
          {(audience === 'course' || audience === 'private') && (
            <p className="text-[11px] text-amber-700">
              {audience === 'course'
                ? 'เลือกชั้นเรียนได้ แต่การเผยแพร่ไปยังชั้นเรียนยังไม่รองรับในขณะนี้'
                : 'การบันทึกโพสต์ส่วนตัวจากหน้าต่างนี้ยังไม่รองรับ'}
            </p>
          )}

          <Textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="พูดอะไรเกี่ยวกับโพสต์นี้..."
            rows={2}
            maxLength={2000}
            className="min-h-20 resize-none rounded-xl border-pink-100 bg-[#F7F7F9] text-sm shadow-none focus-visible:ring-pink-300"
          />

          <OriginalPostPreview post={post} />

          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">ตัวเลือกแชร์เร็ว</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                icon={<Sparkles className="h-4 w-4" />}
                active={audience === 'public'}
                onClick={() => chooseQuickAction('public')}
              >
                แชร์ไปที่ฟีดตอนนี้
              </QuickAction>
              <QuickAction
                icon={<Eye className="h-4 w-4" />}
                active={audience === 'course'}
                onClick={() => chooseQuickAction('course')}
              >
                แชร์ไปชั้นเรียน/วิชา
              </QuickAction>
              <QuickAction
                icon={<Link2 className="h-4 w-4" />}
                onClick={() => void copyLink()}
              >
                คัดลอกลิงก์
              </QuickAction>
              <QuickAction
                icon={<MessageCircle className="h-4 w-4" />}
                active={audience === 'private'}
                onClick={() => chooseQuickAction('private')}
              >
                ส่งข้อความส่วนตัว
              </QuickAction>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            การแชร์จะนับในโพสต์ต้นฉบับและแสดงลิงก์ให้ผู้รับเปิดดู
            {caption.trim()
              ? typeof navigator !== 'undefined' && typeof navigator.share === 'function'
                ? ' · ข้อความแนะนำจะถูกแนบไปกับหน้าต่างแชร์ของอุปกรณ์'
                : ' · ระบบนี้ยังไม่มีช่องทางส่งข้อความพร้อมลิงก์'
              : ''}
          </p>

          <Button
            type="button"
            disabled={share.isPending}
            onClick={submitShare}
            className="h-10 w-full rounded-xl bg-pink-500 text-sm font-semibold text-white hover:bg-pink-600"
          >
            <Send className="mr-2 h-4 w-4" />
            {share.isPending ? 'กำลังแชร์…' : 'แชร์เลย'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function audienceLabel(audience: ShareAudience) {
  if (audience === 'course') return 'ชั้นเรียนที่เลือก'
  if (audience === 'private') return 'เฉพาะฉัน'
  return 'สาธารณะ'
}

function AudienceButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex min-h-9 items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1.5 sm:px-2 sm:text-xs',
        active
          ? 'bg-pink-200 text-pink-800 shadow-sm'
          : 'text-muted-foreground hover:bg-white/80 hover:text-foreground'
      )}
    >
      {active ? <Check className="h-3 w-3 shrink-0" /> : icon}
      <span className="truncate">{children}</span>
    </button>
  )
}

function QuickAction({
  icon,
  active = false,
  children,
  onClick,
}: {
  icon: React.ReactNode
  active?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-10 items-center gap-2 rounded-xl border border-pink-100 px-3 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-pink-200 text-pink-800 hover:bg-pink-300'
          : 'bg-pink-50/60 text-foreground hover:bg-pink-100'
      )}
    >
      <span className="shrink-0 text-pink-600">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}

function OriginalPostPreview({ post }: { post: CommunityPost }) {
  return (
    <article className="space-y-3 rounded-2xl border border-pink-100 bg-[#FFF7F9] p-3">
      <div className="flex items-start gap-2.5">
        <Avatar size="sm" src={post.author.avatar_url} name={displayName(post.author)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold">{displayName(post.author)}</p>
            {post.author.role && post.author.role !== 'student' && (
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[9px] text-pink-800">
                {roleLabel(post.author.role)}
              </span>
            )}
            {post.course && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] text-violet-800">
                {post.course.code || post.course.name}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{timeAgo(post.created_at)}</p>
        </div>
      </div>
      {post.title && <h4 className="text-xs font-semibold">{post.title}</h4>}
      {post.content && (
        <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
          {post.content}
        </p>
      )}
      {post.attachment && (
        <div className="flex items-center gap-2.5 rounded-xl border border-pink-100 bg-white p-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-pink-600">
            {post.attachment.mime?.startsWith('video/') ? (
              <Play className="h-4 w-4" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{post.attachment.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {post.attachment.mime || 'ไฟล์แนบ'} · {formatBytes(post.attachment.size)}
            </span>
          </span>
        </div>
      )}
      {post.embed?.type === 'quiz' && (
        <p className="rounded-lg border border-pink-100 bg-white px-3 py-2 text-xs text-muted-foreground">
          แบบทดสอบ · {post.embed.question_count} ข้อ
        </p>
      )}
      {post.embed?.type === 'roadmap' && (
        <p className="rounded-lg border border-pink-100 bg-white px-3 py-2 text-xs text-muted-foreground">
          {post.embed.title || 'แผนการเรียน'} · {post.embed.nodes.length} หัวข้อ
        </p>
      )}
    </article>
  )
}
