'use client';

import { useEffect } from 'react';
import { watchTheme } from '../lib/theme';

/** Keeps following SIET Space's light / dark choice after the first paint. */
export function ThemeWatcher() {
  useEffect(() => {
    // The inline script has kept `?theme=` from the hand-off link; drop it from
    // the address so a reload is not taken for a new hand-off.
    const url = new URL(window.location.href);
    if (url.searchParams.has('theme')) {
      url.searchParams.delete('theme');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    return watchTheme();
  }, []);
  return null;
}
