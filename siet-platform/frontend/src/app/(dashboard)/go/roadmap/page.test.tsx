import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Node's own (file-backed) localStorage hides jsdom's: an in-memory one before the store is created.
vi.hoisted(() => {
  const items = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true, writable: true })
})

const app = vi.hoisted(() => ({ openRoadmapApp: vi.fn(async () => {}), me: vi.fn() }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('path=%2Froadmap%2Froadmap_session-abc'),
}))
vi.mock('@siet/platform/lib/external-apps', () => ({ openRoadmapApp: app.openRoadmapApp }))
vi.mock('@siet/platform/lib/api/auth', () => ({ authApi: { me: app.me } }))
vi.mock('@/lib/config', () => ({ getApiUrl: async () => 'http://api.test' }))

import { useAuthStore } from '@/lib/stores/auth-store'
import GoRoadmapPage from './page'

const student = { id: '1', username: 'student1', role: 'student' }

beforeEach(() => {
  // What a returning visitor has after a week away: a remembered sign-in whose token has expired.
  useAuthStore.setState({ token: 'old-token', user: student, isAuthenticated: true, lastAuthCheck: null, isCheckingAuth: false })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('/go/roadmap (the relay into AI Roadmap)', () => {
  it('does not hand an expired session over to AI Roadmap', async () => {
    app.me.mockRejectedValue(new Error('401'))
    render(<GoRoadmapPage />)

    await waitFor(() => expect(app.me).toHaveBeenCalled())
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
    expect(app.openRoadmapApp).not.toHaveBeenCalled()
  })

  it('hands a session the API accepts over, once, to the page asked for', async () => {
    app.me.mockResolvedValue(student)
    render(<GoRoadmapPage />)

    await waitFor(() => expect(app.openRoadmapApp).toHaveBeenCalledTimes(1))
    expect(app.openRoadmapApp).toHaveBeenCalledWith(expect.objectContaining({ path: '/roadmap/roadmap_session-abc', replace: true }))
  })

  it('waits for a session check that is already running instead of trusting the remembered one', async () => {
    useAuthStore.setState({ isCheckingAuth: true })
    render(<GoRoadmapPage />)
    await new Promise((r) => setTimeout(r, 50))
    expect(app.openRoadmapApp).not.toHaveBeenCalled()

    // The running check (the dashboard layout's) finds the token expired.
    act(() => useAuthStore.setState({ isCheckingAuth: false, isAuthenticated: false, token: null }))
    await new Promise((r) => setTimeout(r, 50))
    expect(app.openRoadmapApp).not.toHaveBeenCalled()
  })
})
