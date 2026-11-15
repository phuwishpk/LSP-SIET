/**
 * Settings under their LSP_SIET_* names, with the old OPEN_NOTEBOOK_* names as a fallback.
 *
 * Production environments still set the old names, so they keep working: env() reads the new
 * name and, when that is not set, the old one. The first of the two with a value wins; a blank
 * value never shadows a real one; the first read through an old name warns once per name.
 *
 * This is the app's own copy (it shares no code with the host); the host's is
 * platform/frontend/src/lib/env.ts. Server-side only: route handlers read their settings here.
 * platform/tests/test_env_fallback.py checks every pair against siet_core/env.py.
 */
export const LEGACY_NAMES: Record<string, string> = {
  LSP_SIET_API_URL: 'OPEN_NOTEBOOK_API_URL',
}

const warned = new Set<string>();

export function env(name: string, fallback?: string): string | undefined {
  const legacy = LEGACY_NAMES[name];
  let blank: string | undefined;
  for (const candidate of legacy ? [name, legacy] : [name]) {
    const value = process.env[candidate];
    if (value) {
      if (candidate !== name && !warned.has(candidate)) {
        warned.add(candidate);
        console.warn(`${candidate} is deprecated; rename it to ${name} (the old name still works)`);
      }
      return value;
    }
    if (value !== undefined) blank = value;
  }
  return blank ?? fallback;
}
