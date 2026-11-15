import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as locales from './index'
import { resources } from './index'
import { enUS } from './en-US'

const getKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
  return Object.keys(obj).reduce((res: string[], el) => {
    const val = obj[el]
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return [...res, ...getKeys(val as Record<string, unknown>, prefix + el + '.')]
    }
    return [...res, prefix + el]
  }, [])
}

describe('Locales', () => {
  it('ships en-US only', () => {
    expect(Object.keys(resources)).toEqual(['en-US'])
  })

  it('has no locale directory besides en-US', () => {
    const dirs = fs
      .readdirSync(__dirname, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
    expect(dirs).toEqual(['en-US'])
  })

  it('exports no language list for a picker', () => {
    expect(Object.keys(locales)).not.toContain('languages')
  })
})

describe('Unused Key Detection', () => {
  it(
    'all en-US leaf keys should be referenced in source files',
    () => {
      const srcDir = path.resolve(__dirname, '../../..')
      const localesDir = path.resolve(__dirname)
      // The SIET packages (kmitl-rag owns the /search page, ...) read keys of
      // these locales too, so their sources count as references.
      const repoRoot = path.resolve(__dirname, '../../../../..')
      // (The host's own sources are srcDir.) A package dir
      // that is missing must fail, not silently shrink the corpus.
      const packageSrcDirs = ['kmitl-rag', 'community', 'my-ai-quiz', 'ai-roadmap'].map(dir =>
        path.join(repoRoot, dir, 'frontend/src'),
      )
      for (const dir of packageSrcDirs) {
        expect(fs.existsSync(dir), `${dir} is missing`).toBe(true)
      }

      const sourceFiles = [srcDir, ...packageSrcDirs].flatMap(root =>
        (fs.readdirSync(root, { recursive: true }) as string[])
          .map(f => path.join(root, f))
          .filter(full => {
            if (full.startsWith(localesDir)) return false
            if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) return false
            return full.endsWith('.ts') || full.endsWith('.tsx')
          }),
      )

      // Normalize optional chaining (t?.common?.key → t.common.key)
      // so that keys like "common.errorDetails" match "common?.errorDetails"
      const corpus = sourceFiles
        .map(f => fs.readFileSync(f, 'utf-8'))
        .join('\n')
        .replace(/\?\./g, '.')

      // Plural forms (key_one, key_other, …) are resolved by i18next from the
      // base key passed to t(), so check the base key instead.
      const pluralSuffix = /_(zero|one|two|few|many|other)$/
      const leafKeys = getKeys(enUS)
      const unused = leafKeys.filter(
        key => !corpus.includes(key.replace(pluralSuffix, '')),
      )

      expect(
        unused,
        `Found ${unused.length} unused i18n key(s):\n${unused.join('\n')}`,
      ).toEqual([])
    },
    30_000,
  )
})
