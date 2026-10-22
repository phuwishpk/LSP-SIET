import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OwlMascot } from './OwlMascot'

describe('OwlMascot', () => {
  it('shows the resting owl by default', () => {
    render(<OwlMascot />)
    const img = screen.getByRole('img', { name: 'น้องฮูก ผู้ช่วย AI' })
    expect(img.getAttribute('src')).toContain('owl-idle.png')
    expect(img.className).not.toContain('owl-think')
  })

  it('switches to the thinking pose and animates it', () => {
    render(<OwlMascot state="thinking" size={36} />)
    const img = screen.getByRole('img', { name: 'น้องฮูกกำลังคิดคำตอบ' })
    expect(img.getAttribute('src')).toContain('owl-thinking.png')
    expect(img.getAttribute('width')).toBe('36')
    expect(img.className).toContain('owl-think')
  })
})
