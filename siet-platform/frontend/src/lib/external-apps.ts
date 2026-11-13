/**
 * Links to the two standalone AI apps that live in their own folders/containers:
 *   My-ai-quiz/            → AI Quiz app     (default http://localhost:3001/quiz)
 *   ai-roadmap-generator/  → AI Roadmap app  (default http://localhost:3002/roadmap)
 *
 * The URLs come from the runtime `/config/apps` endpoint first, so moving the stack
 * to a real domain only needs `MY_AI_QUIZ_URL` / `AI_ROADMAP_URL` set on the
 * container — no frontend rebuild. Build-time `NEXT_PUBLIC_*` values stay as a
 * fallback for older deployments.
 *
 * Both apps accept the workspace JWT via `?token=` (see `buildCrossAppLink`),
 * so work created there is stored under the same account.
 *
 * The roadmap app opens in the SAME tab and is told where the user came from
 * (`return`), so its "back to Community" button lands on that exact page, and
 * which theme is picked here (`theme`), so it shows the same light / dark; the
 * quiz app still opens in a new tab, and gets `theme` and `return` too (its
 * navbar links back to this SIET Space copy).
 */
import { buildCrossAppLink } from '@siet/platform/lib/cross-app'
import { useThemeStore } from '@/lib/stores/theme-store'

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
    const response = await fetch('/config/apps', { cache: 'no-store' })
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
  // Same theme as here, like the roadmap app (the `siet-theme` cookie covers
  // later changes; this covers a quiz app on another host).
  const target = new URL(quizUrl, window.location.origin)
  target.searchParams.set('theme', useThemeStore.getState().theme)
  // Tells the quiz app's navbar which SIET Space copy to link back to.
  target.searchParams.set('return', window.location.href)
  return openExternalApp(target.toString())
}

export interface RoadmapLaunch {
  /** Room whose library should be pre-selected as the knowledge source. */
  course?: number | null
  /** Library document to pre-select as the knowledge source. */
  doc?: number | null
  /** Page inside the roadmap app (default: its home). May carry a query. */
  path?: string
  /** Where "back to Community" returns to (default: the current page). */
  returnTo?: string
  /** Replace this history entry instead of adding one (used by the relay page). */
  replace?: boolean
}

export async function openRoadmapApp(launch: RoadmapLaunch = {}) {
  const { roadmapUrl } = await resolveUrls()
  const path = launch.path && launch.path.startsWith('/') && launch.path !== '/' ? launch.path : ''
  const target = new URL(roadmapUrl.replace(/\/$/, '') + path, window.location.origin)
  target.searchParams.set('return', launch.returnTo || window.location.href)
  // The choice itself ('system' included), so the app keeps following the OS.
  target.searchParams.set('theme', useThemeStore.getState().theme)
  if (launch.course) target.searchParams.set('course', String(launch.course))
  if (launch.doc) target.searchParams.set('doc', String(launch.doc))
  const link = await buildCrossAppLink({ href: target.toString() })
  if (launch.replace) window.location.replace(link)
  else window.location.assign(link)
}
