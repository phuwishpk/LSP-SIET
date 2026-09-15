'use client'

/**
 * Content moderation.
 *
 * Deleting a post was always possible, but only by scrolling the feed until you
 * found it. This lists every post in the workspace — including the ones already
 * hidden, because a deletion here is a flag, not a drop, and can be undone.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useDebounce } from 'use-debounce'
import { ExternalLink, Eye, EyeOff, Paperclip, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminPosts, useModeratePost } from '@/lib/hooks/use-admin'
import { displayName, kindLabel, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

const TYPES = [
  { value: '', label: 'ทุกชนิด' },
  { value: 'summary', label: 'สรุป' },
  { value: 'question', label: 'คำถาม' },
  { value: 'quiz', label: 'ควิซ' },
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'material', label: 'สื่อการสอน' },
]

export function ModerationPanel() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [type, setType] = useState('')
  const [state, setState] = useState<'visible' | 'deleted' | 'all'>('visible')
  const [offset, setOffset] = useState(0)
  const { data, isLoading } = useAdminPosts({ q: debounced, type, state, offset })
  const moderate = useModeratePost()

  const pages = Math.ceil((data?.total ?? 0) / 25)
  const page = Math.floor(offset / 25)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">เนื้อหาในระบบ</CardTitle>
        <CardDescription>
          {data ? `${data.total} โพสต์ · ` : ''}
          ซ่อนโพสต์ที่ผิดกฎได้จากที่นี่ · โพสต์ที่ซ่อนไว้ยังอยู่ในฐานข้อมูลและกู้คืนได้
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOffset(0)
              }}
              placeholder="ค้นหัวข้อ เนื้อหา หรือชื่อผู้เขียน"
              className="pl-9"
            />
          </div>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setOffset(0)
            }}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex rounded-md border p-0.5">
            {(['visible', 'deleted', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setState(s)
                  setOffset(0)
                }}
                className={cn(
                  'rounded px-2.5 py-1 text-xs transition',
                  state === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}
              >
                {s === 'visible' ? 'แสดงอยู่' : s === 'deleted' ? 'ซ่อนไว้' : 'ทั้งหมด'}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            ไม่พบโพสต์ที่ตรงกับเงื่อนไข
          </p>
        )}

        <div className="divide-y rounded-lg border">
          {data?.items.map((post) => (
            <div
              key={post.id}
              className={cn('flex flex-wrap items-start gap-3 p-3', post.is_deleted && 'bg-muted/40')}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {kindLabel(post.type)}
                  </Badge>
                  <span className={cn('truncate text-sm font-medium', post.is_deleted && 'line-through opacity-70')}>
                    {post.title || '(ไม่มีหัวข้อ)'}
                  </span>
                  {post.is_deleted && (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <EyeOff className="h-3 w-3" /> ซ่อนอยู่
                    </Badge>
                  )}
                  {post.has_attachment && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {displayName(post.author)} (@{post.author.username}) · {timeAgo(post.created_at)}
                  {post.course ? ` · ${post.course.kind === 'club' ? post.course.name : post.course.code}` : ''}
                  {' · '}❤️ {post.counts.like} 💬 {post.counts.comment} 🔁 {post.counts.share}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="sm" className="h-8 px-2" aria-label="เปิดโพสต์">
                  <Link href={`/community?post=${post.id}`} target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                {post.is_deleted ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    disabled={moderate.isPending}
                    onClick={() => moderate.mutate({ id: post.id, action: 'restore' })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> กู้คืน
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={moderate.isPending}
                    onClick={() => moderate.mutate({ id: post.id, action: 'delete' })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> ซ่อน
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setOffset(offset - 25)}>
              ก่อนหน้า
            </Button>
            <span className="text-muted-foreground">
              หน้า {page + 1} จาก {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setOffset(offset + 25)}
            >
              ถัดไป
            </Button>
          </div>
        )}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Eye className="h-3 w-3" /> การซ่อนโพสต์ไม่ได้ลบข้อมูลจริง เปลี่ยนแค่ธง `is_deleted` เท่านั้น
        </p>
      </CardContent>
    </Card>
  )
}
