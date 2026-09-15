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

/**
 * Browser-facing URL of the KMITL workspace (open-notebook Next.js app).
 * `NEXT_PUBLIC_WORKSPACE_URL` wins when baked into the build; otherwise infer
 * it: on the standalone port (3002) the workspace lives on port 3000 of the
 * same host, behind Traefik (`/roadmap`) it is the site root.
 */
export function getWorkspaceAppUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_WORKSPACE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window === 'undefined') return 'http://localhost:3000'
  const { protocol, hostname, port, origin } = window.location
  if (port === '3002') return `${protocol}//${hostname}:3000`
  return origin
}

/** Share an Open Notebook roadmap session to the SIET Space community feed. */
export async function shareRoadmapToCommunity({ sessionId, title, content }) {
  const token = getWorkspaceToken()
  if (!token) throw new Error('กรุณาเข้าสู่ระบบผ่าน SIET Space ก่อนแชร์')
  const res = await fetch('/roadmap/api/roadmap/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ session_id: sessionId, title, content }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || 'แชร์ไม่สำเร็จ')
  return data
}
