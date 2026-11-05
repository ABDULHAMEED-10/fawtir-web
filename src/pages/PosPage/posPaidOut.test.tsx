import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        return json(PREVIEW)
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

  it('is not offered without bill.settle, and the class must then be chosen', async () => {
    await supplierPayment()
    expect(screen.queryByRole('textbox', { name: form('billSearch') })).toBeNull()
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
