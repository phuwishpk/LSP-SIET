'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { OwlLogo, OWL_LOGO_DATA_URI } from './OwlLogo'
import {
  BookOpen,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  Coins,
  GraduationCap,
  InfinityIcon,
  LogOut,
  MapIcon,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
  X,
  Bell,
  TrendingUp,
  TrendingDown,
} from './NavbarIcons'

declare const process: any

// --- Types ---
export interface NavbarUser {
  id?: string | number
  display_name?: string | null
  name?: string | null
  username?: string | null
  email?: string | null
  role?: 'admin' | 'teacher' | 'student' | string | null
  avatar_url?: string | null
  avatar?: string | null
  student_id?: string | null
  points_balance?: number
  points_exempt?: boolean
  [key: string]: any
}

export interface WalletTransaction {
  id: number | string
  kind: string
  delta: number
  note?: string | null
  created_at?: string | null
}

export interface WalletData {
  balance: number
  exempt: boolean
  stats?: {
    posts: number
    saved: number
    courses: number
    earned: number
  }
  history?: WalletTransaction[]
}

/** Which app the navbar sits in (PR #38): marks the matching link as current. */
export type NavbarRoute = 'community' | 'rag' | 'quiz' | 'roadmap'

export interface NavbarProps {
  /**
   * The signed-in user (null: signed out) from a host app that keeps its own
   * session - SIET Space, AI Roadmap. Left out, the Navbar reads the session
   * itself (see readHandOffToken).
   */
  user?: NavbarUser | null
  /** The host app's token, for the points wallet; goes with `user`. */
  token?: string | null
  pointsBalance?: number
  activeRoute?: NavbarRoute
  showPointsWallet?: boolean
  notificationsCount?: number
  /** The host app's own notifications menu, shown in place of the bell (which has no data of its own). */
  notifications?: React.ReactNode
  /** Same as `notifications` (PR #38 name); `notifications` wins when both are given. */
  notificationsSlot?: React.ReactNode
  communityUrl?: string
  /** Where the logo goes (default: SIET Space's feed). AI Roadmap: back to the page the user came from. */
  homeUrl?: string
  logoSrc?: string
  /** A plain click on the logo goes to the host app's own home instead of loading `homeUrl`. */
  onHome?: () => void
  onSearch?: (query: string) => void
  searchDefaultValue?: string
  searchPlaceholder?: string
  onOpenMenu?: () => void
  onPointsClick?: () => void
  onOpenNotifications?: () => void
  onOpenQuiz?: () => void
  onOpenRoadmap?: () => void
  onOpenProfile?: () => void
  onOpenLibrary?: () => void
  onOpenSettings?: () => void
  onOpenRules?: () => void
  onLogout?: () => void
  /** The host app's light / dark state, shown by the switch in the menu. */
  isDark?: boolean
  /**
   * Switch the theme in the host app's own theme store (SIET Space). Left out,
   * there is no switch: the AI apps follow the theme picked in SIET Space.
   */
  onToggleTheme?: () => void
  className?: string
}

// --- Formatters & Helpers ---
/**
 * The navbar looks the same in every app, whatever the app's own base styles:
 * its font (DESIGN.md: Nunito, Thai through IBM Plex Sans Thai - SIET Space has
 * them as next/font variables, the AI apps load them from Google Fonts), its
 * 16px base, and px radii (SIET Space's theme makes `rounded-[12px]` 6px).
 */
const NAVBAR_FONT =
  "var(--font-nunito, 'Nunito'), var(--font-ibm-plex-thai, 'IBM Plex Sans Thai'), var(--font-noto-thai, 'Noto Sans Thai'), system-ui, sans-serif"

/**
 * The logo box leaves 26px for the 28px owl. Tailwind 4's preflight
 * (`img { max-width: 100% }`) fits it in SIET Space and AI Quiz; AI Roadmap
 * runs without preflight, so the navbar sets it itself.
 */
const LOGO_IMG_STYLE: React.CSSProperties = { maxWidth: '100%' }

export type NavbarBellButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { unreadCount?: number }

/**
 * The bell. A host that passes its own `notifications` menu uses this as the
 * menu's trigger, so the bell is the same in every app.
 */
export const NavbarBellButton = React.forwardRef<HTMLButtonElement, NavbarBellButtonProps>(function NavbarBellButton(
  { unreadCount = 0, type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label="การแจ้งเตือน"
      {...rest}
      className={`relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[#202124] hover:bg-[#FCE7F0] hover:text-[#C92F6B] transition-colors cursor-pointer focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-[#C92F6B] dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-pink-200${className ? ` ${className}` : ''}`}
    >
      <Bell size={20} className="h-5 w-5" style={{ width: 20, height: 20 }} />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
})

/** Where the AI Quiz / AI Roadmap apps keep the token SIET Space handed them. */
const HANDOFF_TOKEN_KEY = 'kmitlai-workspace-token'

/**
 * The session for a host app that does not pass `user` (see NavbarProps): a
 * hand-off token that just arrived in the address bar (kept, then removed from
 * the bar), the one kept from an earlier hand-off, or SIET Space's own when
 * both apps share one origin behind the proxy. SIET Space's `auth-storage` is
 * only read (and cleared on sign-out): that session belongs to SIET Space.
 */
function readHandOffToken(): string | null {
  try {
    const url = new URL(window.location.href)
    const fromLink = url.searchParams.get('token')
    if (fromLink) {
      localStorage.setItem(HANDOFF_TOKEN_KEY, fromLink)
      url.searchParams.delete('token')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
      return fromLink
    }
    const kept = localStorage.getItem(HANDOFF_TOKEN_KEY)
    if (kept) return kept
    return JSON.parse(localStorage.getItem('auth-storage') || 'null')?.state?.token || null
  } catch {
    return null
  }
}

/**
 * A link the host app can open itself (onOpenProfile...): a plain click goes to
 * the handler instead of loading the page again; cmd/ctrl-click still opens a tab.
 */
function openInHost(event: React.MouseEvent, handler?: () => void) {
  if (!handler || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  handler()
}

export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'admin':
      return 'ผู้ดูแล'
    case 'teacher':
      return 'อาจารย์'
    case 'student':
      return 'นักศึกษา'
    default:
      return role || 'สมาชิก'
  }
}

