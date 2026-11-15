import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmbeddingModelChangeDialog } from './EmbeddingModelChangeDialog'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

// useTranslation is mocked globally in setup.ts (t returns the key string)

describe('EmbeddingModelChangeDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    router.push.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('"change and rebuild" sends the admin to the rebuild tab of /admin/rag', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <EmbeddingModelChangeDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} oldModelName="a" newModelName="b" />,
    )

    fireEvent.click(screen.getByText('models.changeAndRebuild'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(router.push).toHaveBeenCalledWith('/admin/rag?tab=rebuild')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('"change model only" stays where it is', () => {
    const onConfirm = vi.fn()
    render(<EmbeddingModelChangeDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByText('models.changeModelOnly'))
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
  })
})
