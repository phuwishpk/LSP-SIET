'use client';

import { useEffect } from 'react';
import { watchTheme } from '../lib/theme';

/** Keeps following SIET Space's light / dark choice after the first paint. */
export function ThemeWatcher() {
  useEffect(() => watchTheme(), []);
  return null;
}
