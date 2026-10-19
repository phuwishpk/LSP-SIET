import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The real dialogs fire staff-only queries on mount; here we only care whether
// they are mounted at all for a given role.
vi.mock('@/components/sources/AddSourceDialog', () => ({
  AddSourceDialog: () => <div data-testid="add-source-dialog" />,
}))
vi.mock('@/components/notebooks/CreateNotebookDialog', () => ({
  CreateNotebookDialog: () => <div data-testid="create-notebook-dialog" />,
}))

let currentRole: string | null = null
vi.mock('@/lib/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: { role: string | null } | null }) => unknown) =>
    selector({ user: currentRole ? { role: currentRole } : null }),
}))

// src/test/setup.ts replaces this module with a stub for every other test;
// this file is the one place that needs the real provider.
vi.unmock('@/lib/hooks/use-create-dialogs')
vi.unmock('../lib/hooks/use-create-dialogs')

const { CreateDialogsProvider, useCreateDialogs } = await vi.importActual<
  typeof import('./use-create-dialogs')
>('./use-create-dialogs')

function Consumer() {
  const { openSourceDialog, openNotebookDialog } = useCreateDialogs()
  return (
    <button type="button" onClick={() => { openSourceDialog(); openNotebookDialog() }}>
      child
    </button>
  )
}

const renderAs = (role: string | null) => {
  currentRole = role
  return render(
    <CreateDialogsProvider>
      <Consumer />
    </CreateDialogsProvider>
  )
}

describe('CreateDialogsProvider', () => {
  beforeEach(() => {
    currentRole = null
  })

  it.each(['student', null])('does not mount the staff-only dialogs for %s', (role) => {
    renderAs(role)
    expect(screen.getByText('child')).toBeTruthy()
    expect(screen.queryByTestId('add-source-dialog')).toBeNull()
    expect(screen.queryByTestId('create-notebook-dialog')).toBeNull()
  })

  it.each(['teacher', 'admin'])('mounts both dialogs for %s', (role) => {
    renderAs(role)
    expect(screen.getByTestId('add-source-dialog')).toBeTruthy()
    expect(screen.getByTestId('create-notebook-dialog')).toBeTruthy()
  })

  it('still gives students a working (no-op) context', () => {
    renderAs('student')
    expect(() => screen.getByText('child').click()).not.toThrow()
    expect(screen.queryByTestId('add-source-dialog')).toBeNull()
  })
})
