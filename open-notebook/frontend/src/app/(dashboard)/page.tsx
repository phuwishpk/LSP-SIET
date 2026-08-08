'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import { buildCrossAppLink } from '@/lib/cross-app'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LogOut, BookOpen, GraduationCap, Map, ArrowRight, Sparkles, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface AppCard {
  id: 'notebook' | 'quiz' | 'roadmap'
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /**
   * Either a router path (same app) or an external URL. When external, the
   * workspace JWT will be appended as `?token=…` automatically.
   */
  href: string
  external: boolean
  gradient: string
  cta: string
  badge?: string
}

const APP_CARDS: AppCard[] = [
  {
    id: 'notebook',
    title: 'Open Notebook',
    description:
      'Research assistant with notebooks, sources, notes, podcasts and the AI chat workspace.',
    icon: BookOpen,
    href: '/search?mode=ask',
    external: false,
    gradient: 'from-blue-500/15 to-cyan-500/15',
    cta: 'Ask a question',
  },
  {
    id: 'quiz',
    title: 'AI Quiz',
    description:
      'Generate multiple-choice quizzes from any topic. Pick the topic and the difficulty, get a fresh quiz instantly.',
    icon: GraduationCap,
    href: process.env.NEXT_PUBLIC_MY_AI_QUIZ_URL || 'http://localhost:3001/quiz',
    external: true,
    gradient: 'from-emerald-500/15 to-teal-500/15',
    cta: 'Create a quiz',
    badge: 'Quick',
  },
  {
    id: 'roadmap',
    title: 'AI Roadmap',
    description:
      'Turn a topic into a learning roadmap with nodes, edges and a graph view you can walk through.',
    icon: Map,
    href: process.env.NEXT_PUBLIC_AI_ROADMAP_URL || 'http://localhost:3002/roadmap',
    external: true,
    gradient: 'from-orange-500/15 to-rose-500/15',
    cta: 'Build a roadmap',
    badge: 'New',
  },
]

export default function DashboardHomePage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  const navigate = async (card: AppCard) => {
    setBusy(card.id)
    try {
      if (card.external) {
        const link = await buildCrossAppLink({ href: card.href })
        window.open(link, '_blank', 'noopener,noreferrer')
      } else {
        router.push(card.href)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-screen bg-background overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
          <header className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  KMITL AI Workspace
                </span>
              </div>
              <h1 className="text-3xl font-bold">
                Welcome back
                {user?.display_name
                  ? `, ${user.display_name}`
                  : user?.username
                  ? `, ${user.username}`
                  : ''}
              </h1>
              <p className="text-muted-foreground mt-1 max-w-2xl">
                Pick where you want to go. Every app shares your account, so
                quizzes, roadmaps and notes are scoped to you automatically.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </header>

          <section className="grid gap-4 md:grid-cols-3">
            {APP_CARDS.map((card) => {
              const Icon = card.icon
              const isBusy = busy === card.id
              return (
                <Card
                  key={card.id}
                  className="group flex flex-col transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <CardHeader className="space-y-3">
                    <div
                      className={`w-12 h-12 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center`}
                    >
                      <Icon className="h-6 w-6 text-foreground" />
                    </div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{card.title}</CardTitle>
                      {card.badge && (
                        <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {card.badge}
                        </span>
                      )}
                    </div>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button
                      className="w-full justify-between"
                      variant="outline"
                      onClick={() => navigate(card)}
                      disabled={isBusy}
                    >
                      {card.cta}
                      {card.external ? (
                        <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      ) : (
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </section>

      </div>
    </main>
  )
}
