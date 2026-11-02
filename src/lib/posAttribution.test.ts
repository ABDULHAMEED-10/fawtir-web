import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { saleCashierLabel } from './posAttribution'
import { maskedPayload } from './posOfflineHolds'

// NOT RUN (batch 39, static only).

const t = ((key: string, values?: Record<string, unknown>) =>
  values?.name !== undefined ? `${key}:${String(values.name)}` : key) as unknown as TFunction

const AISHA = { userId: 'u-1', name: 'Aisha' }
const OMAR = { userId: 'u-2', name: 'Omar' }

describe('who a till sale is shown as made by (WEB-7)', () => {
  it('names the cashier of an online or verified sale, and of a sale from an older server', () => {
    expect(saleCashierLabel({ cashier: AISHA, attribution: 'ONLINE' }, t)).toBe('Aisha')
    expect(saleCashierLabel({ cashier: AISHA, attribution: 'VERIFIED' }, t)).toBe('Aisha')
    expect(saleCashierLabel({ cashier: AISHA }, t)).toBe('Aisha')
  })

  it('never names anyone for a sale under review', () => {
    expect(saleCashierLabel({ cashier: null, filedBy: OMAR, attribution: 'PENDING_REVIEW' }, t)).toBe(
      'pos.offline.pending',
    )
    expect(saleCashierLabel({ cashier: null }, t)).toBe('pos.offline.pending')
  })

  it('shows a LEGACY sale as recorded by its sender, unverified', () => {
    expect(saleCashierLabel({ cashier: AISHA, filedBy: OMAR, attribution: 'LEGACY' }, t)).toBe(
      'pos.offline.legacy:Omar',
    )
  })
})

describe('the held payload a reviewer reads (WEB-8, C3)', () => {
  it('keeps only the last four characters of the buyer identifier and contact', () => {
    const shown = maskedPayload({
      sale: {
        customer: {
          consumer: { name: 'Salim', identifierValue: '98765432', contact: '+968 9123 4567' },
        },
      },
    }) as { sale: { customer: { consumer: Record<string, string> } } }
    expect(shown.sale.customer.consumer).toEqual({
      name: 'Salim',
      identifierValue: '••••5432',
      contact: '••••4567',
    })
  })
})

describe('wording for every new code (WEB-10)', () => {
  const codes = {
    refusal: [
      'POS_OFFLINE_KEY_ALREADY_REVOKED',
      'POS_OFFLINE_KEY_NOT_FOUND',
      'POS_OFFLINE_KEY_HUMAN_ONLY',
      'POS_ATTRIBUTION_HUMAN_ONLY',
      'POS_ATTRIBUTION_SELF',
      'POS_ATTRIBUTION_NOT_A_CANDIDATE',
      'POS_ATTRIBUTION_ALREADY_RESOLVED',
      'POS_ATTRIBUTION_HOLD_NOT_FOUND',
      'POS_ATTRIBUTION_REVIEWER_ONLY',
      'POS_LEGACY_RANGE_INVALID',
    ],
    warning: ['POS_OFFLINE_ATTRIBUTION_HELD', 'POS_PRINTED_TOTALS_DIFFER'],
  }
  for (const [name, locale] of [
    ['en', en],
    ['ar', ar],
  ] as const) {
    it(`${name} words them all`, () => {
      const pos = (locale as unknown as { pos: Record<string, Record<string, unknown>> }).pos
      for (const code of codes.refusal) expect(typeof pos.refusal[code]).toBe('string')
      for (const code of codes.warning) expect(typeof pos.warning[code]).toBe('string')
      expect(typeof (pos.offline as Record<string, unknown>).pending).toBe('string')
      expect(typeof (pos.offline as Record<string, unknown>).clockSkew).toBe('string')
    })
  }
})
