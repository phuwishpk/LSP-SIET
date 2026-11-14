import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { enUS } from '@/lib/locales/en-US'

// The real en-US strings, so the button is found by the label the old /advanced page showed.
vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      const text = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enUS)
      if (typeof text !== 'string') return key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars?.[name] ?? ''))
    },
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}))

const api = vi.hoisted(() => ({
  rebuildEmbeddings: vi.fn(),
  getRebuildStatus: vi.fn(),
}))
vi.mock('@/lib/api/embedding', () => ({ embeddingApi: api }))

import { RebuildEmbeddingsPanel } from './RebuildEmbeddingsPanel'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RebuildEmbeddingsPanel />
    </QueryClientProvider>,
  )
}

describe('RebuildEmbeddingsPanel (moved from the old /advanced page)', () => {
  beforeEach(() => {
    api.rebuildEmbeddings.mockReset()
    api.getRebuildStatus.mockReset()
    api.rebuildEmbeddings.mockResolvedValue({ command_id: 'command:abc', message: 'queued', estimated_items: 3 })
  })

  it('has the button the old page had', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: '🚀 Start Rebuild' })).toBeEnabled()
    expect(screen.getByText('Rebuild Embeddings')).toBeInTheDocument()
  })

  it('starts one rebuild of the existing embeddings when the button is clicked', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '🚀 Start Rebuild' }))

    await waitFor(() => expect(api.rebuildEmbeddings).toHaveBeenCalledTimes(1))
    expect(api.rebuildEmbeddings).toHaveBeenCalledWith({
      mode: 'existing',
      include_sources: true,
      include_notes: true,
      include_insights: true,
    })
  })

  it('does not start a rebuild when no item type is selected', () => {
    renderPanel()
    for (const name of ['Sources', 'Notes', 'Insights']) {
      fireEvent.click(screen.getByRole('checkbox', { name }))
    }
    expect(screen.getByText('Please select at least one item type to rebuild')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🚀 Start Rebuild' })).toBeDisabled()
    expect(api.rebuildEmbeddings).not.toHaveBeenCalled()
  })
})
