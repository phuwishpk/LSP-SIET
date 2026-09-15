'use client'

import { useState } from 'react'
import {
  Bookmark,
  Download,
  FileText,
  Hash,
  Heart,
  HelpCircle,
  Library,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Share2,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { communityApi, type CommunityPost } from '@/lib/api/community'
import {
  useAddComment,
  useComments,
  useDeletePost,
  useEditPost,
  useReact,
  useSharePost,
  useToggleSave,
} from '@/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { displayName, formatBytes, roleLabel, timeAgo } from '@/lib/utils/community-format'
import { QuizEmbed } from './QuizEmbed'
import { RoadmapEmbed } from './RoadmapEmbed'
import { cn } from '@/lib/utils'

const TYPE_META: Record<CommunityPost['type'], { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  summary: { label: 'สรุปบทเรียน', icon: FileText, className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' },
  quiz: { label: 'AI Quiz', icon: FileText, className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' },
  roadmap: { label: 'AI Roadmap', icon: FileText, className: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200' },
  question: { label: 'คำถาม', icon: HelpCircle, className: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200' },
  material: { label: 'สื่อการสอน', icon: Library, className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200' },
}

interface PostCardProps {
  post: CommunityPost
  onSelectCourse?: (courseId: number) => void
}

export function PostCard({ post, onSelectCourse }: PostCardProps) {
  const me = useAuthStore((s) => s.user)
  const react = useReact()
  const save = useToggleSave()
  const share = useSharePost()
  const remove = useDeletePost()
  const edit = useEditPost()
  const addComment = useAddComment()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(post.title ?? '')
  const [draftContent, setDraftContent] = useState(post.content ?? '')
  const [showComments, setShowComments] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [comment, setComment] = useState('')
  const { data: comments, isLoading: loadingComments } = useComments(post.id, showComments)

  const meta = TYPE_META[post.type] ?? TYPE_META.summary
  const canDelete = post.is_author || me?.role === 'admin'
  const canEdit = canDelete
  const content = post.content || ''
  const isLong = content.length > 320
  const shownContent = isLong && !expanded ? `${content.slice(0, 320)}…` : content

  const download = async () => {
    try {
      const blob = await communityApi.downloadAttachment(post.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = post.attachment?.name || 'attachment'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      toast.error('ดาวน์โหลดไฟล์ไม่สำเร็จ')
    }
  }

  const copyLink = async () => {
    const url = `${window.location.origin}/community?post=${post.id}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* clipboard may be unavailable */
    }
    share.mutate(post.id)
  }

  return (
    <Card id={`post-${post.id}`} className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar src={post.author.avatar_url} name={displayName(post.author)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{displayName(post.author)}</span>
              {post.author.role && post.author.role !== 'student' && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {roleLabel(post.author.role)}
                </Badge>
              )}
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.className)}>
                {meta.label}
              </span>
              {post.course && (
                <button
                  type="button"
                  onClick={() => post.course && onSelectCourse?.(post.course.id)}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                >
                  {post.course.kind === 'club' ? (
                    <MessagesSquare className="h-3 w-3" />
                  ) : (
                    <Hash className="h-3 w-3" />
                  )}
                  {post.course.kind === 'club'
                    ? post.course.name
                    : `${post.course.code ?? ''} ${post.course.name ?? ''}`.trim()}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyLink}>
                <Share2 className="mr-2 h-4 w-4" /> คัดลอกลิงก์โพสต์
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem
                  onClick={() => {
                    setDraftTitle(post.title ?? '')
                    setDraftContent(post.content ?? '')
                    setEditing(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> แก้ไขโพสต์
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-rose-600"
                  onClick={() => {
                    if (window.confirm('ลบโพสต์นี้?')) remove.mutate(post.id)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> ลบโพสต์
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {editing ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="หัวข้อโพสต์"
              maxLength={200}
            />
            <Textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={4}
              placeholder="เนื้อหา… เพิ่มรายละเอียดให้สมบูรณ์ขึ้นได้แต้มเล็กน้อย"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
              <Button
                size="sm"
                disabled={edit.isPending}
                onClick={() =>
                  edit.mutate(
                    { postId: post.id, title: draftTitle, content: draftContent },
                    { onSuccess: () => setEditing(false) }
                  )
                }
              >
                {edit.isPending ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
              </Button>
            </div>
          </div>
        ) : null}
        {!editing && post.title && (
          <h3 className="text-base font-semibold leading-snug">{post.title}</h3>
        )}
        {!editing && content && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {shownContent}
            {isLong && (
              <button
                type="button"
                className="ml-1 text-xs text-primary hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'ย่อ' : 'อ่านเพิ่มเติม'}
              </button>
            )}
          </p>
        )}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <span key={tag} className="text-xs text-primary">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {post.attachment && (
          <button
            type="button"
            onClick={download}
            className="flex w-full items-center gap-3 rounded-lg border bg-muted/40 p-3 text-left transition hover:bg-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950/40">
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{post.attachment.name}</span>
              <span className="block text-xs text-muted-foreground">
                {formatBytes(post.attachment.size)} · กดเพื่อดาวน์โหลด
              </span>
            </span>
            <Download className="h-4 w-4 text-muted-foreground" />
          </button>
        )}

        {post.embed?.type === 'quiz' && <QuizEmbed post={post} embed={post.embed} />}
        {post.embed?.type === 'roadmap' && <RoadmapEmbed post={post} embed={post.embed} />}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {post.counts.like > 0 && `❤️ ${post.counts.like}  `}
            {post.counts.helpful > 0 && `👍 Helpful ${post.counts.helpful}`}
          </span>
          <span>
            {post.counts.comment > 0 && `${post.counts.comment} ความคิดเห็น`}
            {post.counts.share > 0 && ` · แชร์ ${post.counts.share}`}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1 border-t pt-2">
          <ActionButton
            active={post.viewer.liked}
            icon={Heart}
            label="ถูกใจ"
            activeClass="text-rose-600"
            onClick={() => react.mutate({ postId: post.id, kind: 'like' })}
          />
          <ActionButton
            active={post.viewer.helpful}
            icon={ThumbsUp}
            label="Helpful"
            activeClass="text-emerald-600"
            onClick={() => react.mutate({ postId: post.id, kind: 'helpful' })}
          />
          <ActionButton
            active={showComments}
            icon={MessageCircle}
            label="คอมเมนต์"
            activeClass="text-primary"
            onClick={() => setShowComments((v) => !v)}
          />
          <ActionButton
            active={post.viewer.saved}
            icon={Bookmark}
            label="บันทึก"
            activeClass="text-amber-600"
            onClick={() => save.mutate(post.id)}
          />
          <ActionButton
            active={post.viewer.shared}
            icon={Share2}
            label={post.viewer.shared ? 'แชร์แล้ว' : 'แชร์'}
            activeClass="text-sky-600"
            onClick={copyLink}
          />
        </div>

        {showComments && (
          <div className="space-y-3 border-t pt-3">
            {loadingComments && <p className="text-xs text-muted-foreground">กำลังโหลด…</p>}
            {comments?.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <Avatar size="sm" src={c.author.avatar_url} name={displayName(c.author)} />
                <div className="min-w-0 flex-1 rounded-2xl bg-muted px-3 py-2">
                  <p className="text-xs font-semibold">
                    {displayName(c.author)}{' '}
                    <span className="font-normal text-muted-foreground">· {timeAgo(c.created_at)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{c.content}</p>
                </div>
              </div>
            ))}
            {!loadingComments && (comments?.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground">ยังไม่มีความคิดเห็น เป็นคนแรกที่ตอบ!</p>
            )}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!comment.trim()) return
                addComment.mutate(
                  { postId: post.id, content: comment.trim() },
                  { onSuccess: () => setComment('') }
                )
              }}
            >
              <Avatar size="sm" src={me?.avatar_url} name={displayName(me)} />
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="เขียนความคิดเห็น…"
                className="h-9 rounded-full"
              />
              <Button type="submit" size="sm" disabled={!comment.trim() || addComment.isPending}>
                ส่ง
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActionButton({
  active,
  icon: Icon,
  label,
  activeClass,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  activeClass: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition hover:bg-accent',
        active ? activeClass : 'text-muted-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4', active && 'fill-current')} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
