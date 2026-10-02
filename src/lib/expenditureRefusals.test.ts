import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError, NetworkError } from '../api'
import { describeApiFailure } from './apiFailure'
import { MAPPED_REFUSAL_CODES, REFUSAL_FALLBACK_KEY, refusalMessageKey } from './expenditureRefusals'
import { refusalOf } from './paymentRuns'

const refusal = (code: string | null) =>
  new ApiError({
    status: 400,
    problemType: 'expenditure-refused',
    code,
    correlationId: 'trace-1',
  })

describe('an Expenditure refusal is a decision, not a fault', () => {
  it('gives the named rule its own sentence', () => {
    expect(refusalMessageKey(refusal('CREDIT_NOTE_SUPPLIER_MISMATCH'))).toBe(
      'apiErrors.refused.creditNoteSupplierMismatch',
    )
  })

  it('never tells the reader to try again, because no refusal succeeds on a retry', async () => {
    await i18n.changeLanguage('en')
    for (const code of [...MAPPED_REFUSAL_CODES, 'SOME_CODE_THIS_BUILD_HAS_NEVER_SEEN']) {
      const message = describeApiFailure(refusal(code))
      const text = i18n.t(message.key)
      expect(text, code).not.toMatch(/try again/i)
      expect(text, code).not.toBe(message.key) // the key itself would mean a missing translation
    }
  })

  it('falls back rather than rendering a raw code for a rule this build has not mapped', () => {
    expect(refusalMessageKey(refusal('GOODS_RECEIPT_NUMBER_SEQUENCE_INVALID'))).toBe(REFUSAL_FALLBACK_KEY)
    expect(refusalMessageKey(refusal(null))).toBe(REFUSAL_FALLBACK_KEY)
  })

  it('carries the reference, which is the only thing support can act on', () => {
    expect(describeApiFailure(refusal('CREDIT_NOTE_SUPPLIER_MISMATCH')).reference).toBe('trace-1')
  })

  it('leaves every other failure to the existing branches', () => {
    expect(refusalMessageKey(new ApiError({ status: 400, problemType: 'validation-failed' }))).toBeNull()
    expect(refusalMessageKey(new ApiError({ status: 403, problemType: 'access-denied' }))).toBeNull()
    expect(refusalMessageKey(new NetworkError('offline'))).toBeNull()
    expect(refusalMessageKey(new Error('boom'))).toBeNull()

    // A refusal must not be swallowed by the status branches that come after it.
    expect(describeApiFailure(new ApiError({ status: 404, problemType: 'not-found' })).key).toBe('apiErrors.notFound')
  })

  it('says the same thing in Arabic, so a refusal is not an English-only screen', async () => {
    await i18n.changeLanguage('ar')
    for (const code of MAPPED_REFUSAL_CODES) {
      const message = describeApiFailure(refusal(code))
      expect(i18n.t(message.key), code).not.toBe(message.key)
    }
    await i18n.changeLanguage('en')
  })

  // Draft wording, pending the owner (Wording-For-Abdul.md row 17).
  it('says a run holds a held bill, on any screen that does not name the code itself', async () => {
    const held = refusal('PAYMENT_RUN_BILL_ON_HOLD')
    expect(MAPPED_REFUSAL_CODES).toContain('PAYMENT_RUN_BILL_ON_HOLD')
    expect(i18n.t(describeApiFailure(held).key)).toBe(
      'A bill in this run is on hold. Release it or take it out of the run first.',
    )
    await i18n.changeLanguage('ar')
    expect(i18n.t(describeApiFailure(held).key)).toBe(
      'في هذه الدفعة فاتورة قيد الانتظار. أفرج عنها أو أخرجها من الدفعة أولًا.',
    )
    await i18n.changeLanguage('en')
    // The payment run screens are outside this round and keep the sentence they already had.
    expect(refusalOf(held, i18n.t)).toBe('That bill is on hold. Release it before paying.')
  })
})
