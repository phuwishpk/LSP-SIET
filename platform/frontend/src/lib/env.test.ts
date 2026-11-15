/**
 * LSP_SIET_* settings fall back to the old OPEN_NOTEBOOK_* names.
 *
 * The host app and the two standalone apps (my-ai-quiz, ai-roadmap) each carry their own copy
 * of the helper (they share no code), so the same cases run against all three.
 */
import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type EnvModule = {
  env: (name: string, fallback?: string) => string | undefined
  LEGACY_NAMES: Record<string, string>
}

// [app, loader, the setting that app reads]. Each copy's table holds what its app reads.
const copies: [string, () => Promise<EnvModule>, string, string][] = [
  ['host', () => import('./env'), 'LSP_SIET_MAX_UPLOAD_SIZE_MB', 'OPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB'],
  ['my-ai-quiz', () => import('../../../../my-ai-quiz/app/app/lib/env'), 'LSP_SIET_API_URL', 'OPEN_NOTEBOOK_API_URL'],
  ['ai-roadmap', () => import('../../../../ai-roadmap/app/src/lib/env'), 'LSP_SIET_API_URL', 'OPEN_NOTEBOOK_API_URL'],
]

describe.each(copies)('env() in %s', (_app, load, NEW, OLD) => {
  let warn: ReturnType<typeof vi.spyOn>

  // Each test gets a fresh module, so "warns once per process" starts from nothing.
  async function fresh(): Promise<EnvModule> {
    vi.resetModules()
    return load()
  }

  beforeEach(() => {
    delete process.env[NEW]
    delete process.env[OLD]
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    warn.mockRestore()
  })

  it('env_fallback_new_wins', async () => {
    vi.stubEnv(NEW, 'new')
    vi.stubEnv(OLD, 'new') // the same value under both names: nothing to say
    const { env } = await fresh()

    expect(env(NEW)).toBe('new')
    expect(warn).not.toHaveBeenCalled()
  })

  it('both names with different values warn once and the new one wins', async () => {
    vi.stubEnv(NEW, 'new')
    vi.stubEnv(OLD, 'old')
    const { env } = await fresh()

    expect(env(NEW)).toBe('new')
    expect(env(NEW)).toBe('new')
    expect(env(NEW)).toBe('new')

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0][0])
    expect(message).toContain(NEW)
    expect(message).toContain(OLD)
    expect(message).toContain(`${NEW} wins`)
    expect(message).not.toMatch(/\b(new|old)\b/) // names only, never a value
  })

  it('a blank name next to a real one is not a conflict', async () => {
    vi.stubEnv(NEW, '')
    vi.stubEnv(OLD, 'old')
    let { env } = await fresh()
    expect(env(NEW)).toBe('old')

    vi.stubEnv(NEW, 'new')
    vi.stubEnv(OLD, '')
    ;({ env } = await fresh())
    expect(env(NEW)).toBe('new')

    // the first read only said "deprecated" (old name used); nothing about two values
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('deprecated')
  })

  it('env_fallback_old_used_and_warns', async () => {
    vi.stubEnv(OLD, 'old')
    const { env } = await fresh()

    expect(env(NEW)).toBe('old')
    expect(env(NEW)).toBe('old')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(OLD)
    expect(String(warn.mock.calls[0][0])).toContain(NEW)
  })

  it('env_default', async () => {
    const { env } = await fresh()

    expect(env(NEW)).toBeUndefined()
    expect(env(NEW, '2048')).toBe('2048')
    expect(warn).not.toHaveBeenCalled()
  })

  it('a blank new name does not shadow a real old value', async () => {
    vi.stubEnv(NEW, '')
    vi.stubEnv(OLD, 'old')
    const { env } = await fresh()

    expect(env(NEW)).toBe('old')
  })

  it('a blank value is kept when nothing else is set', async () => {
    vi.stubEnv(OLD, '')
    const { env } = await fresh()

    expect(env(NEW, '2048')).toBe('')
  })

  it('a name without a legacy name is a plain read', async () => {
    vi.stubEnv('SURREAL_USER', 'root')
    const { env } = await fresh()

    expect(env('SURREAL_USER')).toBe('root')
    expect(env('NOT_A_SETTING', 'x')).toBe('x')
  })

  it('every entry pairs a new name with its old one', async () => {
    const { LEGACY_NAMES } = await fresh()

    expect(Object.keys(LEGACY_NAMES)).toContain(NEW)
    for (const [next, old] of Object.entries(LEGACY_NAMES)) {
      expect(next.replace('LSP_SIET_', '')).toBe(old.replace('OPEN_NOTEBOOK_', ''))
    }
  })
})

// Next inlines `process.env.NEXT_PUBLIC_X` into client bundles only when it is written out
// literally. A lookup by computed name (what env() does) is not inlined and reads undefined in
// the browser, so a public value is read with an explicit `a ?? b` over both literal names.
describe('NEXT_PUBLIC_* values', () => {
  const ROOT = path.resolve(__dirname, '../../../..')

  it('are never read through env()', () => {
    const offenders: string[] = []
    for (const dir of ['platform/frontend/src', 'my-ai-quiz/app/app', 'ai-roadmap/app/src']) {
      const files = (fs.readdirSync(path.join(ROOT, dir), { recursive: true }) as string[]).filter(
        (f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\./.test(f) && !f.includes('node_modules'),
      )
      for (const rel of files) {
        const text = fs.readFileSync(path.join(ROOT, dir, rel), 'utf8')
        if (/\benv\(\s*['"`]NEXT_PUBLIC_/.test(text)) offenders.push(`${dir}/${rel}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
