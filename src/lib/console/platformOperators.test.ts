import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  describeRoleChangeFailure,
  displayName,
  isAdminLocked,
  isLastTenantAdmin,
  isPlatformRole,
  operatorsPath,
  rolesAfter,
  withPlatformRoles,
  type PlatformUser,
} from './platformOperators'

const user = (id: string, roles: string[], extra: Partial<PlatformUser> = {}): PlatformUser => ({
  id,
  username: `${id}.name`,
  email: `${id}@example.test`,
  firstName: null,
  lastName: null,
  enabled: true,
  roles,
  createdAt: '2026-09-01T08:00:00Z',
  mfaEnabled: false,
  locked: false,
  lockedUntil: null,
  ...extra,
})

describe('platform roles', () => {
  it('knows only the two catalogue codes', () => {
    expect(isPlatformRole('PLATFORM_TENANT_ADMIN')).toBe(true)
    expect(isPlatformRole('PLATFORM_SUPPORT')).toBe(true)
    expect(isPlatformRole('PLATFORM_PARTICIPANT_OWNERSHIP')).toBe(true)
    // Present in the platform tenant but outside the grant endpoint's catalogue.
    expect(isPlatformRole('PLATFORM_OPERATOR')).toBe(false)
    expect(isPlatformRole('PEPPOL_TEST_OPERATOR')).toBe(false)
  })

  it('replaces the platform roles with the answer and keeps every other role', () => {
    const before = user('a', ['ADMIN', 'PLATFORM_SUPPORT'])
    expect(withPlatformRoles(before, ['PLATFORM_TENANT_ADMIN']).roles).toEqual(['ADMIN', 'PLATFORM_TENANT_ADMIN'])
    expect(withPlatformRoles(before, []).roles).toEqual(['ADMIN'])
  })

  it('applies an accepted change on top of the answer, which can miss a first-time grant', () => {
    expect(rolesAfter({ role: 'PLATFORM_TENANT_ADMIN', action: 'grant' }, ['PLATFORM_SUPPORT'])).toEqual([
      'PLATFORM_SUPPORT',
      'PLATFORM_TENANT_ADMIN',
    ])
    expect(rolesAfter({ role: 'PLATFORM_TENANT_ADMIN', action: 'grant' }, ['PLATFORM_TENANT_ADMIN'])).toEqual([
      'PLATFORM_TENANT_ADMIN',
    ])
    expect(rolesAfter({ role: 'PLATFORM_SUPPORT', action: 'revoke' }, ['PLATFORM_SUPPORT', 'PLATFORM_TENANT_ADMIN'])).toEqual([
      'PLATFORM_TENANT_ADMIN',
    ])
  })

  it('ignores anything in the answer that is not a platform role', () => {
    expect(withPlatformRoles(user('a', []), ['PLATFORM_SUPPORT', 'SOMETHING_ELSE']).roles).toEqual(['PLATFORM_SUPPORT'])
  })
})

describe('isLastTenantAdmin', () => {
  const admin = user('a', ['PLATFORM_TENANT_ADMIN'])
  const support = user('b', ['PLATFORM_SUPPORT'])

  it('is true only for the sole holder, when the whole team is known', () => {
    expect(isLastTenantAdmin(admin, [admin, support], true)).toBe(true)
    expect(isLastTenantAdmin(admin, [admin, user('c', ['PLATFORM_TENANT_ADMIN'])], true)).toBe(false)
    expect(isLastTenantAdmin(support, [admin, support], true)).toBe(false)
  })

  it('does not guess when part of the team is on another page', () => {
    expect(isLastTenantAdmin(admin, [admin, support], false)).toBe(false)
  })

  it('counts holders as the backend does: not one an administrator locked, but one locked out for a while', () => {
    const lockedByAdmin = user('c', ['PLATFORM_TENANT_ADMIN'], { locked: true, lockedUntil: null })
    const lockedOut = user('d', ['PLATFORM_TENANT_ADMIN'], { locked: true, lockedUntil: '2026-09-14T10:15:00Z' })
    expect(isLastTenantAdmin(admin, [admin, lockedByAdmin], true)).toBe(true)
    expect(isLastTenantAdmin(admin, [admin, lockedOut], true)).toBe(false)
  })
})

describe('isAdminLocked', () => {
  it('is an active lock with no end: only an unlock lifts it', () => {
    expect(isAdminLocked({ locked: true, lockedUntil: null })).toBe(true)
    expect(isAdminLocked({ locked: true, lockedUntil: '2026-09-14T10:15:00Z' })).toBe(false)
    expect(isAdminLocked({ locked: false, lockedUntil: null })).toBe(false)
  })
})

describe('describeRoleChangeFailure', () => {
  it.each([
    [new ApiError({ status: 403, problemType: 'insufficient-permission' }), 'console.operators.error.refused'],
    [new ApiError({ status: 403, problemType: 'own-account-refused' }), 'console.operators.selfGive'],
    [new ApiError({ status: 403, problemType: 'last-administrator' }), 'console.operators.lastAdmin'],
    [new ApiError({ status: 403, problemType: null }), 'console.operators.error.refused'],
    [new ApiError({ status: 404, problemType: 'resource-not-found' }), 'console.operators.error.roleTargetGone'],
    [new ApiError({ status: 403, problemType: 'production-platform-realm-required' }), 'console.operators.error.realm'],
    [new ApiError({ status: 500, problemType: 'internal-error' }), 'identityErrors.service'],
    [new NetworkError('timeout'), 'identityErrors.timeout'],
  ])('maps %o', (error, key) => {
    expect(describeRoleChangeFailure(error).key).toBe(key)
  })
})

it('names a person by their name, or their username when they have none', () => {
  expect(displayName(user('a', [], { firstName: 'Noor', lastName: 'Al Said' }))).toBe('Noor Al Said')
  expect(displayName(user('a', [], { firstName: 'Noor' }))).toBe('Noor')
  expect(displayName(user('a', []))).toBe('a.name')
})

it('reads the team a page at a time, in a stable order', () => {
  expect(operatorsPath(0)).toBe('/v1/users?page=0&size=50&sort=createdAt,asc')
})
