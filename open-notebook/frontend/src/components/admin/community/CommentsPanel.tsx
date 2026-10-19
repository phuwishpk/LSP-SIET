'use client'

/**
 * Every comment in the workspace.
 *
 * The feed shows comments post by post, so finding an abusive one meant knowing
 * where it was. Unlike a post, a comment is not flagged: removing it here
 * deletes it for good, which is why it asks first.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useDebounce } from 'use-debounce'
import { EyeOff, Search, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState, Pager } from '@/components/admin/controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminComments, useDeleteComment } from '@/lib/hooks/use-admin'
import type { AdminComment } from '@/lib/api/admin'
import { displayName, timeAgo } from '@/lib/utils/community-format'

const PAGE = 25

export function CommentsPanel() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<AdminComment | null>(null)
  const { data, isLoading } = useAdminComments({ q: debounced, offset })
  const remove = useDeleteComment()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ความคิดเห็นทั้งหมด</CardTitle>
        <CardDescription>
          {data ? `${data.total.toLocaleString()} ความคิดเห็น · ` : ''}
          ใหม่สุดก่อน · การลบความคิดเห็นเป็นการลบถาวร กู้คืนไม่ได้
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
            placeholder="ค้นจากข้อความ หรือชื่อผู้เขียน"
            aria-label="ค้นความคิดเห็น"
            className="pl-9"
          />
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState>ไม่พบความคิดเห็นที่ตรงกับเงื่อนไข</EmptyState>}

        {(data?.items.length ?? 0) > 0 && (
          <div className="divide-y rounded-lg border">
            {data?.items.map((comment) => (
              <div key={comment.id} className="flex items-start gap-3 p-3" data-comment-id={comment.id}>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 whitespace-pre-line break-words text-sm">{comment.content}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      {displayName(comment.author)} (@{comment.author.username}) · {timeAgo(comment.created_at)} · ในโพสต์
                    </span>
                    {comment.post.is_deleted ? (
                      <>
                        <span className="truncate">{comment.post.title || '(ไม่มีหัวข้อ)'}</span>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <EyeOff className="h-3 w-3" /> โพสต์ถูกซ่อน
                        </Badge>
                      </>
                    ) : (
                      <Link
                        href={`/community?post=${comment.post.id}`}
                        target="_blank"
                        className="truncate font-medium text-foreground hover:underline"
                      >
                        {comment.post.title || '(ไม่มีหัวข้อ)'}
                      </Link>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setPending(comment)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> ลบ
                </Button>
              </div>
            ))}
          </div>
        )}

        <Pager offset={offset} pageSize={PAGE} total={data?.total ?? 0} onChange={setOffset} />
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบความคิดเห็นนี้ถาวร?</AlertDialogTitle>
            <AlertDialogDescription>
              ความคิดเห็นของ {pending ? displayName(pending.author) : ''} จะถูกลบออกจากโพสต์และกู้คืนไม่ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending && (
            <p className="line-clamp-4 whitespace-pre-line break-words rounded-lg bg-muted p-3 text-sm">{pending.content}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => {
                if (pending) remove.mutate(pending.id)
                setPending(null)
              }}
            >
              ลบถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
