import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { opensNumbers } from './posQueue'

/**
 * NOT RUN (RC5 W-Q27, static only). Owner P0-3, Q-27 hard-disable (DES43 rev 4.3.4 §5.6; Appendix N
 * N-R8a). Skipping stuck numbers must not be switchable by a server answer, a cached till, storage,
 * the URL, env or config. That is asserted on the source rather than trusted to review: the only
 * source of the capability is one literal, and no production file reads either server flag.
 */

const ROOT = join(process.cwd(), 'src')

function productionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return productionSources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('Q-27: skipping stuck numbers is a literal false (N-R8a)', () => {
  it('opensNumbers() is false', () => {
    expect(opensNumbers()).toBe(false)
  })

  it('is defined once, as a bare literal with nothing to read', () => {
    const files = productionSources(ROOT)
    const defining = files.filter((path) =>
      /function\s+opensNumbers\b/.test(readFileSync(path, 'utf8')),
    )
    expect(defining.map((path) => relative(ROOT, path).replace(/\\/g, '/'))).toEqual([
      'lib/posQueue.ts',
    ])
    const source = readFileSync(join(ROOT, 'lib/posQueue.ts'), 'utf8')
    expect(source).toMatch(/export function opensNumbers\(\): false \{\s*return false\s*\}/)
  })

  it('no production file reads openNumbers or skipsStuckNumbers off any object', () => {
    const readers = productionSources(ROOT).filter((path) =>
      /\.openNumbers\b|\[\s*['"`]openNumbers['"`]\s*\]|skipsStuckNumbers/.test(
        readFileSync(path, 'utf8'),
      ),
    )
    expect(readers.map((path) => relative(ROOT, path).replace(/\\/g, '/'))).toEqual([])
  })
})
