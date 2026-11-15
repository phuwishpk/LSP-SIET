/**
 * The layering of the frontend (docs/ARCHITECTURE.md), a DAG:
 *
 *   platform/frontend (the host app)  <-  @siet/kmitl-rag  <-  @siet/community
 *   platform/frontend (the host app)  <-  @siet/quiz       <-  @siet/community
 *   platform/frontend (the host app)  <-  @siet/roadmap    <-  @siet/community
 *
 * Every package may import the host (`@/`) and itself. Beyond that only
 * community reaches sideways: it may import kmitl-rag, quiz and roadmap;
 * kmitl-rag, quiz and roadmap may not import each other or community. The host
 * app imports the packages only from its route stubs (src/app) and the
 * installed-extensions list. There is no @siet/platform: its code is the host.
 */
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')
const LAYERS = ['host', 'kmitl-rag', 'community', 'quiz', 'roadmap'] as const
type Layer = (typeof LAYERS)[number]
const DIRS: Record<Layer, string> = {
  host: 'platform/frontend/src',
  'kmitl-rag': 'kmitl-rag/frontend/src',
  community: 'community/frontend/src',
  quiz: 'my-ai-quiz/frontend/src',
  roadmap: 'ai-roadmap/frontend/src',
}
// The `@siet/<name>/` alias each package is imported by (host has none: it is `@/`).
const ALIASES = ['kmitl-rag', 'community', 'quiz', 'roadmap']
// Which `@siet/<name>/` aliases each package may import (the host is always allowed).
const MAY_IMPORT: Record<Exclude<Layer, 'host'>, readonly string[]> = {
  'kmitl-rag': ['kmitl-rag'],
  community: ['community', 'kmitl-rag', 'quiz', 'roadmap'],
  quiz: ['quiz'],
  roadmap: ['roadmap'],
}
// Host files that may import @siet/* besides src/app route stubs (docs/ARCHITECTURE.md).
const HOST_ALLOWED = ['lib/extensions.installed.ts']

function allFiles(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[]).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.includes('node_modules'),
  )
}

function sourceFiles(dir: string): string[] {
  return allFiles(dir).filter((f) => !/\.test\.tsx?$/.test(f))
}

function sietImports(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]@siet\/([\w-]+)\//g)].map((m) => m[1])
}

describe('frontend layering', () => {
  it('every layer directory exists', () => {
    // A missing directory must fail here, never shrink the scan below.
    for (const layer of LAYERS) {
      expect(fs.existsSync(path.join(ROOT, DIRS[layer])), `${DIRS[layer]} is missing`).toBe(true)
    }
  })

  for (const layer of LAYERS) {
    it(`${layer} imports no higher layer`, () => {
      const offenders: string[] = []
      for (const rel of sourceFiles(path.join(ROOT, DIRS[layer]))) {
        const used = sietImports(path.join(ROOT, DIRS[layer], rel))
        if (layer === 'host') {
          if (used.length && !rel.startsWith('app/') && !HOST_ALLOWED.includes(rel)) {
            offenders.push(`${DIRS[layer]}/${rel} imports @siet/${used[0]}`)
          }
          continue
        }
        const allowed = new Set(MAY_IMPORT[layer])
        for (const target of used) {
          if (!allowed.has(target)) offenders.push(`${DIRS[layer]}/${rel} imports @siet/${target}`)
        }
      }
      expect(offenders).toEqual([])
    })
  }

  it('every @siet/ import names a known package (no @siet/platform)', () => {
    const offenders: string[] = []
    for (const layer of LAYERS) {
      for (const rel of allFiles(path.join(ROOT, DIRS[layer]))) {
        for (const target of sietImports(path.join(ROOT, DIRS[layer], rel))) {
          if (!ALIASES.includes(target)) offenders.push(`${DIRS[layer]}/${rel} imports @siet/${target}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('nothing imports the removed @siet/platform alias', () => {
    const offenders: string[] = []
    for (const layer of LAYERS) {
      for (const rel of allFiles(path.join(ROOT, DIRS[layer]))) {
        const file = path.join(ROOT, DIRS[layer], rel)
        if (/['"]@siet\/platform\//.test(fs.readFileSync(file, 'utf8'))) offenders.push(`${DIRS[layer]}/${rel}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
