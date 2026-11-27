import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AskWebButton } from './AskWebButton'

describe('AskWebButton', () => {
  it('offers KMITL web info for a partly covered answer', () => {
    const onAsk = vi.fn()
    render(<AskWebButton pending={false} webAdded={false} onAsk={onAsk} />)
    expect(screen.getByText('เอกสารตอบได้บางส่วน ค้นข้อมูลเพิ่มจากเว็บไซต์ของ สจล. ได้ (ไม่ตัดแต้ม)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ค้นเว็บเพิ่ม (เว็บ สจล.)' }))
    expect(onAsk).toHaveBeenCalledTimes(1)
  })

  it('shows the studying owl and cannot be pressed again while searching', () => {
    render(<AskWebButton pending webAdded={false} onAsk={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'น้องฮูกกำลังค้นเว็บ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ค้นเว็บเพิ่ม/ })).toBeDisabled()
  })

  it('disappears once the web part was added', () => {
    const { container } = render(<AskWebButton pending={false} webAdded onAsk={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
