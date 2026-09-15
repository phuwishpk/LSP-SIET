'use client'

/** Every room in one table — including the ones nobody owns or has posted in. */
import Link from 'next/link'
import { AlertTriangle, ExternalLink, Hash, MessagesSquare, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminCourses } from '@/lib/hooks/use-admin'
import { useDeleteCourse } from '@/lib/hooks/use-community'
import { timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

export function RoomsPanel() {
  const { data, isLoading } = useAdminCourses()
  const remove = useDeleteCourse()
  const totals = data?.totals

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ห้องทั้งหมด</CardTitle>
        <CardDescription>
          {totals
            ? `ห้องวิชา ${totals.courses} · ห้องพูดคุย ${totals.clubs} · ยังไม่มีโพสต์ ${totals.empty} · ไม่มีเจ้าของ ${totals.ownerless}`
            : 'ห้องวิชาและห้องพูดคุยทุกห้องในระบบ'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Skeleton className="h-40 w-full" />}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">ห้อง</th>
                <th className="py-2 pr-3 font-medium">เจ้าของ</th>
                <th className="py-2 pr-3 text-right font-medium">สมาชิก</th>
                <th className="py-2 pr-3 text-right font-medium">โพสต์</th>
                <th className="py-2 pr-3 text-right font-medium">เอกสาร</th>
                <th className="py-2 pr-3 font-medium">โพสต์ล่าสุด</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.map((room) => {
                const isClub = room.kind === 'club'
                return (
                  <tr key={room.id} className={cn(room.post_count === 0 && 'text-muted-foreground')}>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        {isClub ? (
                          <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                        ) : (
                          <Hash className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                        <span className="font-medium text-foreground">
                          {isClub ? room.name : `${room.code} ${room.name}`}
                        </span>
                      </div>
                      {room.description && (
                        <p className="truncate text-[11px] text-muted-foreground">{room.description}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {room.owner_username ? (
                        <>
                          {room.owner_display_name || room.owner_username}
                          <span className="text-muted-foreground"> (@{room.owner_username})</span>
                        </>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <AlertTriangle className="h-3 w-3 text-amber-600" /> ไม่มีเจ้าของ
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{room.member_count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{room.post_count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{isClub ? '—' : room.document_count}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {room.last_post_at ? timeAgo(room.last_post_at) : 'ยังไม่มี'}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2" aria-label="เปิดห้อง">
                          <Link href={`/community?course=${room.id}`} target="_blank">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `ปิดห้อง "${room.name}"?\nสมาชิก ${room.member_count} คนจะออกจากห้อง และโพสต์ ${room.post_count} รายการจะย้ายไปฟีดรวม (ไม่ถูกลบ)`
                              )
                            ) {
                              remove.mutate(room.id)
                            }
                          }}
                          aria-label="ปิดห้อง"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {(totals?.ownerless ?? 0) > 0 && (
          <p className="rounded-md border border-amber-400/50 bg-amber-50/60 p-2 text-[11px] text-muted-foreground dark:bg-amber-950/20">
            ห้องที่ &ldquo;ไม่มีเจ้าของ&rdquo; คือห้องตัวอย่างที่ระบบสร้างตอนติดตั้ง หรือห้องที่เจ้าของถูกลบบัญชีไป —
            อาจารย์จะแก้ไข/ปิดห้องเหล่านี้เองไม่ได้ ต้องให้ผู้ดูแลทำ
          </p>
        )}
      </CardContent>
    </Card>
  )
}
