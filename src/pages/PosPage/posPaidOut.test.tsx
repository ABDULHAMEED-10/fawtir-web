import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { PosClosePage } from './PosClosePage'

// NOT RUN (static only). Backend cb9898ac3 (FIN-M3, V536): the till paid-out's purpose, currency,
// receipt, key and bill link, and the split of access. The harness is posCloseLateCash.test.tsx's.

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-11-05T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}
const PREVIEW = {
  shiftId: 'sh-1',
  tillId: 'till-1',
  tillNumber: 1,
  branchId: 'b-1',
  cashier: { userId: 'u-1', name: 'Maryam' },
  status: 'OPEN',
  businessDate: '2026-11-05',
  openedAt: '2026-11-05T03:00:00Z',
  endedAt: null,
  openingFloat: 30,
  openingFloatSource: 'DEFAULT',
  salesCount: 1,
  salesAmount: 5.649,
  byMethod: [{ method: 'CASH', sales: 1, taken: 5.649, refunded: 0, tips: 0 }],
  companyInvoices: 0,
  vatWithin: 0.269,
  discounts: 0,
  tips: 0,
  paidOut: 0,
  paidIn: 0,
  cashRefunded: 0,
  expectedCash: 35.649,
  looseEnds: {
    onAccountOpen: { count: 0, amount: 0 },
    notYetAccepted: 0,
    cardSalesForTerminalCheck: { count: 0, amount: 0 },
  },
  movements: [],
  at: '2026-11-05T14:00:00Z',
}
const PAID_OUT = {
  movementId: 'm-1',
  shiftId: 'sh-1',
  tillId: 'till-1',
  type: 'PAID_OUT',
  amount: 2.5,
  currency: 'OMR',
  note: 'Milk',
  category: 'PETTY_CASH_EXPENSE',
  accountingClass: 'EXPENSE',
  billId: null,
  billPaymentId: null,
  receiptObjectId: 'rcpt-1',
  missingReceiptReason: null,
  reviewFlags: [],
  recordedBy: 'u-1',
  recordedAt: '2026-11-05T14:00:00Z',
  replayed: false,
}
const BILL = {
  id: 'bill-1',
  supplierName: 'Nizwa Dairy',
  supplierBillNumber: 'ND-77',
  currencyCode: 'OMR',
  outstandingAmount: 12,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json({ type: 'https://fawtir.om/problems/pos-refused', status, code, ...extra }, status)

let permissions: string[]
let uploads: number
let previews: number
let paidOuts: { key: string | null; body: Record<string, unknown> }[]
let answer: () => Response | Promise<Response>
let previewAnswer: () => Response
let billSearches: string[]
let bills: Record<string, unknown>[]

/** Where the paid-out in flight is kept for this till and shift (review W4-2). */
const HELD = 'fawtir.pos.paidOut.till-1.sh-1'

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  window.sessionStorage.clear()
  bills = [BILL]
  permissions = ['pos.read', 'pos.sell', 'pos.close', 'pos.cash.pay_out']
  uploads = 0
  previews = 0
  paidOuts = []
  billSearches = []
  answer = () => json(PAID_OUT, 201)
  previewAnswer = () => json(PREVIEW)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') {
        const me: Entitlements = {
          userId: 'u-1',
          username: 'maryam',
          tenantId: 't-1',
          roles: [],
          permissions,
          scopes: [],
          featureFlags: {},
        }
        return json(me)
      }
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.endsWith('/cash-movements/receipts') && init?.method === 'POST') {
        uploads += 1
        return json(
          {
            // A fresh id per upload, as the server gives, so a re-upload is visible in the body.
            receiptObjectId: `rcpt-${uploads}`,
            contentType: 'image/jpeg',
            byteSize: 3,
            sha256: 'x',
            uploadedAt: '2026-11-05T14:00:00Z',
          },
          201,
        )
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.includes('/close-preview')) {
        previews += 1
        return previewAnswer()
      }
      if (url.endsWith('/cash-movements') && init?.method === 'POST') {
        const headers = (init.headers ?? {}) as Record<string, string>
        paidOuts.push({ key: headers['Idempotency-Key'] ?? null, body: JSON.parse(String(init.body)) })
        return answer()
      }
      if (url.startsWith('/api/v1/bills')) {
        billSearches.push(url)
        return json({ items: bills, page: 0, pageSize: 5, count: bills.length, total: bills.length })
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const unlockButton = () =>
  screen.getByRole('button', { name: form('pending.notRecorded') }) as HTMLButtonElement

/** Moves the clock past the 90 s wait and re-reads the cash moves (reviews W5-2, W6-1). */
async function afterTheWait() {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now + 91_000)
  fireEvent.click(screen.getByRole('button', { name: form('pending.check') }))
  await waitFor(() => expect(unlockButton().disabled).toBe(false))
}

const renderClose = () =>
  render(
    <MemoryRouter initialEntries={['/pos/close']}>
      <Routes>
        <Route path="/pos/close" element={<PosClosePage />} />
      </Routes>
    </MemoryRouter>,
  )

const form = (name: string) => i18n.t(`pos.close.paidOutForm.${name}`)
const recordButton = () => screen.getByRole('button', { name: i18n.t('pos.close.record') })

/** A petty cash paid-out with every part but the receipt, which each test supplies. */
async function fillPettyCash() {
  renderClose()
  const amount = await screen.findByRole('textbox', { name: i18n.t('pos.pay.amount') })
  fireEvent.change(amount, { target: { value: '2.5' } })
  fireEvent.change(screen.getByRole('textbox', { name: i18n.t('pos.close.whatFor') }), {
    target: { value: 'Milk' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: form('category') }), {
    target: { value: 'PETTY_CASH_EXPENSE' },
  })
}

function chooseCurrency(code: string) {
  fireEvent.change(screen.getByRole('combobox', { name: form('currency') }), {
    target: { value: code },
  })
}

function attachReceipt() {
  const file = new File(['abc'], 'receipt.jpg', { type: 'image/jpeg', lastModified: 1 })
  fireEvent.change(screen.getByLabelText(form('receipt')), { target: { files: [file] } })
}

