'use client';

import { useEffect } from 'react';
import { getWorkspaceToken, WORKSPACE_ORIGIN_KEY } from '../lib/workspace';

/**
 * SIET Space opens this app with `?token=`, `?theme=` and `?return=` (the page
 * it came from). Keep the token and which SIET Space that was (the theme was
 * already kept by the inline script in layout.tsx), then drop them from the
 * address bar so the token does not linger in history and a reload is not taken
 * for a new hand-off.
 */
export function LaunchParams() {
  useEffect(() => {
    getWorkspaceToken();
    const url = new URL(window.location.href);
    const back = url.searchParams.get('return');
    try {
      if (back && new URL(back).hostname === window.location.hostname) {
        window.localStorage.setItem(WORKSPACE_ORIGIN_KEY, new URL(back).origin);
      }
    } catch {
      // A bad link or private mode: links fall back to the inferred SIET Space.
    }
    const handed = ['token', 'theme', 'return'].filter((name) => url.searchParams.has(name));
    if (handed.length) {
      handed.forEach((name) => url.searchParams.delete(name));
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);
  return null;
}
