import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { issueRefusalOf } from './invoiceIssue'
import { PERIODIC_REFUSALS } from './periodicInvoice'

// NOT RUN (static only). Backend 8f04050ab (HS Slice B, IBR-078-OM): a line of a non-simplified
// document that states neither goods nor services is refused at issue before a number is taken, and
// on a schedule template when it is saved, since its runs issue unattended.

const refused = (status: number) =>
  new ApiError({
    status,
    problemType: 'validation-failed',
    code: 'GOODS_OR_SERVICE_REQUIRED',
    problem: { code: 'GOODS_OR_SERVICE_REQUIRED', line: 2, field: 'classification.goodsOrServiceCode' },
  })

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale)
}

describe('GOODS_OR_SERVICE_REQUIRED', () => {
  it('is worded on the issue screen, never as a generic failure', () => {
    expect(issueRefusalOf(refused(400))).toEqual({
      field: null,
      key: 'invoiceIssue.refused.goodsOrServiceRequired',
    })
  })

  it('is worded when a schedule template is saved', () => {
    expect(PERIODIC_REFUSALS.GOODS_OR_SERVICE_REQUIRED).toBe(
      'periodicInvoice.error.goodsOrServiceRequired',
    )
  })

  it('has English and Arabic wording for both screens', () => {
    for (const key of [
      'invoiceIssue.refused.goodsOrServiceRequired',
      'periodicInvoice.error.goodsOrServiceRequired',
    ]) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string')
      expect(lookup(ar, key)).not.toBe(lookup(en, key))
    }
  })
})