describe('who may record which cash movement', () => {
  it('offers paid-out only with pos.cash.pay_out', async () => {
    permissions = ['pos.read', 'pos.sell', 'pos.close']
    renderClose()
    expect(await screen.findByRole('button', { name: i18n.t('pos.close.move.PAID_IN') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.close.move.PAID_OUT') })).toBeNull()
  })

  it('offers paid-in only with pos.close', async () => {
    permissions = ['pos.read', 'pos.sell', 'pos.cash.pay_out']
    renderClose()
    expect(await screen.findByRole('button', { name: i18n.t('pos.close.move.PAID_OUT') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.close.move.PAID_IN') })).toBeNull()
  })
})

describe('a paid-out', () => {
  it('assumes no currency: Record it waits until one is chosen', async () => {
    await fillPettyCash()
    attachReceipt()
    expect((screen.getByRole('combobox', { name: form('currency') }) as HTMLSelectElement).value).toBe('')
    expect((recordButton() as HTMLButtonElement).disabled).toBe(true)
    chooseCurrency('USD')
    expect((recordButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('uploads the receipt, then sends it with the class, the currency and a key', async () => {
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    expect(uploads).toBe(1)
    expect(paidOuts[0].key).toMatch(/^[A-Za-z0-9._:-]{16,128}$/)
    expect(paidOuts[0].body).toEqual({
      type: 'PAID_OUT',
      amount: 2.5,
      note: 'Milk',
      category: 'PETTY_CASH_EXPENSE',
      accountingClass: 'EXPENSE',
      currency: 'OMR',
      billId: null,
      receiptObjectId: 'rcpt-1',
      missingReceiptReason: null,
    })
    await waitFor(() => expect(previews).toBe(2))
  })

  it('sends a reason in place of a receipt, and uploads nothing', async () => {
    await fillPettyCash()
    chooseCurrency('OMR')
    fireEvent.click(screen.getByRole('checkbox', { name: form('noReceipt') }))
    fireEvent.change(screen.getByRole('textbox', { name: form('noReceiptReason') }), {
      target: { value: 'The shop gave none' },
    })
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    expect(uploads).toBe(0)
    expect(paidOuts[0].body.receiptObjectId).toBeNull()
    expect(paidOuts[0].body.missingReceiptReason).toBe('The shop gave none')
  })

  it('locks the details after a dropped connection; Record it again sends the same key and body', async () => {
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(await screen.findByText(form('pending.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.refusal.offline'))).toBeTruthy()
    expect(screen.getByText(form('pending.hint'))).toBeTruthy()
    // Review W4-1: no field can be changed while the outcome is unknown.
    expect(screen.queryByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeNull()
    expect(screen.queryByRole('combobox', { name: form('currency') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('pos.close.record') })).toBeNull()
    // Review W4-2: the attempt is in the tab's storage, keyed by till and shift.
    expect(window.sessionStorage.getItem(HELD)).toContain(paidOuts[0].key as string)
    answer = () => json({ ...PAID_OUT, replayed: true }, 200)
    fireEvent.click(screen.getByRole('button', { name: form('pending.again') }))
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(paidOuts[1].key).toBe(paidOuts[0].key)
    expect(paidOuts[1].body).toEqual(paidOuts[0].body)
    expect(uploads).toBe(1)
    // The replay is the paid-out already recorded: success, the drawer figures reloaded.
    await waitFor(() => expect(previews).toBe(2))
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
  })

  it('unlocks only after re-reading the cash moves and the cashier saying it is not there', async () => {
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    await screen.findByText(form('pending.title'))
    expect(screen.queryByRole('button', { name: form('pending.notRecorded') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: form('pending.check') }))
    expect(await screen.findByText(form('pending.movesNone'))).toBeTruthy()
    expect(previews).toBe(2)
    // Inside the gateway's minute the press may still land: no unlock yet, and the screen says why.
    expect(unlockButton().disabled).toBe(true)
    expect(screen.getByText(/so this unlocks [0-9]+ s from now/)).toBeTruthy()
    await afterTheWait()
    expect(previews).toBe(3)
    fireEvent.click(unlockButton())
    // The details come back as they were sent, and can be changed again.
    const amount = screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement
    expect(amount.value).toBe('2.500')
    expect((screen.getByRole('combobox', { name: form('currency') }) as HTMLSelectElement).value).toBe('OMR')
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
    attachReceipt()
    answer = () => json(PAID_OUT, 201)
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    // A new attempt: a new key. The receipt held in memory is sent again, not uploaded again, so a
    // paid-out that was in fact recorded would be refused as ALREADY_USED.
    expect(paidOuts[1].key).not.toBe(paidOuts[0].key)
    expect(uploads).toBe(1)
    expect(paidOuts[1].body.receiptObjectId).toBe('rcpt-1')
  })

  it('a re-read from inside the wait does not count: unlocking needs a fresh one after it (review W6-1)', async () => {
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    const sent = Date.now()
    fireEvent.click(recordButton())
    await screen.findByText(form('pending.title'))
    const clock = vi.spyOn(Date, 'now').mockReturnValue(sent + 10_000)
    fireEvent.click(screen.getByRole('button', { name: form('pending.check') }))
    expect(await screen.findByText(form('pending.movesNone'))).toBeTruthy()
    expect(unlockButton().disabled).toBe(true)
    // The wait is over, but the only re-read is from 10 s in.
    clock.mockReturnValue(sent + 91_000)
    await waitFor(() => expect(screen.getByText(form('pending.recheck'))).toBeTruthy())
    expect(unlockButton().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: form('pending.check') }))
    await waitFor(() => expect(unlockButton().disabled).toBe(false))
    expect(screen.queryByText(form('pending.recheck'))).toBeNull()
    fireEvent.click(unlockButton())
    expect(screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeTruthy()
  })

  it('comes back locked after a reload, from the tab’s storage, and sends the stored body', async () => {
    const body = {
      type: 'PAID_OUT',
      amount: 2.5,
      note: 'Milk',
      category: 'PETTY_CASH_EXPENSE',
      accountingClass: 'EXPENSE',
      currency: 'OMR',
      billId: null,
      receiptObjectId: 'rcpt-9',
      missingReceiptReason: null,
    }
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: { key: 'pos-paidout-stored-key-0001', fingerprint: JSON.stringify(body) },
        receipt: { file: 'receipt.jpg|3|1', receiptObjectId: 'rcpt-9' },
        unknown: true,
      }),
    )
    renderClose()
    expect(await screen.findByText(form('pending.title'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: form('pending.again') }))
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    expect(paidOuts[0].key).toBe('pos-paidout-stored-key-0001')
    expect(paidOuts[0].body).toEqual(body)
    expect(uploads).toBe(0)
  })

  it('works without the tab’s storage', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })
    try {
      answer = () => Promise.reject(new TypeError('Failed to fetch'))
      await fillPettyCash()
      chooseCurrency('OMR')
      attachReceipt()
      fireEvent.click(recordButton())
      expect(await screen.findByText(form('pending.title'))).toBeTruthy()
      answer = () => json(PAID_OUT, 201)
      fireEvent.click(screen.getByRole('button', { name: form('pending.again') }))
      await waitFor(() => expect(paidOuts).toHaveLength(2))
      expect(paidOuts[1].key).toBe(paidOuts[0].key)
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original)
    }
  })

  it('locks on a gateway 500 whose only "code" is the reason phrase', async () => {
    // Review W5-1: toApiError turns `error: "Internal Server Error"` into a code; it is not one.
    answer = () =>
      json({ timestamp: '2026-11-05T08:00:00Z', status: 500, error: 'Internal Server Error', path: '/x' }, 500)
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(await screen.findByText(form('pending.title'))).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeNull()
    expect(window.sessionStorage.getItem(HELD)).toContain(paidOuts[0].key as string)
  })

  it('keeps a coded 5xx definite: nothing recorded, the form stays open', async () => {
    answer = () => problem(500, 'POS_LEDGER_UNAVAILABLE')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    await waitFor(() => expect((recordButton() as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(form('pending.title'))).toBeNull()
    expect(screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeTruthy()
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
  })

  it('stays locked when the stored body cannot be read; only the re-read and the wait unlock it', async () => {
    // Review N-W5a: fail closed; nothing can be sent again without the body.
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: { key: 'pos-paidout-stored-key-0002', fingerprint: '{not json' },
        receipt: null,
        unknown: true,
        sentAt: Date.now(),
      }),
    )
    renderClose()
    expect(await screen.findByText(form('pending.title'))).toBeTruthy()
    expect(screen.getByText(form('pending.unreadable'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: form('pending.again') })).toBeNull()
    expect(screen.queryByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: form('pending.check') }))
    await screen.findByText(form('pending.movesNone'))
    expect(unlockButton().disabled).toBe(true)
    await afterTheWait()
    fireEvent.click(unlockButton())
    expect(await screen.findByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeTruthy()
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
    expect(paidOuts).toHaveLength(0)
  })

  it('words a reused key and starts a new attempt after it', async () => {
    answer = () => problem(409, 'POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(i18n.t('pos.refusal.POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED')),
    ).toBeTruthy()
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(paidOuts[1].key).not.toBe(paidOuts[0].key)
  })

  it('words a refund reference: the refund belongs on the refund page', async () => {
    answer = () => problem(422, 'POS_PAID_OUT_REFUND_REFERENCE', { fields: ['saleId'] })
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(
      await screen.findByText('A paid-out is never a refund. Refund the sale from the refund page.'),
    ).toBeTruthy()
  })

  it('refuses a file the server would refuse before uploading it', async () => {
    await fillPettyCash()
    const gif = new File(['abc'], 'r.gif', { type: 'image/gif' })
    fireEvent.change(screen.getByLabelText(form('receipt')), { target: { files: [gif] } })
    expect(screen.getByText(form('receiptProblem.type'))).toBeTruthy()
    expect(uploads).toBe(0)
  })
})

// Backend 9ce2bdcf4 (review F4): the receipt is bound to its till and backs one paid-out; the
// currency must be one cash is counted in.
describe('a refused receipt or currency', () => {
  it.each([
    [422, 'POS_PAID_OUT_RECEIPT_OTHER_TILL'],
    [422, 'POS_PAID_OUT_RECEIPT_NOT_FOUND'],
  ])('%s %s drops the held receipt: the next press uploads again, under a new key', async (status, code) => {
    answer = () => problem(status, code)
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(await screen.findByText(i18n.t(`pos.refusal.${code}`))).toBeTruthy()
    answer = () => json(PAID_OUT, 201)
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(uploads).toBe(2)
    expect(paidOuts[0].body.receiptObjectId).toBe('rcpt-1')
    expect(paidOuts[1].body.receiptObjectId).toBe('rcpt-2')
    // The body changed with the receipt, so the key did too; nothing else did.
    expect(paidOuts[1].key).not.toBe(paidOuts[0].key)
    expect({ ...paidOuts[1].body, receiptObjectId: null }).toEqual({
      ...paidOuts[0].body,
      receiptObjectId: null,
    })
  })

  it('409 POS_PAID_OUT_RECEIPT_ALREADY_USED asks for the receipt afresh rather than copying it', async () => {
    answer = () => problem(409, 'POS_PAID_OUT_RECEIPT_ALREADY_USED')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(i18n.t('pos.refusal.POS_PAID_OUT_RECEIPT_ALREADY_USED')),
    ).toBeTruthy()
    expect((recordButton() as HTMLButtonElement).disabled).toBe(true)
    attachReceipt()
    answer = () => json(PAID_OUT, 201)
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(uploads).toBe(2)
    expect(paidOuts[1].body.receiptObjectId).toBe('rcpt-2')
  })

  it('400 POS_PAID_OUT_CURRENCY_INVALID is worded and leaves the form as it was', async () => {
    answer = () => problem(400, 'POS_PAID_OUT_CURRENCY_INVALID')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(
        'Cash is not counted in that currency. Choose the currency the cash was paid out in.',
      ),
    ).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement).value,
    ).toBe('2.5')
    expect(
      (screen.getByRole('combobox', { name: form('category') }) as HTMLSelectElement).value,
    ).toBe('PETTY_CASH_EXPENSE')
    expect((screen.getByRole('combobox', { name: form('currency') }) as HTMLSelectElement).value).toBe(
      'OMR',
    )
    expect(previews).toBe(1)
    // A definite refusal recorded nothing (review W4-2): the attempt is closed and forgotten, so the
    // next press is a fresh key; the receipt stands and is not uploaded again.
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(uploads).toBe(1)
    expect(paidOuts[1].key).not.toBe(paidOuts[0].key)
    expect(paidOuts[1].body).toEqual(paidOuts[0].body)
  })
})

