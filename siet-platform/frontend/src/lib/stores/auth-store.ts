import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getApiUrl } from '@/lib/config'
import { authApi } from '@siet/platform/lib/api/auth'

export interface AuthUser {
  id: string
  username: string
  display_name?: string | null
  role?: string | null
  email?: string | null
  avatar_url?: string | null
  student_id?: string | null
  points_balance?: number
  points_exempt?: boolean
  disabled?: boolean
  suspend_reason?: string | null
  pdpa_consented_at?: string | null
  created_at?: string | null
  last_login_at?: string | null
}

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  user: AuthUser | null
  isLoading: boolean
  error: string | null
  lastAuthCheck: number | null
  isCheckingAuth: boolean
  hasHydrated: boolean
  authRequired: boolean | null
  registrationEnabled: boolean
  googleLoginEnabled: boolean
  googleLoginMock: boolean
  allowedDomains: string[]

  setHasHydrated: (state: boolean) => void
  /** Store a token + user obtained outside the password flow (Google SSO). */
  setSession: (token: string, user: AuthUser) => void
  checkAuthRequired: () => Promise<boolean>
  login: (username: string, password: string) => Promise<boolean>
  register: (
    username: string,
    password: string,
    displayName?: string
  ) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
  refreshUser: () => Promise<AuthUser | null>
  acceptPdpaConsent: () => Promise<boolean>
}

/**
 * The AI Quiz / AI Roadmap apps keep the token they were handed under this
 * key. Behind the proxy they share this app's origin, so signing in as someone
 * else or signing out here reaches them too. Only localStorage: a cookie would
 * be sent to every port of the host, i.e. to other SIET Space copies as well.
 */
const APPS_TOKEN_KEY = 'kmitlai-workspace-token'

function shareTokenWithApps(token: string | null) {
  try {
    if (token) localStorage.setItem(APPS_TOKEN_KEY, token)
    else localStorage.removeItem(APPS_TOKEN_KEY)
  } catch {
    // Private mode: the apps still get the token through the hand-off link.
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      user: null,
      isLoading: false,
      error: null,
      lastAuthCheck: null,
      isCheckingAuth: false,
      hasHydrated: false,
      authRequired: null,
      registrationEnabled: true,
      googleLoginEnabled: false,
      googleLoginMock: false,
      allowedDomains: ['kmitl.ac.th'],

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      setSession: (token: string, user: AuthUser) => {
        shareTokenWithApps(token)
        set({
          isAuthenticated: true,
          token,
          user,
          isLoading: false,
          error: null,
          lastAuthCheck: Date.now(),
        })
      },

      checkAuthRequired: async () => {
        try {
          const apiUrl = await getApiUrl()
          const response = await fetch(`${apiUrl}/api/auth/status`, {
            cache: 'no-store',
          })
          if (!response.ok) {
            throw new Error(`Auth status check failed: ${response.status}`)
          }
          const data = await response.json()
          const required = Boolean(data.jwt_auth_enabled ?? data.auth_enabled)
          const registrationEnabled = Boolean(data.registration_enabled ?? true)
          const currentUser = data.user as AuthUser | undefined
          set({
            authRequired: required,
            registrationEnabled,
            googleLoginEnabled: Boolean(data.google_login_enabled),
            googleLoginMock: Boolean(data.google_login_mock),
            allowedDomains: Array.isArray(data.allowed_domains) && data.allowed_domains.length
              ? data.allowed_domains
              : ['kmitl.ac.th'],
          })

          if (!required) {
            set({ isAuthenticated: true, token: 'not-required' })
          } else if (currentUser) {
            set({ user: currentUser })
          }
          return required
        } catch (error) {
          console.error('Failed to check auth status:', error)
          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            set({
              error: 'Unable to connect to server. Please check if the API is running.',
              authRequired: null,
            })
          } else {
            set({ authRequired: true })
          }
          throw error
        }
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()
          const data = await authApi.login(apiUrl, { username, password })
          shareTokenWithApps(data.access_token)
          set({
            isAuthenticated: true,
            token: data.access_token,
            user: data.user,
            isLoading: false,
            lastAuthCheck: Date.now(),
            error: null,
          })
          return true
        } catch (error: unknown) {
          console.error('Login error:', error)
          const message = extractErrorMessage(error, 'Invalid username or password')
          set({
            error: message,
            isLoading: false,
            isAuthenticated: false,
            token: null,
          })
          return false
        }
      },

      register: async (username: string, password: string, displayName?: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()
          const data = await authApi.register(apiUrl, {
            username,
            password,
            display_name: displayName,
          })
          shareTokenWithApps(data.access_token)
          set({
            isAuthenticated: true,
            token: data.access_token,
            user: data.user,
            isLoading: false,
            lastAuthCheck: Date.now(),
            error: null,
          })
          return true
        } catch (error: unknown) {
          console.error('Register error:', error)
          const message = extractErrorMessage(error, 'Could not create account')
          set({
            error: message,
            isLoading: false,
            isAuthenticated: false,
            token: null,
          })
          return false
        }
      },

      logout: async () => {
        const apiUrl = await getApiUrl().catch(() => null)
        const token = get().token
        shareTokenWithApps(null)
        if (apiUrl && token && token !== 'not-required') {
          try {
            await authApi.logout(apiUrl, token)
          } catch (error) {
            console.warn('Logout request failed (token discarded anyway):', error)
          }
        }
        set({
          isAuthenticated: false,
          token: null,
          user: null,
          error: null,
          lastAuthCheck: null,
        })
      },

      refreshUser: async () => {
        const apiUrl = await getApiUrl()
        const token = get().token
        if (!token || token === 'not-required') {
          return null
        }
        try {
          const user = await authApi.me(apiUrl, token)
          set({ user })
          return user
        } catch (error) {
          console.warn('refreshUser failed:', error)
          return null
        }
      },

      acceptPdpaConsent: async () => {
        const apiUrl = await getApiUrl()
        const token = get().token
        if (!token || token === 'not-required') {
          return false
        }
        try {
          const user = await authApi.consentPdpa(apiUrl, token)
          set({ user })
          return true
        } catch (error) {
          console.error('acceptPdpaConsent failed:', error)
          return false
        }
      },

      checkAuth: async () => {
        const state = get()
        const { token, lastAuthCheck, isCheckingAuth, isAuthenticated } = state

        if (isCheckingAuth) return isAuthenticated
        if (!token) return false
        if (token === 'not-required') return true

        const now = Date.now()
        if (isAuthenticated && lastAuthCheck && now - lastAuthCheck < 30_000) {
          return true
        }

        set({ isCheckingAuth: true })
        try {
          const apiUrl = await getApiUrl()
          const user = await authApi.me(apiUrl, token)
          set({
            isAuthenticated: true,
            user,
            lastAuthCheck: now,
            isCheckingAuth: false,
          })
          return true
        } catch {
          set({
            isAuthenticated: false,
            token: null,
            user: null,
            lastAuthCheck: null,
            isCheckingAuth: false,
          })
          return false
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)


function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as { response?: { data?: { detail?: unknown } }; message?: string }
    const detail = errObj.response?.data?.detail
    if (typeof detail === 'string' && detail.length > 0) return detail
    if (errObj.message) return errObj.message
  }
  return fallback
}