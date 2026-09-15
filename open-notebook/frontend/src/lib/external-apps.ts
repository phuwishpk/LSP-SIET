/**
 * Links to the standalone AI apps that live in their own folders/containers:
 *   My-ai-quiz/            → AI Quiz app     (default http://localhost:3001/quiz)
 *   ai-roadmap-generator/  → AI Roadmap app  (default http://localhost:3002/roadmap)
 *
 * Both accept the workspace JWT via `?token=` (see `buildCrossAppLink`), so
 * quizzes / roadmaps generated there are stored under the same account and
 * can be shared to the SIET Space feed.
 */
import { buildCrossAppLink } from '@/lib/cross-app'

export const QUIZ_APP_URL = process.env.NEXT_PUBLIC_MY_AI_QUIZ_URL || 'http://localhost:3001/quiz'
export const ROADMAP_APP_URL =
  process.env.NEXT_PUBLIC_AI_ROADMAP_URL || 'http://localhost:3002/roadmap'

export async function openExternalApp(href: string) {
  const link = await buildCrossAppLink({ href })
  window.open(link, '_blank', 'noopener,noreferrer')
}

export const openQuizApp = () => openExternalApp(QUIZ_APP_URL)
export const openRoadmapApp = () => openExternalApp(ROADMAP_APP_URL)
