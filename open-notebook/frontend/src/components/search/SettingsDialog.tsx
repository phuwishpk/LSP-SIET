'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { ModelSelector } from '@/components/common/ModelSelector'
import { NotebookScopePicker } from './NotebookScopePicker'
import { NotebookResponse } from '@/lib/types/api'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Models
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
  // Scope
  selectedNotebooks: NotebookResponse[]
  onSelectedNotebooksChange: (notebooks: NotebookResponse[]) => void
  // Scope active toggle (notebook-scoped vs global)
  scopeActive: boolean
  onScopeActiveChange: (active: boolean) => void
  disabled?: boolean
}

export function SettingsDialog({
  open,
  onOpenChange,
  customModels,
  onCustomModelsChange,
  selectedNotebooks,
  onSelectedNotebooksChange,
  scopeActive,
  onScopeActiveChange,
  disabled,
}: SettingsDialogProps) {
  const { t } = useTranslation()
  const { data: modelDefaults } = useModelDefaults()
  const { data: availableModels } = useModels()
  const hasEmbeddingModel = !!modelDefaults?.default_embedding_model

  // Local model state
  const [strategyModel, setStrategyModel] = useState('')
  const [answerModel, setAnswerModel] = useState('')
  const [finalAnswerModel, setFinalAnswerModel] = useState('')

  // Sync local state when props change
  useEffect(() => {
    const defaults = customModels || {
      strategy: modelDefaults?.default_chat_model || '',
      answer: modelDefaults?.default_chat_model || '',
      finalAnswer: modelDefaults?.default_chat_model || '',
    }
    setStrategyModel(defaults.strategy)
    setAnswerModel(defaults.answer)
    setFinalAnswerModel(defaults.finalAnswer)
  }, [customModels, modelDefaults])

  const handleSaveModels = () => {
    onCustomModelsChange({
      strategy: strategyModel,
      answer: answerModel,
      finalAnswer: finalAnswerModel,
    })
  }

  const resolveModelName = (id: string) => {
    if (!id || !availableModels) return id
    return availableModels.find(m => m.id === id)?.name || id
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('searchPage.settings') || 'Settings'}</DialogTitle>
        </DialogHeader>

        {!hasEmbeddingModel ? (
          <div className="flex items-center gap-2 p-3 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span>{t('searchPage.noEmbeddingModel')}</span>
          </div>
        ) : (
          <Tabs defaultValue="models" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="models">{t('searchPage.models') || 'Models'}</TabsTrigger>
              <TabsTrigger value="scope">{t('searchPage.scope') || 'Scope'}</TabsTrigger>
            </TabsList>

            {/* Models Tab */}
            <TabsContent value="models" className="flex-1 min-h-0 overflow-y-auto space-y-4 mt-4">
              <div className="space-y-4">
                <ModelSelector
                  label={t('searchPage.strategyModel') || 'Strategy Model'}
                  modelType="language"
                  value={strategyModel}
                  onChange={setStrategyModel}
                  placeholder={t('searchPage.selectStrategyPlaceholder') || 'Select model...'}
                  disabled={disabled}
                />

                <ModelSelector
                  label={t('searchPage.answerModel') || 'Answer Model'}
                  modelType="language"
                  value={answerModel}
                  onChange={setAnswerModel}
                  placeholder={t('searchPage.selectAnswerPlaceholder') || 'Select model...'}
                  disabled={disabled}
                />

                <ModelSelector
                  label={t('searchPage.finalAnswerModel') || 'Final Answer Model'}
                  modelType="language"
                  value={finalAnswerModel}
                  onChange={setFinalAnswerModel}
                  placeholder={t('searchPage.selectFinalPlaceholder') || 'Select model...'}
                  disabled={disabled}
                />
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-3">
                  {t('searchPage.currentModels') || 'Current models:'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs">
                    {t('searchPage.strategy')}: {resolveModelName(customModels?.strategy || modelDefaults?.default_chat_model || '')}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs">
                    {t('searchPage.answer')}: {resolveModelName(customModels?.answer || modelDefaults?.default_chat_model || '')}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs">
                    {t('searchPage.final')}: {resolveModelName(customModels?.finalAnswer || modelDefaults?.default_chat_model || '')}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveModels} disabled={disabled}>
                  {t('common.save')}
                </Button>
              </div>
            </TabsContent>

            {/* Scope Tab */}
            <TabsContent value="scope" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant={scopeActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onScopeActiveChange(!scopeActive)}
                    disabled={disabled || selectedNotebooks.length === 0}
                  >
                    {scopeActive
                      ? t('chat.notebookScopeActive') || 'Notebook-scoped'
                      : t('chat.useGlobal') || 'Global (no scope)'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {scopeActive
                      ? t('chat.scopeActiveDesc') || 'RAG will search within selected notebooks'
                      : t('chat.scopeInactiveDesc') || 'Using global knowledge base'}
                  </span>
                </div>

                {selectedNotebooks.length === 0 && !scopeActive && (
                  <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md">
                    {t('chat.noScopeGlobal') || 'No notebooks selected. Using global knowledge base.'}
                  </div>
                )}

                <NotebookScopePicker
                  value={selectedNotebooks}
                  onChange={onSelectedNotebooksChange}
                  questionText=""
                  onQuestionChange={() => {}}
                  disabled={disabled}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
