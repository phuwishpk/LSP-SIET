'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Search, ChevronDown, AlertCircle } from 'lucide-react'
import { useSearch } from '@/lib/hooks/use-search'
import { useModelDefaults } from '@/lib/hooks/use-models'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useGlobalChat } from '@/lib/hooks/useGlobalChat'
import { SessionSidebar } from '@/components/search/SessionSidebar'
import { AskChatView } from '@/components/search/AskChatView'
import { NotebookResponse } from '@/lib/types/api'

export default function SearchPage() {
  const { t } = useTranslation()
  // URL params
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.get('q') || ''
  const rawMode = searchParams?.get('mode')
  const urlMode = rawMode === 'search' ? 'search' : 'ask'

  // Tab state (controlled)
  const [activeTab, setActiveTab] = useState<'ask' | 'search'>(
    urlMode === 'search' ? 'search' : 'ask'
  )

  // Search state
  const [searchQuery, setSearchQuery] = useState(urlMode === 'search' ? urlQuery : '')
  const [searchType, setSearchType] = useState<'text' | 'vector'>('text')
  const [searchSources, setSearchSources] = useState(true)
  const [searchNotes, setSearchNotes] = useState(true)

  // Hooks
  const searchMutation = useSearch()
  const { data: modelDefaults } = useModelDefaults()
  const { openModal } = useModalManager()

  const hasEmbeddingModel = !!modelDefaults?.default_embedding_model

  // Chat settings state (lifted for persistence across tab switches)
  const [customModels, setCustomModels] = useState<{
    strategy: string
    answer: string
    finalAnswer: string
  } | null>(null)

  const [selectedNotebooks, setSelectedNotebooks] = useState<NotebookResponse[]>([])
  const [scopeActive, setScopeActive] = useState(false)

  // Single source of truth for chat state
  const chat = useGlobalChat({
    notebookId: scopeActive ? selectedNotebooks[0]?.id : undefined,
    sources: scopeActive ? selectedNotebooks.map(nb => ({ id: nb.id, name: nb.name })) : undefined,
    notes: scopeActive ? selectedNotebooks.map(nb => ({ id: nb.id, title: nb.name })) : undefined,
    contextSelections: scopeActive
      ? {
          sources: Object.fromEntries(selectedNotebooks.map(nb => [nb.id, 'full' as const])),
          notes: Object.fromEntries(selectedNotebooks.map(nb => [nb.id, 'full' as const])),
        }
      : undefined,
  })

  // Track if we've already auto-triggered from URL params
  const hasAutoTriggeredRef = useRef(false)
  const lastUrlParamsRef = useRef({ q: '', mode: '' })

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return

    searchMutation.mutate({
      query: searchQuery,
      type: searchType,
      limit: 100,
      search_sources: searchSources,
      search_notes: searchNotes,
      minimum_score: 0.2
    })
  }, [searchQuery, searchType, searchSources, searchNotes, searchMutation])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Auto-trigger search when arriving with URL params
  useEffect(() => {
    if (hasAutoTriggeredRef.current || !urlQuery) return

    if (urlMode === 'search') {
      handleSearch()
      hasAutoTriggeredRef.current = true
    }
  }, [urlQuery, urlMode, handleSearch])

  // Handle URL param changes while on page
  useEffect(() => {
    const currentQ = searchParams?.get('q') || ''
    const rawCurrentMode = searchParams?.get('mode')
    const currentMode = rawCurrentMode === 'search' ? 'search' : 'ask'

    if (currentQ !== lastUrlParamsRef.current.q || currentMode !== lastUrlParamsRef.current.mode) {
      lastUrlParamsRef.current = { q: currentQ, mode: currentMode }

      if (currentQ) {
        if (currentMode === 'search') {
          setSearchQuery(currentQ)
          setActiveTab('search')
          hasAutoTriggeredRef.current = false
        }
      }
    }
  }, [searchParams])

  return (
    <main className="h-screen flex flex-col bg-background overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'ask' | 'search')}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="border-b bg-card px-4 pt-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-0">
            <h1 className="text-lg font-semibold">{t('searchPage.title') || 'Search & Ask'}</h1>
            <TabsList className="bg-muted">
              <TabsTrigger value="ask" className="text-xs">
                {t('searchPage.askTab') || 'Ask'}
              </TabsTrigger>
              <TabsTrigger value="search" className="text-xs">
                {t('searchPage.searchTab') || 'Search'}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Ask Tab — Chat Interface */}
        <TabsContent value="ask" className="flex-1 min-h-0 m-0 flex">
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left Sidebar — Session List */}
            <div className="w-64 flex-shrink-0 border-r overflow-hidden hidden md:flex">
              <SessionSidebarWrapper
                chat={chat}
                selectedNotebooks={selectedNotebooks}
                onSelectedNotebooksChange={setSelectedNotebooks}
                customModels={customModels}
                onCustomModelsChange={setCustomModels}
                scopeActive={scopeActive}
                onScopeActiveChange={setScopeActive}
                defaultChatModel={modelDefaults?.default_chat_model != null ? modelDefaults.default_chat_model : undefined}
              />
            </div>

            {/* Right — Chat Area */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AskChatView
                chat={chat}
                notebookId={scopeActive ? selectedNotebooks[0]?.id : undefined}
                sources={scopeActive ? selectedNotebooks.map(nb => ({ id: nb.id, name: nb.name })) : undefined}
                notes={scopeActive ? selectedNotebooks.map(nb => ({ id: nb.id, title: nb.name })) : undefined}
                contextSelections={
                  scopeActive
                    ? {
                        sources: Object.fromEntries(
                          selectedNotebooks.map(nb => [nb.id, 'full' as const])
                        ),
                        notes: Object.fromEntries(
                          selectedNotebooks.map(nb => [nb.id, 'full' as const])
                        ),
                      }
                    : undefined
                }
                customModels={customModels}
                onCustomModelsChange={setCustomModels}
                selectedNotebooks={selectedNotebooks}
                onSelectedNotebooksChange={setSelectedNotebooks}
                scopeActive={scopeActive}
                onScopeActiveChange={setScopeActive}
                defaultChatModel={modelDefaults?.default_chat_model != null ? modelDefaults.default_chat_model : undefined}
              />
            </div>
          </div>
        </TabsContent>

        {/* Search Tab — Existing Search UI */}
        <TabsContent value="search" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="w-full max-w-4xl mx-auto p-4 md:p-8 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('searchPage.search')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('searchPage.searchDesc')}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search Input */}
                <div className="space-y-2">
                  <Label htmlFor="search-query" className="sr-only">
                    {t('searchPage.search')}
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="search-query"
                      name="search-query"
                      placeholder={t('searchPage.enterSearchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={searchMutation.isPending}
                      className="flex-1"
                      aria-label={t('common.accessibility.enterSearch')}
                      autoComplete="off"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searchMutation.isPending || !searchQuery.trim()}
                      aria-label={t('common.accessibility.searchKBBtn')}
                      className="w-full sm:w-auto"
                    >
                      {searchMutation.isPending ? (
                        <span className="animate-spin mr-2">
                          <Search className="h-4 w-4" />
                        </span>
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      {t('searchPage.search')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('searchPage.pressToSearch')}</p>
                </div>

                {/* Search Options */}
                <div className="space-y-4">
                  {/* Search Type */}
                  <div className="space-y-2" role="group" aria-labelledby="search-type-label">
                    <span id="search-type-label" className="text-sm font-medium leading-none">{t('searchPage.searchType')}</span>
                    {!hasEmbeddingModel && (
                      <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                        <span>{t('searchPage.vectorSearchWarning')}</span>
                      </div>
                    )}
                    <RadioGroup
                      name="search-type"
                      value={searchType}
                      onValueChange={(value: 'text' | 'vector') => setSearchType(value)}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="text" id="text" />
                        <Label htmlFor="text" className="font-normal cursor-pointer">
                          {t('searchPage.textSearch')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="vector"
                          id="vector"
                          disabled={!hasEmbeddingModel}
                        />
                        <Label
                          htmlFor="vector"
                          className={`font-normal ${!hasEmbeddingModel ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {t('searchPage.vectorSearch')}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Search Locations */}
                  <div className="space-y-2" role="group" aria-labelledby="search-in-label">
                    <span id="search-in-label" className="text-sm font-medium leading-none">{t('searchPage.searchIn')}</span>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sources"
                          name="sources"
                          checked={searchSources}
                          onCheckedChange={(checked) => setSearchSources(checked as boolean)}
                        />
                        <Label htmlFor="sources" className="font-normal cursor-pointer">
                          {t('searchPage.searchSources')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="notes"
                          name="notes"
                          checked={searchNotes}
                          onCheckedChange={(checked) => setSearchNotes(checked as boolean)}
                        />
                        <Label htmlFor="notes" className="font-normal cursor-pointer">
                          {t('searchPage.searchNotes')}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {searchMutation.data && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">
                        {t('searchPage.resultsFound').replace('{count}', searchMutation.data.total_count.toString())}
                      </h3>
                      <Badge variant="outline">{searchMutation.data.search_type === 'text' ? t('searchPage.textSearch') : t('searchPage.vectorSearch')}</Badge>
                    </div>

                    {searchMutation.data.results.length === 0 ? (
                      <Card>
                        <CardContent className="pt-6 text-center text-muted-foreground">
                          {t('searchPage.noResultsFor').replace('{query}', searchQuery)}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {searchMutation.data.results.map((result, index) => {
                          if (!result.parent_id) {
                            return null
                          }
                          const [type, id] = result.parent_id.split(':')
                          const modalType = type === 'source_insight' ? 'insight' : type as 'source' | 'note' | 'insight'

                          return (
                            <Card key={index}>
                              <CardContent className="pt-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <button
                                      onClick={() => openModal(modalType, id)}
                                      className="text-primary hover:underline font-medium"
                                    >
                                      {result.title}
                                    </button>
                                    <Badge variant="secondary" className="ml-2">
                                      {result.final_score.toFixed(2)}
                                    </Badge>
                                  </div>
                                </div>

                                {result.matches && result.matches.length > 0 && (
                                  <Collapsible className="mt-3">
                                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                      <ChevronDown className="h-4 w-4" />
                                      {t('searchPage.matches').replace('{count}', result.matches.length.toString())}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-2 space-y-1">
                                      {result.matches.map((match, i) => (
                                        <div key={i} className="text-sm pl-6 py-1 border-l-2 border-muted">
                                          {match}
                                        </div>
                                      ))}
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}

// -----------------------------------------------------------------------------
// SessionSidebarWrapper — lifts session state so AskChatView can also show sessions
// -----------------------------------------------------------------------------

function SessionSidebarWrapper({
  chat,
  selectedNotebooks,
  onSelectedNotebooksChange,
  customModels,
  onCustomModelsChange,
  scopeActive,
  onScopeActiveChange,
  defaultChatModel,
}: {
  chat: ReturnType<typeof useGlobalChat>
  selectedNotebooks: NotebookResponse[]
  onSelectedNotebooksChange: (notebooks: NotebookResponse[]) => void
  customModels: { strategy: string; answer: string; finalAnswer: string } | null
  onCustomModelsChange: (models: { strategy: string; answer: string; finalAnswer: string } | null) => void
  scopeActive: boolean
  onScopeActiveChange: (active: boolean) => void
  defaultChatModel?: string
}) {
  return (
    <SessionSidebar
      sessions={chat.sessions}
      currentSessionId={chat.currentSessionId}
      onCreateSession={(title) => chat.createSession(title)}
      onSelectSession={chat.switchSession}
      onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
      onDeleteSession={chat.deleteSession}
      loadingSessions={chat.loadingSessions}
    />
  )
}
