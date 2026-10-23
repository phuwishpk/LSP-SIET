'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  Share2,
  Smile,
  ThumbsUp,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@siet/platform/components/ui/avatar'
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
import { communityApi, type CommunityPost, type PostComment } from '@siet/platform/lib/api/community'
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useReact,
  useSharePost,
} from '@siet/platform/lib/hooks/use-community'
import { useAuthStore } from '@/lib/stores/auth-store'
import { displayName, formatBytes, roleLabel, timeAgo } from '@siet/platform/lib/utils/community-format'
import { cn } from '@/lib/utils'
import { QuizEmbed } from './QuizEmbed'
import { RoadmapEmbed } from './RoadmapEmbed'

interface PostDetailModalProps {
  post: CommunityPost
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CommentSort = 'newest' | 'oldest'

export function PostDetailModal({ post, open, onOpenChange }: PostDetailModalProps) {
  const me = useAuthStore((state) => state.user)
  const { data: comments, isLoading, isError } = useComments(post.id, open)
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const react = useReact()
  const share = useSharePost()
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<CommentSort>('newest')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const canDelete = (comment: PostComment) =>
    comment.can_delete || String(comment.author_id) === String(me?.id)
  const isVideo = Boolean(post.attachment?.mime?.startsWith('video/'))

  useEffect(() => {
    if (!open || !isVideo) return
    let objectUrl: string | null = null
    let cancelled = false

    communityApi.downloadAttachment(post.id).then(
      (blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setVideoUrl(objectUrl)
      },
      () => {
        if (!cancelled) {
          setVideoError(true)
          toast.error('โหลดตัวอย่างวิดีโอไม่สำเร็จ')
        }
      }
    )

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setVideoUrl(null)
      setVideoError(false)
      setVideoPlaying(false)
    }
  }, [isVideo, open, post.id])

  const commentTree = useMemo(() => {
    const ordered = [...(comments ?? [])].sort((a, b) =>
      sort === 'newest'
        ? b.id - a.id
        : a.id - b.id
    )
    const roots = ordered.filter((comment) => !comment.parent_id)
    const replies = new Map<number, PostComment[]>()
    ordered.forEach((comment) => {
      if (!comment.parent_id) return
      const children = replies.get(comment.parent_id) ?? []
      children.push(comment)
      replies.set(comment.parent_id, children)
    })
    return { roots, replies }
  }, [comments, sort])

