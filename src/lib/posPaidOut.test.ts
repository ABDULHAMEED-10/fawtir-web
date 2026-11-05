import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { ApiError, NetworkError } from '../api'
import {
  choosableClasses,
  dropsHeldReceipt,
  fixedClass,
  emptyPaidOutStore,
  keyForAttempt,
  loadPaidOutStore,
  outcomeUnknown,
  paidOutGap,
  paidOutRefusal,
  paidOutRequest,
  pendingBody,
  receiptProblem,
  savePaidOutStore,
} from './posPaidOut'
import { posRefusalKey } from './posRefusals'

// NOT RUN (static only). Backend cb9898ac3 (FIN-M3, V536): the paid-out's rules, key and wording.

const coded = (status: number, code: string, problem: Record<string, unknown> = {}) =>
  new ApiError({ status, problemType: null, code, problem: { code, ...problem } })

afterEach(async () => {
  await i18n.changeLanguage('en')
})

const FORM = {
  amount: 2.5,
  note: 'Milk for the staff room',
  category: 'PETTY_CASH_EXPENSE' as const,
  chosenClass: null,
  currency: 'OMR',
  billId: null,
  receiptObjectId: 'rcpt-1',
  missingReceiptReason: null,
}

describe('the class a category fixes (PosPaidOut.fixedClass and admits)', () => {
  it.each([
    ['PETTY_CASH_EXPENSE', false, 'EXPENSE'],
    ['CASH_TRANSFER', false, 'TRANSFER'],
    ['FLOAT_ADJUSTMENT', false, 'TRANSFER'],
    ['SUPPLIER_PAYMENT', true, 'BILL_SETTLEMENT'],
    ['SUPPLIER_PAYMENT', false, null],
    ['OTHER', false, null],
  ] as const)('%s (bill linked %s) is %s', (category, linked, fixed) => {
    expect(fixedClass(category, linked)).toBe(fixed)
  })

  it('offers no default and only what the server admits where the cashier must choose', () => {
    expect(choosableClasses('SUPPLIER_PAYMENT', false)).toEqual(['EXPENSE', 'ADVANCE'])
    expect(choosableClasses('OTHER', false)).toEqual(['EXPENSE', 'ADVANCE', 'TRANSFER'])
    expect(choosableClasses('PETTY_CASH_EXPENSE', false)).toEqual([])
    expect(choosableClasses('SUPPLIER_PAYMENT', true)).toEqual([])
  })
})

describe('what the form still lacks', () => {
  const ready = { ...FORM, hasReceipt: true }

  it('is nothing once every part is there', () => {
    expect(paidOutGap(ready)).toBeNull()
  })

  it('never assumes a currency', () => {
    expect(paidOutGap({ ...ready, currency: '' })).toBe('currency')
    expect(paidOutGap({ ...ready, currency: 'omr' })).toBe('currency')
  })

  it('asks a class where none is fixed, and refuses one the category does not admit', () => {
    const other = { ...ready, category: 'OTHER' as const }
    expect(paidOutGap(other)).toBe('class')
    expect(paidOutGap({ ...other, chosenClass: 'BILL_SETTLEMENT' as const })).toBe('class')
    expect(paidOutGap({ ...other, chosenClass: 'TRANSFER' as const })).toBeNull()
    const supplier = { ...ready, category: 'SUPPLIER_PAYMENT' as const }
    expect(paidOutGap({ ...supplier, chosenClass: 'TRANSFER' as const })).toBe('class')
    expect(paidOutGap({ ...supplier, billId: 'bill-1' })).toBeNull()
  })

  it('takes exactly one of a receipt and a reason', () => {
    expect(paidOutGap({ ...ready, hasReceipt: false })).toBe('receipt')
    expect(paidOutGap({ ...ready, hasReceipt: false, missingReceiptReason: '  ' })).toBe('receipt')
    expect(paidOutGap({ ...ready, hasReceipt: false, missingReceiptReason: 'Shop gave none' })).toBeNull()
    expect(paidOutGap({ ...ready, missingReceiptReason: 'Shop gave none' })).toBe('receipt')
  })

  it('asks the amount, the note and the category', () => {
    expect(paidOutGap({ ...ready, amount: 0 })).toBe('amount')
    expect(paidOutGap({ ...ready, note: ' ' })).toBe('note')
    expect(paidOutGap({ ...ready, category: null })).toBe('category')
  })
})

