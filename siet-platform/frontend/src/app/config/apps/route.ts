import { NextResponse } from 'next/server'

/**
 * GET /config/apps: URLs of the two standalone apps (My-ai-quiz,
 * ai-roadmap-generator).
 *
 * These used to be read from NEXT_PUBLIC_* only, which bakes them into the
 * bundle at build time and forces a rebuild for every new domain. Serving them
 * here means a deployment can change them with a container restart.
 */
export async function GET() {
  return NextResponse.json({
    quizUrl: process.env.MY_AI_QUIZ_URL || process.env.NEXT_PUBLIC_MY_AI_QUIZ_URL || null,
    roadmapUrl: process.env.AI_ROADMAP_URL || process.env.NEXT_PUBLIC_AI_ROADMAP_URL || null,
  })
}