describe('the supplier bill link', () => {
  async function supplierPayment() {
    renderClose()
    await screen.findByRole('combobox', { name: form('category') })
    fireEvent.change(screen.getByRole('combobox', { name: form('category') }), {
      target: { value: 'SUPPLIER_PAYMENT' },
    })
  }

  // Owner v2 K10 ("Only staff who can settle supplier bills") replaces the earlier rule that let a
  // cashier without bill.settle pay a supplier unlinked: the category itself is not offered.
  it('is not offered without bill.settle: a payment to a supplier is not a category to choose', async () => {
    renderClose()
    const category = (await screen.findByRole('combobox', { name: form('category') })) as HTMLSelectElement
    const offered = Array.from(category.options).map((option) => option.value)
    expect(offered).not.toContain('SUPPLIER_PAYMENT')
    expect(offered).toEqual(['', 'PETTY_CASH_EXPENSE', 'CASH_TRANSFER', 'FLOAT_ADJUSTMENT', 'OTHER'])
    expect(screen.queryByRole('textbox', { name: form('billSearch') })).toBeNull()
  })

  it('with bill.settle, a payment to a supplier is offered, and unlinked its class must be chosen', async () => {
    permissions = [...permissions, 'bill.settle']
    await supplierPayment()
    expect(screen.getByRole('textbox', { name: form('billSearch') })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: form('class') })).toBeTruthy()
  })

  it('is offered with bill.settle and links an approved bill, fixing the class', async () => {
    permissions = [...permissions, 'bill.settle']
    await supplierPayment()
    fireEvent.change(screen.getByRole('textbox', { name: form('billSearch') }), {
      target: { value: 'ND-77' },
    })
    fireEvent.click(screen.getByRole('button', { name: form('billFind') }))
    const row = await screen.findByRole('button', { name: /Nizwa Dairy · ND-77/ })
    expect(billSearches[0]).toContain('filter=APPROVED')
    fireEvent.click(row)
    expect(screen.queryByRole('combobox', { name: form('class') })).toBeNull()
    expect(
      screen.getByText(
        i18n.t('pos.close.paidOutForm.classFixed', {
          class: i18n.t('pos.close.paidOutForm.classes.BILL_SETTLEMENT'),
        }),
      ),
    ).toBeTruthy()
    chooseCurrency('USD')
    expect(
      screen.getByText(i18n.t('pos.close.paidOutForm.billCurrency', { currency: 'OMR' })),
    ).toBeTruthy()
  })

  it('never says "This bill is in ." for a bill that states no currency (review NIT)', async () => {
    permissions = [...permissions, 'bill.settle']
    bills = [{ ...BILL, currencyCode: null }]
    await supplierPayment()
    fireEvent.click(screen.getByRole('button', { name: form('billFind') }))
    fireEvent.click(await screen.findByRole('button', { name: /Nizwa Dairy · ND-77/ }))
    chooseCurrency('USD')
    expect(screen.queryByText(/This bill is in/)).toBeNull()
  })

  it('asks for someone who can settle bills, never suggests recording it unlinked (review W4-3)', async () => {
    permissions = [...permissions, 'bill.settle']
    answer = () => problem(403, 'POS_PAID_OUT_BILL_FORBIDDEN')
    await supplierPayment()
    fireEvent.click(screen.getByRole('button', { name: form('billFind') }))
    fireEvent.click(await screen.findByRole('button', { name: /Nizwa Dairy · ND-77/ }))
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }), {
      target: { value: '2.5' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('pos.close.whatFor') }), {
      target: { value: 'Milk bill' },
    })
    chooseCurrency('OMR')
    fireEvent.click(screen.getByRole('checkbox', { name: form('noReceipt') }))
    fireEvent.change(screen.getByRole('textbox', { name: form('noReceiptReason') }), {
      target: { value: 'Paid by phone' },
    })
    fireEvent.click(recordButton())
    expect(
      await screen.findByText('Ask someone who can settle bills to record this payment against the bill.'),
    ).toBeTruthy()
    expect(screen.queryByText(/without the bill/)).toBeNull()
  })

  // Review WB4-2. The code is backend e643ad188's.
  it('an unlinked supplier payment refused for bill.settle says so, not "against the bill"', async () => {
    permissions = [...permissions, 'bill.settle']
    answer = () => problem(403, 'POS_SUPPLIER_PAYMENT_REQUIRES_BILL_SETTLE')
    await supplierPayment()
    fireEvent.change(screen.getByRole('combobox', { name: form('class') }), {
      target: { value: 'EXPENSE' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }), {
      target: { value: '2.5' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('pos.close.whatFor') }), {
      target: { value: 'Milk' },
    })
    chooseCurrency('OMR')
    fireEvent.click(screen.getByRole('checkbox', { name: form('noReceipt') }))
    fireEvent.change(screen.getByRole('textbox', { name: form('noReceiptReason') }), {
      target: { value: 'Paid by phone' },
    })
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(
        'Only someone who can settle supplier bills can pay a supplier from the till. Nothing was recorded.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/against the bill/)).toBeNull()
    expect(i18n.exists('pos.refusal.POS_SUPPLIER_PAYMENT_REQUIRES_BILL_SETTLE', { lng: 'ar', fallbackLng: false })).toBe(true)
  })

  it('a kept supplier payment comes back without its category for a user without bill.settle (review WB4-3)', async () => {
    const body = {
      type: 'PAID_OUT',
      amount: 2.5,
      note: 'Milk',
      category: 'SUPPLIER_PAYMENT',
      accountingClass: 'EXPENSE',
      currency: 'OMR',
      billId: null,
      receiptObjectId: 'rcpt-9',
      missingReceiptReason: null,
    }
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: { key: 'pos-paidout-stored-key-0003', fingerprint: JSON.stringify(body) },
        receipt: { file: 'receipt.jpg|3|1', receiptObjectId: 'rcpt-9' },
        unknown: true,
      }),
    )
    renderClose()
    expect(await screen.findByText(form('pending.title'))).toBeTruthy()
    await afterTheWait()
    fireEvent.click(unlockButton())
    const category = (await screen.findByRole('combobox', { name: form('category') })) as HTMLSelectElement
    expect(category.value).toBe('')
    expect(screen.queryByRole('combobox', { name: form('class') })).toBeNull()
    expect((screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement).value).toBe(
      '2.500',
    )
  })

  // B8R-1 (Agent 10): a supplier payment kept from before K10 is sent again under its key by a
  // cashier without bill.settle. The server answers 403 instead of replaying the first press, which
  // may have paid the cash out, so the till must not say nothing was recorded.
  it('a retry of a kept supplier payment refused for bill.settle may have been recorded, and stays held', async () => {
    const body = {
      type: 'PAID_OUT',
      amount: 2.5,
      note: 'Milk',
      category: 'SUPPLIER_PAYMENT',
      accountingClass: 'EXPENSE',
      currency: 'OMR',
      billId: null,
      receiptObjectId: 'rcpt-9',
      missingReceiptReason: null,
    }
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: { key: 'pos-paidout-stored-key-0004', fingerprint: JSON.stringify(body) },
        receipt: { file: 'receipt.jpg|3|1', receiptObjectId: 'rcpt-9' },
        unknown: true,
      }),
    )
    answer = () => problem(403, 'POS_SUPPLIER_PAYMENT_REQUIRES_BILL_SETTLE')
    renderClose()
    fireEvent.click(await screen.findByRole('button', { name: form('pending.again') }))
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    expect(paidOuts[0].key).toBe('pos-paidout-stored-key-0004')
    expect(await screen.findByText(form('pending.mayBeRecorded'))).toBeTruthy()
    expect(screen.queryByText(/Nothing was recorded|nothing was paid/i)).toBeNull()
    // Still held: the details stay locked, the key stays kept, and the check is offered.
    expect(screen.getByText(form('pending.title'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.close.record') })).toBeNull()
    expect(screen.getByRole('button', { name: form('pending.check') })).toBeTruthy()
    // WB5-3: sending it again could only be refused the same way.
    expect(screen.queryByRole('button', { name: form('pending.again') })).toBeNull()
    expect(window.sessionStorage.getItem(HELD)).toContain('pos-paidout-stored-key-0004')
    expect(i18n.exists('pos.close.paidOutForm.pending.mayBeRecorded', { lng: 'ar', fallbackLng: false })).toBe(true)
  })

  // WB5-2: any 403 on a retry under a kept key, here pos.cash.pay_out withdrawn since the first press.
  it('a retry refused POS_PAID_OUT_FORBIDDEN may have been recorded, and stays held', async () => {
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: {
          key: 'pos-paidout-stored-key-0005',
          fingerprint: JSON.stringify({
            type: 'PAID_OUT',
            amount: 2.5,
            note: 'Milk',
            category: 'PETTY_CASH_EXPENSE',
            accountingClass: 'EXPENSE',
            currency: 'OMR',
            billId: null,
            receiptObjectId: null,
            missingReceiptReason: 'Lost',
          }),
        },
        receipt: null,
        unknown: true,
      }),
    )
    answer = () => problem(403, 'POS_PAID_OUT_FORBIDDEN')
    renderClose()
    fireEvent.click(await screen.findByRole('button', { name: form('pending.again') }))
    expect(await screen.findByText(form('pending.mayBeRecorded'))).toBeTruthy()
    expect(paidOuts[0].key).toBe('pos-paidout-stored-key-0005')
    expect(screen.queryByText(/Nothing was recorded/i)).toBeNull()
    expect(screen.getByText(form('pending.title'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: form('pending.again') })).toBeNull()
    expect(window.sessionStorage.getItem(HELD)).toContain('pos-paidout-stored-key-0005')
  })

  // W7R-3: a TIMED_OUT answers only the resend. The first press may still be recorded, so the lock
  // stays; unlocking would show empty fields, and a detail retyped differently would be a new key.
  it('a resend from the locked view that times out stays locked under the same key', async () => {
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: {
          key: 'pos-paidout-stored-key-0006',
          fingerprint: JSON.stringify({
            type: 'PAID_OUT',
            amount: 2.5,
            note: 'Milk',
            category: 'PETTY_CASH_EXPENSE',
            accountingClass: 'EXPENSE',
            currency: 'OMR',
            billId: null,
            receiptObjectId: null,
            missingReceiptReason: 'Lost',
          }),
        },
        receipt: null,
        unknown: true,
      }),
    )
    answer = () => problem(503, 'POS_PAID_OUT_TIMED_OUT')
    renderClose()
    fireEvent.click(await screen.findByRole('button', { name: form('pending.again') }))
    expect(await screen.findByText(form('pending.timedOut'))).toBeTruthy()
    expect(paidOuts[0].key).toBe('pos-paidout-stored-key-0006')
    // Still locked: the stored details, no form, and the same press offered again.
    expect(screen.getByText(form('pending.title'))).toBeTruthy()
    expect(screen.getByText('Milk')).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.close.record') })).toBeNull()
    expect(screen.queryByText(/Press "Record it" again with the same details/)).toBeNull()
    const held = JSON.parse(window.sessionStorage.getItem(HELD) ?? '{}')
    expect(held.unknown).toBe(true)
    expect(held.attempt.key).toBe('pos-paidout-stored-key-0006')
    answer = () => json(PAID_OUT, 201)
    fireEvent.click(screen.getByRole('button', { name: form('pending.again') }))
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(paidOuts[1].key).toBe('pos-paidout-stored-key-0006')
    expect(i18n.exists('pos.close.paidOutForm.pending.timedOut', { lng: 'ar', fallbackLng: false })).toBe(true)
  })

  it('a failed bill search never steers the cashier to record it without the bill', async () => {
    permissions = [...permissions, 'bill.settle']
    await supplierPayment()
    vi.mocked(fetch).mockImplementationOnce(async () => problem(500, 'INTERNAL'))
    fireEvent.click(screen.getByRole('button', { name: form('billFind') }))
    expect(
      await screen.findByText('Bills could not be read. Try again, or ask someone who can settle bills.'),
    ).toBeTruthy()
    expect(screen.queryByText(/without a bill|without the bill/)).toBeNull()
  })
})

