import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnswerReferences } from './AnswerReferences'

const passage = (index: number, cited?: boolean) => ({
  index, id: `source:${index}`, title: `เอกสาร ${index}`, snippet: `ข้อความ ${index}`, cited,
})

describe('AnswerReferences', () => {
  it('renders nothing when there is no evidence at all', () => {
    const { container } = render(<AnswerReferences citations={[]} webSources={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('lists cited passages first and folds the unused ones away', () => {
    render(<AnswerReferences citations={[passage(1, true), passage(2, false), passage(3, true)]} />)
    expect(screen.getByText('อ้างอิง')).toBeTruthy()
    expect(screen.getByText(/\[1\] เอกสาร 1/)).toBeTruthy()
    expect(screen.getByText(/\[3\] เอกสาร 3/)).toBeTruthy()
    expect(screen.getByText('ข้อความที่ค้นเจอแต่ไม่ได้ใช้อ้างอิง (1)')).toBeTruthy()
  })

  it('shows every passage for answers saved before the cited flag existed', () => {
    render(<AnswerReferences citations={[passage(1), passage(2)]} />)
    expect(screen.getByText(/\[2\] เอกสาร 2/)).toBeTruthy()
    expect(screen.queryByText(/ไม่ได้ใช้อ้างอิง/)).toBeNull()
  })

  it('renders web sources as safe external links numbered [Wn]', () => {
    render(
      <AnswerReferences
        citations={[]}
        webSources={[{ index: 1, title: 'kmitl.ac.th', url: 'https://example.org/a' }]}
      />
    )
    const link = screen.getByRole('link', { name: /\[W1\]/ })
    expect(link.getAttribute('href')).toBe('https://example.org/a')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/จากการค้นเว็บ/)).toBeTruthy()
  })
})
