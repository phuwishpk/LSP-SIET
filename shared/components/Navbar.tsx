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
  Infinity as InfinityIcon,
  LogOut,
  Map as MapIcon,
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
} from 'lucide-react'

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

export interface NavbarProps {
  user?: NavbarUser | null
  pointsBalance?: number
  showPointsWallet?: boolean
  notificationsCount?: number
  communityUrl?: string
  logoSrc?: string
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
  className?: string
}

// --- Formatters & Helpers ---
export function setSessionCookie(token: string) {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `kmitl_session_token=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`
  } catch {}
}

export function clearSessionCookie() {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `kmitl_session_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  } catch {}
}

export function getSessionCookie(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie.match(/(?:^|;\s*)kmitl_session_token=([^;]+)/)
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1])
      if (decoded && decoded !== 'not-required') return decoded
    }
  } catch {}
  return null
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

/**
 * Single source of truth for the workspace URL.
 * Defaults to port 3500 (the active SIET Community Next.js app).
 */
export function getWorkspaceUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3500'
  const fromEnv = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WORKSPACE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const { protocol, hostname, port, origin } = window.location
  if (port === '3001' || port === '3002' || port === '3000') {
    return `${protocol}//${hostname}:3500`
  }
  return origin
}

// --- Main Navbar Component ---
export function Navbar({
  user: initialUser,
  pointsBalance: initialPoints,
  showPointsWallet = true,
  notificationsCount: initialNotificationsCount = 0,
  communityUrl,
  logoSrc,
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
  className = '',
}: NavbarProps) {
  const [user, setUser] = React.useState<NavbarUser | null>(initialUser ?? null)
  const [balance, setBalance] = React.useState<number>(initialPoints ?? 0)
  const [isExempt, setIsExempt] = React.useState<boolean>(false)
  const [workspaceUrl, setWorkspaceUrl] = React.useState<string>('http://localhost:3500')
  const [currentToken, setCurrentToken] = React.useState<string | null>(null)
  const [walletData, setWalletData] = React.useState<WalletData | null>(null)
  const [isWalletLoading, setIsWalletLoading] = React.useState<boolean>(false)
  const tokenRef = React.useRef<string | null>(null)

  // UI state
  const [draft, setDraft] = React.useState(searchDefaultValue)
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [isWalletOpen, setIsWalletOpen] = React.useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false)
  const [unreadCount, setUnreadCount] = React.useState(initialNotificationsCount)
  const [isDark, setIsDark] = React.useState(false)

  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const walletRef = React.useRef<HTMLDivElement>(null)
  const notifRef = React.useRef<HTMLDivElement>(null)

  // 1. Resolve Workspace Root URL (port 3500)
  React.useEffect(() => {
    const url = communityUrl ? communityUrl.replace(/\/community\/?$/, '') : getWorkspaceUrl()
    setWorkspaceUrl(url)
  }, [communityUrl])

  // Helper for cross-origin / cross-port links (ensures port 3500 and forwards token)
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
        // If target points to localhost workspace, ensure it targets port 3500
        if (typeof window !== 'undefined') {
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
            if (
              !u.pathname.startsWith('/quiz') &&
              !u.pathname.startsWith('/roadmap')
            ) {
              if (u.port === '3000' || !u.port || window.location.port === '3001' || window.location.port === '3002') {
                u.port = '3500'
              }
            }
          }
        }
        // If target origin differs from current origin, forward token in query parameter
        if (typeof window !== 'undefined' && u.origin !== window.location.origin) {
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

  // 2. Load Auth & Real User Sync from LocalStorage / Cookie / URL token / API
  React.useEffect(() => {
    if (initialUser !== undefined && initialUser !== null) {
      setUser(initialUser)
      if (initialPoints !== undefined) setBalance(initialPoints)
      else if (initialUser.points_balance !== undefined) setBalance(initialUser.points_balance)
      if (initialUser.points_exempt !== undefined) setIsExempt(initialUser.points_exempt)
      return
    }

    if (typeof window === 'undefined') return

    let token: string | null = null
    let loadedUser: NavbarUser | null = null

    // A. Check URL parameter ?token=... (from cross-app navigation)
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')

    // B. Check shared cookie across ports
    const cookieToken = getSessionCookie()

    // C. Check auth-storage (standard zustand store for SIET Platform)
    let storageToken: string | null = null
    let storageUser: NavbarUser | null = null
    try {
      const authStorage = localStorage.getItem('auth-storage')
      if (authStorage) {
        const parsed = JSON.parse(authStorage)
        storageToken = parsed?.state?.token || null
        storageUser = parsed?.state?.user || null
      }
    } catch {}

    // D. Check workspace token
    let workspaceToken: string | null = null
    try {
      workspaceToken = localStorage.getItem('kmitlai-workspace-token')
    } catch {}

    // Precedence: URL token > Shared cookie > auth-storage token > workspaceToken
    if (urlToken && urlToken !== 'not-required') {
      token = urlToken
      setSessionCookie(urlToken)
      try {
        localStorage.setItem('kmitlai-workspace-token', urlToken)
        const u = new URL(window.location.href)
        u.searchParams.delete('token')
        window.history.replaceState({}, document.title, u.pathname + (u.search ? u.search : '') + u.hash)
      } catch {}
    } else if (cookieToken && cookieToken !== 'not-required') {
      token = cookieToken
    } else if (storageToken && storageToken !== 'not-required') {
      token = storageToken
      setSessionCookie(storageToken)
    } else if (workspaceToken && workspaceToken !== 'not-required') {
      token = workspaceToken
      setSessionCookie(workspaceToken)
    }

    tokenRef.current = token
    setCurrentToken(token)

    // Only adopt storageUser optimistically if storageToken actually matches the active token!
    // (Prevents flashing stale accounts like "test" when switching sessions across ports)
    if (storageUser && storageToken === token) {
      loadedUser = storageUser
      setUser(loadedUser)
      if (loadedUser?.points_balance !== undefined) setBalance(loadedUser.points_balance)
      if (loadedUser?.points_exempt !== undefined) setIsExempt(loadedUser.points_exempt)
    }

    // Always fetch fresh profile & wallet from API if token exists
    if (token && token !== 'not-required') {
      const fetchFreshProfile = async () => {
        try {
          let targetUrl = `${getWorkspaceUrl()}/api/users/me`
          if (typeof window !== 'undefined') {
            if (window.location.port === '3001' || window.location.pathname.startsWith('/quiz')) {
              targetUrl = '/quiz/api/me'
            } else if (window.location.port === '3002' || window.location.pathname.startsWith('/roadmap')) {
              targetUrl = '/roadmap/api/ws/users/me'
            }
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
              setSessionCookie(token)

              // Keep auth-storage in sync
              try {
                const currentStorage = localStorage.getItem('auth-storage')
                const currentParsed = currentStorage ? JSON.parse(currentStorage) : {}
                localStorage.setItem(
                  'auth-storage',
                  JSON.stringify({
                    ...currentParsed,
                    state: {
                      ...(currentParsed.state || {}),
                      token,
                      user: realUser,
                      isAuthenticated: true,
                    },
                  })
                )
                localStorage.setItem('kmitlai-workspace-token', token)
              } catch {}
            }
          } else if (res.status === 401) {
            clearSessionCookie()
            try {
              localStorage.removeItem('auth-storage')
              localStorage.removeItem('kmitlai-workspace-token')
            } catch {}
            setUser(null)
          }
        } catch {
          // Keep existing local user on network error
        }
      }
      fetchFreshProfile()
      fetchWallet(token)
    } else {
      setUser(null)
    }
  }, [initialUser, initialPoints, fetchWallet])

  // 3. Theme Detection
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
  }, [])

  const toggleTheme = () => {
    if (typeof window !== 'undefined') {
      const nextDark = !document.documentElement.classList.contains('dark')
      if (nextDark) {
        document.documentElement.classList.add('dark')
        try { localStorage.setItem('theme', 'dark') } catch {}
      } else {
        document.documentElement.classList.remove('dark')
        try { localStorage.setItem('theme', 'light') } catch {}
      }
      setIsDark(nextDark)
    }
  }

  // 4. Outside Click Listener for Dropdowns
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

  // 5. Search Submit
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

  // 6. Navigation Actions
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
      const quizBase = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MY_AI_QUIZ_URL) || 'http://localhost:3001/quiz'
      window.open(buildCrossUrl(quizBase), '_blank', 'noopener,noreferrer')
    }
  }

  const handleOpenRoadmap = () => {
    setIsDropdownOpen(false)
    if (onOpenRoadmap) {
      onOpenRoadmap()
    } else if (typeof window !== 'undefined') {
      const roadmapBase = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_AI_ROADMAP_URL) || 'http://localhost:3002/roadmap'
      window.location.assign(buildCrossUrl(roadmapBase))
    }
  }

  const handleLogout = () => {
    setIsDropdownOpen(false)
    clearSessionCookie()
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('auth-storage')
        localStorage.removeItem('kmitlai-workspace-token')
      } catch {}
    }
    if (onLogout) {
      onLogout()
    } else if (typeof window !== 'undefined') {
      window.location.href = buildCrossUrl(`${workspaceUrl}/community`)
    }
  }

  const activeName = displayName(user)
  const activeInitials = initials(activeName || user?.username)
  const isPrivileged = user?.role === 'teacher' || user?.role === 'admin'
  const profileHref = buildCrossUrl(`${workspaceUrl}/community/profile/me`)

  return (
    <header
      style={{
        background: 'linear-gradient(to right, #420A2B, #6B0F3F, #8C1453)',
        borderBottom: '2.5px solid #E91E63',
        color: '#ffffff',
        minHeight: '64px',
        height: '64px',
      }}
      className={`sticky top-0 z-[100] w-full bg-gradient-to-r from-[#420A2B] via-[#6B0F3F] to-[#8C1453] text-white shadow-md shadow-black/10 select-none ${className}`}
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
          <polygon points="0,0 150,0 75,64 0,64" fill="rgba(255,255,255,0.05)" />
          <polygon points="1050,0 1200,0 1275,64 1125,64" fill="rgba(255,255,255,0.04)" />
          <polygon points="1320,0 1440,0 1440,64 1365,64" fill="rgba(255,255,255,0.06)" />
        </svg>
      </div>

      <div
        className="relative z-[100] mx-auto flex h-16 max-w-[1440px] items-center gap-1.5 px-3 sm:gap-3 sm:px-5 lg:px-6"
        style={{ height: '64px', minHeight: '64px', display: 'flex', alignItems: 'center' }}
      >
        {/* Mobile menu trigger - only rendered when onOpenMenu handler is provided */}
        {onOpenMenu && (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg p-0 text-white hover:bg-white/15 hover:text-white lg:hidden transition-colors cursor-pointer bg-transparent border-0"
            style={{ background: 'transparent', border: 'none' }}
            onClick={handleOpenMenu}
            aria-label="เปิดเมนู"
          >
            <Menu size={20} className="h-5 w-5" style={{ width: 20, height: 20 }} />
          </button>
        )}

        {/* Brand logo & tagline */}
        <a
          href={buildCrossUrl(`${workspaceUrl}/community`)}
          className="flex shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-white/10 no-underline"
          style={{ textDecoration: 'none' }}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 p-1 ring-1 ring-white/25 shadow-xs backdrop-blur-xs">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="nungsue logo"
                width={32}
                height={32}
                className="h-7 w-7 object-contain drop-shadow-xs select-none"
                onError={(e) => {
                  e.currentTarget.src = OWL_LOGO_DATA_URI
                }}
              />
            ) : (
              <OwlLogo
                size={32}
                className="h-7 w-7 object-contain drop-shadow-xs select-none"
                alt="nungsue logo"
              />
            )}
          </div>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-base font-bold tracking-tight text-white drop-shadow-xs">
              nungsue
            </span>
            <span className="text-[10px] font-medium text-pink-200/90" style={{ color: 'rgba(251, 207, 232, 0.9)' }}>
              SIET learning community
            </span>
          </span>
        </a>

        {/* Center capsule search bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="mx-1 min-w-[48px] w-auto max-w-xl flex-1 sm:mx-auto"
          role="search"
        >
          <div className="relative w-full flex items-center" style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-200/90 transition-colors z-10 shrink-0"
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: 'rgba(251, 207, 232, 0.9)',
                pointerEvents: 'none',
                zIndex: 10,
                flexShrink: 0,
              }}
            />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full cursor-text rounded-full border border-white/20 bg-white/10 pl-9 pr-10 text-xs text-white placeholder:text-pink-100/60 backdrop-blur-xs transition-all duration-200 hover:border-white/35 hover:bg-white/15 focus:border-[#E91E63] focus:bg-white/20 focus:ring-2 focus:ring-[#E91E63]/60 focus-visible:border-[#E91E63] focus-visible:ring-2 focus-visible:ring-[#E91E63]/60 sm:text-sm focus:outline-none"
              style={{
                height: '36px',
                width: '100%',
                borderRadius: '9999px',
                paddingLeft: '38px',
                paddingRight: '38px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
                fontSize: '13px',
              }}
            />
            {draft && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-pink-100 transition-all hover:bg-white/35 hover:text-white focus:outline-hidden focus:ring-1 focus:ring-pink-300 cursor-pointer z-10"
                onClick={() => setDraft('')}
                aria-label="ล้างการค้นหา"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </form>

        {/* Right side items */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
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
                className="group relative overflow-hidden flex items-center gap-1.5 rounded-full border border-amber-300/90 bg-gradient-to-r from-amber-50 via-amber-100/60 to-orange-50 px-3 py-1.5 text-amber-950 shadow-xs transition-all duration-200 hover:border-amber-400 hover:shadow-sm hover:scale-[1.03] active:scale-95 max-sm:gap-1 max-sm:px-2.5 dark:from-amber-950/60 dark:via-amber-900/40 dark:to-orange-950/30 dark:text-amber-200 dark:border-amber-600 cursor-pointer"
                style={{
                  borderRadius: '9999px',
                  border: '1px solid rgba(252, 211, 77, 0.9)',
                  background: 'linear-gradient(to right, #fffbeb, #fef3c7, #fff7ed)',
                  color: '#451a03',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
                aria-label="กระเป๋าแต้ม"
              >
                {/* Kinetic Shimmer Wave */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden" />
                <Coins size={16} className="h-4 w-4 text-amber-600 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110 dark:text-amber-400" style={{ width: 16, height: 16, color: '#d97706', flexShrink: 0 }} />
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
                <div className="community-theme absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/80 bg-white p-0 text-slate-800 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 z-[110] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                  {/* Top Stats */}
                  <div className="border-b border-slate-100 dark:border-zinc-800 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-zinc-500 font-semibold">
                      Points Wallet
                    </p>
                    <div className="mt-1 flex items-end justify-between">
                      <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {isExempt ? '∞' : balance}
                        <span className="ml-1 text-base font-medium text-slate-500 dark:text-zinc-400">แต้ม</span>
                      </p>
                      {isExempt && (
                        <span className="rounded-full bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-zinc-300">
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
                  <div className="p-4 border-b border-slate-100 dark:border-zinc-800 max-h-72 overflow-y-auto">
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
                        <div className="h-6 w-full animate-pulse rounded-md bg-slate-100 dark:bg-zinc-800" />
                        <div className="h-6 w-full animate-pulse rounded-md bg-slate-100 dark:bg-zinc-800" />
                      </div>
                    ) : !walletData?.history || walletData.history.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-zinc-500 py-1">ยังไม่มีรายการ</p>
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

                  <div className="p-3 bg-slate-50 dark:bg-zinc-800/50 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsWalletOpen(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
                    >
                      ปิด
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notifications Button & Dropdown */}
          <div className="relative z-[100]" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen(!isNotificationsOpen)
                setIsDropdownOpen(false)
                setIsWalletOpen(false)
                if (onOpenNotifications) onOpenNotifications()
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors cursor-pointer relative"
              style={{ background: 'transparent', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="การแจ้งเตือน"
            >
              <Bell size={20} className="h-5 w-5" style={{ width: 20, height: 20 }} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="community-theme absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/80 bg-white p-0 text-slate-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 z-[110] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="border-b border-slate-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">การแจ้งเตือน</p>
                  <a
                    href={buildCrossUrl(`${workspaceUrl}/community`)}
                    className="text-xs text-pink-600 hover:text-pink-700 dark:text-pink-400"
                  >
                    ดูทั้งหมด
                  </a>
                </div>
                <div className="p-4 text-center text-sm text-slate-500 dark:text-zinc-400">
                  ยังไม่มีการแจ้งเตือนใหม่
                </div>
              </div>
            )}
          </div>

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
                className="flex h-9 shrink-0 items-center gap-2 rounded-full px-1.5 text-white hover:bg-white/15 transition-colors focus-visible:ring-2 focus-visible:ring-pink-300 cursor-pointer"
                style={{ background: 'transparent', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                aria-label="เปิดเมนูบัญชีผู้ใช้"
              >
                {/* Avatar with initial or photo */}
                <div
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-[#6B0F3F] font-bold text-xs ring-1.5 ring-white/50 shadow-xs"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '9999px',
                    backgroundColor: '#fce7f3',
                    color: '#6B0F3F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                    flexShrink: 0,
                    border: '1.5px solid rgba(255, 255, 255, 0.5)',
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
                  className="max-w-[140px] truncate text-sm font-semibold text-white drop-shadow-xs"
                  style={{
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '14px',
                    maxWidth: '140px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                  }}
                >
                  {activeName}
                </span>
                <ChevronDown
                  size={14}
                  className="h-3.5 w-3.5 text-pink-200 shrink-0"
                  style={{ width: '14px', height: '14px', color: '#fbcfe8', flexShrink: 0 }}
                />
              </button>

              {/* Profile Dropdown Menu */}
              {isDropdownOpen && (
                <div className="community-theme absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200/80 bg-white p-2.5 text-slate-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 z-[110] animate-in fade-in-0 zoom-in-95 duration-150">
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
                    onClick={() => { setIsDropdownOpen(false); if (onOpenProfile) onOpenProfile() }}
                    className="mb-1 flex min-h-11 items-center gap-2.5 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <UserRound className="h-4 w-4 text-pink-600 dark:text-pink-400 shrink-0" />
                    <span>ดูโปรไฟล์เต็ม</span>
                  </a>

                  <a
                    href={buildCrossUrl(`${workspaceUrl}/community?view=library`)}
                    onClick={() => { setIsDropdownOpen(false); if (onOpenLibrary) onOpenLibrary() }}
                    className="mb-1 flex min-h-11 items-center gap-2.5 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <BookOpen className="h-4 w-4 text-pink-600 dark:text-pink-400 shrink-0" />
                    <span>คลังความรู้และไฟล์ของฉัน</span>
                  </a>

                  {isPrivileged ? (
                    <a
                      href={buildCrossUrl(`${workspaceUrl}/settings`)}
                      onClick={() => { setIsDropdownOpen(false); if (onOpenSettings) onOpenSettings() }}
                      className="mb-1 flex min-h-11 items-center gap-2.5 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Settings className="h-4 w-4 text-pink-600 dark:text-pink-400 shrink-0" />
                      <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                    </a>
                  ) : (
                    <div
                      title="การตั้งค่าบัญชีสำหรับนักศึกษายังไม่พร้อมใช้งาน"
                      className="mb-1 flex min-h-11 items-center gap-2.5 rounded-xl border border-pink-100 bg-slate-50/50 px-3 py-2 text-sm text-slate-400 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-500 cursor-not-allowed opacity-60"
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      <span>ตั้งค่าบัญชีและความเป็นส่วนตัว</span>
                    </div>
                  )}

                  <a
                    href={buildCrossUrl(`${workspaceUrl}/community?view=rules`)}
                    onClick={() => { setIsDropdownOpen(false); if (onOpenRules) onOpenRules() }}
                    className="mb-1 flex min-h-11 items-center gap-2.5 rounded-xl border border-pink-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 transition-colors hover:border-pink-200 hover:bg-pink-50 focus:bg-pink-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <CircleHelp className="h-4 w-4 text-pink-600 dark:text-pink-400 shrink-0" />
                    <span>ช่วยเหลือและกฎชุมชน</span>
                  </a>

                  <div className="my-2 h-[1px] bg-pink-100 dark:bg-zinc-800" />

                  {/* App Links */}
                  <button
                    type="button"
                    onClick={() => { setIsDropdownOpen(false); handleOpenQuiz() }}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-800 transition-colors hover:bg-pink-50 dark:text-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>แอป AI Quiz ↗</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsDropdownOpen(false); handleOpenRoadmap() }}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-800 transition-colors hover:bg-pink-50 dark:text-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <MapIcon className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
                    <span>แอป AI Roadmap</span>
                  </button>

                  <div className="my-2 h-[1px] bg-pink-100 dark:bg-zinc-800" />

                  {/* Theme Toggle */}
                  <div className="rounded-xl border border-pink-100 bg-slate-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="w-full flex items-center justify-between px-2 py-1 text-sm text-slate-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {isDark ? <Moon className="h-4 w-4 text-amber-400" /> : <Sun className="h-4 w-4 text-amber-500" />}
                        <span>ธีม ({isDark ? 'โหมดมืด' : 'โหมดสว่าง'})</span>
                      </span>
                      <span className="text-xs text-slate-400">สลับ</span>
                    </button>
                  </div>

                  {/* Logout */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-2 w-full min-h-11 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60 cursor-pointer"
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
              className="flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/25 active:scale-95"
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