describe('the new sentences in Arabic', () => {
  it.each([
    'pos.close.paidOutForm.currencyNote',
    'pos.close.paidOutForm.pending.title',
    'pos.close.paidOutForm.pending.hint',
    'pos.close.paidOutForm.pending.notRecorded',
    'pos.refusal.POS_PAID_OUT_REFUND_REFERENCE',
    'pos.refusal.POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED',
    'pos.refusal.POS_PAID_OUT_BILL_FORBIDDEN',
  ])('%s', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
    await i18n.changeLanguage('en')
  })
})

// Backend a2c9fcf0c (FIN-M3-CURRENCY-MIX Phase 2a): a shift whose cash is in mixed or unrecorded
// currencies has no drawer figure. It is refused or withheld, never shown as 0 nor added up here.
describe('drawer figures the server withholds', () => {
  const closeButton = () => screen.queryByRole('button', { name: i18n.t('pos.close.closeTill') })

  it('409 POS_SHIFT_CURRENCY_MIXED on the preview is worded, names the currencies, and offers no close', async () => {
    previewAnswer = () => problem(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] })
    renderClose()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      i18n.t('pos.close.withheld.POS_SHIFT_CURRENCY_MIXED', { currencies: 'OMR, USD' }),
    )
    // Review WB3-5: a read refused; nothing was being recorded, so it does not say so.
    expect(alert.textContent).not.toMatch(/nothing was recorded/i)
    expect(alert.textContent).toContain('OMR, USD')
    // Review WB2-1: no counted-float or new-shift screen exists, so neither is offered.
    expect(alert.textContent).toMatch(/a manager needs to sort this out/i)
    expect(alert.textContent).not.toMatch(/count the float|new shift/i)
    expect(closeButton()).toBeNull()
    expect(screen.queryByRole('textbox', { name: i18n.t('pos.pay.amount') })).toBeNull()
  })

  it('409 POS_SHIFT_CURRENCY_MIXED without its currencies reads whole, with no placeholder (review WB2-2)', async () => {
    previewAnswer = () => problem(409, 'POS_SHIFT_CURRENCY_MIXED')
    renderClose()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(i18n.t('pos.close.withheld.withoutFigures.POS_SHIFT_CURRENCY_MIXED'))
    expect(alert.textContent).not.toMatch(/nothing was recorded/i)
    expect(alert.textContent).not.toContain('{{')
    expect(closeButton()).toBeNull()
  })

  it('409 POS_SHIFT_CURRENCY_UNRECORDED on the preview is worded, and offers no close', async () => {
    previewAnswer = () =>
      problem(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 2, currencies: ['OMR'] })
    renderClose()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      i18n.t('pos.close.withheld.POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: '2' }),
    )
    expect(alert.textContent).not.toMatch(/nothing was recorded/i)
    expect(closeButton()).toBeNull()
  })

  it('a preview with null figures shows them as not available, never 0, and offers no close', async () => {
    previewAnswer = () => json({ ...PREVIEW, expectedCash: null, paidOut: null, paidIn: null })
    renderClose()
    expect(await screen.findByText(i18n.t('pos.close.figuresWithheld'))).toBeTruthy()
    expect(screen.getAllByText(i18n.t('pos.close.notAvailable'))).toHaveLength(3)
    expect(screen.queryByText(/0\.000/)).toBeNull()
    expect(screen.queryByText(/35\.649/)).toBeNull()
    expect(closeButton()).toBeNull()
  })

  it('one null figure is enough: the others are not used to work it out', async () => {
    previewAnswer = () => json({ ...PREVIEW, expectedCash: null })
    renderClose()
    expect(await screen.findByText(i18n.t('pos.close.figuresWithheld'))).toBeTruthy()
    expect(screen.getAllByText(i18n.t('pos.close.notAvailable'))).toHaveLength(1)
    expect(screen.queryByText(/35\.649/)).toBeNull()
    expect(closeButton()).toBeNull()
  })

  it('a paid-out held with an unknown outcome stays held while the figures are refused, and comes back', async () => {
    const body = {
      type: 'PAID_OUT',
      amount: 2.5,
      note: 'Milk',
      category: 'PETTY_CASH_EXPENSE',
      accountingClass: 'EXPENSE',
      currency: 'OMR',
      billId: null,
      receiptObjectId: 'rcpt-9',
      missingReceiptReason: null,
    }
    window.sessionStorage.setItem(
      HELD,
      JSON.stringify({
        attempt: { key: 'pos-paidout-stored-key-0002', fingerprint: JSON.stringify(body) },
        receipt: { file: 'receipt.jpg|3|1', receiptObjectId: 'rcpt-9' },
        unknown: true,
      }),
    )
    previewAnswer = () => problem(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] })
    const first = renderClose()
    await screen.findByRole('alert')
    // Nothing can be sent from here, and the held attempt is not forgotten.
    expect(screen.queryByRole('button', { name: form('pending.again') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('pos.close.record') })).toBeNull()
    expect(paidOuts).toHaveLength(0)
    expect(window.sessionStorage.getItem(HELD)).toContain('pos-paidout-stored-key-0002')
    first.unmount()

    resetSharedRequests()
    previewAnswer = () => json(PREVIEW)
    renderClose()
    expect(await screen.findByText(form('pending.title'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: form('pending.again') }))
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    expect(paidOuts[0].key).toBe('pos-paidout-stored-key-0002')
    expect(paidOuts[0].body).toEqual(body)
  })
})

