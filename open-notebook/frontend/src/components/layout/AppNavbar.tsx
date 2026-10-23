'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BookOpen,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  GraduationCap,
  LogOut,
  Map as MapIcon,
  Menu,
  Search,
  Settings,
  UserRound,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar } from '@siet/platform/components/ui/avatar'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { PointsWallet } from '@siet/platform/components/community/PointsWallet'
import { NotificationsMenu } from '@siet/platform/components/community/NotificationsMenu'
import { displayName, roleLabel } from '@siet/platform/lib/utils/community-format'
import { openQuizApp, openRoadmapApp } from '@siet/platform/lib/external-apps'
import { useAuth } from '@/lib/hooks/use-auth'
import { cn } from '@/lib/utils'

export interface AppNavbarProps {
  onOpenMenu?: () => void
  className?: string
}

function NavbarSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlQuery = pathname === '/community' ? searchParams.get('q') || '' : ''
  const [draft, setDraft] = useState(urlQuery)

  useEffect(() => {
    if (pathname === '/community') {
      setDraft(searchParams.get('q') || '')
    }
  }, [pathname, searchParams])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = draft.trim()
    if (q) {
      router.push(`/community?q=${encodeURIComponent(q)}`)
    } else if (pathname === '/community') {
      router.push('/community')
    }
  }

  const handleClear = () => {
    setDraft('')
    if (pathname === '/community') {
      router.push('/community')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mx-1 min-w-[48px] w-auto max-w-xl flex-1 sm:mx-auto"
      role="search"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/65 transition-colors" />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="ค้นหาสรุป, ข้อสอบ, รายวิชา, เพื่อน…"
        className="h-9 w-full cursor-text rounded-full border border-white/20 bg-white/10 pl-9 pr-14 text-xs text-white placeholder:text-white/60 backdrop-blur-xs transition-all duration-200 hover:border-white/35 hover:bg-white/15 focus:border-[#E91E63] focus:bg-white/20 focus:ring-2 focus:ring-[#E91E63]/60 focus-visible:border-[#E91E63] focus-visible:ring-2 focus-visible:ring-[#E91E63]/60 sm:text-sm"
      />
      {draft && (
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/70 transition-colors hover:text-white"
          onClick={handleClear}
          aria-label="ล้างการค้นหา"
        >
          ล้าง
        </button>
      )}
    </form>
  )
}

