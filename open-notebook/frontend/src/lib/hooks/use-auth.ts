'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function useAuth() {
  const router = useRouter()
  const {
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    checkAuth,
    checkAuthRequired,
    error,
    hasHydrated,
    authRequired,
    registrationEnabled,
    user,
  } = useAuthStore()

  useEffect(() => {
    // Only check auth after the store has hydrated from localStorage
    if (hasHydrated) {
      if (authRequired === null) {
        checkAuthRequired().then((required) => {
          if (required) checkAuth()
        })
      } else if (authRequired) {
        checkAuth()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, authRequired])

  const navigateAfterAuth = () => {
    // Read fresh state directly from the store — the closure `user` is
    // captured at hook render time and will still be null immediately after
    // login() sets the store, before React re-renders.
    const currentUser = useAuthStore.getState().user
    if (currentUser?.role === 'admin') {
      router.push('/admin')
      return
    }
    // Students / teachers land on the SIET Space community feed, unless they
    // were sent to /login from a protected page.
    let redirect: string | null = null
    try {
      redirect = sessionStorage.getItem('redirectAfterLogin')
      if (redirect) sessionStorage.removeItem('redirectAfterLogin')
    } catch {
      redirect = null
    }
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//') && redirect !== '/login') {
      router.push(redirect)
    } else {
      router.push('/community')
    }
  }

  const handleLogin = async (username: string, password: string) => {
    const success = await login(username, password)
    if (success) navigateAfterAuth()
    return success
  }

  const handleRegister = async (
    username: string,
    password: string,
    displayName?: string
  ) => {
    const success = await register(username, password, displayName)
    if (success) navigateAfterAuth()
    return success
  }

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return {
    isAuthenticated,
    isLoading: isLoading || !hasHydrated,
    error,
    user,
    registrationEnabled,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  }
}