/** Opens the paid-in form and returns its amount field. */
async function openPaidIn() {
  renderClose()
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.move.PAID_IN') }))
  return screen.getAllByPlaceholderText('0.000').at(-1) as HTMLInputElement
}

const paidInCurrency = () =>
  screen.getByRole('combobox', { name: i18n.t('pos.close.paidInCurrency') }) as HTMLSelectElement

function choosePaidInCurrency(code: string) {
  fireEvent.change(paidInCurrency(), { target: { value: code } })
}

// FIN-PAIDIN-CUR: since backend a2c9fcf0c a paid-in states its currency. The paid-out's pattern
// (FIN-M3-CURRENCY-SRC, owner item 6.3): the cashier's explicit choice, never a default.
describe('the currency of a paid-in', () => {
  it('assumes none: nothing is chosen, and every currency of the paid-out list is offered', async () => {
    await openPaidIn()
    expect(paidInCurrency().value).toBe('')
    const offered = Array.from(paidInCurrency().options).map((option) => option.value)
    expect(offered).toEqual(['', 'OMR', 'USD', 'EUR', 'AED', 'SAR'])
    expect(screen.getByText(i18n.t('pos.close.paidInCurrencyNote'))).toBeTruthy()
  })

  it('Record it waits until a currency is chosen, and sends nothing before', async () => {
    const amount = await openPaidIn()
    fireEvent.change(amount, { target: { value: '4' } })
    expect((recordButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(recordButton())
    expect(paidOuts).toHaveLength(0)
    choosePaidInCurrency('OMR')
    expect((recordButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('sends the chosen currency with the paid-in', async () => {
    answer = () => json({ ...PAID_OUT, type: 'PAID_IN', amount: 4, currency: 'USD' }, 201)
    const amount = await openPaidIn()
    fireEvent.change(amount, { target: { value: '4' } })
    choosePaidInCurrency('USD')
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(1))
    expect(paidOuts[0].body).toEqual({ type: 'PAID_IN', amount: 4, note: null, currency: 'USD' })
    // Recorded: the drawer figures reload and the next paid-in again starts with no currency.
    await waitFor(() => expect(previews).toBe(2))
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.move.PAID_IN') }))
    expect(paidInCurrency().value).toBe('')
  })

  it('422 POS_CASH_MOVEMENT_CURRENCY_MISMATCH names both currencies and leaves the form as it was', async () => {
    answer = () =>
      problem(422, 'POS_CASH_MOVEMENT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'AED' })
    const amount = await openPaidIn()
    fireEvent.change(amount, { target: { value: '4' } })
    fireEvent.change(screen.getByPlaceholderText(i18n.t('pos.pay.optional')), {
      target: { value: 'Change from the bank' },
    })
    choosePaidInCurrency('AED')
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(
        i18n.t('pos.refusal.POS_CASH_MOVEMENT_CURRENCY_MISMATCH', {
          shiftCurrency: 'OMR',
          sentCurrency: 'AED',
        }),
      ),
    ).toBeTruthy()
    expect(amount.value).toBe('4')
    expect((screen.getByPlaceholderText(i18n.t('pos.pay.optional')) as HTMLInputElement).value).toBe(
      'Change from the bank',
    )
    expect(paidInCurrency().value).toBe('AED')
    expect(previews).toBe(1)
  })

  it('400 POS_CASH_MOVEMENT_CURRENCY_INVALID is worded and leaves the form as it was', async () => {
    answer = () => problem(400, 'POS_CASH_MOVEMENT_CURRENCY_INVALID')
    const amount = await openPaidIn()
    fireEvent.change(amount, { target: { value: '4' } })
    choosePaidInCurrency('SAR')
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(i18n.t('pos.refusal.POS_CASH_MOVEMENT_CURRENCY_INVALID')),
    ).toBeTruthy()
    expect(amount.value).toBe('4')
    expect(paidInCurrency().value).toBe('SAR')
  })

  it.each(['pos.close.paidInCurrency', 'pos.close.paidInCurrencyNote'])('%s is in Arabic', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
    await i18n.changeLanguage('en')
  })
})

describe('a paid-out or paid-in the shift currency refuses', () => {
  it('422 POS_PAID_OUT_CURRENCY_MISMATCH names both currencies and leaves the form as it was', async () => {
    answer = () =>
      problem(422, 'POS_PAID_OUT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'USD' })
    await fillPettyCash()
    chooseCurrency('USD')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(
        i18n.t('pos.refusal.POS_PAID_OUT_CURRENCY_MISMATCH', {
          shiftCurrency: 'OMR',
          sentCurrency: 'USD',
        }),
      ),
    ).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement).value,
    ).toBe('2.5')
    expect((screen.getByRole('combobox', { name: form('currency') }) as HTMLSelectElement).value).toBe(
      'USD',
    )
    // Definite: nothing recorded, nothing held, no lock.
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
    expect(screen.queryByText(form('pending.title'))).toBeNull()
  })

  it.each(['POS_SHIFT_CURRENCY_MIXED', 'POS_SHIFT_CURRENCY_UNRECORDED'])(
    'a paid-out refused 409 %s is worded and definite: the form stays, nothing is held',
    async (code) => {
      answer = () => problem(409, code, { currencies: ['OMR', 'USD'], unrecordedMovements: 1 })
      await fillPettyCash()
      chooseCurrency('OMR')
      attachReceipt()
      fireEvent.click(recordButton())
      expect(
        await screen.findByText(
          i18n.t(`pos.refusal.${code}`, { currencies: 'OMR, USD', unrecordedMovements: '1' }),
        ),
      ).toBeTruthy()
      expect(
        (screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement).value,
      ).toBe('2.5')
      expect(window.sessionStorage.getItem(HELD)).toBeNull()
      expect(screen.queryByText(form('pending.title'))).toBeNull()
    },
  )

  // FIN-PAIDIN-CUR: the paid-in now sends the currency the cashier chose; a server that still finds
  // none is worded, and the amount survives it.
  it('a paid-in refused 400 POS_CASH_MOVEMENT_CURRENCY_REQUIRED is worded and keeps the amount', async () => {
    answer = () => problem(400, 'POS_CASH_MOVEMENT_CURRENCY_REQUIRED')
    const amount = await openPaidIn()
    fireEvent.change(amount, { target: { value: '4' } })
    choosePaidInCurrency('OMR')
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(i18n.t('pos.refusal.POS_CASH_MOVEMENT_CURRENCY_REQUIRED')),
    ).toBeTruthy()
    expect(paidOuts).toHaveLength(1)
    expect(paidOuts[0].body).toMatchObject({ type: 'PAID_IN', amount: 4, currency: 'OMR' })
    expect(amount.value).toBe('4')
  })

  it.each(['pos.close.notAvailable', 'pos.close.figuresWithheld'])('%s is in Arabic', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
    await i18n.changeLanguage('en')
  })
})

