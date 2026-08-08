/**
 * Lightweight workspace bridge used by the ai-roadmap-generator pages.
 *
 * Lets the rest of the app:
 *   * read the JWT stashed by the `WorkspaceTokenBridge` component
 *   * resolve the workspace API base URL (overridable via NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL)
 *   * issue authenticated requests to open-notebook endpoints
 *
 * The PocketBase integration is untouched – we keep that local to this app
 * because the existing UI persists roadmap data there. The workspace bridge
 * is only used to verify the user / display their identity in the header.
 */

const TOKEN_KEY = 'kmitlai-workspace-token'

export function getWorkspaceToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function getWorkspaceApiBase() {
  const explicit = process.env.NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL
  if (explicit) return explicit.replace(/\/$/, '')
  return 'http://localhost:5055'
}

export function hasWorkspaceSession() {
  return Boolean(getWorkspaceToken())
}

export async function fetchCurrentWorkspaceUser() {
  const token = getWorkspaceToken()
  if (!token) return null
  try {
    const res = await fetch(`${getWorkspaceApiBase()}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.warn('Workspace user lookup failed:', error)
    return null
  }
}