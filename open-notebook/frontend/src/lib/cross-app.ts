/**
 * Helpers for cross-app navigation that need to forward the workspace JWT.
 *
 * The standalone Next.js apps (My-ai-quiz / ai-roadmap-generator) accept the
 * JWT via the `?token=…` query parameter, store it in localStorage and use it
 * on subsequent API calls.
 */

import { getApiUrl } from './config'

interface CrossAppLink {
  /** Local path or external URL – we never inspect this. */
  href: string
}

/**
 * Build the URL for an external app with the current JWT appended as a query
 * parameter. Falls back to the un-tokenised URL if the token cannot be read.
 */
export async function buildCrossAppLink({ href }: CrossAppLink): Promise<string> {
  if (typeof window === 'undefined') {
    return href
  }
  const authStorage = window.localStorage.getItem('auth-storage')
  if (!authStorage) return href

  try {
    const { state } = JSON.parse(authStorage)
    const token: string | undefined = state?.token
    if (!token || token === 'not-required') return href
    const url = new URL(href, window.location.origin)
    url.searchParams.set('token', token)
    return url.toString()
  } catch {
    return href
  }
}

/**
 * Resolve the API URL we should hit when forwarding the workspace JWT to a
 * different app's server (for example, the open-notebook API when a child app
 * wants to verify the token).
 */
export async function getWorkspaceApiUrl(): Promise<string> {
  return getApiUrl()
}