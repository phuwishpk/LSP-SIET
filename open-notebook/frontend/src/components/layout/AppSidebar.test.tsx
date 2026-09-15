/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AppSidebar } from './AppSidebar'
import { useSidebarStore } from '@/lib/stores/sidebar-store'

// Mock Tooltip components to avoid Radix UI async issues in tests
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// The navigation is role-aware (see lib/roles.ts): students only get the
// community, everything else belongs to staff. The store decides which.
const mockRole = vi.fn<() => string | undefined>(() => 'teacher')
vi.mock('@/lib/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: '1', username: 'teacher1', role: mockRole() } }),
}))

describe('AppSidebar', () => {
  it('renders correctly when expanded', () => {
    mockRole.mockReturnValue('teacher')
    render(<AppSidebar />)

    // With mocked t() returning keys, check for translation key strings
    expect(screen.getByText('common.appName')).toBeDefined()
    expect(screen.getByText('navigation.sources')).toBeDefined()
    expect(screen.getByText('navigation.notebooks')).toBeDefined()
  })

  it('hides the staff areas from students', () => {
    mockRole.mockReturnValue('student')
    render(<AppSidebar />)

    expect(screen.getByText('navigation.communityFeed')).toBeDefined()
    expect(screen.queryByText('navigation.sources')).toBeNull()
    expect(screen.queryByText('navigation.notebooks')).toBeNull()
    expect(screen.queryByText('navigation.teacherConsole')).toBeNull()
    expect(screen.queryByText('navigation.adminConsole')).toBeNull()
  })

  it('gives admins the console and model settings', () => {
    mockRole.mockReturnValue('admin')
    render(<AppSidebar />)

    expect(screen.getByText('navigation.teacherConsole')).toBeDefined()
    expect(screen.getByText('navigation.adminConsole')).toBeDefined()
    expect(screen.getByText('navigation.models')).toBeDefined()
  })

  it('toggles collapse state when clicking handle', () => {
    mockRole.mockReturnValue('teacher')
    const toggleCollapse = vi.fn()
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: false,
      toggleCollapse,
    } as any)

    render(<AppSidebar />)

    fireEvent.click(screen.getByTestId('sidebar-toggle'))

    expect(toggleCollapse).toHaveBeenCalled()
  })

  it('shows collapsed view when isCollapsed is true', () => {
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: true,
      toggleCollapse: vi.fn(),
    } as any)

    render(<AppSidebar />)

    // In collapsed mode, app name shouldn't be visible (as text)
    expect(screen.queryByText('common.appName')).toBeNull()
  })
})
