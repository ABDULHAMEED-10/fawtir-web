import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosClosePage } from './PosClosePage'
import { PosDonePage } from './PosDonePage'
import { PosQueuePanel } from './PosQueuePanel'
import { PosRefundPage } from './PosRefundPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, setFinishedSale } from '../../lib/posSale'
import { flushQueue, queuedFor, resetPosQueue, submitSale } from '../../lib/posQueue'
import { approvalCodeOk } from '../../lib/posPayment'
import { startingCount } from '../../lib/posClose'
import { NO_SALE_DISCOUNT, totalsFor } from '../../lib/pos'
import { maskedIdentifier } from '../../lib/posSale'
import { memoryVault, setPosVault } from '../../lib/posVault'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import type { PosSaleRequest, PosTillDto } from '../../api/pos/pos'
import type { TillState } from '../../lib/posTill'

/** Abdul's decisions of 1 Nov 2026 on the till, on the API's own shapes. */

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.close', 'pos.refund', 'pos.till.manage'],
  scopes: [],
  featureFlags: {},
}

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 0,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-11-01T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

/** The preview after the split sale refunded all as cash, as the live server answered it. */
const preview = (expectedCash: number) => ({
  shiftId: 'sh-1',
  tillId: 'till-1',
  tillNumber: 1,
  branchId: 'b-1',
  cashier: { userId: 'u-1', name: 'Maryam' },
  status: 'OPEN',
  businessDate: '2026-11-01',
  openedAt: '2026-11-01T03:00:00Z',
  endedAt: null,
  openingFloat: 0,
  openingFloatSource: 'DEFAULT',
  salesCount: 1,
  salesAmount: 21,
  byMethod: [
    { method: 'CASH', sales: 1, taken: 1, refunded: 21, tips: 0 },
    { method: 'CARD', sales: 1, taken: 20, refunded: 0, tips: 0 },
  ],
  companyInvoices: 0,
  vatWithin: 1,
  discounts: 0,
  tips: 0,
  paidOut: 0,
  paidIn: 0,
  cashRefunded: 21,
  expectedCash,
  looseEnds: {
    onAccountOpen: { count: 0, amount: 0 },
    notYetAccepted: 0,
    cardSalesForTerminalCheck: { count: 1, amount: 20 },
  },
  movements: [],
  at: '2026-11-01T14:00:00Z',
})

const LINE = {
  lineNumber: 1,
  role: 'ITEM',
  productId: 'p-1',
  description: 'Lunch',
  quantitySold: 2,
  quantityRefunded: 0,
  unitPrice: 10,
  discount: null,
  vatRate: 5,
  vatCategory: 'S',
  refundable: true,
}

