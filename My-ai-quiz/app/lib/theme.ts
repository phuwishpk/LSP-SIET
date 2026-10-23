/**
 * Light / dark theme, following the one picked in SIET Space (Community).
 *
 * Where the choice comes from, in order:
 *   1. SIET Space's own `theme-storage`, when both apps share one origin behind
 *      the proxy - then there is only one SIET Space and it is always current;
 *   2. otherwise the newer of
 *      - the `siet-theme` cookie (`<choice>~<ms>`), which SIET Space writes when
 *        its user changes the theme - cookies are not separated by port, so it
 *        reaches this app on :3001;
 *      - the `?theme=` of the hand-off link, kept with the time it arrived.
 *      Comparing times matters when two SIET Space copies run on one host: the
 *      app follows the copy it was opened from until the user changes the theme;
 *   3. 'system'.
 *
 * `siteTheme` runs as an inline script in layout.tsx (the Next.js "preventing
 * flash before hydration" pattern) and again from ThemeWatcher whenever the tab
 * comes back into view. It is serialised for the inline script, so it may only
 * use its arguments and browser globals, in plain ES5.
 */

type ThemeKeys = { kept: string; shared: string; cookie: string };

const ARGS: ThemeKeys = { kept: 'quiz-theme', shared: 'theme-storage', cookie: 'siet-theme' };

export function siteTheme(keys: ThemeKeys, readLink: boolean): void {
  try {
    var choices = ['light', 'dark', 'system'];
    var store = window.localStorage;
    var parse = function (raw: string | null): { choice: string; at: number } | null {
      if (!raw) return null;
      try {
        var saved = JSON.parse(raw);
        if (saved && choices.indexOf(saved.choice) >= 0) return { choice: saved.choice, at: Number(saved.at) || 0 };
      } catch (e) {}
      var parts = String(raw).split('~');
      return choices.indexOf(parts[0]) >= 0 ? { choice: parts[0], at: Number(parts[1]) || 0 } : null;
    };
    if (readLink) {
      var fromLink = new URLSearchParams(window.location.search).get('theme');
      if (fromLink && choices.indexOf(fromLink) >= 0) store.setItem(keys.kept, JSON.stringify({ choice: fromLink, at: Date.now() }));
    }
    var choice: string | null = null;
    try {
      var shared = JSON.parse(store.getItem(keys.shared) || 'null');
      if (shared && shared.state && choices.indexOf(shared.state.theme) >= 0) choice = shared.state.theme;
    } catch (e) {}
    if (!choice) {
      var match = document.cookie.match(new RegExp('(?:^|; )' + keys.cookie + '=([^;]*)'));
      var cookie = match ? parse(decodeURIComponent(match[1])) : null;
      var kept = parse(store.getItem(keys.kept));
      var newer = cookie && kept ? (cookie.at > kept.at ? cookie : kept) : cookie || kept;
      choice = newer ? newer.choice : 'system';
    }
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
}

/** Inline <script> for layout.tsx: reads the hand-off link once, at page load. */
export const themeBootScript = `(${siteTheme.toString()})(${JSON.stringify(ARGS)}, true)`;

export function applyTheme(): void {
  siteTheme(ARGS, false);
}

/** Re-apply when the OS theme or the stored choice changes; returns a cleanup. */
export function watchTheme(): () => void {
  applyTheme();
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onStorage = (event: StorageEvent) => {
    if (event.key === ARGS.shared || event.key === ARGS.kept) applyTheme();
  };
  // A cookie set in Community fires no event here: look again whenever this
  // tab is shown (switching tabs, the back button, focusing the window).
  const onVisible = () => {
    if (document.visibilityState === 'visible') applyTheme();
  };
  media?.addEventListener?.('change', applyTheme);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', applyTheme);
  window.addEventListener('focus', applyTheme);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    media?.removeEventListener?.('change', applyTheme);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', applyTheme);
    window.removeEventListener('focus', applyTheme);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
