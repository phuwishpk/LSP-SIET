/**
 * Bridge to SIET Space (the main app).
 *
 * The main app sends the user here with `?token=<JWT>` plus optional
 * `return` (where the back button goes), `course` and `doc` (the room or
 * library document the user came from). They are stored and stripped from the
 * address bar straight away so the token never lingers in history.
 */

export const BASE_PATH = '/roadmap'

const TOKEN_KEY = 'kmitlai-workspace-token'
const ORIGIN_KEY = 'kmitlai-workspace-origin'
const RETURN_KEY = 'roadmap-return-url'
const CONTEXT_KEY = 'roadmap-launch-context'
const LOGIN_ATTEMPT_KEY = 'roadmap-login-attempt'

const isBrowser = () => typeof window !== 'undefined'

function read(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function write(storage, key, value) {
  try {
    if (value === null || value === undefined) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    /* private mode: the app still works for this page view */
  }
}

export function getToken() {
  return isBrowser() ? read(window.localStorage, TOKEN_KEY) : null
}

export function clearToken() {
  if (isBrowser()) write(window.localStorage, TOKEN_KEY, null)
}

/** Only a URL on this same host (any port) may become the back target. */
function sameHost(url) {
  try {
    return new URL(url).hostname === window.location.hostname
  } catch {
    return false
  }
}

/** Hand-off parameters; removed from the address bar once stored. */
export const LAUNCH_PARAMS = ['token', 'return', 'course', 'doc']

/**
 * Read the hand-off parameters and store them. The address bar is cleaned by
 * the caller through the Next router (see WorkspaceProvider) - a bare
 * history.replaceState is undone when the router hydrates the query string.
 */
export function captureLaunchParams() {
  if (!isBrowser()) return
  const params = new URL(window.location.href).searchParams

  const token = params.get('token')
  if (token) write(window.localStorage, TOKEN_KEY, token)

  const back = params.get('return')
  if (back !== null && sameHost(back)) {
    write(window.sessionStorage, RETURN_KEY, back)
    write(window.localStorage, ORIGIN_KEY, new URL(back).origin)
  }

  if (params.has('course') || params.has('doc')) {
    const context = {
      course: Number(params.get('course')) || null,
      doc: Number(params.get('doc')) || null,
    }
    write(window.sessionStorage, CONTEXT_KEY, JSON.stringify(context))
  }
}

/** Origin of the main app: learned from the last hand-off, else inferred. */
export function workspaceOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_WORKSPACE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (!isBrowser()) return 'http://localhost:3000'
  const stored = read(window.localStorage, ORIGIN_KEY)
  if (stored && sameHost(stored)) return stored
  const { protocol, hostname, port, origin } = window.location
  // Standalone port 3002 -> the main app is on 3000; behind the proxy both
  // share one origin.
  if (port === '3002') return `${protocol}//${hostname}:3000`
  return origin
}

export function communityUrl(query = '') {
  return `${workspaceOrigin()}/community${query}`
}

/** Where "back to Community" goes: the page the user came from, else the feed. */
export function returnUrl() {
  if (!isBrowser()) return communityUrl()
  const stored = read(window.sessionStorage, RETURN_KEY)
  return stored && sameHost(stored) ? stored : communityUrl()
}

/** The room / document the user launched from (used to pre-select the source). */
export function launchContext() {
  if (!isBrowser()) return { course: null, doc: null }
  try {
    return JSON.parse(read(window.sessionStorage, CONTEXT_KEY) || '') || { course: null, doc: null }
  } catch {
    return { course: null, doc: null }
  }
}

export function clearLaunchContext() {
  if (isBrowser()) write(window.sessionStorage, CONTEXT_KEY, null)
}

export function markSignedIn() {
  if (isBrowser()) write(window.sessionStorage, LOGIN_ATTEMPT_KEY, null)
}

/**
 * Send the user through the main app to sign in, then straight back here.
 * Returns false when we just came back from that trip and are still not
 * signed in - bouncing again would loop, so the caller shows a message.
 */
export function redirectToLogin() {
  if (!isBrowser()) return false
  const last = Number(read(window.sessionStorage, LOGIN_ATTEMPT_KEY) || 0)
  if (Date.now() - last < 20000) return false
  write(window.sessionStorage, LOGIN_ATTEMPT_KEY, String(Date.now()))
  clearToken()

  const here = window.location.pathname.replace(new RegExp(`^${BASE_PATH}`), '') || '/'
  const target = new URL(`${workspaceOrigin()}/go/roadmap`)
  target.searchParams.set('path', here + window.location.search)
  const back = read(window.sessionStorage, RETURN_KEY)
  if (back) target.searchParams.set('return', back)
  const context = launchContext()
  if (context.course) target.searchParams.set('course', String(context.course))
  if (context.doc) target.searchParams.set('doc', String(context.doc))
  window.location.replace(target.toString())
  return true
}

/** `roadmap_session:abc` <-> the URL-safe code used in /roadmap/<code>. */
export function sessionCode(sessionId) {
  return String(sessionId).replace(':', '-')
}

export function sessionIdFromCode(code) {
  return String(code).replace(/^roadmap_session-/, 'roadmap_session:')
}