export function AppNavbar({ onOpenMenu, className }: AppNavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const handleOpenMenu = () => {
    if (onOpenMenu) {
      onOpenMenu()
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toggle-community-sidebar'))
    }
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full relative border-b-[2.5px] border-[#E91E63] bg-gradient-to-r from-[#420A2B] via-[#6B0F3F] to-[#8C1453] text-white shadow-md shadow-black/10',
        className
      )}
    >
      {/* Geometric Overlay Pattern (Journal of Industrial Education / JIE inspired) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-18">
        <svg
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1440 64"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="jie-geometric-pattern"
              width="56"
              height="56"
              patternUnits="userSpaceOnUse"
            >
              {/* Diamond & triangle line mesh */}
              <path
                d="M0 28 L28 0 L56 28 L28 56 Z"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.8"
                fill="none"
              />
              <path
                d="M0 0 L56 56 M56 0 L0 56"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="0.5"
              />
              <polygon
                points="28,0 56,28 28,28"
                fill="rgba(255,255,255,0.06)"
              />
              <polygon
                points="0,28 28,56 0,56"
                fill="rgba(255,255,255,0.04)"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#jie-geometric-pattern)" />

          {/* Accent geometric polygons */}
          <polygon points="0,0 150,0 75,64 0,64" fill="rgba(255,255,255,0.05)" />
          <polygon points="1050,0 1200,0 1275,64 1125,64" fill="rgba(255,255,255,0.04)" />
          <polygon points="1320,0 1440,0 1440,64 1365,64" fill="rgba(255,255,255,0.06)" />
        </svg>
      </div>

      <div className="relative z-10 mx-auto flex h-16 max-w-[1440px] items-center gap-1.5 px-3 sm:gap-3 sm:px-5 lg:px-6">
        {/* Mobile menu trigger */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0 text-white hover:bg-white/15 hover:text-white lg:hidden"
          onClick={handleOpenMenu}
          aria-label="เปิดเมนู"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Brand logo & tagline */}
        <Link
          href="/community"
          className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-pink-300"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-[#E91E63] via-rose-500 to-amber-300 text-sm font-black text-white shadow-sm ring-1 ring-white/30">
            S
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-sm font-bold tracking-tight text-white drop-shadow-xs">
              SIET Space
            </span>
            <span className="text-[10px] font-medium text-pink-200/90">
              KMITL learning community
            </span>
          </span>
        </Link>

        {/* Center capsule search bar */}
        <Suspense
          fallback={
            <div className="relative mx-1 min-w-[48px] w-auto max-w-xl flex-1 sm:mx-auto h-9" />
          }
        >
          <NavbarSearch />
        </Suspense>

        {/* Right side items */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 [&_button]:shrink-0">
          <div className="[&_button]:border-amber-300/80 [&_button]:shadow-xs">
            <PointsWallet />
          </div>

          <div className="[&_button]:text-white [&_button]:hover:bg-white/15 [&_button]:hover:text-white">
            <NotificationsMenu
              onOpenPost={(postId) => router.push(`/community?post=${postId}`)}
            />
          </div>

          {/* User profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 shrink-0 gap-2 rounded-full px-1.5 text-white hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-pink-300"
                aria-label="เปิดเมนูบัญชีผู้ใช้"
              >
                <Avatar
                  size="sm"
                  src={user?.avatar_url}
                  name={displayName(user)}
                  className="bg-pink-100 text-[#6B0F3F] font-bold ring-1.5 ring-white/50"
                />
                <span className="hidden max-w-[120px] truncate text-sm font-semibold text-white drop-shadow-xs md:inline">
                  {displayName(user)}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-pink-200 md:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="community-theme w-[320px] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200/80 bg-white p-2.5 text-slate-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <DropdownMenuLabel className="px-2.5 pb-3 pt-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    size="lg"
                    src={user?.avatar_url}
                    name={displayName(user)}
                    className="bg-pink-200 text-pink-800"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">
                      {displayName(user)}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-normal text-slate-500 dark:text-zinc-300">
                      {user?.email || `@${user?.username}`}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-1 text-[10px] font-medium text-pink-800 dark:bg-pink-950/60 dark:text-pink-300">
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
                    <UserRound className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                    <span>ดูโปรไฟล์เต็ม</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                asChild
                className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
              >
                <Link href="/community?view=library">
                  <BookOpen className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  <span>คลังความรู้และไฟล์ของฉัน</span>
                </Link>
              </DropdownMenuItem>
              {user?.role === 'teacher' || user?.role === 'admin' ? (
                <DropdownMenuItem
                  asChild
                  className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                >
                  <Link href="/settings">
                    <Settings className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                    <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled
                  title="การตั้งค่าบัญชีสำหรับนักศึกษายังไม่พร้อมใช้งาน"
                  className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                >
                  <Settings className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                asChild
                className="mb-1 min-h-12 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
              >
                <Link href="/community?view=rules">
                  <CircleHelp className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  <span>ช่วยเหลือและกฎชุมชน</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2 bg-pink-100 dark:bg-zinc-800" />
              <DropdownMenuItem
                className="rounded-xl text-slate-800 transition-colors hover:bg-pink-50 focus:bg-pink-50 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                onClick={() => void openQuizApp()}
              >
                <GraduationCap className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" /> แอป AI Quiz ↗
              </DropdownMenuItem>
              <DropdownMenuItem
                className="rounded-xl text-slate-800 transition-colors hover:bg-pink-50 focus:bg-pink-50 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                onClick={() => void openRoadmapApp()}
              >
                <MapIcon className="mr-2 h-4 w-4 text-orange-600 dark:text-orange-400" /> แอป AI Roadmap
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
