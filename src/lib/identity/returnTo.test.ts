import { describe, expect, it } from 'vitest'
import { returnPathFrom, safeReturnPath, withReturnPath } from './returnTo'

describe('the return target of a sign-in', () => {
  it('takes a path inside the app, with its query', () => {
    expect(safeReturnPath('/pos')).toBe('/pos')
    expect(safeReturnPath('/pos/today?tab=CARD')).toBe('/pos/today?tab=CARD')
    expect(returnPathFrom('?next=%2Fpos')).toBe('/pos')
  })

  it.each([
    'https://evil.example/pos',
    '//evil.example/pos',
    '/\\evil.example',
    'javascript:alert(1)',
    'pos',
    '/pos\n',
    '/login',
    '/login/mfa',
    '',
    null,
  ])('refuses %j', (raw) => {
    expect(safeReturnPath(raw)).toBeNull()
  })

  it('carries a safe target on to the next screen and drops an unsafe one', () => {
    expect(withReturnPath('/login', '/pos')).toBe('/login?next=%2Fpos')
    expect(withReturnPath('/login/mfa', '//evil.example')).toBe('/login/mfa')
    expect(withReturnPath('/login', null)).toBe('/login')
  })
})
