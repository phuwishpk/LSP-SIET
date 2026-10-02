'use client'

/**
 * Every roadmap in the workspace, as a summary.
 *
 * A roadmap is private until its owner shares it, so this list never shows the
 * nodes of a plan — only who made it, how big it is and what it was grounded
 * on. A shared roadmap is a post, and the link opens that post like anyone
 * else would see it.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useDebounce } from 'use-debounce'
import { ExternalLink, EyeOff, Footprints, Lock, Search, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminRoadmaps, useDeleteRoadmap } from '@/lib/hooks/use-admin'
import type { AdminRoadmap } from '@/lib/api/admin'
import { displayName, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

const PAGE = 25

const ORIGINS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'own', label: 'สร้างเอง' },
  { value: 'followed', label: 'เดินตามจากฟีด' },
] as const

const ownerLabel = (roadmap: AdminRoadmap) =>
  roadmap.owner ? `${displayName(roadmap.owner)} (@${roadmap.owner.username})` : 'บัญชีถูกลบแล้ว'

export function RoadmapListPanel() {
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const [origin, setOrigin] = useState<(typeof ORIGINS)[number]['value']>('all')
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<AdminRoadmap | null>(null)
  const { data, isLoading } = useAdminRoadmaps({ q: debounced, origin, offset })
  const remove = useDeleteRoadmap()

  const pages = Math.ceil((data?.total ?? 0) / PAGE)
  const page = Math.floor(offset / PAGE)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Roadmap ทั้งหมด</CardTitle>
        <CardDescription>
          {data ? `${data.total.toLocaleString()} รายการ · ` : ''}
          เห็นเฉพาะข้อมูลสรุป · เนื้อหาเต็มเปิดดูได้เฉพาะ Roadmap ที่เจ้าของแชร์ลงฟีดแล้ว
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
              placeholder="ค้นจากชื่อ Roadmap"
              aria-label="ค้นจากชื่อ Roadmap"
              className="pl-9"
            />
          </div>
          <div className="flex rounded-md border p-0.5">
            {ORIGINS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setOrigin(item.value)
                  setOffset(0)
                }}
                className={cn(
                  'rounded px-2.5 py-1 text-xs transition',
                  origin === item.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            ไม่พบ Roadmap ที่ตรงกับเงื่อนไข
          </p>
        )}

        {(data?.items.length ?? 0) > 0 && (
          <div className="divide-y rounded-lg border">
            {data?.items.map((roadmap) => {
              const post = roadmap.shared_post
              return (
                <div key={roadmap.id} className="flex flex-wrap items-start gap-3 p-3" data-roadmap-id={roadmap.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{roadmap.title || '(ไม่มีชื่อ)'}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {roadmap.origin === 'followed' ? 'เดินตามจากฟีด' : 'สร้างเอง'}
                      </Badge>
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
                      {ownerLabel(roadmap)} · {roadmap.node_count} ด่าน
                      {roadmap.grounding_label ? ` · ${roadmap.grounding_label}` : ''}
                      {roadmap.created_at ? ` · ${timeAgo(roadmap.created_at)}` : ''}
                    </p>
                    {post && post.follow_count > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Footprints className="h-3 w-3" /> มีคนเดินตาม {post.follow_count} คน
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
                    ) : roadmap.origin === 'followed' && roadmap.source_post_id ? (
                      <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
                        <Link href={`/community?post=${roadmap.source_post_id}`} target="_blank">
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
                      className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setPending(roadmap)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ลบ
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setOffset(offset - PAGE)}>
              ก่อนหน้า
            </Button>
            <span className="text-muted-foreground">
              หน้า {page + 1} จาก {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setOffset(offset + PAGE)}>
              ถัดไป
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ Roadmap นี้ถาวร?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pending?.title || '(ไม่มีชื่อ)'}” ของ {pending ? ownerLabel(pending) : ''} จะหายจากรายการของเจ้าของและกู้คืนไม่ได้
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
