'use client';

import { useEffect } from 'react';
import { getWorkspaceToken } from '../lib/workspace';

/**
 * SIET Space opens this app with `?token=` and `?theme=`. Keep the token (the
 * theme was already kept by the inline script in layout.tsx), then drop both
 * from the address bar so the token does not linger in history and a reload
 * is not taken for a new hand-off.
 */
export function LaunchParams() {
  useEffect(() => {
    getWorkspaceToken();
    const url = new URL(window.location.href);
    if (url.searchParams.has('token') || url.searchParams.has('theme')) {
      url.searchParams.delete('token');
      url.searchParams.delete('theme');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);
  return null;
}
