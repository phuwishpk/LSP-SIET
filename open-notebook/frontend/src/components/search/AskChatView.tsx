'use client'

import { useEffect } from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useGlobalChat } from '@/lib/hooks/useGlobalChat'
import { ChatPanel } from '@/components/source/ChatPanel'
import { SettingsDialog } from './SettingsDialog'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import { NotebookResponse } from '@/lib/types/api'
import { useState } from 'react'

interface AskChatViewProps {
  // Optional: if provided, enables notebook-scoped RAG
  notebookId?: string
  sources?: Array<{ id: string; name?: string }>
  notes?: Array<{ id: string; title?: string }>
  contextSelections?: {
    sources: Record<string, 'insights' | 'full' | 'off'>
    notes: Record<string, 'full' | 'off'>
  }
  // Settings state (lifted up to search/page.tsx for persistence)
  customModels: {
    strategy: string
    answer: string
    finalAnswer: string
  } | null
  onCustomModelsChange: (models: {
    strategy: string
    answer: string
    finalAnswer: string
  } | null) => void
  selectedNotebooks: NotebookResponse[]
  onSelectedNotebooksChange: (notebooks: NotebookResponse[]) => void
  scopeActive: boolean
  onScopeActiveChange: (active: boolean) => void
  defaultChatModel?: string
}

export function AskChatView({
  notebookId,
  sources,
  notes,
  contextSelections,
  customModels,
  onCustomModelsChange,
  selectedNotebooks,
  onSelectedNotebooksChange,
  scopeActive,
  onScopeActiveChange,
  defaultChatModel,
}: AskChatViewProps) {
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const chat = useGlobalChat({
    notebookId: scopeActive ? notebookId : undefined,
    sources,
    notes,
    contextSelections,
  })

  // Build model override from custom models
  const effectiveModel = customModels?.strategy || defaultChatModel || undefined

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header with settings button */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card flex-shrink-0">
          <h2 className="flex items-center gap-2 font-semibold text-sm">
            <Bot className="h-4 w-4" />
            {t('chat.globalChat') || 'Global Chat'}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="gap-1.5 h-8 px-2 text-xs"
          >
            <Settings className="h-3.5 w-3.5" />
            {t('searchPage.settings') || 'Settings'}
          </Button>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 min-h-0">
          <ChatPanel
            contextType="notebook"
            title={t('chat.globalChat') || 'Global Chat'}
            messages={chat.messages.map(msg => ({
              id: msg.id,
              type: msg.type,
              content: msg.content,
              timestamp: msg.timestamp || undefined,
            }))}
            isStreaming={chat.isSending}
            contextIndicators={null}
            onSendMessage={(message, modelOverride) =>
              chat.sendMessage(message, modelOverride)
            }
            modelOverride={chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined}
            onModelChange={(model) => chat.setModelOverride(model ?? null)}
            sessions={chat.sessions}
            currentSessionId={chat.currentSessionId}
            onCreateSession={(title) => chat.createSession(title)}
            onSelectSession={chat.switchSession}
            onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
            onDeleteSession={chat.deleteSession}
            loadingSessions={chat.loadingSessions}
            hasRagContext={scopeActive && !!notebookId && !!sources?.length}
          />
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        customModels={customModels}
        onCustomModelsChange={onCustomModelsChange}
        selectedNotebooks={selectedNotebooks}
        onSelectedNotebooksChange={onSelectedNotebooksChange}
        scopeActive={scopeActive}
        onScopeActiveChange={onScopeActiveChange}
        disabled={chat.isSending}
      />
    </>
  )
}
