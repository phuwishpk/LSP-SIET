/**
 * The layering of the frontend (docs/ARCHITECTURE.md):
 *
 *   platform/frontend (the host app)  <-  @siet/kmitl-rag  <-  @siet/community
 *
 * A package imports only from its own layer or the ones to its left. The host
 * app imports the packages only from its route stubs (src/app) and the
 * installed-extensions list. There is no @siet/platform: its code is the host.
 */
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')
const LAYERS = ['host', 'kmitl-rag', 'community'] as const
type Layer = (typeof LAYERS)[number]
const DIRS: Record<Layer, string> = {
  host: 'platform/frontend/src',
  'kmitl-rag': 'kmitl-rag/frontend/src',
  community: 'community/frontend/src',
}
// Host files that may import @siet/* besides src/app route stubs (docs/ARCHITECTURE.md).
const HOST_ALLOWED = ['lib/extensions.installed.ts']

function sourceFiles(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('node_modules'))
}

function sietImports(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]@siet\/([\w-]+)\//g)].map((m) => m[1])
}

describe('frontend layering', () => {
  for (const layer of LAYERS) {
    it(`${layer} imports no higher layer`, () => {
      const allowed = new Set(LAYERS.slice(0, LAYERS.indexOf(layer) + 1))
      const offenders: string[] = []
      for (const rel of sourceFiles(path.join(ROOT, DIRS[layer]))) {
        const used = sietImports(path.join(ROOT, DIRS[layer], rel))
        if (layer === 'host') {
          if (used.length && !rel.startsWith('app/') && !HOST_ALLOWED.includes(rel)) {
            offenders.push(`${DIRS[layer]}/${rel} imports @siet/${used[0]}`)
          }
          continue
        }
        for (const target of used) {
          if (!allowed.has(target as Layer)) offenders.push(`${DIRS[layer]}/${rel} imports @siet/${target}`)
        }
      }
      expect(offenders).toEqual([])
    })
  }

  it('nothing imports the removed @siet/platform alias', () => {
    const offenders: string[] = []
    for (const layer of LAYERS) {
      for (const rel of (fs.readdirSync(path.join(ROOT, DIRS[layer]), { recursive: true }) as string[])) {
        if (!/\.(ts|tsx)$/.test(rel) || rel.includes('node_modules')) continue
        const file = path.join(ROOT, DIRS[layer], rel)
        if (/['"]@siet\/platform\//.test(fs.readFileSync(file, 'utf8'))) offenders.push(`${DIRS[layer]}/${rel}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
