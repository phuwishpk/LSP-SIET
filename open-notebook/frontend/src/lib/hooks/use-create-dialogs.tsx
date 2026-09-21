'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { CreateNotebookDialog } from '@/components/notebooks/CreateNotebookDialog'
import { useAuthStore } from '@/lib/stores/auth-store'
import { isStaff, type Role } from '@/lib/roles'

interface CreateDialogsContextType {
  openSourceDialog: () => void
  openNotebookDialog: () => void
}

const CreateDialogsContext = createContext<CreateDialogsContextType | null>(null)

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false)

  // This provider wraps every dashboard page, and AddSourceDialog loads
  // notebooks / transformations / settings as soon as it mounts, open or not.
  // Those APIs are staff-only, so for a student each page load produced a burst
  // of 403s (retried). Students cannot create sources or notebooks anyway, so
  // the dialogs simply do not exist for them.
  const role = useAuthStore((s) => s.user?.role) as Role
  const canCreate = isStaff(role)

  const openSourceDialog = useCallback(() => setSourceDialogOpen(true), [])
  const openNotebookDialog = useCallback(() => setNotebookDialogOpen(true), [])

  return (
    <CreateDialogsContext.Provider
      value={{
        openSourceDialog,
        openNotebookDialog,
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
