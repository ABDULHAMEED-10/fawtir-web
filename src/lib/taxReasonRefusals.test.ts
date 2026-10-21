import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { describeApiFailure } from './apiFailure'
import { issueRefusalOf } from './invoiceIssue'
import { TAX_REASON_REFUSALS } from './taxReasonRefusals'

const refused = (code: string, status = 400) =>
  new ApiError({ status, problemType: 'validation-failed', code })

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale)
}

describe('no-VAT reason refusals', () => {
  it('has English and Arabic wording for every code', () => {
    for (const key of new Set(Object.values(TAX_REASON_REFUSALS))) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string')
      expect(lookup(ar, key)).not.toBe(lookup(en, key))
    }
  })

  it('words a zero-rated line refused for its missing reason on save, never as a generic failure', () => {
    expect(describeApiFailure(refused('EXEMPTION_REASON_CODE_REQUIRED')).key).toBe(
      'taxReasonRefusal.reasonRequired',
    )
    expect(describeApiFailure(refused('BULK_EXEMPTION_REASON_CODE_REQUIRED')).key).toBe(
      'taxReasonRefusal.bulkReasonRequired',
    )
    expect(describeApiFailure(refused('EXEMPTION_REASON_REQUIRED')).key).toBe(
      'taxReasonRefusal.reasonRequired',
    )
    expect(describeApiFailure(refused('EXEMPTION_REASON_CODE_INVALID')).key).toBe(
      'taxReasonRefusal.reasonInvalid',
    )
  })

  it('words the same refusal at issue', () => {
    expect(issueRefusalOf(refused('EXEMPTION_REASON_CODE_REQUIRED', 409))).toEqual({
      field: null,
      key: 'taxReasonRefusal.reasonRequired',
    })
    expect(issueRefusalOf(refused('LINE_TAX_REASON_CODE_MISSING', 422))?.key).toBe(
      'taxReasonRefusal.reasonRequired',
    )
  })
})
