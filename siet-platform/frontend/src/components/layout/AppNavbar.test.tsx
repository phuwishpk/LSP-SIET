import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Navbar } from '@shared/components/Navbar'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useThemeStore } from '@/lib/stores/theme-store'
import { AppNavbar } from './AppNavbar'

const student = { id: '1', username: 'student1', display_name: 'Student One', role: 'student' }

function visit(path: string) {
  window.history.replaceState(null, '', path)
}

// Node's own (file-backed) localStorage hides jsdom's, and the stores keep the
// one they find when they are created: put an in-memory one in before imports.
const storage = vi.hoisted(() => {
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
  return memory
})

function reply(url: string): Response {
  if (url === '/quiz/api/me') {
    return Response.json({ id: '2', username: 'player', display_name: 'Quiz Player', role: 'student' })
  }
  return new Response('{}', { status: 404 })
}

describe('the shared navbar and the session', () => {
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => reply(String(input))))
    useAuthStore.setState({ user: student, token: 'own-token', isAuthenticated: true, lastAuthCheck: Date.now() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    visit('/')
  })

  it('shows SIET Space its own user and leaves a token in the link alone', async () => {
    visit('/community?token=someone-else')
    render(<AppNavbar />)

    expect(await screen.findByText('Student One')).toBeDefined()
    expect(window.location.search).toBe('?token=someone-else')
    expect(localStorage.getItem('kmitlai-workspace-token')).toBeNull()
    expect(document.cookie).not.toContain('kmitl_session_token')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the signed-in account when a link carries another token', async () => {
    visit('/community?token=someone-else')
    await useAuthStore.getState().checkAuth()

    expect(useAuthStore.getState().token).toBe('own-token')
    expect(useAuthStore.getState().user?.username).toBe('student1')
  })

  it('hands sign-in and sign-out on to the AI apps, without a cookie', async () => {
    useAuthStore.getState().setSession('new-token', student)
    expect(localStorage.getItem('kmitlai-workspace-token')).toBe('new-token')

    await useAuthStore.getState().logout()
    expect(localStorage.getItem('kmitlai-workspace-token')).toBeNull()
    expect(document.cookie).not.toContain('kmitl_session_token')
  })

  it('in an AI app takes the hand-off once and never gives the token back to SIET Space', async () => {
    // Behind the proxy the AI app shares SIET Space's origin and its session.
    const siteSession = localStorage.getItem('auth-storage')
    visit('/quiz/solo?token=handed')
    render(<Navbar communityUrl="http://localhost:3500/community" />)

    expect(await screen.findByText('Quiz Player')).toBeDefined()
    expect(window.location.search).toBe('')
    expect(localStorage.getItem('kmitlai-workspace-token')).toBe('handed')
    expect(localStorage.getItem('auth-storage')).toBe(siteSession)
    expect(document.cookie).not.toContain('kmitl_session_token')

    fireEvent.click(screen.getByLabelText('เปิดเมนูบัญชีผู้ใช้'))
    expect(profileLink()).toBe('http://localhost:3500/community/profile/me')
  })
})

function profileLink() {
  return screen.getByText('ดูโปรไฟล์เต็ม').closest('a')?.getAttribute('href')
}

describe('where the navbar links go', () => {
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => reply(String(input))))
    useAuthStore.setState({ user: student, token: 'own-token', isAuthenticated: true, lastAuthCheck: Date.now() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    visit('/')
  })

  it('an AI app links back to the SIET Space copy that opened it', async () => {
    visit('/quiz?token=handed&return=http%3A%2F%2Flocalhost%3A18502%2Fcommunity')
    render(<Navbar />)
    await screen.findByText('Quiz Player')
    fireEvent.click(screen.getByLabelText('เปิดเมนูบัญชีผู้ใช้'))

    expect(localStorage.getItem('kmitlai-workspace-origin')).toBe('http://localhost:18502')
    expect(profileLink()).toBe('http://localhost:18502/community/profile/me')
  })

  it('does not learn a SIET Space on another host', async () => {
    visit('/quiz?token=handed&return=https%3A%2F%2Fexample.com%2Fcommunity')
    render(<Navbar />)
    await screen.findByText('Quiz Player')
    fireEvent.click(screen.getByLabelText('เปิดเมนูบัญชีผู้ใช้'))

    expect(localStorage.getItem('kmitlai-workspace-origin')).toBeNull()
    expect(profileLink()).toBe('http://localhost:3000/community/profile/me')
  })

  it('SIET Space links to itself whatever an AI app learned', async () => {
    localStorage.setItem('kmitlai-workspace-origin', 'http://localhost:18502')
    visit('/community')
    render(<AppNavbar />)
    fireEvent.click(await screen.findByLabelText('เปิดเมนูบัญชีผู้ใช้'))

    expect(profileLink()).toBe('http://localhost:3000/community/profile/me')
  })
})

describe('the theme switch', () => {
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => reply(String(input))))
    useAuthStore.setState({ user: student, token: 'own-token', isAuthenticated: true, lastAuthCheck: Date.now() })
    useThemeStore.setState({ theme: 'light' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.className = ''
    visit('/')
  })

  it("in SIET Space switches SIET Space's own theme, which the AI apps follow", async () => {
    render(<AppNavbar />)
    fireEvent.click(await screen.findByLabelText('เปิดเมนูบัญชีผู้ใช้'))
    fireEvent.click(screen.getByText('ธีม (โหมดสว่าง)'))

    expect(useThemeStore.getState().theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem('theme-storage') || '{}').state?.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('is left out of the AI apps, which follow SIET Space', async () => {
    visit('/quiz?token=handed')
    render(<Navbar />)
    fireEvent.click(await screen.findByLabelText('เปิดเมนูบัญชีผู้ใช้'))

    expect(screen.getByText('ดูโปรไฟล์เต็ม')).toBeDefined()
    expect(screen.queryByText(/^ธีม/)).toBeNull()
  })
})
