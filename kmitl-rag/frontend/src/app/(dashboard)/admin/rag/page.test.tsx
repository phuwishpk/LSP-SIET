import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }))
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/admin/AdminPageHeader', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@siet/kmitl-rag/components/admin/rag/RagStatsPanel', () => ({ RagStatsPanel: () => <div>stats-panel</div> }))
vi.mock('@siet/kmitl-rag/components/admin/rag/RagDocumentsPanel', () => ({ RagDocumentsPanel: () => <div>documents-panel</div> }))
vi.mock('@siet/kmitl-rag/components/admin/rag/RagKnowledgePanel', () => ({ RagKnowledgePanel: () => <div>knowledge-panel</div> }))
vi.mock('@siet/kmitl-rag/components/admin/rag/RebuildEmbeddingsPanel', () => ({
  RebuildEmbeddingsPanel: () => <div>rebuild-embeddings-panel</div>,
}))

import AdminRagPage from './page'

describe('/admin/rag', () => {
  beforeEach(() => {
    nav.query = ''
  })

  it('hosts the rebuild-embeddings panel that used to live on /advanced', () => {
    render(<AdminRagPage />)
    expect(screen.queryByText('rebuild-embeddings-panel')).not.toBeInTheDocument()

    // Radix tabs activate on mouse down, not on click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'สร้าง Embedding ใหม่' }), { button: 0 })
    expect(screen.getByText('rebuild-embeddings-panel')).toBeInTheDocument()
  })

  it('keeps the statistics overview as the first tab', () => {
    render(<AdminRagPage />)
    expect(screen.getByText('stats-panel')).toBeInTheDocument()
  })

  it.each([
    ['rebuild', 'rebuild-embeddings-panel'],
    ['documents', 'documents-panel'],
    ['knowledge', 'knowledge-panel'],
    ['overview', 'stats-panel'],
  ])('?tab=%s opens that tab', (tab, panel) => {
    nav.query = `tab=${tab}`
    render(<AdminRagPage />)
    expect(screen.getByText(panel)).toBeInTheDocument()
    expect(screen.getByRole('tab', { selected: true })).toBe(
      screen.getAllByRole('tab')[['overview', 'documents', 'knowledge', 'rebuild'].indexOf(tab)],
    )
  })

  it('opens the overview for a tab that does not exist', () => {
    nav.query = 'tab=nope'
    render(<AdminRagPage />)
    expect(screen.getByText('stats-panel')).toBeInTheDocument()
    expect(screen.queryByText('rebuild-embeddings-panel')).not.toBeInTheDocument()
  })
})
