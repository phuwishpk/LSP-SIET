'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { CreateNotebookDialog } from '@/components/notebooks/CreateNotebookDialog'
import { useGate } from '@/lib/extensions'

interface CreateDialogsContextType {
  openSourceDialog: () => void
  openCreateNotebookDialog: () => void
}

const CreateDialogsContext = createContext<CreateDialogsContextType | null>(null)

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false)
  // KMITL hooks: the dialogs load their data as soon as they mount, so an
  // extension may withhold them (e.g. from users the API refuses anyway)
  const canCreate = useGate('create-dialogs')

  const openSourceDialog = useCallback(() => setSourceDialogOpen(true), [])
  const openCreateNotebookDialog = useCallback(() => setNotebookDialogOpen(true), [])

  return (
    <CreateDialogsContext.Provider
      value={{
        openSourceDialog,
        openCreateNotebookDialog,
      }}
    >
      {children}
      {canCreate && (
        <>
          <AddSourceDialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen} />
          <CreateNotebookDialog open={notebookDialogOpen} onOpenChange={setNotebookDialogOpen} />
        </>
      )}
    </CreateDialogsContext.Provider>
  )
}

export function useCreateDialogs() {
  const context = useContext(CreateDialogsContext)
  if (!context) {
    throw new Error('useCreateDialogs must be used within a CreateDialogsProvider')
  }
  return context
}
