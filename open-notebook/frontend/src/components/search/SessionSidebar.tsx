'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Edit2, Check, X, Clock, MessageSquare } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { useTranslation } from '@/lib/hooks/use-translation'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { GlobalChatSession } from '@/lib/types/api'
import { useModels } from '@/lib/hooks/use-models'

interface SessionSidebarProps {
  sessions: GlobalChatSession[]
  currentSessionId: string | null
  onCreateSession: (title: string) => void
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onUpdateSession: (sessionId: string, title: string) => void
  loadingSessions: boolean
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateSession,
  loadingSessions
}: SessionSidebarProps) {
  const { t, language } = useTranslation()
  const [isCreating, setIsCreating] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: models } = useModels()

  const customModelLabel = t('common.customModel')
  const getModelName = useMemo(() => {
    return (modelId: string) => {
      const model = models?.find(m => m.id === modelId)
      return model?.name || customModelLabel
    }
  }, [models, customModelLabel])

  const handleCreateSession = () => {
    if (newSessionTitle.trim()) {
      onCreateSession(newSessionTitle.trim())
      setNewSessionTitle('')
      setIsCreating(false)
    }
  }

  const handleStartEdit = (session: GlobalChatSession) => {
    setEditingId(session.id)
    setEditTitle(session.title)
  }

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      onUpdateSession(editingId, editTitle.trim())
      setEditingId(null)
      setEditTitle('')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      onDeleteSession(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  return (
    <>
      <div className="flex flex-col h-full w-full bg-card border-r">
        {/* Header */}
        <div className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <MessageSquare className="h-4 w-4" />
              {t('chat.sessions')}
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await onCreateSession(`Chat ${new Date().toLocaleDateString()}`)
                } catch {
                  // Error handled by hook
                }
              }}
              className="h-7 px-2"
              title={t('chat.newChat') || 'New Chat'}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* New session input */}
          {isCreating && (
            <div className="space-y-2">
              <Input
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder={t('chat.sessionTitlePlaceholder')}
                className="h-8 text-xs"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleCreateSession()
                }}
              />
              <div className="flex gap-1">
                <Button size="sm" variant="default" onClick={handleCreateSession} className="h-7 flex-1 text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  {t('common.create')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsCreating(false); setNewSessionTitle('') }} className="h-7 px-2">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Session list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {loadingSessions ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {t('common.loading')}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs text-muted-foreground">{t('chat.noSessions')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('chat.createToStart')}</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative rounded-md px-2 py-2 cursor-pointer transition-colors ${
                    currentSessionId === session.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted border border-transparent'
                  }`}
                  onClick={() => onSelectSession(session.id)}
                >
                  {editingId === session.id ? (
                    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') handleCancelEdit()
                        }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" onClick={handleSaveEdit} className="h-6 px-1.5 text-xs flex-1">
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelEdit} className="h-6 px-1.5">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-medium leading-tight line-clamp-2 flex-1 pr-1">
                          {session.title || 'Untitled'}
                        </h4>
                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={(e) => { e.stopPropagation(); handleStartEdit(session) }}
                          >
                            <Edit2 className="h-2.5 w-2.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(session.id) }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                        <span className="text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(session.created), {
                            addSuffix: true,
                            locale: getDateLocale(language)
                          })}
                        </span>
                      </div>
                      {session.message_count != null && session.message_count > 0 && (
                        <Badge variant="secondary" className="mt-1 text-[10px] h-4 px-1">
                          {session.message_count} {session.message_count === 1 ? 'msg' : 'msgs'}
                        </Badge>
                      )}
                      {session.model_override && (
                        <div className="mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {getModelName(session.model_override)}
                          </Badge>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.deleteSession')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.deleteSessionDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
