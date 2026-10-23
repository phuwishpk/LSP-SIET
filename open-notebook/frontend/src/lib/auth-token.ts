// Reads the auth token persisted by the zustand auth store
// (localStorage key `auth-storage`, written by `src/lib/stores/auth-store.ts`).
// Single source of truth for the token-parsing ritual — use this instead of
// re-reading localStorage directly.

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

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  // 1. Check URL query ?token= parameter first (cross-app navigation)
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    if (urlToken && urlToken !== 'not-required') {
      setSessionCookie(urlToken)
      try {
        localStorage.setItem('kmitlai-workspace-token', urlToken)
      } catch {}
      return urlToken
    }
  } catch {}

  // 2. Check shared session cookie across ports (3000, 3001, etc.)
  const cookieToken = getSessionCookie()
  if (cookieToken) {
    return cookieToken
  }

  // 3. Check localStorage key auth-storage
  const raw = window.localStorage.getItem('auth-storage')
  if (raw) {
    try {
      const { state } = JSON.parse(raw)
      if (state?.token && state.token !== 'not-required') {
        return state.token
      }
    } catch (error) {
      console.error('Error parsing auth storage:', error)
    }
  }

  return window.localStorage.getItem('kmitlai-workspace-token') || null
}

