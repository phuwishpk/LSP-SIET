/**
 * Settings under their LSP_SIET_* names, with the old OPEN_NOTEBOOK_* names as a fallback.
 *
 * Production .env files and compose environments still use the old names, so they keep
 * working: env() reads the new name and, when that is not set, the old one. The same rules
 * as siet_core/env.py: the first of the two with a value wins (new before old); a blank value
 * never shadows a real one; the first read through an old name warns once per name; two different
 * non-blank values under the two names warn once (naming both, the new one wins).
 *
 * Server-side only (next.config.ts, route handlers, server components): the lookup is by a
 * computed name, which Next does not inline into client bundles. A NEXT_PUBLIC_* value used
 * in client code is written out literally instead, over both names:
 *
 *   process.env.NEXT_PUBLIC_LSP_SIET_API_URL ?? process.env.NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL
 *
 * (env.test.ts fails if env() is called with a NEXT_PUBLIC_ name.)
 *
 * The app reads few of these; add a pair when it reads another. platform/tests/test_env_fallback.py
 * checks every pair against LEGACY_NAMES in siet_core/env.py.
 */
export const LEGACY_NAMES: Record<string, string> = {
  LSP_SIET_MAX_UPLOAD_SIZE_MB: 'OPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB',
}

const warned = new Set<string>()

/** Both names set to different non-blank values: say once which one wins (names only, never a value). */
function warnIfConflicting(name: string, legacy: string): void {
  const next = process.env[name]
  const old = process.env[legacy]
  const key = `${legacy} != ${name}`
  if (!next || !old || next === old || warned.has(key)) return
  warned.add(key)
  console.warn(
    `${name} and ${legacy} are both set, with different values: ${name} wins and ${legacy} is ignored. ` +
      `Remove ${legacy} (or give both the same value) so the setting is not changed by accident`,
  )
}

export function env(name: string, fallback?: string): string | undefined {
  const legacy = LEGACY_NAMES[name]
  let blank: string | undefined
  if (legacy) warnIfConflicting(name, legacy)
  for (const candidate of legacy ? [name, legacy] : [name]) {
    const value = process.env[candidate]
    if (value) {
      if (candidate !== name && !warned.has(candidate)) {
        warned.add(candidate)
        console.warn(`${candidate} is deprecated; rename it to ${name} (the old name still works)`)
      }
      return value
    }
    if (value !== undefined) blank = value
  }
  return blank ?? fallback
}
