import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { buildErpKeyRequest } from '../../api/settings/apiKeys'
import { classifyApiKeyFailure, expiryBounds, lastUsedPhrase } from './apiPush'

const NOW = Date.parse('2026-10-07T12:00:00Z')

const error = (status: number, problemType: string | null) => new ApiError({ status, problemType })

describe('classifyApiKeyFailure', () => {
  it('branches on the problem type, never on prose', () => {
    expect(classifyApiKeyFailure(error(403, 'erp-entitlement-required'))).toBe('erpNotEnabled')
    expect(classifyApiKeyFailure(error(409, 'plan-limit-reached'))).toBe('noApiAccess')
    expect(classifyApiKeyFailure(error(403, 'insufficient-permission'))).toBe('forbidden')
    expect(classifyApiKeyFailure(error(403, 'csrf-rejected'))).toBe('other')
    expect(classifyApiKeyFailure(error(409, 'resource-conflict'))).toBe('conflict')
    expect(classifyApiKeyFailure(error(404, 'not-found'))).toBe('notFound')
    expect(classifyApiKeyFailure(error(400, 'validation-failed'))).toBe('invalid')
    expect(classifyApiKeyFailure(error(500, null))).toBe('other')
    expect(classifyApiKeyFailure(new NetworkError('offline'))).toBe('unreachable')
    expect(classifyApiKeyFailure(new Error('x'))).toBe('other')
  })
})

describe('lastUsedPhrase', () => {
  it('never claims more precision than a once-a-minute record has', () => {
    expect(lastUsedPhrase(null, NOW, 'en').key).toBe('erp.apiPush.lastUsed.never')
    expect(lastUsedPhrase('2026-10-07T11:59:30Z', NOW, 'en').key).toBe('erp.apiPush.lastUsed.recently')
    expect(lastUsedPhrase('2026-10-07T11:56:00Z', NOW, 'en').key).toBe('erp.apiPush.lastUsed.recently')
    expect(lastUsedPhrase('2026-10-07T11:30:00Z', NOW, 'en')).toEqual({
      key: 'erp.apiPush.lastUsed.about',
      when: '30 minutes ago',
    })
    expect(lastUsedPhrase('2026-10-05T12:00:00Z', NOW, 'en').when).toBe('2 days ago')
    expect(lastUsedPhrase('not a date', NOW, 'en').key).toBe('erp.apiPush.lastUsed.never')
  })
})

describe('expiry', () => {
  it('offers tomorrow to the 730th day, in UTC', () => {
    expect(expiryBounds(NOW)).toEqual({ min: '2026-10-08', max: '2028-10-06' })
  })

  it('sends the chosen day as its UTC start, and no expiry when none is chosen', () => {
    expect(buildErpKeyRequest({ label: '  Odoo  ', scopes: ['invoice.submit'], expiryDate: '' })).toEqual({
      label: 'Odoo',
      scopes: ['invoice.submit'],
      profile: 'ERP_INGESTION',
    })
    expect(
      buildErpKeyRequest({ label: 'Odoo', scopes: ['invoice.submit'], expiryDate: '2027-01-31' })
        .expiresAt,
    ).toBe('2027-01-31T00:00:00Z')
  })
})
