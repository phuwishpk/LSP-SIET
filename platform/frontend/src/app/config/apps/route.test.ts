import { afterEach, describe, expect, it, vi } from 'vitest'

import * as route from './route'

describe('GET /config/apps', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is evaluated per request, not prerendered at build', () => {
    // Without this Next prerenders the handler at build time and the image
    // serves the build-time (empty) quiz/roadmap URLs.
    expect(route.dynamic).toBe('force-dynamic')
  })

  it('returns the URLs from the environment as set at call time', async () => {
    // The module is already imported: only a handler that reads process.env on
    // each call sees values set now.
    vi.stubEnv('MY_AI_QUIZ_URL', 'https://quiz.example/quiz')
    vi.stubEnv('AI_ROADMAP_URL', 'https://roadmap.example/roadmap')

    const response = await route.GET()

    expect(await response.json()).toEqual({
      quizUrl: 'https://quiz.example/quiz',
      roadmapUrl: 'https://roadmap.example/roadmap',
    })
  })

  it('falls back to the NEXT_PUBLIC_* values, then to null', async () => {
    vi.stubEnv('MY_AI_QUIZ_URL', '')
    vi.stubEnv('AI_ROADMAP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_MY_AI_QUIZ_URL', 'https://quiz.example/public')
    vi.stubEnv('NEXT_PUBLIC_AI_ROADMAP_URL', '')

    expect(await (await route.GET()).json()).toEqual({
      quizUrl: 'https://quiz.example/public',
      roadmapUrl: null,
    })
  })
})