export function displayName(user?: {
  display_name?: string | null
  name?: string | null
  username?: string | null
} | null): string {
  return user?.display_name || user?.name || user?.username || ''
}

export function initials(name?: string | null): string {
  const clean = (name || '').trim()
  if (!clean) return 'U'
  const parts = clean.split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + second).toUpperCase() || 'U'
}

export const KIND_LABELS: Record<string, string> = {
  welcome: 'แต้มต้อนรับ',
  rag_question: 'ถาม KMITL RAG AI',
  rag_session: 'เซสชัน RAG AI',
  quiz_generate: 'สร้าง AI Quiz',
  roadmap_generate: 'สร้าง AI Roadmap',
  roadmap_expand: 'ขยายด่าน Roadmap',
  quiz_import: 'นำเข้าควิซของเพื่อน',
  cashback: 'แต้มคืน (เพื่อนทำควิซ)',
  creator_bonus: 'Creator Points (แชร์สรุป)',
  post_bonus: 'โพสต์เนื้อหาลงฟีด',
  helpful_bonus: 'มีคนกด Helpful',
  like_bonus: 'มีคนกดถูกใจโพสต์',
  share_bonus: 'มีคนแชร์โพสต์',
  edit_bonus: 'แก้ไขโพสต์ให้ดีขึ้น',
  refund: 'คืนแต้ม',
  admin_grant: 'ผู้ดูแลเพิ่มแต้ม',
  admin_deduct: 'ผู้ดูแลหักแต้ม',
  balance_adjust: 'ปรับยอดยกมา',
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] || kind
}

export function timeAgo(dateString?: string | null): string {
  if (!dateString) return ''
  try {
    const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateString)
    const date = new Date(hasZone ? dateString : `${dateString}Z`)
    if (Number.isNaN(date.getTime())) return ''
    const now = new Date()
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diffSec < 60) return 'เมื่อสักครู่'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} นาทีที่ผ่านมา`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่ผ่านมา`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays} วันที่ผ่านมา`
    const diffMonths = Math.floor(diffDays / 30)
    if (diffMonths < 12) return `${diffMonths} เดือนที่ผ่านมา`
    return `${Math.floor(diffMonths / 12)} ปีที่ผ่านมา`
  } catch {
    return ''
  }
}

/** A NEXT_PUBLIC_* value: Next fills in `process.env.NAME` written out in full at build time. */
function publicEnv(read: () => string | undefined): string {
  try {
    return (read() || '').replace(/\/$/, '')
  } catch {
    return ''
  }
}

/** SIET Space's URL as both the server and the first client render see it. */
function configuredWorkspaceUrl(): string {
  return publicEnv(() => process.env.NEXT_PUBLIC_WORKSPACE_URL) || 'http://localhost:3000'
}

/** Where SIET Space was, learned from a hand-off (see learnWorkspaceOrigin). */
const WORKSPACE_ORIGIN_KEY = 'kmitlai-workspace-origin'

/**
 * A hand-off link carries `return` (the SIET Space page it came from): keep its
 * origin, same host only, as the AI Roadmap app does. Several SIET Space copies
 * can share one AI app (prod :3000 and the test stack :18502 both use :3001).
 */
function learnWorkspaceOrigin() {
  try {
    const back = new URLSearchParams(window.location.search).get('return')
    if (back && new URL(back).hostname === window.location.hostname) {
      localStorage.setItem(WORKSPACE_ORIGIN_KEY, new URL(back).origin)
    }
  } catch {}
}

/**
 * Browser-facing URL of SIET Space (the main app): `NEXT_PUBLIC_WORKSPACE_URL`
 * when baked into the build, else the one learned from the last hand-off (same
 * host), else inferred - an AI app on its own port (3001 / 3002) has SIET Space
 * on port 3000 of the same host; behind the proxy it is this origin.
 */
export function getWorkspaceUrl(): string {
  const fromEnv = publicEnv(() => process.env.NEXT_PUBLIC_WORKSPACE_URL)
  if (fromEnv) return fromEnv
  if (typeof window === 'undefined') return configuredWorkspaceUrl()
  const { protocol, hostname, port, origin } = window.location
  try {
    const learned = localStorage.getItem(WORKSPACE_ORIGIN_KEY)
    if (learned && new URL(learned).hostname === hostname) return learned
  } catch {}
  if (port === '3001' || port === '3002') return `${protocol}//${hostname}:3000`
  return origin
}

