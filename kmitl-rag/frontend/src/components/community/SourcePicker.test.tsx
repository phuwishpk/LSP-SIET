import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { KnowledgeNotebook, LibraryDocument } from '@/lib/api/library'
import { SourcePicker } from './SourcePicker'

function course(id: number, name: string, extra: Partial<KnowledgeNotebook> = {}): KnowledgeNotebook {
  return {
    id: `notebook:c${id}`,
    name,
    description: '',
    kind: 'course',
    course_id: id,
    visibility: 'shared',
    archived: false,
    owner_label: `คลังวิชา ${id}`,
    source_count: 1,
    sources: [{ id: `source:${id}`, title: `เอกสาร ${id}`, chunks: 1 }],
    ...extra,
  }
}

const MY_DOCS = [{ id: 12, title: 'สรุปของฉัน.pdf' } as LibraryDocument]

function setup(props: Partial<Parameters<typeof SourcePicker>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <SourcePicker
      value={{ tab: 'course', courseId: null }}
      onChange={onChange}
      notebooks={[course(7, '03206107 Programming')]}
      myDocs={MY_DOCS}
      seesEverything={false}
      {...props}
    />
  )
  return { onChange }
}

describe('SourcePicker', () => {
  it('shows one tab per kind of source', () => {
    setup()
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['ทุกแหล่ง', 'ไฟล์ของฉัน', 'รายวิชา', 'จากอาจารย์/ผู้ดูแล'])
    expect(screen.getByRole('tab', { name: 'รายวิชา' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the users tab to admins only', () => {
    setup({ seesEverything: true })
    expect(screen.getByRole('tab', { name: 'ของผู้ใช้' })).toBeInTheDocument()
  })

  it('switching tab starts that tab empty', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('tab', { name: 'ไฟล์ของฉัน' }))
    expect(onChange).toHaveBeenCalledWith({ tab: 'mine', docId: null })
  })

  it('picks a whole course', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /03206107 Programming/ }))
    expect(onChange).toHaveBeenCalledWith({ tab: 'course', courseId: 7 })
  })

  it('picks one document inside a course and keeps unready ones disabled', () => {
    const nb = course(7, '03206107 Programming', {
      source_count: 2,
      sources: [
        { id: 'source:a', title: 'Lecture 1', chunks: 3 },
        { id: 'source:b', title: 'Lab 2', chunks: 0 },
      ],
    })
    const { onChange } = setup({ notebooks: [nb] })
    fireEvent.click(screen.getByRole('button', { name: 'แสดงเอกสารใน 03206107 Programming' }))
    expect(screen.getByRole('radio', { name: /Lab 2/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /Lecture 1/ }))
    expect(onChange).toHaveBeenCalledWith({ tab: 'course', courseId: 7, sourceId: 'source:a' })
  })

  it('filters a long list by name', () => {
    const many = Array.from({ length: 7 }, (_, i) => course(i + 1, i === 0 ? 'Programming' : `Course ${i + 1}`))
    setup({ notebooks: many })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Prog' } })
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([expect.stringContaining('Programming')])
  })

  it('a short list has no search box', () => {
    setup()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('an empty tab says why and points at the add button below (no second button)', () => {
    setup({ value: { tab: 'staff', notebookId: null } })
    expect(screen.getByText(/ยังไม่มี notebook ที่อาจารย์หรือผู้ดูแลแชร์ไว้/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /เพิ่มเนื้อหาให้ AI อ่าน/ })).toBeNull()
  })

  it('a cut-off name can still be read on hover', () => {
    setup()
    expect(screen.getByRole('radio', { name: /03206107 Programming/ })).toHaveAttribute('title', '03206107 Programming')
  })

  it('my files: all of them or one', () => {
    const { onChange } = setup({ value: { tab: 'mine', docId: null } })
    expect(screen.getByRole('radio', { name: /ไฟล์ทั้งหมดของฉัน/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /สรุปของฉัน.pdf/ }))
    expect(onChange).toHaveBeenCalledWith({ tab: 'mine', docId: 12 })
  })

  it('search text does not leak into another tab', () => {
    const many = Array.from({ length: 7 }, (_, i) => course(i + 1, `Course ${i + 1}`))
    const staff: KnowledgeNotebook = { ...course(99, 'คู่มือนักศึกษา'), kind: 'staff', course_id: null }
    const props = { onChange: vi.fn(), notebooks: [...many, staff], myDocs: MY_DOCS, seesEverything: false }
    const { rerender } = render(<SourcePicker {...props} value={{ tab: 'course', courseId: null }} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'math' } })
    rerender(<SourcePicker {...props} value={{ tab: 'staff', notebookId: null }} />)
    expect(screen.getByRole('radio', { name: /คู่มือนักศึกษา/ })).toBeInTheDocument()
  })

  it('a deep-linked document shows up checked once the list arrives', () => {
    const props = { onChange: vi.fn(), myDocs: MY_DOCS, seesEverything: false }
    const value = { tab: 'course' as const, courseId: 7, sourceId: 'source:7' }
    const { rerender } = render(<SourcePicker {...props} notebooks={[]} value={value} />)
    rerender(<SourcePicker {...props} notebooks={[course(7, '03206107 Programming')]} value={value} />)
    expect(screen.getByRole('radio', { name: /เอกสาร 7/ })).toHaveAttribute('aria-checked', 'true')
  })
})
