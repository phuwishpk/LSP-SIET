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

export function peekPostLoginPath(role?: string | null, disabled?: boolean): string {
  if (disabled || role === 'pending') {
    return '/denied'
  }
  if (role === 'admin') {
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem(KEY)
    } catch {
      stored = null
    }
    if (stored && (stored.startsWith('/admin') || stored.startsWith('/settings'))) {
      return stored
    }
    return '/admin'
  }
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(KEY)
  } catch {
    stored = null
  }
  // Same-origin paths only, and never back to the sign-in page itself or pending page.
  if (
    stored &&
    stored.startsWith('/') &&
    !stored.startsWith('//') &&
    !stored.startsWith('/login') &&
    !stored.startsWith('/pending') &&
    !stored.startsWith('/denied')
  ) {
    return stored
  }
  return '/community'
}

export function clearPostLoginPath() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}


/**
 * The Google login gate refuses ineligible accounts with
 * `403 access_denied_not_eligible:<email>:<name>` (PR #37). Returns the /denied
 * URL for such an error detail, or null for any other error.
 */
export function deniedPathForLoginError(detail?: string | null): string | null {
  if (!detail || !detail.startsWith('access_denied_not_eligible')) return null
  const [, email = '', ...rest] = detail.split(':')
  const name = rest.join(':')
  return `/denied?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
}
