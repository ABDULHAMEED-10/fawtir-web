import { describe, expect, it, vi } from 'vitest'
import { erpSwitchedOff, type Entitlements } from './entitlements'
import { openAreas } from '../erp/integrationAreas'

const base: Entitlements = {
  userId: 'u-1',
  username: 'someone',
  tenantId: 't-1',
  roles: [],
  permissions: ['erp.connection.read', 'invoice.read', 'invoice.submit', 'admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}

describe('erpSwitchedOff', () => {
  it('is true only when the server says the company has ERP off', () => {
    expect(erpSwitchedOff({ ...base, erpEntitled: false })).toBe(true)
    expect(erpSwitchedOff({ ...base, erpEntitled: true })).toBe(false)
  })

  it('reads a missing field (a server before backend #713) as not off, and an unread snapshot as not off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(erpSwitchedOff(base)).toBe(false)
    expect(erpSwitchedOff(null)).toBe(false)
    warn.mockRestore()
  })
})

describe('openAreas with the company switch', () => {
  it('offers no ERP area while ERP is off, whatever the permissions', () => {
    expect(openAreas({ ...base, erpEntitled: false })).toEqual([])
  })

  it('offers the permitted areas while ERP is on, and only those', () => {
    const ids = openAreas({ ...base, permissions: ['invoice.submit'], erpEntitled: true }).map(
      (area) => area.id,
    )
    expect(ids).toEqual(['bridge', 'access'])
  })
})
