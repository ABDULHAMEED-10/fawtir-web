import { describe, expect, it } from 'vitest'
import { formatAmount, formatCount, formatDate, formatInstant, formatInstantDay, initialsOf, minorUnitsOf } from './format'
import { describeApiFailure, isNotFound, isPermissionDenied } from './apiFailure'
import { ApiError, NetworkError } from '../api'

describe('formatAmount', () => {
  it('writes OMR to three decimals, as the ledger keeps it', () => {
    expect(formatAmount(2759.1)).toBe('2,759.100')
    expect(formatAmount(0)).toBe('0.000')
    expect(formatAmount('11247.88', 'OMR')).toBe('11,247.880')
  })

  it('uses the currency’s own minor units', () => {
    expect(minorUnitsOf('omr')).toBe(3)
    expect(formatAmount(10, 'USD')).toBe('10.00')
  })

  it('keeps Latin digits in Arabic (decision D15)', () => {
    expect(formatAmount(1234.5, 'OMR', 'ar')).toMatch(/1.234.500/)
    expect(formatAmount(1234.5, 'OMR', 'ar')).not.toMatch(/[٠-٩]/)
    expect(formatCount(68, 'ar')).toBe('68')
  })

  it('hands back what it cannot read instead of NaN', () => {
    expect(formatAmount('n/a')).toBe('n/a')
  })
})

describe('dates', () => {
  it('reads a business date as a calendar day in any time zone', () => {
    expect(formatDate('2026-07-18')).toBe('18 Jul 2026')
    expect(formatDate('2026-07-18', 'ar')).not.toMatch(/[٠-٩]/)
    expect(formatDate('not a date')).toBe('not a date')
  })

  it('shows an instant in Muscat time, where the ledger decides the day', () => {
    // 21:30 UTC on the 14th is already the 15th in Muscat (UTC+4).
    expect(formatInstantDay('2026-09-14T21:30:00Z')).toBe('15 Sept 2026')
    expect(formatInstant('2026-09-14T21:30:00Z')).toContain('01:30')
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Muscat Roastery Co')).toBe('MR')
    expect(initialsOf('  gulf  ')).toBe('G')
  })
})

describe('describeApiFailure', () => {
  const error = (status: number, problemType: string | null, correlationId: string | null = null) =>
    new ApiError({ status, problemType, correlationId })

  it('tells a permission refusal from a CSRF one', () => {
    expect(describeApiFailure(error(403, 'insufficient-permission')).key).toBe('apiErrors.forbidden')
    expect(describeApiFailure(error(403, 'csrf-rejected')).key).toBe('apiErrors.csrf')
    expect(isPermissionDenied(error(403, 'insufficient-permission'))).toBe(true)
    expect(isPermissionDenied(error(403, 'csrf-rejected'))).toBe(false)
  })

  it('names not-found and conflicts, and carries the reference', () => {
    expect(describeApiFailure(error(404, 'resource-not-found', 'c-7'))).toEqual({
      key: 'apiErrors.notFound',
      reference: 'c-7',
    })
    expect(isNotFound(error(404, null))).toBe(true)
    expect(describeApiFailure(error(409, 'resource-conflict')).key).toBe('apiErrors.conflict')
  })

  it('falls back to the shared identity messages', () => {
    expect(describeApiFailure(error(500, 'internal-error', 'c-8'))).toEqual({
      key: 'identityErrors.service',
      reference: 'c-8',
    })
    expect(describeApiFailure(new NetworkError('timeout')).key).toBe('identityErrors.timeout')
  })
})
