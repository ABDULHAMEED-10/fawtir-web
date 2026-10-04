import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The production ERP connection screens must not read the design-time mock runtime.
 *
 * `src/lib/erpConnector.ts` is a 1,400-line stand-in written before the backend existed. It
 * invents products, auth kinds, a scheduler, runs, records, a write-back outbox, watermarks, an
 * add-on subscription and an `ERROR` connection state — none of which Phase 2 has. A screen that
 * still read it would show a tenant figures about invoice collection that never happened, and the
 * failure is silent: the numbers look plausible.
 *
 * So this is asserted structurally rather than trusted to review. The file itself is kept — the
 * console's operator screens still draw the design against it, and deleting it is not this
 * phase's business — but nothing the tenant sees may import it.
 */

const ROOT = join(process.cwd(), 'src')

/** The mock modules a tenant-facing connection screen may not reach. */
const FORBIDDEN = ['erpConnector', 'consoleErp']

/**
 * Where the real connection screens live, plus the two pages that frame them and the Settings hub
 * that links to them. `SettingsPage` is included because its connections card used to carry a
 * mock-derived count and an "N need attention" badge for a state the backend cannot produce.
 */
const GUARDED = [
  'pages/ErpPage/connections',
  'pages/ErpPage/ErpConnectionsPage.tsx',
  'pages/ErpPage/ErpConnectPage.tsx',
  'pages/SettingsPage/SettingsPage.tsx',
  'api/erp/connections.ts',
  'api/erp/extraction.ts',
  'lib/erp/connectionPolicy.ts',
  'hooks/useErpAccess.ts',
  // The extraction reports (ERP frontend Phase 2): runs, documents and reconciliation are where a
  // tenant reads what their ERP sent, so invented figures there would be the most misleading.
  'pages/ErpPage/reporting',
  'api/erp/reporting.ts',
  'lib/erp/reportingStatus.ts',
  'lib/erp/reportingWindow.ts',
  // The console's own two connection screens, since the browser gate of 24 September 2026:
  // they drew the same invented state for an operator, who would answer a support call from
  // it. They now say the platform view is not built (ConsoleErpUnavailable). The templates,
  // add-on request, audit and queue screens still read the fixture and are out of scope here.
  'pages/ConsolePage/erp/ConsoleErpPage.tsx',
  'pages/ConsolePage/erp/ConsoleErpConnectionPage.tsx',
  'pages/ConsolePage/erp/ConsoleErpUnavailable.tsx',
]

/**
 * Paths are returned with forward slashes on every platform. `join` yields backslashes on Windows,
 * which silently defeats naming a nested file in an assertion — the guard reports success over a
 * tree it did walk but cannot be asked about. `readFileSync` accepts either separator, so
 * normalising costs nothing.
 */
function filesUnder(relative: string): string[] {
  const absolute = join(ROOT, relative)
  if (!statSync(absolute).isDirectory()) return [relative]
  return readdirSync(absolute).flatMap((entry) => filesUnder(`${relative}/${entry}`))
}

function importsOf(relative: string): string[] {
  const source = readFileSync(join(ROOT, relative), 'utf8')
  // `from '...'` covers static imports and re-exports; `import('...')` covers a lazy one.
  return [...source.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1])
}