describe('the request', () => {
  it('sends the fixed class, the chosen currency and the receipt, and no refund reference', () => {
    const body = paidOutRequest(FORM)
    expect(body).toEqual({
      type: 'PAID_OUT',
      amount: 2.5,
      note: 'Milk for the staff room',
      category: 'PETTY_CASH_EXPENSE',
      accountingClass: 'EXPENSE',
      currency: 'OMR',
      billId: null,
      receiptObjectId: 'rcpt-1',
      missingReceiptReason: null,
    })
    for (const field of ['saleId', 'invoiceId', 'invoiceNumber', 'creditNoteId', 'refundId']) {
      expect(body).not.toHaveProperty(field)
    }
  })

  it('names a bill only on a supplier payment, classed as its settlement', () => {
    expect(paidOutRequest({ ...FORM, billId: 'bill-1' }).billId).toBeNull()
    const supplier = paidOutRequest({ ...FORM, category: 'SUPPLIER_PAYMENT', billId: 'bill-1' })
    expect(supplier.billId).toBe('bill-1')
    expect(supplier.accountingClass).toBe('BILL_SETTLEMENT')
  })

  it('sends a reason in place of the receipt', () => {
    const body = paidOutRequest({ ...FORM, missingReceiptReason: ' Shop gave none ' })
    expect(body.receiptObjectId).toBeNull()
    expect(body.missingReceiptReason).toBe('Shop gave none')
  })
})

describe('one key per attempt', () => {
  it('keeps the key for the same body and takes a new one when anything changes', () => {
    const body = paidOutRequest(FORM)
    const first = keyForAttempt(null, body)
    expect(first.key).toMatch(/^[A-Za-z0-9._:-]{16,128}$/)
    expect(keyForAttempt(first.attempt, paidOutRequest(FORM)).key).toBe(first.key)
    expect(keyForAttempt(first.attempt, paidOutRequest({ ...FORM, amount: 2.6 })).key).not.toBe(
      first.key,
    )
  })
})

describe('a receipt the server would refuse', () => {
  it.each([
    [{ type: 'image/jpeg', size: 1 }, null],
    [{ type: 'image/png', size: 10 * 1024 * 1024 }, null],
    [{ type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }, 'size'],
    [{ type: 'image/png', size: 0 }, 'size'],
    [{ type: 'image/gif', size: 100 }, 'type'],
  ] as const)('%o is %s', (file, problem) => {
    expect(receiptProblem(file)).toBe(problem)
  })
})

