'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar } from '@/components/ui/avatar'
import { useMarkNotificationsRead, useNotifications } from '@/lib/hooks/use-community'
import { displayName, timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

export function NotificationsMenu({ onOpenPost }: { onOpenPost?: (postId: number) => void }) {
  const [open, setOpen] = useState(false)
  const { data } = useNotifications()
  const markRead = useMarkNotificationsRead()
  const unread = data?.unread_count ?? 0

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && unread > 0) markRead.mutate(undefined)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="การแจ้งเตือน">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">การแจ้งเตือน</p>
        </div>
        <ScrollArea className="max-h-80">
          {(data?.items.length ?? 0) === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            <ul>
              {data?.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-accent',
                      !n.is_read && 'bg-primary/5'
                    )}
                    onClick={() => {
                      if (n.post_id && onOpenPost) {
                        onOpenPost(n.post_id)
                        setOpen(false)
                      }
                    }}
                  >
                    <Avatar
                      size="sm"
                      src={n.actor?.avatar_url}
                      name={n.actor ? displayName(n.actor) : 'SIET'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
