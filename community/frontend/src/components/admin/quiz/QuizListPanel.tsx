'use client'

/**
 * Every quiz in the workspace, as a summary.
 *
 * A quiz is private until its owner shares it, so this list never shows the
 * questions or the answers — only who made it, how big it is and where it came
 * from. A shared quiz is a post, and the link opens that post like anyone else
 * would see it.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useDebounce } from 'use-debounce'
import { ExternalLink, EyeOff, Gamepad2, Lock, Search, Trash2 } from 'lucide-react'
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
import { EmptyState, Pager, Segmented } from '@/components/admin/controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminQuizzes, useDeleteQuiz } from '@/lib/hooks/use-admin'
import type { AdminQuiz } from '@/lib/api/admin'
import { displayName, timeAgo } from '@/lib/utils/community-format'

const PAGE = 25

const ORIGINS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'own', label: 'สร้างเอง' },
  { value: 'imported', label: 'นำเข้าจากฟีด' },
] as const

const ownerLabel = (quiz: AdminQuiz) =>
  quiz.owner ? `${displayName(quiz.owner)} (@${quiz.owner.username})` : 'บัญชีถูกลบแล้ว'

export function QuizListPanel() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [origin, setOrigin] = useState<(typeof ORIGINS)[number]['value']>('all')
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<AdminQuiz | null>(null)
  const { data, isLoading } = useAdminQuizzes({ q: debounced, origin, offset })
  const remove = useDeleteQuiz()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quiz ทั้งหมด</CardTitle>
        <CardDescription>
          {data ? `${data.total.toLocaleString()} รายการ · ` : ''}
          เห็นเฉพาะข้อมูลสรุป · คำถามและเฉลยเปิดดูได้เฉพาะ Quiz ที่เจ้าของแชร์ลงฟีดแล้ว
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setOffset(0)
              }}
              placeholder="ค้นจากหัวข้อ Quiz"
              aria-label="ค้นจากหัวข้อ Quiz"
              className="pl-9"
            />
          </div>
          <Segmented
            label="ที่มาของ Quiz"
            value={origin}
            options={ORIGINS}
            onChange={(value) => {
              setOrigin(value)
              setOffset(0)
            }}
          />
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState>ไม่พบ Quiz ที่ตรงกับเงื่อนไข</EmptyState>}

        {(data?.items.length ?? 0) > 0 && (
          <div className="divide-y rounded-lg border">
            {data?.items.map((quiz) => {
              const post = quiz.shared_post
              return (
                <div key={quiz.id} className="flex flex-wrap items-start gap-3 p-3" data-quiz-id={quiz.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{quiz.topic || '(ไม่มีหัวข้อ)'}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {quiz.origin === 'imported' ? 'นำเข้าจากฟีด' : 'สร้างเอง'}
                      </Badge>
                      {quiz.from_library && (
                        <Badge variant="outline" className="text-[10px]">
                          จากคลังความรู้
                        </Badge>
                      )}
                      {post && !post.is_deleted && (
                        <Badge variant="secondary" className="text-[10px]">
                          แชร์แล้ว
                        </Badge>
                      )}
                      {post?.is_deleted && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <EyeOff className="h-3 w-3" /> โพสต์ถูกซ่อน
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {ownerLabel(quiz)} · {quiz.question_count} ข้อ
                      {quiz.created_at ? ` · ${timeAgo(quiz.created_at)}` : ''}
                    </p>
                    {post && post.play_count > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Gamepad2 className="h-3 w-3" /> มีคนเล่น {post.play_count} ครั้ง
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {post && !post.is_deleted ? (
                      <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
                        <Link href={`/community?post=${post.post_id}`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5" /> ดูโพสต์
                        </Link>
                      </Button>
                    ) : quiz.origin === 'imported' && quiz.source_post_id ? (
                      <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
                        <Link href={`/community?post=${quiz.source_post_id}`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5" /> โพสต์ต้นทาง
                        </Link>
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 px-2 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" /> ยังไม่แชร์
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setPending(quiz)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ลบ
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Pager offset={offset} pageSize={PAGE} total={data?.total ?? 0} onChange={setOffset} />
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ Quiz นี้ถาวร?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pending?.topic || '(ไม่มีหัวข้อ)'}” ของ {pending ? ownerLabel(pending) : ''} จะหายจากรายการของเจ้าของและกู้คืนไม่ได้
              {pending?.shared_post
                ? ' · โพสต์ในฟีดเก็บสำเนาของตัวเองไว้ จึงยังอยู่ต่อ หากต้องการเอาออกจากฟีดให้ซ่อนโพสต์ในแท็บ “ที่แชร์ในฟีด”'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
