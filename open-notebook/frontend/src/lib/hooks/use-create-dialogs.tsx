'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { CreateNotebookDialog } from '@/components/notebooks/CreateNotebookDialog'
import { GeneratePodcastDialog } from '@/components/podcasts/GeneratePodcastDialog'
import { useGate } from '@/lib/extensions'

interface CreateDialogsContextType {
  openSourceDialog: () => void
  openNotebookDialog: () => void
  openPodcastDialog: () => void
}

const CreateDialogsContext = createContext<CreateDialogsContextType | null>(null)

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false)
  const [podcastDialogOpen, setPodcastDialogOpen] = useState(false)
  // KMITL hooks: the dialogs load their data as soon as they mount, so an
  // extension may withhold them (e.g. from users the API refuses anyway)
  const canCreate = useGate('create-dialogs')
  const showPodcasts = useGate('podcasts')

  const openSourceDialog = useCallback(() => setSourceDialogOpen(true), [])
  const openNotebookDialog = useCallback(() => setNotebookDialogOpen(true), [])
  const openPodcastDialog = useCallback(() => setPodcastDialogOpen(true), [])

  return (
    <CreateDialogsContext.Provider
      value={{
        openSourceDialog,
        openNotebookDialog,
        openPodcastDialog,
      }}
    >
      {children}
      {canCreate && (
        <>
          <AddSourceDialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen} />
          <CreateNotebookDialog open={notebookDialogOpen} onOpenChange={setNotebookDialogOpen} />
        </>
      )}
      {showPodcasts && (
        <GeneratePodcastDialog open={podcastDialogOpen} onOpenChange={setPodcastDialogOpen} />
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