const LOOKUP = {
  saleId: 'sale-1',
  invoiceId: 'inv-1',
  invoiceNumber: 'NZW-T01-INV-2026-000001',
  soldAt: '2026-11-01T08:00:00Z',
  transactionType: 'SIMPLIFIED',
  branch: { id: 'b-1', name: 'Nizwa' },
  customer: { kind: 'WALK_IN', customerId: 'c-1', name: 'Walk-in customer' },
  headerDiscount: null,
  lines: [LINE],
  paid: { byMethod: [{ method: 'CASH', amount: 21 }], total: 21, paidBack: 0 },
  total: 21,
  tip: 0,
  tipMethod: null,
  filing: null,
  credited: 0,
  owed: 0,
  creditNoteNumbers: [],
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const NOT_FOUND = () => json({ type: 'about:blank', status: 404 }, 404)

let lookup: unknown
let quote: () => Response
let drawer: number
let refunds: { moneyBack: { method: string; amount: number; reference?: string }[] }[]
let closes: unknown[]
let drawerReads: number
let saleReply: () => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale([])
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  lookup = LOOKUP
  quote = NOT_FOUND
  drawer = 100
  refunds = []
  closes = []
  drawerReads = 0
  saleReply = NOT_FOUND
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(MANAGER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/pos/refund-lookup')) return json(lookup)
      if (url === '/api/v1/pos/sales/sale-1/refund-quote') return quote()
      if (url === '/api/v1/pos/sales/sale-1/refunds' && init?.method === 'POST') {
        refunds.push(JSON.parse(String(init.body)))
        return json(
          {
            refundId: 'r-1',
            saleId: 'sale-1',
            creditNoteId: 'cn-1',
            creditNoteNumber: 'NZW-T01-CRN-2026-000001',
            totals: {},
            warnings: [],
          },
          201,
        )
      }
      if (url === '/api/v1/pos/shifts/sh-1/close-preview') {
        drawerReads += 1
        return json(preview(drawer))
      }
      if (url === '/api/v1/pos/shifts/sh-1/close' && init?.method === 'POST') {
        closes.push(JSON.parse(String(init.body)))
        return json({ shiftId: 'sh-1', closedAt: '2026-11-01T14:00:00Z' }, 201)
      }
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') return saleReply()
      return NOT_FOUND()
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  setPosVault(null)
})

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pos/refund" element={<PosRefundPage />} />
        <Route path="/pos/close" element={<PosClosePage />} />
        <Route path="/pos/receipt" element={<PosDonePage />} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const refundPage = () => at('/pos/refund?invoice=NZW-T01-INV-2026-000001')

const warnings = () =>
  screen
    .queryAllByRole('status')
    .map((element) => element.textContent ?? '')
    .filter((text) => text.includes('2.500') && text.includes('21.000'))

const drawerWarning = () => waitFor(() => expect(warnings()).toHaveLength(1))

describe('a drawer below zero (decision 1)', () => {
  it('starts the count at 0, never a negative figure', () => {
    expect(startingCount(-9957)).toBe(0)
    expect(startingCount(0)).toBe(0)
    expect(startingCount(34973)).toBe(34973)
  })

  it.each(['en', 'ar'])(
    'the close counts from 0, says over and not balances, and sends a figure the server takes (%s)',
    async (language) => {
      await i18n.changeLanguage(language)
      drawer = -9.957
      at('/pos/close')
      const count = (await screen.findByRole('textbox', {
        name: i18n.t('pos.close.actuallyIn'),
      })) as HTMLInputElement
      expect(count.value).toBe('0.000')
      expect(screen.queryByText(i18n.t('pos.close.balances'))).toBeNull()
      expect(screen.getAllByText(i18n.t('pos.close.overBy')).length).toBeGreaterThan(0)
      // PosMoney.cash refuses a negative total with POS_COUNT_INVALID: never sent.
      fireEvent.click(screen.getByText(i18n.t('pos.close.dontKnow')))
      fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
      await waitFor(() => expect(closes).toHaveLength(1))
      expect(closes[0]).toMatchObject({
        counting: { mode: 'TOTAL', total: 0 },
        floatLeft: 0,
        overShortReason: 'DONT_KNOW',
      })
      await i18n.changeLanguage('en')
    },
  )

  it('keeps the prefill on a drawer that holds money', async () => {
    drawer = 34.973
    at('/pos/close')
    const count = (await screen.findByRole('textbox', {
      name: i18n.t('pos.close.actuallyIn'),
    })) as HTMLInputElement
    expect(count.value).toBe('34.973')
    expect(screen.getAllByText(i18n.t('pos.close.balances')).length).toBeGreaterThan(0)
  })

  it.each(['en', 'ar'])(
    'warns at a cash refund the drawer cannot cover, on the server without a quote, and still lets it go (%s)',
    async (language) => {
      await i18n.changeLanguage(language)
      drawer = 2.5
      refundPage()
      fireEvent.click(await screen.findByRole('checkbox'))
      await drawerWarning()
      const go = screen.getByRole('button', {
        name: i18n.t('pos.refund.refundAmount', { amount: '21.000' }),
      }) as HTMLButtonElement
      expect(go.disabled).toBe(false)
      fireEvent.click(go)
      await waitFor(() => expect(refunds).toHaveLength(1))
      expect(refunds[0].moneyBack).toEqual([{ method: 'CASH', amount: 21 }])
      await i18n.changeLanguage('en')
    },
  )

  it('warns on the cash part of a split, and stops when the cashier moves it to the card', async () => {
    drawer = 2.5
    lookup = {
      ...LOOKUP,
      paid: {
        byMethod: [
          { method: 'CARD', amount: 20 },
          { method: 'CASH', amount: 1 },
        ],
        total: 21,
        paidBack: 0,
      },
    }
    quote = () =>
      json({
        total: 21,
        lastRefund: true,
        suggested: [{ method: 'CASH', amount: 21 }],
        cardLimit: 20,
        payOutLimit: 21,
        reduceBalance: 0,
      })
    refundPage()
    fireEvent.click(await screen.findByRole('checkbox'))
    await drawerWarning()
    const card = screen.getByLabelText(new RegExp(i18n.t('pos.refund.method.CARD')))
    fireEvent.change(card, { target: { value: '20' } })
    await screen.findByRole('button', {
      name: i18n.t('pos.refund.refundAmount', { amount: '21.000' }),
    })
    await waitFor(() => expect(warnings()).toEqual([]))
  })

  it('says nothing when the drawer covers it, or when nothing goes back in cash', async () => {
    drawer = 50
    refundPage()
    fireEvent.click(await screen.findByRole('checkbox'))
    await waitFor(() => expect(drawerReads).toBe(1))
    await screen.findByRole('button', {
      name: i18n.t('pos.refund.refundAmount', { amount: '21.000' }),
    })
    expect(warnings()).toEqual([])
  })
})