describe('a refusal that spends the held receipt (backend 9ce2bdcf4)', () => {
  it.each([
    ['POS_PAID_OUT_RECEIPT_NOT_FOUND', 422, true],
    ['POS_PAID_OUT_RECEIPT_OTHER_TILL', 422, true],
    ['POS_PAID_OUT_RECEIPT_ALREADY_USED', 409, true],
    ['POS_PAID_OUT_CURRENCY_INVALID', 400, false],
    ['POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED', 409, false],
  ] as const)('%s (%s) drops it: %s', (code, status, drops) => {
    expect(dropsHeldReceipt(coded(status, code))).toBe(drops)
  })

  it('a dropped connection keeps it, so the retry replays', () => {
    expect(dropsHeldReceipt(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('an outcome nobody knows (review W4-1)', () => {
  it('is a dropped connection, a timeout, or an uncoded server fault', () => {
    expect(outcomeUnknown(new NetworkError('offline'))).toBe(true)
    expect(outcomeUnknown(new NetworkError('timeout'))).toBe(true)
    expect(outcomeUnknown(new ApiError({ status: 504, problemType: null, problem: {} }))).toBe(true)
  })

  it('is never a coded refusal: that recorded nothing', () => {
    expect(outcomeUnknown(coded(409, 'POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED'))).toBe(false)
    expect(outcomeUnknown(coded(503, 'POS_SOMETHING'))).toBe(false)
    expect(outcomeUnknown(coded(422, 'POS_PAID_OUT_EXCEEDS_CASH'))).toBe(false)
  })
})

describe('the attempt kept in the tab (review W4-2)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('round-trips per till and shift, and is forgotten once the attempt closes', () => {
    const { attempt } = keyForAttempt(null, paidOutRequest(FORM))
    const store = { attempt, receipt: { file: 'r|3|1', receiptObjectId: 'rcpt-1' }, unknown: true }
    savePaidOutStore('till-1', 'sh-1', store)
    expect(loadPaidOutStore('till-1', 'sh-1')).toEqual(store)
    expect(loadPaidOutStore('till-1', 'sh-2')).toEqual(emptyPaidOutStore())
    expect(pendingBody(loadPaidOutStore('till-1', 'sh-1'))).toEqual(paidOutRequest(FORM))
    savePaidOutStore('till-1', 'sh-1', { ...store, attempt: null, unknown: false })
    expect(window.sessionStorage.getItem('fawtir.pos.paidOut.till-1.sh-1')).toBeNull()
  })

  it('reads damaged or refused storage as nothing held, and never throws', () => {
    window.sessionStorage.setItem('fawtir.pos.paidOut.till-1.sh-1', '{not json')
    expect(loadPaidOutStore('till-1', 'sh-1')).toEqual(emptyPaidOutStore())
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(loadPaidOutStore('till-1', 'sh-1')).toEqual(emptyPaidOutStore())
    const { attempt } = keyForAttempt(null, paidOutRequest(FORM))
    expect(() => savePaidOutStore('till-1', 'sh-1', { attempt, receipt: null, unknown: true })).not.toThrow()
  })

  it('holds no unknown outcome without its attempt', () => {
    window.sessionStorage.setItem(
      'fawtir.pos.paidOut.till-1.sh-1',
      JSON.stringify({ attempt: null, receipt: null, unknown: true }),
    )
    expect(loadPaidOutStore('till-1', 'sh-1').unknown).toBe(false)
  })
})

describe('the refusals', () => {
  it.each([
    'POS_PAID_OUT_FORBIDDEN',
    'POS_CASH_MOVEMENT_FORBIDDEN',
    'POS_PAID_OUT_DETAILS_REQUIRED',
    'POS_PAID_OUT_IDEMPOTENCY_KEY_REQUIRED',
    'POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED',
    'POS_PAID_OUT_CATEGORY_REQUIRED',
    'POS_PAID_OUT_CLASS_REQUIRED',
    'POS_PAID_OUT_CLASS_INVALID',
    'POS_PAID_OUT_CURRENCY_REQUIRED',
    'POS_PAID_OUT_RECEIPT_REQUIRED',
    'POS_PAID_OUT_RECEIPT_NOT_FOUND',
    'POS_PAID_OUT_BILL_FORBIDDEN',
    'POS_PAID_OUT_BILL_LINK_INVALID',
    'POS_PAID_OUT_REFUND_REFERENCE',
    'POS_CASH_MOVEMENT_FIELDS_INVALID',
    'POS_CASH_RECEIPT_INVALID',
    'POS_PAID_OUT_RECEIPT_OTHER_TILL',
    'POS_PAID_OUT_RECEIPT_ALREADY_USED',
    'POS_PAID_OUT_CURRENCY_INVALID',
  ])('%s has its own sentence in both languages', (code) => {
    const key = posRefusalKey(coded(400, code))
    expect(key).toBe(`pos.refusal.${code}`)
    expect(i18n.exists(key, { lng: 'en', fallbackLng: false })).toBe(true)
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
  })

  it('sends the refund to the refund page, never names the field values', () => {
    const error = coded(422, 'POS_PAID_OUT_REFUND_REFERENCE', { fields: ['saleId'] })
    const { key, values } = paidOutRefusal(error, 'en')
    expect(i18n.t(key, values)).toBe('A paid-out is never a refund. Refund the sale from the refund page.')
  })

  it('words a linked bill’s refusal as the bill screens do, with what is still owed', () => {
    const exceeds = coded(422, 'BILL_PAYMENT_EXCEEDS_OUTSTANDING', {
      outstandingAmount: 1.5,
      currency: 'OMR',
    })
    const { key, values } = paidOutRefusal(exceeds, 'en')
    expect(key).toBe('billDetail.pay.tooMuchMost')
    expect(values.amount).toBe('1.500 OMR')
    expect(paidOutRefusal(coded(422, 'BILL_PAYMENT_CURRENCY_MISMATCH'), 'en').key).toBe(
      'apiErrors.refused.paymentCurrencyMismatch',
    )
    expect(
      paidOutRefusal(coded(409, 'BILL_PAYMENT_IN_PAYMENT_RUN', { paymentRun: 'PR-7' }), 'en').values,
    ).toEqual({ run: 'PR-7' })
  })

  it('says the receipt is too big when the gateway refuses the body before the server answers', () => {
    const edge = new ApiError({ status: 413, problemType: null, problem: {} })
    expect(paidOutRefusal(edge, 'en').key).toBe('pos.close.paidOutForm.receiptTooBigForServer')
  })
})
