import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({
  items: [] as { id: string; title: string; message_count: number; updated_at: string }[],
  remove: vi.fn(),
  rename: vi.fn(),
}))
vi.mock('@/lib/hooks/use-community', () => ({
  useAskHistory: () => ({ data: { items: state.items }, isLoading: false }),
  useDeleteConversation: () => ({ mutate: state.remove }),
  useRenameConversation: () => ({ mutate: state.rename }),
}))

import { AskHistoryPanel } from './AskHistoryPanel'

describe('AskHistoryPanel', () => {
  beforeEach(() => {
    state.items = [
      { id: 'a1', title: 'หลักสูตรนี้เรียนกี่หน่วยกิต', message_count: 4, updated_at: new Date().toISOString() },
      { id: 'b2', title: 'Docker กับ Kubernetes', message_count: 2, updated_at: new Date().toISOString() },
    ]
    state.remove.mockReset()
    state.rename.mockReset()
  })

  it('lists conversations and opens one', () => {
    const onOpen = vi.fn()
    render(<AskHistoryPanel activeId="b2" onOpen={onOpen} onNew={() => {}} />)
    fireEvent.click(screen.getByText('หลักสูตรนี้เรียนกี่หน่วยกิต'))
    expect(onOpen).toHaveBeenCalledWith('a1')
    expect(screen.getByText('Docker กับ Kubernetes').closest('button')?.getAttribute('aria-current')).toBe('true')
  })

  it('shows an empty state and the new-chat button', () => {
    state.items = []
    const onNew = vi.fn()
    render(<AskHistoryPanel activeId={null} onOpen={() => {}} onNew={onNew} />)
    expect(screen.getByText(/ยังไม่มีประวัติ/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /แชทใหม่/ }))
    expect(onNew).toHaveBeenCalled()
  })

  it('renames inline and deletes after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AskHistoryPanel activeId={null} onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'เปลี่ยนชื่อ Docker กับ Kubernetes' }))
    const input = screen.getByLabelText('ชื่อบทสนทนา') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'คอนเทนเนอร์' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(state.rename).toHaveBeenCalledWith({ id: 'b2', title: 'คอนเทนเนอร์' })

    fireEvent.click(screen.getByRole('button', { name: 'ลบ หลักสูตรนี้เรียนกี่หน่วยกิต' }))
    expect(state.remove).toHaveBeenCalledWith('a1', expect.anything())
  })

  it('does not delete when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AskHistoryPanel activeId={null} onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'ลบ หลักสูตรนี้เรียนกี่หน่วยกิต' }))
    expect(state.remove).not.toHaveBeenCalled()
  })
})