describe('the approval code on a card refund (decision 2)', () => {
  it('is the sale rule: 1 to 40 printable ASCII once trimmed, empty allowed', () => {
    expect(approvalCodeOk('')).toBe(true)
    expect(approvalCodeOk('   ')).toBe(true)
    expect(approvalCodeOk(' GOOD5678 ')).toBe(true)
    expect(approvalCodeOk('bad ref!')).toBe(true)
    expect(approvalCodeOk('bad ref! ؟؟')).toBe(false)
    expect(approvalCodeOk('١٢٣')).toBe(false)
    expect(approvalCodeOk('x'.repeat(40))).toBe(true)
    expect(approvalCodeOk('x'.repeat(41))).toBe(false)
  })

  const splitSale = () => {
    lookup = {
      ...LOOKUP,
      paid: { byMethod: [{ method: 'CARD', amount: 21 }], total: 21, paidBack: 0 },
    }
    quote = () =>
      json({
        total: 21,
        lastRefund: true,
        suggested: [{ method: 'CARD', amount: 21 }],
        cardLimit: 21,
        payOutLimit: 21,
        reduceBalance: 0,
      })
  }

  it.each(['en', 'ar'])(
    'holds the refund on a code the sale would refuse (%s)',
    async (language) => {
      await i18n.changeLanguage(language)
      splitSale()
      refundPage()
      fireEvent.click(await screen.findByRole('checkbox'))
      const code = await screen.findByLabelText(i18n.t('pos.pay.approvalCode'))
      fireEvent.change(code, { target: { value: 'bad ref! ؟؟' } })
      expect(await screen.findByText(i18n.t('pos.refund.approvalInvalid'))).toBeTruthy()
      const go = screen.getByRole('button', {
        name: i18n.t('pos.refund.refundAmount', { amount: '21.000' }),
      }) as HTMLButtonElement
      expect(go.disabled).toBe(true)
      fireEvent.change(code, { target: { value: 'GOOD5678' } })
      expect(screen.queryByText(i18n.t('pos.refund.approvalInvalid'))).toBeNull()
      fireEvent.click(go)
      await waitFor(() => expect(refunds).toHaveLength(1))
      expect(refunds[0].moneyBack).toEqual([{ method: 'CARD', amount: 21, reference: 'GOOD5678' }])
      await i18n.changeLanguage('en')
    },
  )

  it('stays optional', async () => {
    splitSale()
    refundPage()
    fireEvent.click(await screen.findByRole('checkbox'))
    await screen.findByLabelText(i18n.t('pos.pay.approvalCode'))
    const go = screen.getByRole('button', {
      name: i18n.t('pos.refund.refundAmount', { amount: '21.000' }),
    }) as HTMLButtonElement
    expect(go.disabled).toBe(false)
  })
})

