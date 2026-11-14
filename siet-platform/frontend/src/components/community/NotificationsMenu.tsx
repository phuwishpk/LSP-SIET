'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NavbarBellButton } from '@shared/components/Navbar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar } from '@siet/platform/components/ui/avatar'
import { useMarkNotificationsRead, useNotifications } from '@siet/platform/lib/hooks/use-community'
import { displayName, timeAgo } from '@siet/platform/lib/utils/community-format'
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
        {/* The navbar's own bell, so it looks the same here as in AI Quiz and AI Roadmap. */}
        <NavbarBellButton unreadCount={unread} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="community-theme w-80 rounded-2xl border-[#EAE6EA] p-0 shadow-[0_4px_16px_rgba(32,33,36,0.04)] dark:border-border"
      >
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">การแจ้งเตือน</p>
        </div>
        <ScrollArea className="max-h-80">
          {(data?.items.length ?? 0) === 0 ? (
            <div className="mx-4 my-3 flex items-center gap-2 rounded-2xl border border-[#EAE6EA] bg-[#FAF7F9] p-4 text-sm text-muted-foreground dark:border-border dark:bg-zinc-800/60" role="status">
              <Bell aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>ยังไม่มีการแจ้งเตือน</span>
            </div>
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
