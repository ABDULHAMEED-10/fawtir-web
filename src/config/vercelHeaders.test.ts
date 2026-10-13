import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

interface VercelConfig {
  rewrites: { source: string; destination: string }[]
  headers: HeaderRule[]
}

const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as VercelConfig

const SPA_SOURCE = '/((?!api(?:/|$)).*)'

function spaRule() {
  const rule = config.headers.find(
    (candidate) => candidate.source === SPA_SOURCE && header(candidate, 'X-Frame-Options'),
  )
  if (!rule) throw new Error(`vercel.json has no header rule for ${SPA_SOURCE}`)
  return rule
}

function header(rule: HeaderRule, key: string) {
  return rule.headers.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())?.value
}

function directives(policy: string) {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/)
        return [name, values] as const
      }),
  )
}

/**
 * Mirrors how Vercel compiles a header `source` (path-to-regexp 6: a custom group is emitted
 * verbatim, anchored, case-insensitive, optional trailing delimiter). The same pattern was checked
 * against path-to-regexp 6.1.0 itself when this rule was written; this keeps the exclusion from
 * silently widening or narrowing if someone edits the pattern later.
 */
function matches(source: string, path: string) {
  const body = source.replace(/^\/\((.*)\)$/, '$1')
  return new RegExp(`^(?:\\/(${body}))[\\/#\\?]?$`, 'i').test(path)
}

describe('vercel.json security headers (D6)', () => {
  it('keeps the same-origin API rewrite and the SPA fallback', () => {
    expect(config.rewrites).toContainEqual({
      source: '/api/:path*',
      destination: 'https://api.fawtir.om/api/:path*',
    })
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
  })

  // The backend already hardens /api, and some of its headers arrive twice through the rewrite.
  // Adding ours there would make every one of them a duplicate.
  it('applies to the app and its assets but never to the proxied API', () => {
    for (const path of [
      '/',
      '/login',
      '/index.html',
      '/assets/index-abc.js',
      '/settings/api-keys',
      '/apidocs',
    ]) {
      expect(matches(SPA_SOURCE, path), path).toBe(true)
    }
    for (const path of ['/api', '/api/', '/api/v1/customers', '/API/v1/customers']) {
      expect(matches(SPA_SOURCE, path), path).toBe(false)
    }
  })

  it('forbids framing by every browser generation', () => {
    const rule = spaRule()
    expect(header(rule, 'X-Frame-Options')).toBe('DENY')
    expect(
      directives(header(rule, 'Content-Security-Policy') ?? '').get('frame-ancestors'),
    ).toEqual(["'none'"])
  })

  it('sends nosniff, a referrer policy and a permissions policy', () => {
    const rule = spaRule()
    expect(header(rule, 'X-Content-Type-Options')).toBe('nosniff')
    expect(header(rule, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    // No screen calls getUserMedia: receipts and bills are picked as files, so the camera is denied.
    expect(header(rule, 'Permissions-Policy')).toContain('camera=()')
  })

  it('reports, without enforcing, the full content policy derived from the build', () => {
    const policy = directives(header(spaRule(), 'Content-Security-Policy-Report-Only') ?? '')
    expect(policy.get('default-src')).toEqual(["'self'"])
    expect(policy.get('script-src')).toEqual(["'self'"])
    expect(policy.get('connect-src')).toEqual(["'self'"])
    expect(policy.get('style-src')).toEqual(["'self'", 'https://fonts.googleapis.com'])
    expect(policy.get('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com'])
    expect(policy.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
    expect(policy.get('frame-src')).toEqual(["'self'", 'blob:'])
    expect(policy.get('object-src')).toEqual(["'none'"])
    // Browsers ignore frame-ancestors in a report-only policy and warn about it.
    expect(policy.has('frame-ancestors')).toBe(false)
  })

  // Vercel replaces the upstream Cache-Control with any matching rule's value, so a catch-all rule
  // turned the backend's `no-store` on authenticated JSON into `public` (D8). Only the app's own
  // files may carry a Vercel cache policy; /api must keep whatever the backend sends.
  it('never sets a cache policy on the proxied API', () => {
    for (const rule of config.headers) {
      if (!header(rule, 'Cache-Control')) continue
      for (const path of ['/api', '/api/v1/customers', '/API/v1/authored-invoices']) {
        expect(matches(rule.source, path), `${rule.source} ${path}`).toBe(false)
      }
    }
    const appCache = config.headers.find((rule) => rule.source === SPA_SOURCE && header(rule, 'Cache-Control'))
    expect(header(appCache!, 'Cache-Control')).toBe('public, max-age=0, must-revalidate')
  })

  it('does not set a wildcard CORS header on the app', () => {
    for (const rule of config.headers) {
      expect(header(rule, 'Access-Control-Allow-Origin'), rule.source).toBeUndefined()
    }
  })
})