  const submitComment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return
    addComment.mutate(
      {
        postId: post.id,
        content,
        parentId: replyTo?.id,
      },
      {
        onSuccess: () => {
          setDraft('')
          setReplyTo(null)
          setExpandedReplies((current) => {
            if (!replyTo) return current
            const next = new Set(current)
            next.add(replyTo.id)
            return next
          })
        },
      }
    )
  }

  const insertEmoji = (emoji: string) => {
    setDraft((current) => `${current}${emoji}`)
    setEmojiOpen(false)
    inputRef.current?.focus()
  }

  const beginReply = (comment: PostComment) => {
    setReplyTo(comment)
    setDraft('')
    inputRef.current?.focus()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/community?post=${post.id}`)
    } catch {
      toast.info('ไม่สามารถคัดลอกลิงก์ได้')
    }
    share.mutate(post.id)
  }

  const deleteCommentById = (comment: PostComment) => {
    if (!window.confirm('ลบความคิดเห็นนี้? การลบย้อนกลับไม่ได้')) return
    deleteComment.mutate({ postId: post.id, commentId: comment.id })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="community-theme mx-auto flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-3xl border-pink-100 bg-white p-0 shadow-md dark:bg-card sm:max-w-xl md:max-w-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-pink-100 px-5 py-4">
          <DialogTitle className="text-base font-semibold">โพสต์ของผู้ใช้</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground"
            aria-label="ปิดรายละเอียดโพสต์"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <article className="space-y-3 px-5 pb-4 pt-4">
            <div className="flex items-start gap-3">
              <Avatar
                src={post.author.avatar_url}
                name={displayName(post.author)}
                className="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{displayName(post.author)}</span>
                  {post.course && (
                    <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-800 dark:bg-pink-950/50 dark:text-pink-200">
                      {post.course.code
                        ? `${post.course.code} · ${post.course.name ?? ''}`
                        : post.course.name}
                    </span>
                  )}
                  {!post.course && post.author.role && post.author.role !== 'student' && (
                    <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-800 dark:bg-pink-950/50 dark:text-pink-200">
                      {roleLabel(post.author.role)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(post.created_at)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground"
                aria-label="คัดลอกลิงก์โพสต์"
                onClick={copyLink}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {post.title && <h2 className="text-sm font-semibold">{post.title}</h2>}
            {post.content && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>
            )}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {post.tags.map((tag) => (
                  <span key={tag} className="text-xs text-primary">#{tag}</span>
                ))}
              </div>
            )}

            {post.attachment && (
              isVideo ? (
                <div className="overflow-hidden rounded-xl border border-pink-100 bg-[#FFF5F8] dark:border-pink-900/40 dark:bg-pink-950/20">
                  <div className="relative flex aspect-video items-center justify-center bg-slate-900">
                    {videoUrl && !videoError ? (
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        controls
                        preload="metadata"
                        className="h-full w-full"
                        onPlay={() => setVideoPlaying(true)}
                        onPause={() => setVideoPlaying(false)}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-white/70">
                        {videoError ? (
                          <p className="text-xs">ไม่สามารถโหลดตัวอย่างวิดีโอได้</p>
                        ) : (
                          <span className="animate-pulse text-xs">กำลังโหลดวิดีโอ…</span>
                        )}
                      </div>
                    )}
                    {videoUrl && !videoError && !videoPlaying && (
                      <button
                        type="button"
                        aria-label="เล่นวิดีโอ"
                        className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transition hover:scale-105 hover:bg-pink-600"
                        onClick={() => void videoRef.current?.play()}
                      >
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </button>
                    )}
                  </div>
                  <p className="truncate px-3 py-2 text-xs text-muted-foreground">
                    {post.attachment.name} · {formatBytes(post.attachment.size)}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-pink-100 bg-[#FFF5F8] p-3 text-left transition-colors hover:bg-pink-50 dark:border-pink-900/40 dark:bg-pink-950/20 dark:hover:bg-pink-950/40"
                  onClick={() => void communityApi.downloadAttachment(post.id).then(
                    (blob) => {
                      const url = URL.createObjectURL(blob)
                      const anchor = document.createElement('a')
                      anchor.href = url
                      anchor.download = post.attachment?.name ?? 'attachment'
                      anchor.click()
                      URL.revokeObjectURL(url)
                    },
                    () => toast.error('ดาวน์โหลดไฟล์ไม่สำเร็จ')
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-pink-500 dark:bg-pink-950/50 dark:text-pink-300">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{post.attachment.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {post.attachment.mime?.includes('pdf')
                        ? 'PDF'
                        : post.attachment.mime ?? 'ไฟล์แนบ'}{' '}
                      · {formatBytes(post.attachment.size)} · กดเพื่อดาวน์โหลด
                    </span>
                  </span>
                </button>
              )
            )}
            {post.embed?.type === 'quiz' && <QuizEmbed post={post} embed={post.embed} />}
            {post.embed?.type === 'roadmap' && <RoadmapEmbed post={post} embed={post.embed} />}
          </article>

          <div className="flex items-center justify-between border-y border-pink-100 px-5 py-3 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => react.mutate({ postId: post.id, kind: 'like' })}
              className={cn(
                'inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-pink-100 dark:bg-pink-950/30 dark:hover:bg-pink-950/50',
                post.viewer.liked && 'text-pink-600'
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>{post.counts.like}</span>
              <span>ถูกใจ</span>
            </button>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" />
                ความคิดเห็น {comments?.length ?? post.counts.comment}
              </span>
              <button type="button" onClick={copyLink} className="flex items-center gap-1 hover:text-primary">
                <Share2 className="h-3.5 w-3.5" /> แชร์ {post.counts.share}
              </button>
            </div>
          </div>

          <section aria-label="ความคิดเห็น" className="px-5 pb-4 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">ความคิดเห็น · {comments?.length ?? post.counts.comment}</h3>
              <Select value={sort} onValueChange={(value) => setSort(value as CommentSort)}>
                <SelectTrigger className="h-8 w-[150px] border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="community-theme">
                  <SelectItem value="newest">ใหม่ที่สุด</SelectItem>
                  <SelectItem value="oldest">เก่าที่สุด</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading && <p className="py-4 text-center text-xs text-muted-foreground">กำลังโหลดความคิดเห็น…</p>}
            {isError && (
              <p className="py-4 text-center text-xs text-destructive">
                โหลดความคิดเห็นไม่สำเร็จ ลองปิดแล้วเปิดโพสต์อีกครั้ง
              </p>
            )}
            {!isLoading && !isError && commentTree.roots.length === 0 && (
              <p className="py-5 text-center text-xs text-muted-foreground">ยังไม่มีความคิดเห็น เป็นคนแรกที่แสดงความคิดเห็น</p>
            )}
            <div className="space-y-4">
              {commentTree.roots.map((comment) => {
                const replies = commentTree.replies.get(comment.id) ?? []
                const repliesVisible = expandedReplies.has(comment.id)
                return (
                  <div key={comment.id} className="group">
                    <CommentRow
                      comment={comment}
                      canDelete={canDelete(comment)}
                      deleting={deleteComment.isPending}
                      onReply={() => beginReply(comment)}
                      onDelete={() => deleteCommentById(comment)}
                    />
                    {replies.length > 0 && (
                      <div className="ml-10 mt-2">
                        <button
                          type="button"
                          aria-expanded={repliesVisible}
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => setExpandedReplies((current) => {
                            const next = new Set(current)
                            if (next.has(comment.id)) next.delete(comment.id)
                            else next.add(comment.id)
                            return next
                          })}
                        >
                          ↳ {repliesVisible ? 'ซ่อนการตอบกลับ' : `ดูการตอบกลับ ${replies.length}`}
                        </button>
                        {repliesVisible && (
                          <div className="mt-3 space-y-3 border-l-2 border-pink-100 pl-3">
                            {replies.map((reply) => (
                              <CommentRow
                                key={reply.id}
                                comment={reply}
                                canDelete={canDelete(reply)}
                                deleting={deleteComment.isPending}
                                onReply={() => beginReply(comment)}
                                onDelete={() => deleteCommentById(reply)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <form
          onSubmit={submitComment}
          className="relative flex shrink-0 items-end gap-2 border-t border-pink-100 bg-white px-4 py-3 dark:bg-card sm:px-5"
        >
          <Avatar size="sm" src={me?.avatar_url} name={displayName(me)} className="mb-1" />
          <div className="relative min-w-0 flex-1">
            {replyTo && (
              <div className="mb-1 flex items-center justify-between px-2 text-[11px] text-muted-foreground">
                <span>กำลังตอบกลับ {displayName(replyTo.author)}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="hover:text-foreground">
                  ยกเลิก
                </button>
              </div>
            )}
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={replyTo ? `ตอบกลับ ${displayName(replyTo.author)}…` : 'เขียนความคิดเห็น…'}
              rows={1}
              maxLength={4000}
              className="min-h-10 resize-none rounded-2xl border-0 bg-muted/70 py-2.5 pr-12 text-sm shadow-none focus-visible:ring-1"
            />
            <div className="absolute bottom-1.5 right-2 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-muted-foreground"
                aria-label="เพิ่มอีโมจิ"
                onClick={() => setEmojiOpen((value) => !value)}
              >
                <Smile className="h-4 w-4" />
              </Button>
            </div>
            {emojiOpen && (
              <div className="absolute bottom-12 right-0 z-10 flex gap-1 rounded-xl border bg-card p-2 shadow-lg">
                {['❤️', '👍', '🎉', '😊', '🙏'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="rounded-md p-1.5 hover:bg-muted"
                    aria-label={`เพิ่ม ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || addComment.isPending}
            aria-label="ส่งความคิดเห็น"
            className="mb-0.5 h-10 w-10 shrink-0 rounded-full bg-pink-500 text-white hover:bg-pink-600"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CommentRow({
  comment,
  canDelete,
  deleting,
  onReply,
  onDelete,
}: {
  comment: PostComment
  canDelete: boolean
  deleting: boolean
  onReply: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-start gap-2.5">
      <Avatar size="sm" src={comment.author.avatar_url} name={displayName(comment.author)} />
      <div className="min-w-0 flex-1">
        <div className="max-w-full rounded-2xl bg-[#F6F6F8] px-3 py-2 dark:bg-muted">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-semibold">{displayName(comment.author)}</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{comment.content}</p>
        </div>
        <div className="mt-1 flex items-center gap-3 pl-2">
          <button type="button" onClick={onReply} className="text-[11px] font-medium text-muted-foreground hover:text-primary">
            ตอบกลับ
          </button>
          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="text-[11px] text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
            >
              ลบ
            </button>
          )}
          <MoreHorizontal className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>
      </div>
    </div>
  )
}
