'use client'

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Trash2,
  GraduationCap,
  Map,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useDeleteQuizSession,
  useDeleteRoadmapSession,
  useGenerateQuiz,
  useGenerateRoadmap,
  useQuizSession,
  useQuizSessions,
  useRoadmapSession,
  useRoadmapSessions,
} from '@/lib/hooks/use-features'
import { QuizRunner } from './components/QuizRunner'
import { RoadmapGraph } from './components/RoadmapGraph'

export default function FeaturesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'quiz' | 'roadmap'>('quiz')
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null)
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null)

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">
                {t('features.title', 'AI Features')}
              </h1>
            </div>
          </div>

          <p className="text-muted-foreground max-w-3xl">
            {t(
              'features.description',
              'Quickly generate quizzes and roadmaps from your research topics. Each session is scoped to your account so multi-user deployments keep data isolated.'
            )}
          </p>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'quiz' | 'roadmap')}
          >
            <TabsList>
              <TabsTrigger value="quiz" className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                {t('features.quiz', 'Quiz')}
              </TabsTrigger>
              <TabsTrigger value="roadmap" className="flex items-center gap-2">
                <Map className="h-4 w-4" />
                {t('features.roadmap', 'Roadmap')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="quiz" className="space-y-4">
              <QuizTab
                selectedId={selectedQuizId}
                onSelect={setSelectedQuizId}
              />
            </TabsContent>

            <TabsContent value="roadmap" className="space-y-4">
              <RoadmapTab
                selectedId={selectedRoadmapId}
                onSelect={setSelectedRoadmapId}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Quiz tab
// ---------------------------------------------------------------------------

function QuizTab({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const [topic, setTopic] = useState('')
  const [questionCount, setQuestionCount] = useState(5)
  const { data: sessions, isLoading, refetch } = useQuizSessions()
  const generate = useGenerateQuiz()
  const remove = useDeleteQuizSession()

  const handleGenerate = () => {
    if (!topic.trim()) return
    generate.mutate(
      { topic: topic.trim(), question_count: questionCount, language: 'th' },
      {
        onSuccess: (data) => {
          setTopic('')
          onSelect(data.session.id)
        },
      }
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('features.generateQuiz', 'Generate a new quiz')}</CardTitle>
            <CardDescription>
              {t(
                'features.quizHint',
                'Provide a topic and let the AI produce multiple-choice questions with explanations.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="quiz-topic">
                {t('features.topic', 'Topic')}
              </Label>
              <Input
                id="quiz-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={t(
                  'features.topicPlaceholder',
                  'e.g. การโปรแกรมเบื้องต้น, Python basics'
                )}
                maxLength={500}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiz-count">
                {t('features.questionCount', 'Number of questions')}
              </Label>
              <Input
                id="quiz-count"
                type="number"
                min={1}
                max={20}
                value={questionCount}
                onChange={(event) =>
                  setQuestionCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))
                }
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generate.isPending || !topic.trim()}
              className="w-full"
            >
              {generate.isPending
                ? t('features.generating', 'Generating...')
                : t('features.generate', 'Generate quiz')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                {t('features.history', 'Recent quizzes')}
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <div className="space-y-2">
                <div className="h-12 w-full rounded-md bg-muted animate-pulse" />
                <div className="h-12 w-full rounded-md bg-muted animate-pulse" />
              </div>
            )}
            {!isLoading && (sessions?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('features.noQuizzes', 'No quizzes yet — generate one to get started.')}
              </p>
            )}
            {sessions?.map((session) => (
              <div
                key={session.id}
                className={`rounded-md border p-3 cursor-pointer transition hover:bg-accent ${
                  selectedId === session.id ? 'border-primary bg-accent' : ''
                }`}
                onClick={() => onSelect(session.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{session.topic}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.question_count} questions · {session.created}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      remove.mutate(session.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {selectedId ? (
          <QuizSessionView sessionId={selectedId} />
        ) : (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              {t('features.selectQuiz', 'Select a quiz from the list or generate a new one.')}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function QuizSessionView({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuizSession(sessionId)
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="h-6 w-3/4 rounded bg-muted animate-pulse" />
          <div className="h-32 w-full rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    )
  }
  if (!data) return null
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{data.topic}</CardTitle>
          <Badge variant="secondary">{data.language}</Badge>
        </div>
        <CardDescription>
          {data.question_count} questions · {data.created}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QuizRunner questions={data.questions} />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Roadmap tab
// ---------------------------------------------------------------------------

function RoadmapTab({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const [description, setDescription] = useState('')
  const [title, setTitle] = useState('')
  const [nodeCount, setNodeCount] = useState(12)
  const { data: sessions, isLoading, refetch } = useRoadmapSessions()
  const generate = useGenerateRoadmap()
  const remove = useDeleteRoadmapSession()

  const handleGenerate = () => {
    if (!description.trim()) return
    generate.mutate(
      {
        description: description.trim(),
        title: title.trim() || undefined,
        node_count: nodeCount,
        language: 'th',
      },
      {
        onSuccess: (data) => {
          setDescription('')
          setTitle('')
          onSelect(data.session.id)
        },
      }
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('features.generateRoadmap', 'Generate a new roadmap')}</CardTitle>
            <CardDescription>
              {t(
                'features.roadmapHint',
                'Describe a project and the AI will sequence it into ordered milestones.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="roadmap-title">{t('features.title', 'Title')}</Label>
              <Input
                id="roadmap-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('features.titleOptional', 'Optional')}
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="roadmap-description">
                {t('features.description', 'Description')}
              </Label>
              <Textarea
                id="roadmap-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={6}
                placeholder={t(
                  'features.descriptionPlaceholder',
                  'Describe the project, its goals, and constraints...'
                )}
                maxLength={2000}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="roadmap-nodes">{t('features.nodeCount', 'Nodes')}</Label>
              <Input
                id="roadmap-nodes"
                type="number"
                min={3}
                max={50}
                value={nodeCount}
                onChange={(event) =>
                  setNodeCount(Math.max(3, Math.min(50, Number(event.target.value) || 3)))
                }
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generate.isPending || !description.trim()}
              className="w-full"
            >
              {generate.isPending
                ? t('features.generating', 'Generating...')
                : t('features.generateRoadmap', 'Generate roadmap')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {t('features.roadmapHistory', 'Recent roadmaps')}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <div className="space-y-2">
                <div className="h-12 w-full rounded-md bg-muted animate-pulse" />
                <div className="h-12 w-full rounded-md bg-muted animate-pulse" />
              </div>
            )}
            {!isLoading && (sessions?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('features.noRoadmaps', 'No roadmaps yet — generate one to get started.')}
              </p>
            )}
            {sessions?.map((session) => (
              <div
                key={session.id}
                className={`rounded-md border p-3 cursor-pointer transition hover:bg-accent ${
                  selectedId === session.id ? 'border-primary bg-accent' : ''
                }`}
                onClick={() => onSelect(session.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{session.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {session.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {session.node_count} nodes · {session.created}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      remove.mutate(session.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {selectedId ? (
          <RoadmapSessionView sessionId={selectedId} />
        ) : (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              {t('features.selectRoadmap', 'Select a roadmap from the list or generate a new one.')}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function RoadmapSessionView({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useRoadmapSession(sessionId)
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="h-6 w-3/4 rounded bg-muted animate-pulse" />
          <div className="h-64 w-full rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    )
  }
  if (!data) return null
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{data.title}</CardTitle>
          <Badge variant="secondary">{data.language}</Badge>
        </div>
        <CardDescription>{data.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <RoadmapGraph nodes={data.nodes} edges={data.edges} />
      </CardContent>
    </Card>
  )
}