const TILL_DTO = { ...TILL, openNumbers: false } as unknown as PosTillDto
const READY = {
  status: 'ready',
  till: TILL_DTO,
  branchId: 'b-1',
  branchName: 'Nizwa',
  can: { sell: true, close: true, refund: true, manage: true },
} as unknown as Extract<TillState, { status: 'ready' }>

const buyerSale = (): PosSaleRequest =>
  ({
    tillId: 'till-1',
    soldAt: '2026-11-01T08:00:00Z',
    queuedOffline: false,
    invoiceNumber: null,
    customer: {
      kind: 'CONSUMER',
      consumer: { name: 'Saif', identifierScheme: 'CID', identifierValue: '99887766' },
    },
    draft: {},
    lineRefs: [],
    payments: [{ method: 'CASH', amount: 5, tendered: 5 }],
    tip: null,
  }) as unknown as PosSaleRequest

const refused = (code: string) => () =>
  json({ type: 'about:blank', status: 400, code, detail: 'not shown' }, 400)

describe('a device that cannot encrypt (decision 3)', () => {
  const panel = () =>
    render(
      <MemoryRouter>
        <PosQueuePanel till={READY} />
      </MemoryRouter>,
    )

  it.each(['en', 'ar'])(
    'says the refused sale with a buyer cannot be filed from this device (%s)',
    async (language) => {
      await i18n.changeLanguage(language)
      setPosVault(memoryVault(false))
      // The queue fills while offline; then the server refuses the sale for good.
      saleReply = () => {
        throw new TypeError('Failed to fetch')
      }
      await submitSale(TILL_DTO, buyerSale(), 'pos-sale-key-noseal-1')
      saleReply = refused('POS_PAYMENT_INVALID')
      await flushQueue('till-1')
      const [entry] = queuedFor('till-1')
      expect(entry).toMatchObject({ final: true, buyerRemoved: true })
      expect(entry.body.customer.consumer).toBeUndefined()
      panel()
      expect(screen.getByText(i18n.t('pos.queue.buyerRemovedHint'))).toBeTruthy()
      expect(screen.queryByText(i18n.t('pos.queue.finalHint'))).toBeNull()
      // Neither can work without the buyer, so neither is offered.
      expect(screen.queryByRole('button', { name: i18n.t('pos.queue.retry') })).toBeNull()
      expect(screen.queryByRole('button', { name: i18n.t('pos.queue.correct') })).toBeNull()
      await i18n.changeLanguage('en')
    },
  )

  it('a device that can seal keeps both ways of sending it again', async () => {
    setPosVault(memoryVault(true))
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    await submitSale(TILL_DTO, buyerSale(), 'pos-sale-key-noseal-2')
    saleReply = refused('POS_PAYMENT_INVALID')
    await flushQueue('till-1')
    panel()
    expect(screen.queryByText(i18n.t('pos.queue.buyerRemovedHint'))).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('pos.queue.retry') })).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('pos.queue.correct') })).toBeTruthy()
  })
})

const finished = (patch: Record<string, unknown>) =>
  setFinishedSale({
    lines: SAMPLE_SALE,
    totals: totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT),
    tip: 0,
    change: 0,
    company: null,
    buyer: { name: 'Saif Al Busaidi', identifierScheme: 'CID', identifierValue: '99887766' },
    payments: [{ method: 'cash', amount: 5649 }],
    sale: null,
    queuedNumber: 'NZW-T01-INV-2026-000049',
    finishedAt: '2026-11-01T10:00:00Z',
    ...patch,
  })

