/**
 * Where to send someone right after they sign in.
 *
 * The dashboard layout remembers the page a signed-out visitor was heading for;
 * every sign-in path (password, Google, "already signed in") reads it through
 * here so they all agree, and the layout clears it once the page is reached.
 */
const KEY = 'redirectAfterLogin'

export function rememberPostLoginPath(path: string) {
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    /* storage unavailable: fall back to the role's home page */
  }
}

export function peekPostLoginPath(role?: string | null): string {
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(KEY)
  } catch {
    stored = null
  }
  // Same-origin paths only, and never back to the sign-in page itself.
  if (stored && stored.startsWith('/') && !stored.startsWith('//') && !stored.startsWith('/login')) {
    return stored
  }
  return role === 'admin' ? '/admin' : '/community'
}

export function clearPostLoginPath() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