// Backend b2234c04d (W6-90S): the paid-out's transaction is bounded at 45 s and rolled back past it.
describe('a paid-out the server timed out', () => {
  it('503 POS_PAID_OUT_TIMED_OUT says nothing was paid out, keeps the form unlocked, and keeps the key', async () => {
    answer = () => problem(503, 'POS_PAID_OUT_TIMED_OUT')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(
      await screen.findByText(
        'This paid-out took too long, and nothing was paid out. Press "Record it" again with the same details: it is sent again safely and cannot be recorded twice.',
      ),
    ).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement).value,
    ).toBe('2.5')
    expect((screen.getByRole('combobox', { name: form('currency') }) as HTMLSelectElement).value).toBe(
      'OMR',
    )
    expect(screen.queryByText(form('pending.title'))).toBeNull()
    // Coordinator ruling 2026-11-05 (inverts WB3's new key): the attempt and its key are kept, in the
    // tab's storage too, so pressing again sends the same paid-out under the same key, and a replay is
    // the one paid-out.
    expect(window.sessionStorage.getItem(HELD)).toContain(paidOuts[0].key as string)
    answer = () => json({ ...PAID_OUT, replayed: true }, 200)
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(paidOuts[1].key).toBe(paidOuts[0].key)
    expect(paidOuts[1].body).toEqual(paidOuts[0].body)
    expect(uploads).toBe(1)
    await waitFor(() => expect(window.sessionStorage.getItem(HELD)).toBeNull())
  })

  it('after the 503 and a reload, the same paid-out entered again goes under the same key', async () => {
    answer = () => problem(503, 'POS_PAID_OUT_TIMED_OUT')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    await screen.findByText(/nothing was paid out/)
    // A reload: the page and its memory go, the tab's storage stays.
    cleanup()
    answer = () => json({ ...PAID_OUT, replayed: true }, 200)
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(paidOuts[1].key).toBe(paidOuts[0].key)
    expect(paidOuts[1].body).toEqual(paidOuts[0].body)
    expect(uploads).toBe(1)
  })

  it('after the 503, a changed detail is a new paid-out under a new key', async () => {
    answer = () => problem(503, 'POS_PAID_OUT_TIMED_OUT')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    await screen.findByText(/nothing was paid out/)
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }), {
      target: { value: '3' },
    })
    answer = () => json(PAID_OUT, 201)
    fireEvent.click(recordButton())
    await waitFor(() => expect(paidOuts).toHaveLength(2))
    expect(paidOuts[1].key).not.toBe(paidOuts[0].key)
  })

  it('reads in Arabic with nothing left in English', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists('pos.refusal.POS_PAID_OUT_TIMED_OUT', { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t('pos.refusal.POS_PAID_OUT_TIMED_OUT')).not.toMatch(/[A-Za-z]{4,}/)
    await i18n.changeLanguage('en')
  })
})

