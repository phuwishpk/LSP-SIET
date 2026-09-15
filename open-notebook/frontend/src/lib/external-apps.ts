/**
 * Links to the two standalone AI apps that live in their own folders/containers:
 *   My-ai-quiz/            → AI Quiz app     (default http://localhost:3001/quiz)
 *   ai-roadmap-generator/  → AI Roadmap app  (default http://localhost:3002/roadmap)
 *
 * The URLs come from the runtime `/config` endpoint first, so moving the stack
 * to a real domain only needs `MY_AI_QUIZ_URL` / `AI_ROADMAP_URL` set on the
 * container — no frontend rebuild. Build-time `NEXT_PUBLIC_*` values stay as a
 * fallback for older deployments.
 *
 * Both apps accept the workspace JWT via `?token=` (see `buildCrossAppLink`),
 * so work created there is stored under the same account.
 */
import { buildCrossAppLink } from '@/lib/cross-app'

const FALLBACK_QUIZ_URL =
  process.env.NEXT_PUBLIC_MY_AI_QUIZ_URL || 'http://localhost:3001/quiz'
const FALLBACK_ROADMAP_URL =
  process.env.NEXT_PUBLIC_AI_ROADMAP_URL || 'http://localhost:3002/roadmap'

export const QUIZ_APP_URL = FALLBACK_QUIZ_URL
export const ROADMAP_APP_URL = FALLBACK_ROADMAP_URL

let cached: { quizUrl: string; roadmapUrl: string } | null = null

async function resolveUrls(): Promise<{ quizUrl: string; roadmapUrl: string }> {
  if (cached) return cached
  const resolved = { quizUrl: FALLBACK_QUIZ_URL, roadmapUrl: FALLBACK_ROADMAP_URL }
  try {
    const response = await fetch('/config', { cache: 'no-store' })
    if (response.ok) {
      const data = (await response.json()) as {
        quizUrl?: string | null
        roadmapUrl?: string | null
      }
      if (data.quizUrl) resolved.quizUrl = data.quizUrl
      if (data.roadmapUrl) resolved.roadmapUrl = data.roadmapUrl
    }
  } catch {
    // Offline or old deployment: keep the build-time defaults.
  }
  cached = resolved
  return resolved
}

export async function openExternalApp(href: string) {
  const link = await buildCrossAppLink({ href })
  window.open(link, '_blank', 'noopener,noreferrer')
}

export async function openQuizApp() {
  const { quizUrl } = await resolveUrls()
  return openExternalApp(quizUrl)
}

export async function openRoadmapApp() {
  const { roadmapUrl } = await resolveUrls()
  return openExternalApp(roadmapUrl)
}
