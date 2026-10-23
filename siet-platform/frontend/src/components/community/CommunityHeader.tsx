'use client'

import { useEffect, useState } from 'react'
import {
  BookOpen,
  CircleCheck,
  ChevronDown,
  CircleHelp,
  GraduationCap,
  LogOut,
  Menu,
  Settings,
  Search,
  UserRound,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar } from '@siet/platform/components/ui/avatar'
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
import { displayName, roleLabel } from '@siet/platform/lib/utils/community-format'
import { openQuizApp, openRoadmapApp } from '@siet/platform/lib/external-apps'
import { Map as MapIcon } from 'lucide-react'
import Link from 'next/link'

interface CommunityHeaderProps {
  query: string
  onSearch: (q: string) => void
  onOpenPost: (postId: number) => void
  onHome: () => void
  onOpenCommunityRules?: () => void
  /**
   * Opens the navigation drawer. Only passed on pages that have a left column
   * to show; below `lg` that column is hidden, so without this the rooms,
   * library and AI tools are unreachable on a phone.
   */
  onOpenMenu?: () => void
}

export function CommunityHeader({
  query,
  onSearch,
  onOpenPost,
  onHome,
  onOpenCommunityRules,
  onOpenMenu,
}: CommunityHeaderProps) {
  const { user, logout } = useAuth()
  const [draft, setDraft] = useState(query)

  useEffect(() => setDraft(query), [query])

  return (
    <header className="sticky top-0 z-30 border-b bg-white dark:bg-zinc-900">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-1.5 px-3 sm:gap-3 sm:px-5 lg:px-6">
        {onOpenMenu && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 lg:hidden"
            onClick={onOpenMenu}
            aria-label="เปิดเมนู"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <button
          type="button"
          onClick={onHome}
          className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-600 via-rose-500 to-pink-500 text-sm font-black text-white shadow-sm shadow-rose-500/20">
            S
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-sm font-bold tracking-tight">SIET Space</span>
            <span className="text-[10px] font-medium text-rose-600/80 dark:text-rose-400">KMITL learning community</span>
          </span>
        </button>

        <form
          className="relative mx-1 min-w-[48px] w-auto max-w-xl flex-1 sm:mx-auto"
          onSubmit={(e) => {
            e.preventDefault()
            onSearch(draft.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            /* MERGE-OWNER (undecided, Poh #4 vs SpriteUm 254a779): kept staging's version (Poh's community redesign).
            SpriteUm's version, to swap in if SpriteUm owns this:
              placeholder="ค้นหาชีทสรุป, แนวข้อสอบ, รหัสวิชา (เช่น CS101)…"
              className="h-9 rounded-xl border border-slate-200/90 bg-slate-50/80 pl-9 pr-16 text-xs transition-all focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-500/20 dark:border-zinc-800 dark:bg-zinc-800/60 dark:focus:bg-zinc-900"
            */
            placeholder="ค้นหาสรุป, ข้อสอบ, รายวิชา, เพื่อน…"
            className="h-9 cursor-text rounded-lg border-border bg-muted/70 pl-9 pr-16 transition-all duration-200 hover:bg-slate-100/80 focus:bg-white focus:ring-2 focus:ring-pink-300/50 dark:bg-muted/70 dark:hover:bg-zinc-800/80 dark:focus:bg-zinc-900 dark:focus:ring-pink-500/30"
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

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 [&_button]:shrink-0">
          <PointsWallet />
          <NotificationsMenu onOpenPost={onOpenPost} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 shrink-0 gap-2 rounded-full px-1.5 focus-visible:ring-2 focus-visible:ring-pink-400"
                aria-label="เปิดเมนูบัญชีผู้ใช้"
              >
                <Avatar
                  size="sm"
                  src={user?.avatar_url}
                  name={displayName(user)}
                  className="bg-pink-200 text-pink-800 dark:bg-pink-900/50 dark:text-pink-100"
                />
                <span className="hidden max-w-[120px] truncate text-sm md:inline">
                  {displayName(user)}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="community-theme w-[320px] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200/80 bg-white p-2.5 text-slate-800 shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <DropdownMenuLabel className="px-2.5 pb-3 pt-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    size="lg"
                    src={user?.avatar_url}
                    name={displayName(user)}
                    className="bg-pink-200 text-pink-800 dark:bg-pink-900/50 dark:text-pink-100"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">
                      {displayName(user)}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-normal text-slate-500 dark:text-zinc-300">
                      {user?.email || `@${user?.username}`}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-1 text-[10px] font-medium text-pink-800 dark:bg-pink-950/50 dark:text-pink-200">
                      <CircleCheck className="h-3 w-3" />
                      สมาชิก SIET Space · {roleLabel(user?.role)}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2 bg-pink-100 dark:bg-zinc-800" />
              {user && (
                <DropdownMenuItem
                  asChild
                  className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                >
                  <Link href="/community/profile/me">
                    <UserRound className="h-4 w-4 text-pink-600" />
                    <span>ดูโปรไฟล์เต็ม</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                asChild
                className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
              >
                <Link href="/community?view=library">
                  <BookOpen className="h-4 w-4 text-pink-600" />
                  <span>คลังความรู้และไฟล์ของฉัน</span>
                </Link>
              </DropdownMenuItem>
              {user?.role === 'teacher' || user?.role === 'admin' ? (
                <DropdownMenuItem
                  asChild
                  className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                >
                  <Link href="/settings">
                    <Settings className="h-4 w-4 text-pink-600" />
                    <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled
                  title="การตั้งค่าบัญชีสำหรับนักศึกษายังไม่พร้อมใช้งาน"
                  className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                >
                  <Settings className="h-4 w-4 text-pink-600" />
                  <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  if (onOpenCommunityRules) onOpenCommunityRules()
                  else onHome()
                }}
                className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
              >
                <CircleHelp className="h-4 w-4 text-pink-600" />
                <span>ช่วยเหลือและกฎชุมชน</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2 bg-pink-100 dark:bg-zinc-800" />
              <DropdownMenuItem
                className="rounded-xl text-slate-800 transition-colors hover:bg-pink-50 focus:bg-pink-50 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                onClick={() => void openQuizApp()}
              >
                <GraduationCap className="mr-2 h-4 w-4 text-emerald-600" /> แอป AI Quiz ↗
              </DropdownMenuItem>
              <DropdownMenuItem
                className="rounded-xl text-slate-800 transition-colors hover:bg-pink-50 focus:bg-pink-50 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                onClick={() => void openRoadmapApp()}
              >
                <MapIcon className="mr-2 h-4 w-4 text-orange-600" /> แอป AI Roadmap
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2 bg-pink-100 dark:bg-zinc-800" />
              <div className="rounded-xl border border-pink-100 bg-slate-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                <ThemeToggle />
              </div>
              <DropdownMenuItem
                className="mt-2 min-h-11 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 transition-colors hover:bg-rose-100 focus:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60 dark:focus:bg-rose-900/60"
                onClick={() => logout()}
              >
                <LogOut className="h-4 w-4" /> ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
