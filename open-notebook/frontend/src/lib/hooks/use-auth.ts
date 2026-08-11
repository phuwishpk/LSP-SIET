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
    const userRole = user?.role
    if (userRole === 'admin') {
      router.push('/notebooks')
    } else {
      router.push('/dashboard')
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
