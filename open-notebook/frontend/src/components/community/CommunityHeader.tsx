'use client'

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  GraduationCap,
  LogOut,
  Search,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { useAuth } from '@/lib/hooks/use-auth'
import { PointsWallet } from './PointsWallet'
import { NotificationsMenu } from './NotificationsMenu'
import { displayName, roleLabel } from '@/lib/utils/community-format'
import { openQuizApp, openRoadmapApp } from '@/lib/external-apps'
import { Map as MapIcon } from 'lucide-react'

interface CommunityHeaderProps {
  query: string
  onSearch: (q: string) => void
  onOpenPost: (postId: number) => void
  onHome: () => void
}

export function CommunityHeader({ query, onSearch, onOpenPost, onHome }: CommunityHeaderProps) {
  const { user, logout } = useAuth()
  const [draft, setDraft] = useState(query)

  useEffect(() => setDraft(query), [query])

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-4">
        <button
          type="button"
          onClick={onHome}
          className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 text-sm font-black text-white shadow">
            S
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-sm font-bold tracking-tight">SIET Space</span>
            <span className="text-[10px] text-muted-foreground">KMITL learning community</span>
          </span>
        </button>

        <form
          className="relative mx-auto w-full max-w-xl"
          onSubmit={(e) => {
            e.preventDefault()
            onSearch(draft.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ค้นหาสรุป, ข้อสอบ, รายวิชา, เพื่อน…"
            className="h-9 rounded-full bg-muted/60 pl-9 pr-16"
          />
          {draft && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setDraft('')
                onSearch('')
              }}
            >
              ล้าง
            </button>
          )}
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <PointsWallet />
          <NotificationsMenu onOpenPost={onOpenPost} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 rounded-full px-1.5">
                <Avatar size="sm" src={user?.avatar_url} name={displayName(user)} />
                <span className="hidden max-w-[120px] truncate text-sm md:inline">
                  {displayName(user)}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-1">
                <p className="truncate text-sm font-semibold">{displayName(user)}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">
                  {user?.email || `@${user?.username}`}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Badge variant="secondary">{roleLabel(user?.role)}</Badge>
                  {user?.student_id && <Badge variant="outline">รหัส {user.student_id}</Badge>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void openQuizApp()}>
                <GraduationCap className="mr-2 h-4 w-4 text-emerald-600" /> แอป AI Quiz ↗
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void openRoadmapApp()}>
                <MapIcon className="mr-2 h-4 w-4 text-orange-600" /> แอป AI Roadmap ↗
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <ThemeToggle />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" /> ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