// Backend 0e9aa15ac (FIN-2a-1): until a sale or a refund records the shift's currency, a paid-in or
// paid-out stating one is refused 409 POS_SHIFT_CURRENCY_UNKNOWN (review WB3-1).
describe('a shift whose currency is not known yet', () => {
  const SENTENCE = "This shift's currency is not known yet. Nothing was recorded. A manager can help."

  it('a paid-out is refused in words, and the form keeps its values with nothing held', async () => {
    answer = () => problem(409, 'POS_SHIFT_CURRENCY_UNKNOWN')
    await fillPettyCash()
    chooseCurrency('OMR')
    attachReceipt()
    fireEvent.click(recordButton())
    expect(await screen.findByText(SENTENCE)).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: i18n.t('pos.pay.amount') }) as HTMLInputElement).value,
    ).toBe('2.5')
    expect(window.sessionStorage.getItem(HELD)).toBeNull()
    expect(screen.queryByText(form('pending.title'))).toBeNull()
  })

  it('a paid-in is refused in words, and the form keeps its values', async () => {
    answer = () => problem(409, 'POS_SHIFT_CURRENCY_UNKNOWN')
    const amount = await openPaidIn()
    fireEvent.change(amount, { target: { value: '4' } })
    choosePaidInCurrency('OMR')
    fireEvent.click(recordButton())
    expect(await screen.findByText(SENTENCE)).toBeTruthy()
    expect(amount.value).toBe('4')
    expect(paidInCurrency().value).toBe('OMR')
  })

  it('reads in Arabic with nothing left in English', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists('pos.refusal.POS_SHIFT_CURRENCY_UNKNOWN', { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t('pos.refusal.POS_SHIFT_CURRENCY_UNKNOWN')).not.toMatch(/[A-Za-z]{4,}|\{\{/)
    await i18n.changeLanguage('en')
  })
})
