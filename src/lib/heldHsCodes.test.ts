import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { heldHsRefusal, isHeldForHsCode, missingHsLines } from './heldHsCodes'
import type { InvoiceDispatchDto, InvoiceLineDto } from '../api/invoices/detail'

const coded = (code: string, problem: Record<string, unknown> = {}) =>
  new ApiError({ status: 422, problemType: null, code, problem: { code, ...problem } })

const DISPATCH = { state: 'DEAD_LETTERED', reasonCode: 'LINE_HS_CODE_MISSING' } as InvoiceDispatchDto

describe('which invoice and lines take a held HS code', () => {
  it('only the HS-code hold, and only when dead-lettered', () => {
    expect(isHeldForHsCode(DISPATCH)).toBe(true)
    expect(isHeldForHsCode({ ...DISPATCH, state: 'RETRY_SCHEDULED' })).toBe(false)
    expect(isHeldForHsCode({ ...DISPATCH, reasonCode: 'SELLER_ADDRESS_INCOMPLETE' })).toBe(false)
    expect(isHeldForHsCode(null)).toBe(false)
  })

  it('only goods lines with no code', () => {
    const line = (lineNumber: number, classification: InvoiceLineDto['classification']) =>
      ({ lineNumber, classification }) as InvoiceLineDto
    const lines = [
      line(1, { goodsOrService: 'G', hsCode: null }),
      line(2, { goodsOrService: 'G', hsCode: '090111000000' }),
      line(3, { goodsOrService: 'S', hsCode: null }),
      line(4, null),
    ]
    expect(missingHsLines({ lines }).map((each) => each.lineNumber)).toEqual([1])
  })
})

describe('the refusals of adding a held HS code', () => {
  it('names the line when the body gives a whole number, and otherwise says it without one', () => {
    expect(heldHsRefusal(coded('HS_CODE_INVALID', { line: 2 }))).toEqual({
      key: 'heldHs.refused.invalid.line',
      values: { line: '2' },
    })
    for (const line of [undefined, 'two', 1.5, 0]) {
      expect(heldHsRefusal(coded('HS_CODE_INVALID', { line }))).toEqual({
        key: 'heldHs.refused.invalid.any',
        values: {},
      })
    }
  })

  it.each([
    'STALE_INVOICE_VERSION',
    'INVOICE_NOT_HELD',
    'INVOICE_RECEIPT_ISSUED_AT_TILL',
    'INVOICE_DELIVERED_TO_BUYER',
    'HELD_INVOICE_ALREADY_SENT',
    'DELIVERY_STATE_UNAVAILABLE',
    'DISPATCH_IN_PROGRESS',
    'INVOICE_HELD_FOR_ANOTHER_REASON',
    'INVOICE_UNDER_LEGAL_HOLD',
    'HS_CODE_AMENDMENT_REASON_REQUIRED',
    'HS_CODE_AMENDMENT_EMPTY',
    'HS_CODE_AMENDMENT_LINE_UNKNOWN',
    'HS_CODE_AMENDMENT_NOT_GOODS',
    'HS_CODE_AMENDMENT_ALREADY_SET',
    'HS_CODE_AMENDMENT_LINE_REPEATED',
  ])('%s has a sentence in English and Arabic with nothing left unfilled', (code) => {
    const refusal = heldHsRefusal(coded(code))!
    expect(refusal).not.toBeNull()
    for (const lng of ['en', 'ar']) {
      expect(i18n.exists(refusal.key, { lng, fallbackLng: false })).toBe(true)
      expect(i18n.t(refusal.key, { ...refusal.values, lng })).not.toContain('{{')
    }
  })

  it('leaves a refusal it does not know to the general failure', () => {
    expect(heldHsRefusal(coded('SOMETHING_ELSE'))).toBeNull()
    expect(heldHsRefusal(new Error('x'))).toBeNull()
  })
})
