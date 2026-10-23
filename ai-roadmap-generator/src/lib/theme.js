/**
 * Light / dark theme, following the one picked in SIET Space (Community).
 *
 * SIET Space keeps the choice ('light' | 'dark' | 'system') in localStorage
 * under `theme-storage`. Behind the proxy both apps share one origin and that
 * value is read directly, so a change in Community shows up here too. On its
 * own port (3002) the app cannot see it, so the hand-off link carries
 * `?theme=` and the choice is kept under THEME_KEY.
 *
 * The same logic runs twice: as an inline script in _document.js, so the first
 * paint already has the right colours, and from WorkspaceProvider to follow
 * later changes.
 */

export const THEME_KEY = 'roadmap-theme'
const WORKSPACE_THEME_KEY = 'theme-storage'
const CHOICES = ['light', 'dark', 'system']

/** Inline <script> for _document.js; it must not depend on anything else. */
export const themeBootScript = `(function () {
  try {
    var choices = ${JSON.stringify(CHOICES)};
    var fromLink = new URLSearchParams(window.location.search).get('theme');
    if (choices.indexOf(fromLink) >= 0) localStorage.setItem('${THEME_KEY}', fromLink);
    var choice = null;
    try { choice = JSON.parse(localStorage.getItem('${WORKSPACE_THEME_KEY}') || 'null').state.theme; } catch (e) {}
    if (choices.indexOf(choice) < 0) choice = localStorage.getItem('${THEME_KEY}');
    if (choices.indexOf(choice) < 0) choice = 'system';
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
})();`

function read(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The theme picked in SIET Space: 'light' | 'dark' | 'system'. */
export function themeChoice() {
  try {
    const shared = JSON.parse(read(WORKSPACE_THEME_KEY) || 'null')?.state?.theme
    if (CHOICES.includes(shared)) return shared
  } catch {
    /* not on the main app's origin, or an unreadable value */
  }
  const kept = read(THEME_KEY)
  return CHOICES.includes(kept) ? kept : 'system'
}

/** Keep the choice handed over in the link (see captureLaunchParams). */
export function rememberThemeChoice(choice) {
  if (!CHOICES.includes(choice)) return
  try {
    window.localStorage.setItem(THEME_KEY, choice)
  } catch {
    /* private mode: the choice still applies to this page view */
  }
}

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function applyTheme() {
  const choice = themeChoice()
  const dark = choice === 'dark' || (choice === 'system' && prefersDark())
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

/** Re-apply when the OS theme or the stored choice changes; returns a cleanup. */
export function watchTheme() {
  applyTheme()
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const onStorage = (event) => {
    if (event.key === WORKSPACE_THEME_KEY || event.key === THEME_KEY) applyTheme()
  }
  media?.addEventListener?.('change', applyTheme)
  window.addEventListener('storage', onStorage)
  // Coming back with the browser's back button can restore the page as it was.
  window.addEventListener('pageshow', applyTheme)
  return () => {
    media?.removeEventListener?.('change', applyTheme)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pageshow', applyTheme)
  }
}