const SOLD = {
  saleId: 's-1',
  invoiceId: 'i-1',
  invoiceNumber: 'NZW-T01-INV-2026-000050',
  transactionType: 'FULL_TAX',
  receivedAt: '2026-11-01T10:00:00Z',
  cashier: { userId: 'u-1', name: 'Maryam' },
  receipt: { invoiceTotal: 5.649, tip: 0, qr: { status: 'NONE' } },
  filing: { dispatchState: 'SENT', acceptedAt: null },
  warnings: [],
}

describe('the civil ID on the receipt (decision 4)', () => {
  it('leaves the last four, as the server masks it, and only for a person', () => {
    expect(maskedIdentifier('CID', '99887766')).toBe('•••• 7766')
    expect(maskedIdentifier('PASNUM', 'A 1234567')).toBe('•••• 4567')
    expect(maskedIdentifier('CID', '1234')).toBe('••••')
    expect(maskedIdentifier('CID', '•••• 7766')).toBe('•••• 7766')
    expect(maskedIdentifier('CR', '1234567')).toBe('1234567')
    expect(maskedIdentifier('OTHID', 'ABC-1')).toBe('ABC-1')
  })

  it.each([
    ['queued', {}],
    ['online', { sale: SOLD, queuedNumber: null }],
  ])('a %s receipt never prints the whole number', async (_kind, patch) => {
    finished(patch)
    const { container } = at('/pos/receipt')
    await screen.findByText('Saif Al Busaidi')
    expect(screen.getByText('•••• 7766')).toBeTruthy()
    expect(container.textContent).not.toContain('99887766')
  })

  it('a company with a person’s ID is masked too; its CR is not', async () => {
    finished({
      buyer: null,
      company: {
        id: 'c-1',
        name: 'Saif Trading',
        kind: 'BUSINESS',
        vat: null,
        identifier: { scheme: 'CID', value: '99887766' },
      },
    })
    const first = at('/pos/receipt')
    await screen.findByText('Saif Trading')
    expect(first.container.textContent).not.toContain('99887766')
    first.unmount()
    finished({
      buyer: null,
      company: {
        id: 'c-2',
        name: 'CR Trading',
        kind: 'BUSINESS',
        vat: null,
        identifier: { scheme: 'CR', value: '1234567' },
      },
    })
    at('/pos/receipt')
    await screen.findByText('CR Trading')
    expect(screen.getByText('1234567')).toBeTruthy()
  })

  it('the invoice data keeps the whole number, in the online body and on the resend', async () => {
    setPosVault(memoryVault(true))
    const bodies: PosSaleRequest[] = []
    const stub = vi.mocked(fetch)
    const original = stub.getMockImplementation()!
    stub.mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/pos/sales' && init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)))
      }
      return original(input, init)
    })
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    await submitSale(TILL_DTO, buyerSale(), 'pos-sale-key-mask-1')
    saleReply = () => json(SOLD, 201)
    await flushQueue('till-1')
    expect(bodies.at(-1)?.customer.consumer?.identifierValue).toBe('99887766')
    expect(queuedFor('till-1')).toEqual([])
  })
})

