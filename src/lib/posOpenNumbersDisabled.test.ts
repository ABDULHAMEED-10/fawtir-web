import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { opensNumbers } from './posQueue'

/**
 * NOT RUN (Q-27 web-main port of a75104240, static only). Owner P0-3, Q-27 hard-disable (DES43 rev
 * 4.3.4 §5.6; Appendix N N-R8a). Skipping stuck numbers must not be switchable by a server answer, a
 * cached till, storage, the URL, env or config. That is asserted on the source rather than trusted to
 * review: the only source of the capability is one literal, and no production file reads either
 * server flag, by property, by index, by destructuring or by `in` (IMPL1-A2 widened the scan).
 */

const ROOT = join(process.cwd(), 'src')

const READS_A_SKIP_FLAG = [
  /\.openNumbers\b/,
  /\[\s*['"`]openNumbers['"`]\s*\]/,
  /\{[^{}]*\bopenNumbers\b[^{}]*\}\s*[:=]/,
  /['"`]openNumbers['"`]\s+in\b/,
  /skipsStuckNumbers/,
]

function productionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return productionSources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const shown = (path: string) => relative(ROOT, path).replace(/\\/g, '/')

describe('Q-27: skipping stuck numbers is a literal false (N-R8a)', () => {
  it('opensNumbers() is false', () => {
    expect(opensNumbers()).toBe(false)
  })

  it('is defined once, as a bare literal with nothing to read', () => {
    const defining = productionSources(ROOT).filter((path) =>
      /function\s+opensNumbers\b/.test(readFileSync(path, 'utf8')),
    )
    expect(defining.map(shown)).toEqual(['lib/posQueue.ts'])
    const source = readFileSync(join(ROOT, 'lib/posQueue.ts'), 'utf8')
    expect(source).toMatch(/export function opensNumbers\(\): false \{\s*return false\s*\}/)
  })

  it('no production file reads openNumbers or skipsStuckNumbers off any object', () => {
    const readers = productionSources(ROOT).filter((path) => {
      const source = readFileSync(path, 'utf8')
      return READS_A_SKIP_FLAG.some((pattern) => pattern.test(source))
    })
    expect(readers.map(shown)).toEqual([])
  })

  it('the scan itself catches each shape of read', () => {
    const shapes = [
      'const canSkip = till.openNumbers === true',
      'const canSkip = till?.openNumbers',
      "const canSkip = till['openNumbers']",
      'const { openNumbers } = till',
      'function f({ id, openNumbers }: PosTillDto) {}',
      "if ('openNumbers' in till) {}",
      'const canSkip = till.skipsStuckNumbers',
    ]
    for (const shape of shapes) {
      expect(READS_A_SKIP_FLAG.some((pattern) => pattern.test(shape)), shape).toBe(true)
    }
  })
})
