/**
 * The community feed's left column is `hidden lg:block`, so on a phone the
 * rooms, library and AI tools were unreachable. These tests pin the replacement
 * down: a menu button below `lg`, and a drawer that actually renders the
 * sidebar's contents.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/lib/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: '2', username: 'student1', display_name: 'Student 1', role: 'student' },
    logout: vi.fn(),
  }),
}))
vi.mock('./PointsWallet', () => ({ PointsWallet: () => <div data-testid="wallet" /> }))
vi.mock('./NotificationsMenu', () => ({ NotificationsMenu: () => <div data-testid="notifications" /> }))
vi.mock('@/components/common/ThemeToggle', () => ({ ThemeToggle: () => <div data-testid="theme" /> }))
vi.mock('@/lib/external-apps', () => ({
  openQuizApp: vi.fn(),
  openRoadmapApp: vi.fn(),
}))

import { CommunityHeader } from './CommunityHeader'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const headerProps = {
  query: '',
  onSearch: vi.fn(),
  onOpenPost: vi.fn(),
  onHome: vi.fn(),
}

describe('CommunityHeader — ปุ่มเมนูสำหรับจอเล็ก', () => {
  it('shows a menu button that is hidden from lg upwards', () => {
    const onOpenMenu = vi.fn()
    render(<CommunityHeader {...headerProps} onOpenMenu={onOpenMenu} />)

    const button = screen.getByRole('button', { name: 'เปิดเมนู' })
    expect(button.className).toContain('lg:hidden')

    fireEvent.click(button)
    expect(onOpenMenu).toHaveBeenCalledTimes(1)
  })

  it('renders no menu button on pages that have no sidebar to open', () => {
    render(<CommunityHeader {...headerProps} />)
    expect(screen.queryByRole('button', { name: 'เปิดเมนู' })).toBeNull()
  })
})

describe('Sheet — ลิ้นชักเมนู', () => {
  it('keeps its contents out of the tree until it is opened', () => {
    const { rerender } = render(
      <Sheet open={false}>
        <SheetContent title="เมนู SIET Space">
          <button type="button">ห้องวิชา</button>
        </SheetContent>
      </Sheet>
    )
    expect(screen.queryByText('ห้องวิชา')).toBeNull()

    rerender(
      <Sheet open>
        <SheetContent title="เมนู SIET Space">
          <button type="button">ห้องวิชา</button>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByText('ห้องวิชา')).toBeTruthy()
    expect(screen.getByText('เมนู SIET Space')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ปิดเมนู' })).toBeTruthy()
  })

  it('closes when the panel asks to close', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent title="เมนู SIET Space">
          <button type="button">ห้องวิชา</button>
        </SheetContent>
      </Sheet>
    )
    fireEvent.click(screen.getByRole('button', { name: 'ปิดเมนู' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