/** An AI app: on its own port (quiz 3001, roadmap 3002) next to this one, else under this origin behind the proxy. */
function aiAppUrl(app: 'quiz' | 'roadmap'): string {
  const fromEnv =
    app === 'quiz'
      ? publicEnv(() => process.env.NEXT_PUBLIC_MY_AI_QUIZ_URL)
      : publicEnv(() => process.env.NEXT_PUBLIC_AI_ROADMAP_URL)
  if (fromEnv) return fromEnv
  const { protocol, hostname, port, origin } = window.location
  if (port === '3001' || port === '3002') return `${protocol}//${hostname}:${app === 'quiz' ? 3001 : 3002}/${app}`
  return `${origin}/${app}`
}

// --- Main Navbar Component ---
export function Navbar({
  user: initialUser,
  token: hostToken,
  pointsBalance: initialPoints,
  activeRoute,
  showPointsWallet = true,
  notificationsCount: initialNotificationsCount = 0,
  notifications: notificationsProp,
  notificationsSlot,
  communityUrl,
  homeUrl,
  logoSrc,
  onHome,
  onSearch,
  searchDefaultValue = '',
  searchPlaceholder = 'ค้นหาสรุป, ข้อสอบ, รายวิชา, เพื่อน…',
  onOpenMenu,
  onPointsClick,
  onOpenNotifications,
  onOpenQuiz,
  onOpenRoadmap,
  onOpenProfile,
  onOpenLibrary,
  onOpenSettings,
  onOpenRules,
  onLogout,
  isDark = false,
  onToggleTheme,
  className = '',
}: NavbarProps) {
  const [user, setUser] = React.useState<NavbarUser | null>(initialUser ?? null)
  const [balance, setBalance] = React.useState<number>(initialPoints ?? 0)
  const [isExempt, setIsExempt] = React.useState<boolean>(false)
  const [workspaceUrl, setWorkspaceUrl] = React.useState<string>(configuredWorkspaceUrl)
  const [currentToken, setCurrentToken] = React.useState<string | null>(null)
  const [walletData, setWalletData] = React.useState<WalletData | null>(null)
  const [isWalletLoading, setIsWalletLoading] = React.useState<boolean>(false)
  const tokenRef = React.useRef<string | null>(null)

  // UI state
  const [draft, setDraft] = React.useState(searchDefaultValue)
  // The host app's current search (e.g. ?q= on the feed) shows in the box.
  React.useEffect(() => setDraft(searchDefaultValue), [searchDefaultValue])
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [isWalletOpen, setIsWalletOpen] = React.useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false)
  const [unreadCount, setUnreadCount] = React.useState(initialNotificationsCount)

  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const walletRef = React.useRef<HTMLDivElement>(null)
  const notifRef = React.useRef<HTMLDivElement>(null)

  // 1. Resolve Workspace Root URL (the host app may tell it: communityUrl)
  React.useEffect(() => {
    if (!communityUrl) learnWorkspaceOrigin()
    const url = communityUrl ? communityUrl.replace(/\/community\/?$/, '') : getWorkspaceUrl()
    setWorkspaceUrl(url)
  }, [communityUrl])

  // Helper for links to the other apps (absolute; forwards the token to the AI apps only)
  const buildCrossUrl = React.useCallback(
    (targetHref: string) => {
      const activeToken = tokenRef.current || currentToken
      try {
        let base = targetHref
        if (!base.startsWith('http://') && !base.startsWith('https://')) {
          const root = workspaceUrl || getWorkspaceUrl()
          base = `${root}${base.startsWith('/') ? '' : '/'}${base}`
        }
        const u = new URL(base)
        // Hand the token over only to the AI Quiz / AI Roadmap apps on another
        // origin, the way SIET Space opens them. Never to SIET Space itself: it
        // trusts only its own sign-in, so a token in a link would be a way to
        // sign someone into another account.
        const toAiApp = /^\/(quiz|roadmap)(\/|$)/.test(u.pathname)
        if (toAiApp && typeof window !== 'undefined' && u.origin !== window.location.origin) {
          if (activeToken && activeToken !== 'not-required') {
            u.searchParams.set('token', activeToken)
          }
        }
        return u.toString()
      } catch {
        return targetHref
      }
    },
    [workspaceUrl, currentToken]
  )

  // Helper to fetch wallet info (balance, rules, stats, and transaction history)
  const fetchWallet = React.useCallback(
    async (authToken?: string | null) => {
      const t = authToken || tokenRef.current || currentToken
      if (!t || t === 'not-required') return
      setIsWalletLoading(true)
      try {
        const root = workspaceUrl || getWorkspaceUrl()
        let url = `${root}/api/community/wallet?limit=30`
        if (typeof window !== 'undefined') {
          if (window.location.port === '3002' || window.location.pathname.startsWith('/roadmap')) {
            url = '/roadmap/api/ws/community/wallet?limit=30'
          }
        }
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${t}` },
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          setWalletData(data)
          if (data.balance !== undefined) setBalance(data.balance)
          if (data.exempt !== undefined) setIsExempt(data.exempt)
        }
      } catch {
        // network error / offline fallback
      } finally {
        setIsWalletLoading(false)
      }
    },
    [workspaceUrl, currentToken]
  )

  // 2. The signed-in user: given by the host app (`user`), else read here
  // (readHandOffToken) and refreshed from the API. No session is written here.
  React.useEffect(() => {
    if (initialUser !== undefined) {
      tokenRef.current = hostToken ?? null
      setCurrentToken(hostToken ?? null)
      setUser(initialUser)
      if (initialPoints !== undefined) setBalance(initialPoints)
      else if (initialUser?.points_balance !== undefined) setBalance(initialUser.points_balance)
      if (initialUser?.points_exempt !== undefined) setIsExempt(initialUser.points_exempt)
      return
    }

    if (typeof window === 'undefined') return

    const token = readHandOffToken()
    tokenRef.current = token
    setCurrentToken(token)
    if (!token || token === 'not-required') {
      setUser(null)
      return
    }

    // Behind the proxy SIET Space's own copy of this user shows straight away.
    try {
      const own = JSON.parse(localStorage.getItem('auth-storage') || 'null')?.state
      if (own?.user && own.token === token) {
        setUser(own.user)
        if (own.user.points_balance !== undefined) setBalance(own.user.points_balance)
        if (own.user.points_exempt !== undefined) setIsExempt(own.user.points_exempt)
      }
    } catch {}

    const fetchFreshProfile = async () => {
      try {
        let targetUrl = `${getWorkspaceUrl()}/api/users/me`
        if (window.location.port === '3001' || window.location.pathname.startsWith('/quiz')) {
          targetUrl = '/quiz/api/me'
        } else if (window.location.port === '3002' || window.location.pathname.startsWith('/roadmap')) {
          targetUrl = '/roadmap/api/ws/users/me'
        }
        const res = await fetch(targetUrl, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          const realUser = data.user || data
          if (realUser && (realUser.username || realUser.display_name)) {
            setUser(realUser)
            if (realUser.points_balance !== undefined) setBalance(realUser.points_balance)
            if (realUser.points_exempt !== undefined) setIsExempt(realUser.points_exempt)
          }
        } else if (res.status === 401) {
          setUser(null)
        }
      } catch {
        // Keep existing local user on network error
      }
    }
    fetchFreshProfile()
    fetchWallet(token)
  }, [initialUser, hostToken, initialPoints, fetchWallet])

  // 3. Outside Click Listener for Dropdowns
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false)
      }
      if (walletRef.current && !walletRef.current.contains(target)) {
        setIsWalletOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setIsNotificationsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
        setIsWalletOpen(false)
        setIsNotificationsOpen(false)
      }
    }

    if (isDropdownOpen || isWalletOpen || isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen, isWalletOpen, isNotificationsOpen])

  // 4. Search Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = draft.trim()
    if (onSearch) {
      onSearch(q)
    } else if (typeof window !== 'undefined') {
      const searchTarget = `${workspaceUrl}/community${q ? `?q=${encodeURIComponent(q)}` : ''}`
      window.location.href = buildCrossUrl(searchTarget)
    }
  }

  // 5. Navigation Actions
  const handleOpenMenu = () => {
    if (onOpenMenu) {
      onOpenMenu()
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toggle-community-sidebar'))
    }
  }

  const handleOpenQuiz = () => {
    setIsDropdownOpen(false)
    if (onOpenQuiz) {
      onOpenQuiz()
    } else if (typeof window !== 'undefined') {
      window.open(buildCrossUrl(aiAppUrl('quiz')), '_blank', 'noopener,noreferrer')
    }
  }

  const handleOpenRoadmap = () => {
    setIsDropdownOpen(false)
    if (onOpenRoadmap) {
      onOpenRoadmap()
    } else if (typeof window !== 'undefined') {
      window.location.assign(buildCrossUrl(aiAppUrl('roadmap')))
    }
  }

  const handleLogout = () => {
    setIsDropdownOpen(false)
    if (onLogout) {
      // The host app signs out its own session.
      onLogout()
    } else if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(HANDOFF_TOKEN_KEY)
        localStorage.removeItem('auth-storage')
      } catch {}
      window.location.href = buildCrossUrl(`${workspaceUrl}/community`)
    }
  }

  const activeName = displayName(user)
  const activeInitials = initials(activeName || user?.username)
  const isPrivileged = user?.role === 'teacher' || user?.role === 'admin'
  const profileHref = buildCrossUrl(`${workspaceUrl}/community/profile/me`)

  const notifications = notificationsProp ?? notificationsSlot

  return (
    <header
      id="siet-shared-navbar"
      data-active-route={activeRoute}
      className={`siet-navbar siet-shared-navbar sticky top-0 z-[100] w-full border-b border-[#EAE6EA] bg-white text-[#202124] shadow-[0_1px_0_#EAE6EA] select-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 ${className}`}
      style={{ minHeight: '64px', height: '64px', fontFamily: NAVBAR_FONT, fontSize: '16px', lineHeight: 1.5 }}
    >
      {/* No ' " & < > in here: React 18 (AI Roadmap) escapes them when rendering on the server, and the page then fails to hydrate. */}
      <style>{`
        #siet-shared-navbar :focus-visible {
          outline: 2px solid #C92F6B !important;
          outline-offset: 2px !important;
        }

        #siet-shared-navbar input:focus-visible {
          border-color: #ED4988 !important;
        }

        .dark #siet-shared-navbar :focus-visible,
        [data-theme=dark] #siet-shared-navbar :focus-visible {
          outline-color: #f472b6 !important;
        }
      `}</style>
      <div
        className="relative z-[100] mx-auto flex h-16 max-w-[1440px] items-center gap-[6px] px-[12px] sm:gap-[12px] sm:px-[20px] lg:px-[24px]"
        style={{ height: '64px', minHeight: '64px', display: 'flex', alignItems: 'center' }}
      >
        {/* Mobile menu trigger - only rendered when onOpenMenu handler is provided */}
        {onOpenMenu && (
          <button
            type="button"
            className="flex h-[44px] w-[44px] min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[12px] p-0 text-[#202124] hover:bg-[#FCE7F0] hover:text-[#C92F6B] focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-[#C92F6B] lg:hidden transition-colors cursor-pointer bg-transparent border-0 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-pink-200"
            onClick={handleOpenMenu}
            aria-label="เปิดเมนู"
          >
            <Menu size={20} className="h-5 w-5" style={{ width: 20, height: 20 }} />
          </button>
        )}

        {/* Brand logo & tagline */}
        <a
          href={buildCrossUrl(homeUrl || `${workspaceUrl}/community`)}
          title={homeUrl ? 'กลับไปหน้าที่เปิดมาใน SIET Space' : undefined}
          onClick={(event) => openInHost(event, onHome)}
          aria-current={activeRoute === 'community' ? 'page' : undefined}
          className="flex min-h-[44px] shrink-0 items-center gap-[10px] rounded-[12px] px-[6px] py-[4px] text-left transition-colors hover:bg-[#FFF8FA] no-underline dark:hover:bg-zinc-800"
          style={{ textDecoration: 'none' }}
        >
          <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[12px] border border-[#F7B7D0] bg-[#FCE7F0] p-[4px] dark:border-[#694255] dark:bg-[#382630]">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="SIET Space"
                width={32}
                height={32}
                className="h-[28px] w-[28px] object-contain drop-shadow-xs select-none"
                style={LOGO_IMG_STYLE}
                onError={(e) => {
                  e.currentTarget.src = OWL_LOGO_DATA_URI
                }}
              />
            ) : (
              <OwlLogo
                size={32}
                className="h-[28px] w-[28px] object-contain drop-shadow-xs select-none"
                style={LOGO_IMG_STYLE}
                alt="SIET Space"
              />
            )}
          </div>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[16px] font-bold tracking-tight text-[#202124] dark:text-zinc-100">
              SIET Space
            </span>
            <span className="text-[10px] font-medium text-[#707070] dark:text-zinc-400">
              SIET learning community
            </span>
          </span>
        </a>

        {/* Center capsule search bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="mx-[4px] min-w-[48px] w-full max-w-md flex-1 sm:mx-auto"
          role="search"
        >
          <div className="relative w-full flex items-center" style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <Search
              size={16}
              className="pointer-events-none absolute left-[14px] top-1/2 h-[16px] w-[16px] text-[#707070] transition-colors z-10 shrink-0 dark:text-zinc-400"
              style={{ transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={searchPlaceholder || 'ค้นหาใน SIET Space'}
              placeholder={searchPlaceholder}
              className="h-[44px] w-full cursor-text rounded-full border border-solid border-[#EAE6EA] bg-[#FAF7F9] pl-[36px] pr-[48px] text-[12px] text-[#202124] placeholder:text-[#707070] transition-all duration-200 hover:border-[#D6D0D6] hover:bg-white focus:border-[#ED4988] focus-visible:border-[#ED4988] sm:text-[14px] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:hover:bg-zinc-800/80 dark:focus:bg-zinc-900"
            />
            {draft && (
              <button
                type="button"
                style={{ transform: 'translateY(-50%)' }}
                className="absolute right-[2px] top-1/2 flex h-[44px] w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-[#707070] transition-colors hover:bg-[#FCE7F0] hover:text-[#C92F6B] focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-[#C92F6B] cursor-pointer z-10 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-pink-200"
                  onClick={() => {
                    setDraft('')
                    onSearch?.('')
                  }}
                aria-label="ล้างการค้นหา"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </form>

        {/* Right side items */}
        <div className="ml-auto flex shrink-0 items-center gap-[4px] sm:gap-[8px]">
          {/* Points Wallet Button & Popover */}
          {showPointsWallet && user && (
            <div className="relative z-[100]" ref={walletRef}>
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !isWalletOpen
                  setIsWalletOpen(nextOpen)
                  setIsDropdownOpen(false)
                  setIsNotificationsOpen(false)
                  if (nextOpen) {
                    fetchWallet()
                  }
                  if (onPointsClick) onPointsClick()
                }}
                className="group relative flex min-h-[44px] min-w-[44px] items-center gap-[6px] rounded-full border border-[#E3D8FB] bg-[#F3E8FF] px-[12px] py-[8px] text-[12px] font-semibold text-[#6035C8] transition-colors duration-150 hover:border-[#C7B1F5] hover:bg-[#EADBFF] active:scale-95 max-sm:gap-[4px] max-sm:px-[10px] cursor-pointer focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-[#C92F6B] dark:border-[#604D82] dark:bg-[#382A4D] dark:text-[#DECAFF]"
                aria-label="กระเป๋าแต้ม"
                aria-expanded={isWalletOpen}
              >
                <Coins size={16} className="h-4 w-4 text-[#8A57FF] dark:text-[#DECAFF]" style={{ width: 16, height: 16, flexShrink: 0 }} />
                {isExempt ? (
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <InfinityIcon className="h-3.5 w-3.5" /> <span className="max-sm:hidden">ไม่จำกัด</span>
                  </span>
                ) : (
                  <span className="text-xs font-semibold tabular-nums">
                    {balance} <span className="max-sm:hidden">PT</span>
                  </span>
                )}
              </button>

              {/* Full Points Wallet Popover */}
              {isWalletOpen && (
                <div className="community-theme absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-[16px] border border-[#EAE6EA] bg-white p-0 text-slate-800 shadow-[0_4px_16px_rgba(32,33,36,0.04)] z-[110] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100" style={{ fontFamily: NAVBAR_FONT }}>
                  {/* Top Stats */}
                  <div className="border-b border-slate-100 p-4 dark:border-zinc-800">
                    <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold dark:text-zinc-500">
                      Points Wallet
                    </p>
                    <div className="mt-1 flex items-end justify-between">
                      <p className="text-3xl font-bold tabular-nums text-[#6035C8] dark:text-[#DECAFF]">
                        {isExempt ? '∞' : balance}
                        <span className="ml-1 text-base font-medium text-slate-500 dark:text-zinc-400">แต้ม</span>
                      </p>
                      {isExempt && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                          อาจารย์/ผู้ดูแล ไม่ถูกตัดแต้ม
                        </span>
                      )}
                    </div>
                    {walletData?.stats && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                        ได้รับจากการแชร์/ช่วยเพื่อนรวม +{walletData.stats.earned || 0} แต้ม · โพสต์ {walletData.stats.posts || 0} รายการ
                      </p>
                    )}
                  </div>

                  {/* Rules and Earnings */}
                  <div className="p-4 border-b border-slate-100 max-h-72 overflow-y-auto dark:border-zinc-800">
                    <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">อัตราการตัดแต้ม</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="text-slate-600 dark:text-zinc-300">ถาม RAG AI 1 คำถาม</div>
                      <div className="text-right font-semibold tabular-nums text-slate-800 dark:text-zinc-200">1 แต้ม</div>

                      <div className="text-slate-600 dark:text-zinc-300">เซสชัน RAG 5 ข้อความ</div>
                      <div className="text-right font-semibold tabular-nums text-slate-800 dark:text-zinc-200">4 แต้ม</div>

                      <div className="text-slate-600 dark:text-zinc-300">สร้าง AI Quiz 1 ชุด</div>
                      <div className="text-right font-semibold tabular-nums text-slate-800 dark:text-zinc-200">8 แต้ม</div>

                      <div className="text-slate-600 dark:text-zinc-300">สร้าง AI Roadmap 1 แผน</div>
                      <div className="text-right font-semibold tabular-nums text-slate-800 dark:text-zinc-200">15 แต้ม</div>

                      <div className="text-slate-600 dark:text-zinc-300">นำเข้าควิซเพื่อน</div>
                      <div className="text-right font-semibold tabular-nums text-slate-800 dark:text-zinc-200">1 แต้ม</div>

                      <div className="text-slate-600 dark:text-zinc-300">ดู/บันทึก Roadmap เพื่อน</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">ฟรี</div>
                    </div>

                    <p className="mb-1.5 mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      วิธีได้แต้มคืน
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="text-slate-600 dark:text-zinc-300">โพสต์เนื้อหาลงฟีด</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +2 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤6 ต่อวัน)</span>
                      </div>

                      <div className="text-slate-600 dark:text-zinc-300">แชร์สรุปบทเรียน</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +2 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤6 ต่อวัน)</span>
                      </div>

                      <div className="text-slate-600 dark:text-zinc-300">มีคนกดถูกใจโพสต์เรา</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +1 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤10 ต่อวัน)</span>
                      </div>

                      <div className="text-slate-600 dark:text-zinc-300">มีคนกด Helpful</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +1 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤10 ต่อวัน)</span>
                      </div>

                      <div className="text-slate-600 dark:text-zinc-300">มีคนแชร์โพสต์เรา</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +2 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤10 ต่อวัน)</span>
                      </div>

                      <div className="text-slate-600 dark:text-zinc-300">แก้ไขโพสต์ให้ดีขึ้น</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +1 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤2 ต่อวัน)</span>
                      </div>

                      <div className="text-slate-600 dark:text-zinc-300">เพื่อนเล่นควิซเราจนจบ</div>
                      <div className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +1 <span className="ml-1 font-normal text-slate-500 dark:text-zinc-400">(≤15 ต่อควิซ)</span>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400">
                      แต้มที่ได้จากคนอื่นจะนับครั้งเดียวต่อคนต่อโพสต์ และมีเพดานต่อวันเพื่อกันการปั๊มแต้ม
                    </p>
                  </div>

                  {/* Transaction History */}
                  <div className="p-4 border-b border-slate-100 dark:border-zinc-800">
                    <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">ประวัติแต้ม</p>
                    {isWalletLoading ? (
                      <div className="space-y-2 py-2">
                        <div className="h-6 w-full animate-pulse rounded-[6px] bg-slate-100 dark:bg-zinc-800" />
                        <div className="h-6 w-full animate-pulse rounded-[6px] bg-slate-100 dark:bg-zinc-800" />
                      </div>
                    ) : !walletData?.history || walletData.history.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-[16px] border border-[#EAE6EA] bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400" role="status">
                        <Coins aria-hidden="true" className="h-4 w-4 shrink-0" />
                        <span>ยังไม่มีรายการ</span>
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                        {walletData.history.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between text-xs">
                            <div className="min-w-0 pr-2">
                              <p className="truncate font-medium text-slate-800 dark:text-zinc-200">
                                {kindLabel(tx.kind)}
                              </p>
                              <p className="truncate text-[11px] text-slate-400 dark:text-zinc-500">
                                {tx.note ? `${tx.note} ` : ''}{tx.created_at ? `· ${timeAgo(tx.created_at)}` : ''}
                              </p>
                            </div>
                            <span
                              className={`ml-2 flex shrink-0 items-center gap-0.5 font-semibold tabular-nums ${
                                tx.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {tx.delta >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {tx.delta >= 0 ? `+${tx.delta}` : tx.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 flex justify-end dark:bg-zinc-800/50">
                    <button
                      type="button"
                      onClick={() => setIsWalletOpen(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-[8px] hover:bg-slate-200/60 transition-colors cursor-pointer dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-700/60"
                    >
                      ปิด
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notifications Button & Dropdown */}
          {notifications ?? (
            <div className="relative z-[100]" ref={notifRef}>
              <NavbarBellButton
                unreadCount={unreadCount}
                aria-expanded={isNotificationsOpen}
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen)
                  setIsDropdownOpen(false)
                  setIsWalletOpen(false)
                  if (onOpenNotifications) onOpenNotifications()
                }}
              />

              {isNotificationsOpen && (
                <div className="community-theme absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[16px] border border-[#EAE6EA] bg-white p-0 text-slate-800 shadow-[0_4px_16px_rgba(32,33,36,0.04)] z-[110] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100" style={{ fontFamily: NAVBAR_FONT }}>
                  <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between dark:border-zinc-800">
                    <p className="text-sm font-semibold">การแจ้งเตือน</p>
                    <a
                      href={buildCrossUrl(`${workspaceUrl}/community`)}
                      className="text-xs text-pink-600 no-underline hover:text-pink-700 dark:text-pink-400"
                    >
                      ดูทั้งหมด
                    </a>
                  </div>
                  <div className="m-4 flex items-center justify-center gap-2 rounded-[16px] border border-[#EAE6EA] bg-[#FAF7F9] p-4 text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400" role="status">
                    <Bell aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>ยังไม่มีการแจ้งเตือนใหม่</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Profile / Login */}
          {user ? (
            <div className="relative z-[100]" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen)
                  setIsWalletOpen(false)
                  setIsNotificationsOpen(false)
                }}
                className="flex h-[44px] min-h-[44px] shrink-0 items-center gap-[8px] rounded-full border-0 bg-transparent px-[6px] py-0 text-[#202124] hover:bg-[#FCE7F0] transition-colors focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-[#C92F6B] cursor-pointer dark:text-zinc-100 dark:hover:bg-zinc-800"
                aria-label="เปิดเมนูบัญชีผู้ใช้"
                aria-expanded={isDropdownOpen}
              >
                {/* Avatar with initial or photo */}
                <div
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FCE7F0] text-[#6B0F3F] font-bold text-xs ring-1.5 ring-[#F7B7D0]"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '9999px',
                    backgroundColor: '#FCE7F0',
                    color: '#6B0F3F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                    flexShrink: 0,
                    border: '1.5px solid #F7B7D0',
                  }}
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={activeName}
                      className="h-full w-full object-cover"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ color: '#6B0F3F', fontWeight: 700, lineHeight: 1 }}>{activeInitials}</span>
                  )}
                </div>
                <span
                  className="max-w-[140px] truncate text-[14px] font-semibold text-[#202124] dark:text-zinc-100"
                >
                  {activeName}
                </span>
                <ChevronDown
                  size={14}
                  className="h-3.5 w-3.5 shrink-0 text-[#707070] dark:text-zinc-400"
                />
              </button>

              {/* Profile Dropdown Menu */}
              {isDropdownOpen && (
                <div className="community-theme absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-1rem)] rounded-[16px] border border-[#EAE6EA] bg-white p-2.5 text-slate-800 shadow-[0_4px_16px_rgba(32,33,36,0.04)] z-[110] animate-in fade-in-0 zoom-in-95 duration-150 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100" style={{ fontFamily: NAVBAR_FONT }}>
                  {/* User Profile Header */}
                  <div className="px-2.5 pb-3 pt-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-200 text-pink-800 font-bold text-base shadow-xs">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={activeName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{activeInitials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">
                          {activeName}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-normal text-slate-500 dark:text-zinc-300">
                          {user.email || `@${user.username}`}
                        </p>
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-800 dark:bg-pink-950/60 dark:text-pink-300">
                          <CircleCheck className="h-3 w-3" />
                          สมาชิก SIET Space · {roleLabel(user.role)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="my-2 h-[1px] bg-pink-100 dark:bg-zinc-800" />

                  {/* Links */}
                  <a
                    href={profileHref}
                    onClick={(e) => { setIsDropdownOpen(false); openInHost(e, onOpenProfile) }}
                    className="mb-1 flex min-h-[44px] items-center gap-2.5 rounded-[12px] border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 no-underline transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <UserRound className="h-4 w-4 text-pink-600 shrink-0 dark:text-pink-400" />
                    <span>ดูโปรไฟล์เต็ม</span>
                  </a>

                  <a
                    href={buildCrossUrl(`${workspaceUrl}/community?view=library`)}
                    onClick={(e) => { setIsDropdownOpen(false); openInHost(e, onOpenLibrary) }}
                    className="mb-1 flex min-h-[44px] items-center gap-2.5 rounded-[12px] border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 no-underline transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <BookOpen className="h-4 w-4 text-pink-600 shrink-0 dark:text-pink-400" />
                    <span>คลังความรู้และไฟล์ของฉัน</span>
                  </a>

                  {isPrivileged ? (
                    <a
                      href={buildCrossUrl(`${workspaceUrl}/settings`)}
                      onClick={(e) => { setIsDropdownOpen(false); openInHost(e, onOpenSettings) }}
                      className="mb-1 flex min-h-[44px] items-center gap-2.5 rounded-[12px] border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 no-underline transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Settings className="h-4 w-4 text-pink-600 shrink-0 dark:text-pink-400" />
                      <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                    </a>
                  ) : (
                    <div
                      title="การตั้งค่าบัญชีสำหรับนักศึกษายังไม่พร้อมใช้งาน"
                      className="mb-1 flex min-h-11 items-center gap-2.5 rounded-[12px] border border-pink-100 bg-slate-50/50 px-3 py-2 text-sm text-slate-400 cursor-not-allowed opacity-60 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-500"
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                    </div>
                  )}

                  <a
                    href={buildCrossUrl(`${workspaceUrl}/community?view=rules`)}
                    onClick={(e) => { setIsDropdownOpen(false); openInHost(e, onOpenRules) }}
                    className="mb-1 flex min-h-[44px] items-center gap-2.5 rounded-[12px] border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 no-underline transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <CircleHelp className="h-4 w-4 text-pink-600 shrink-0 dark:text-pink-400" />
                    <span>ช่วยเหลือและกฎชุมชน</span>
                  </a>

                  <div className="my-2 h-[1px] bg-pink-100 dark:bg-zinc-800" />

                  {/* App Links */}
                  <button
                    type="button"
                    onClick={() => { setIsDropdownOpen(false); handleOpenQuiz() }}
                    aria-current={activeRoute === 'quiz' ? 'page' : undefined}
                    className={`w-full flex items-center gap-2 rounded-[12px] border-0 px-3 py-2 text-sm transition-colors cursor-pointer dark:text-zinc-100 ${
                      activeRoute === 'quiz'
                        ? 'bg-pink-50 text-[#C92F6B] dark:bg-pink-950/40 dark:text-pink-200'
                        : 'bg-transparent text-slate-800 hover:bg-pink-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <GraduationCap className="h-4 w-4 text-emerald-600 shrink-0 dark:text-emerald-400" />
                    <span>แอป AI Quiz ↗</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsDropdownOpen(false); handleOpenRoadmap() }}
                    aria-current={activeRoute === 'roadmap' ? 'page' : undefined}
                    className={`w-full flex items-center gap-2 rounded-[12px] border-0 px-3 py-2 text-sm transition-colors cursor-pointer dark:text-zinc-100 ${
                      activeRoute === 'roadmap'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'bg-transparent text-slate-800 hover:bg-pink-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MapIcon className="h-4 w-4 text-orange-600 shrink-0 dark:text-orange-400" />
                    <span>แอป AI Roadmap</span>
                  </button>

                  <div className="my-2 h-[1px] bg-pink-100 dark:bg-zinc-800" />

                  {/* Theme Toggle (only where the host app owns the theme) */}
                  {onToggleTheme && (
                    <div className="rounded-[12px] border border-pink-100 bg-slate-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                      <button
                        type="button"
                        onClick={onToggleTheme}
                        className="w-full flex items-center justify-between border-0 bg-transparent px-2 py-1 text-sm text-slate-700 cursor-pointer dark:text-zinc-200"
                      >
                        <span className="flex items-center gap-2">
                          {isDark ? <Moon className="h-4 w-4 text-amber-400" /> : <Sun className="h-4 w-4 text-amber-500" />}
                          <span>ธีม ({isDark ? 'โหมดมืด' : 'โหมดสว่าง'})</span>
                        </span>
                        <span className="text-xs text-slate-400">สลับ</span>
                      </button>
                    </div>
                  )}

                  {/* Logout */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-2 w-full min-h-11 flex items-center gap-2 rounded-[12px] border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 transition-colors hover:bg-rose-100 cursor-pointer dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a
              href={buildCrossUrl(`${workspaceUrl}/login`)}
              className="flex min-h-[44px] items-center gap-[6px] rounded-full border border-[#F7B7D0] bg-[#FCE7F0] px-[14px] py-[8px] text-[12px] font-semibold text-[#C92F6B] no-underline transition-colors hover:bg-[#F7B7D0] active:scale-95 focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-[#C92F6B] dark:border-[#694255] dark:bg-[#382630] dark:text-[#F9C4DC] dark:hover:bg-[#4A2B3C]"
            >
              เข้าสู่ระบบ
            </a>
          )}
        </div>
      </div>
    </header>
  )
}

export default Navbar