describe('the warnings of a queued sale with no HS code (decision 5)', () => {
  it.each(['en', 'ar'])('both have real wording (%s)', async (language) => {
    await i18n.changeLanguage(language)
    expect(i18n.exists('pos.warning.POS_GOODS_FLAG_CLEARED')).toBe(true)
    expect(i18n.t('pos.warning.POS_GOODS_FLAG_CLEARED', { line: 2 })).toContain(
      language === 'ar' ? '2' : 'Line 2',
    )
    // RC2 never sends it, and its "filed once the item has a code" was false (held-invoice contract §4).
    expect(i18n.exists('pos.warning.POS_HS_CODE_MISSING_ACCEPTED')).toBe(false)
    await i18n.changeLanguage('en')
  })

  const walkIn = (): PosSaleRequest =>
    ({
      ...buyerSale(),
      customer: { kind: 'WALK_IN' },
    }) as unknown as PosSaleRequest

  it.each([['POS_GOODS_FLAG_CLEARED', 'filed without the flag']])('%s from the background send reaches the next sale, named (%s)', async (code) => {
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    await submitSale(TILL_DTO, walkIn(), 'pos-sale-key-hs-1')
    saleReply = () =>
      json(
        {
          ...SOLD,
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          warnings: [{ code, line: 2, message: 'not shown' }],
        },
        201,
      )
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])

    saleReply = () => json(SOLD, 201)
    const next = await submitSale(TILL_DTO, walkIn(), 'pos-sale-key-hs-2')
    expect('sale' in next && next.sale.warnings).toEqual([
      { code, line: 2, filed: 'NZW-T01-INV-2026-000049' },
    ])
    // Told once.
    const after = await submitSale(TILL_DTO, walkIn(), 'pos-sale-key-hs-3')
    expect('sale' in after && after.sale.warnings).toEqual([])

    finished({
      sale: 'sale' in next ? next.sale : null,
      queuedNumber: null,
      buyer: null,
    })
    const { container } = at('/pos/receipt')
    await screen.findByText(/Line 2/)
    expect(container.textContent).toContain('NZW-T01-INV-2026-000049')
  })

  it('another warning of a queued sale leaves nothing for the next sale, as before', async () => {
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    await submitSale(TILL_DTO, walkIn(), 'pos-sale-key-hs-4')
    saleReply = () =>
      json({ ...SOLD, warnings: [{ code: 'STOCK_BELOW_ZERO', line: 1, message: 'x' }] }, 201)
    await flushQueue('till-1')
    saleReply = () => json(SOLD, 201)
    const next = await submitSale(TILL_DTO, walkIn(), 'pos-sale-key-hs-5')
    expect('sale' in next && next.sale.warnings).toEqual([])
  })
})

describe('a given-away line alone on a server that cannot take it (decision 6)', () => {
  const GIVEN = { ...LINE, discount: { type: 'PERCENTAGE', value: 100 } }

  it.each(['en', 'ar'])(
    'says so in plain words and sends nothing, in place of the money refusal (%s)',
    async (language) => {
      await i18n.changeLanguage(language)
      lookup = { ...LOOKUP, lines: [GIVEN], total: 0 }
      refundPage()
      fireEvent.click(await screen.findByRole('checkbox'))
      expect(await screen.findByText(i18n.t('pos.refund.givenAwayOldServer'))).toBeTruthy()
      const go = screen.getByRole('button', {
        name: i18n.t('pos.refund.refundAmount', { amount: '0.000' }),
      }) as HTMLButtonElement
      expect(go.disabled).toBe(true)
      expect(refunds).toEqual([])
      await i18n.changeLanguage('en')
    },
  )

  it('with a paid line it goes as usual, and a server that marks the line needs none of it', async () => {
    lookup = { ...LOOKUP, lines: [LINE, { ...GIVEN, lineNumber: 2 }] }
    refundPage()
    const [paid] = await screen.findAllByRole('checkbox')
    fireEvent.click(paid)
    await screen.findByRole('button', {
      name: i18n.t('pos.refund.refundAmount', { amount: '21.000' }),
    })
    expect(screen.queryByText(i18n.t('pos.refund.givenAwayOldServer'))).toBeNull()
  })

  it('a line the server marks given free is the stock return, not this', async () => {
    lookup = { ...LOOKUP, lines: [{ ...GIVEN, givenFree: true }], total: 0 }
    refundPage()
    fireEvent.click(await screen.findByRole('checkbox'))
    await screen.findByRole('button', { name: i18n.t('pos.refund.stockReturnButton') })
    expect(screen.queryByText(i18n.t('pos.refund.givenAwayOldServer'))).toBeNull()
  })
})
