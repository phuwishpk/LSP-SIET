/**
 * Settings under their LSP_SIET_* names, with the old OPEN_NOTEBOOK_* names as a fallback.
 *
 * Production environments still set the old names, so they keep working: env() reads the new
 * name and, when that is not set, the old one. The first of the two with a value wins; a blank
 * value never shadows a real one; the first read through an old name warns once per name; two
 * different non-blank values under the two names warn once (naming both, the new one wins).
 *
 * This is the app's own copy (it shares no code with the host); the host's is
 * platform/frontend/src/lib/env.ts. Server-side only: route handlers read their settings here.
 * platform/tests/test_env_fallback.py checks every pair against siet_core/env.py.
 */
export const LEGACY_NAMES: Record<string, string> = {
  LSP_SIET_API_URL: 'OPEN_NOTEBOOK_API_URL',
}

const warned = new Set<string>();

/** Both names set to different non-blank values: say once which one wins (names only, never a value). */
function warnIfConflicting(name: string, legacy: string): void {
  const next = process.env[name];
  const old = process.env[legacy];
  const key = `${legacy} != ${name}`;
  if (!next || !old || next === old || warned.has(key)) return;
  warned.add(key);
  console.warn(
    `${name} and ${legacy} are both set, with different values: ${name} wins and ${legacy} is ignored. ` +
      `Remove ${legacy} (or give both the same value) so the setting is not changed by accident`,
  );
}

export function env(name: string, fallback?: string): string | undefined {
  const legacy = LEGACY_NAMES[name];
  let blank: string | undefined;
  if (legacy) warnIfConflicting(name, legacy);
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