describe('the production ERP connection screens', () => {
  const guardedFiles = GUARDED.flatMap(filesUnder).filter((file) => /\.tsx?$/.test(file))

  it('were actually found, so this guard is not vacuous', () => {
    // A guard that silently checks nothing is worse than no guard: it reports success over an
    // unexamined tree. Five is the floor -- the four screens plus the API client.
    expect(guardedFiles.length).toBeGreaterThanOrEqual(5)
    expect(guardedFiles).toContain('pages/ErpPage/ErpConnectionsPage.tsx')
    expect(guardedFiles).toContain('api/erp/connections.ts')
    // Named explicitly: the MANAGED_PULL productization screen is the one that shows a tenant what
    // their ERP actually returned, so it is where invented data would be least visible.
    expect(guardedFiles).toContain('pages/ErpPage/connections/ConnectionExtractionPage.tsx')
    expect(guardedFiles).toContain('pages/ErpPage/connections/extractionData.ts')
    expect(guardedFiles).toContain('api/erp/extraction.ts')
  })

  it.each(guardedFiles)('%s does not import the mock runtime', (file) => {
    const offending = importsOf(file).filter((specifier) =>
      FORBIDDEN.some((mock) => specifier.includes(mock)),
    )
    expect(offending).toEqual([])
  })

  it('reach the real endpoints through the typed client', () => {
    const client = readFileSync(join(ROOT, 'api/erp/connections.ts'), 'utf8')
    expect(client).toContain("'/v1/erp/connections'")
    // Nine operations, all under the one base path.
    for (const call of [
      'listErpConnections',
      'getErpConnection',
      'createErpConnection',
      'updateErpConnection',
      'transitionErpConnection',
      'storeErpCredential',
      'testErpConnection',
    ]) {
      expect(client).toContain(`export function ${call}`)
    }
  })

  it('has no response type with a field that could carry a secret', () => {
    const client = readFileSync(join(ROOT, 'api/erp/connections.ts'), 'utf8')
    // The one place `secret` may appear on a type is the REQUEST. If it ever appears on a
    // response shape, a screen could render it.
    const responseBlocks = client.split(
      '/* ---------------------------------------------------------------- requests */',
    )[0]
    // Field DECLARATIONS only. A looser `toContain('ciphertext')` also matched the prose in this
    // file's own doc comments explaining that no such field exists, which is the wrong thing to
    // fail on -- the text saying a field is absent is not the field.
    expect(responseBlocks).not.toMatch(/^\s*secret\??:/m)
    expect(responseBlocks).not.toMatch(/^\s*\w*[Cc]iphertext\??:/m)
    expect(responseBlocks).not.toMatch(/^\s*(envelope|plaintext|authHeader)\??:/m)
  })

  it('reach the real extraction endpoints through the typed client', () => {
    const client = readFileSync(join(ROOT, 'api/erp/extraction.ts'), 'utf8')
    expect(client).toContain("'/v1/erp/connections'")
    for (const call of [
      'getExtractionSettings',
      'putExtractionSettings',
      'getExtractionStatus',
      'fetchExtractionSample',
      'putExtractionEnablement',
    ]) {
      expect(client).toContain(`export function ${call}`)
    }
  })

  it('does not recompute the extraction status the server decides', () => {
    // The nine status values appear in the client as a union, for exhaustiveness checking. What must
    // never appear is code that picks one: the precedence is the backend's, and a second
    // implementation of it would disagree the first time the order changed.
    const sources = [
      readFileSync(join(ROOT, 'api/erp/extraction.ts'), 'utf8'),
      readFileSync(join(ROOT, 'pages/ErpPage/connections/ConnectionExtractionPage.tsx'), 'utf8'),
      readFileSync(join(ROOT, 'pages/ErpPage/connections/extractionData.ts'), 'utf8'),
    ].join('\n')
    // A local decision would have to PRODUCE a status -- return it, or yield it from a conditional --
    // rather than only name it as a type member or a lookup key, which both screens legitimately do.
    for (const status of ['WAITING', 'RUNNING', 'BACKOFF', 'MAPPING_NOT_CERTIFIED']) {
      expect(sources).not.toContain("return '" + status + "'")
      expect(sources).not.toContain("? '" + status + "'")
      expect(sources).not.toContain(": '" + status + "'")
    }
  })

  it('has no extraction response field that could carry a secret', () => {
    const client = readFileSync(join(ROOT, 'api/erp/extraction.ts'), 'utf8')
    const responses = client.split(
      '/* ---------------------------------------------------------------- requests */',
    )[0]
    // The sample response carries a tenant's real document. It must not also carry the credential
    // that fetched it, nor the resolved URL, which would leak the tenant's network shape into a
    // browser console.
    expect(responses).not.toMatch(/^\s*secret\??:/m)
    expect(responses).not.toMatch(/^\s*\w*[Cc]iphertext\??:/m)
    expect(responses).not.toMatch(/^\s*(envelope|plaintext|authHeader|password|token)\??:/m)
    expect(responses).not.toMatch(/^\s*(url|endpoint|requestUrl|resolvedUrl)\??:/m)
  })
})
