import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosRefundPage } from './PosRefundPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  chooseCash,
  moneyBackLines,
  refundLines,
  splitFromQuote,
  splitProblem,
} from '../../lib/posRefund'
import { figuresOf } from '../../lib/posClose'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import type { PosClosePreviewDto, PosRefundQuoteDto } from '../../api/pos/pos'

/** The money back of a split sale (Abdul, 1 Nov 2026), on a server with the quote and one without. */

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.refund'],
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
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const LOOKUP = {
  saleId: 'sale-1',
  invoiceId: 'inv-1',
  invoiceNumber: 'NZW-T01-INV-2026-000001',
  soldAt: '2026-10-28T08:00:00Z',
  transactionType: 'SIMPLIFIED',
  branch: { id: 'b-1', name: 'Nizwa' },
  customer: { kind: 'WALK_IN', customerId: 'c-1', name: 'Walk-in customer' },
  headerDiscount: null,
  lines: [
    {
      lineNumber: 1,
      role: 'ITEM',
      productId: 'p-1',
      description: 'Lunch',
      quantitySold: 3,
      quantityRefunded: 0,
      unitPrice: 4.452,
      discount: null,
      vatRate: 5,
      vatCategory: 'S',
      refundable: true,
    },
  ],
  paid: {
    byMethod: [
      { method: 'CARD', amount: 10 },
      { method: 'CASH', amount: 4.025 },
    ],
    total: 14.025,
    paidBack: 0,
  },
  total: 14.025,
  tip: 0,
  tipMethod: null,
  filing: null,
  credited: 0,
  owed: 0,
  creditNoteNumbers: [],
}

const QUOTE: PosRefundQuoteDto = {
  total: 14.025,
  lastRefund: true,
  suggested: [
    { method: 'CARD', amount: 10 },
    { method: 'CASH', amount: 4.025 },
  ],
  cardLimit: 10,
  payOutLimit: 14.025,
  reduceBalance: 0,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let lookup: typeof LOOKUP
let quote: () => Response
let refund: () => Response
let quotes: unknown[]
let refunds: { moneyBack: unknown[] }[]

const REFUNDED = {
  refundId: 'r-1',
  saleId: 'sale-1',
  creditNoteId: 'cn-1',
  creditNoteNumber: 'NZW-T01-CRN-2026-000001',
  totals: {},
  warnings: [],
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale([])
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  quotes = []
  refunds = []
  lookup = LOOKUP
  quote = () => json(QUOTE)
  refund = () => json(REFUNDED, 201)
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
      if (url === '/api/v1/pos/sales/sale-1/refund-quote') {
        quotes.push(JSON.parse(String(init?.body)))
        return quote()
      }
      if (url === '/api/v1/pos/sales/sale-1/refunds' && init?.method === 'POST') {
        refunds.push(JSON.parse(String(init.body)))
        return refund()
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const showPage = () =>
  render(
    <MemoryRouter initialEntries={['/pos/refund?invoice=NZW-T01-INV-2026-000001']}>
      <Routes>
        <Route path="/pos/refund" element={<PosRefundPage />} />
      </Routes>
    </MemoryRouter>,
  )

const open = async () => {
  showPage()
  fireEvent.click(await screen.findByText(i18n.t('pos.refund.allOfIt')))
}

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement

const refundButton = () => screen.getByRole('button', { name: /^Refund/ }) as HTMLButtonElement

describe('the refund page on a server with the quote', () => {
  it('fills the sale split from the server, and sends it with the approval reference', async () => {
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    expect(field('Cash').value).toBe('4.025')
    expect(quotes).toEqual([
      { tillId: 'till-1', lines: [{ lineNumber: 1, quantity: 3, backOnShelf: false }] },
    ])
    expect(document.body.textContent).toMatch(/Up to .*10\.000 can go back to the card/)

    fireEvent.change(field(i18n.t('pos.pay.approvalCode')), { target: { value: 'AUTH-77' } })
    fireEvent.click(refundButton())
    await waitFor(() => expect(refunds).toHaveLength(1))
    expect(refunds[0].moneyBack).toEqual([
      { method: 'CARD', amount: 10, reference: 'AUTH-77' },
      { method: 'CASH', amount: 4.025 },
    ])
  })

  it('takes the reference the sale takes: up to the 40 the field allows, no Arabic figures', async () => {
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    const approval = field(i18n.t('pos.pay.approvalCode'))
    expect(approval.maxLength).toBe(40)
    fireEvent.change(approval, { target: { value: 'رقم١٢' } })
    expect(refundButton().disabled).toBe(true)
    fireEvent.change(approval, { target: { value: 'AUTH-12' } })
    fireEvent.click(refundButton())
    await waitFor(() => expect(refunds).toHaveLength(1))
    expect(refunds[0].moneyBack[0]).toMatchObject({ method: 'CARD', reference: 'AUTH-12' })
  })

  it('uses the server total over the estimate', async () => {
    quote = () =>
      json({
        ...QUOTE,
        total: 14.024,
        suggested: [
          { method: 'CARD', amount: 10 },
          { method: 'CASH', amount: 4.024 },
        ],
      })
    await open()
    await waitFor(() => expect(field('Cash').value).toBe('4.024'))
    expect(refundButton().textContent).toContain('14.024')
  })

  it('keeps the route the server gave: the card cannot be moved into cash (FIN-A5)', async () => {
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    expect(field('Card').readOnly).toBe(true)
    expect(field('Cash').readOnly).toBe(true)
    expect(field('Bank transfer').readOnly).toBe(true)
    expect(screen.getByText(i18n.t('pos.refund.routeFixed'))).toBeTruthy()
    fireEvent.change(field('Cash'), { target: { value: '14.025' } })
    fireEvent.blur(field('Cash'))
    fireEvent.change(field('Card'), { target: { value: '6.000' } })
    fireEvent.blur(field('Card'))
    expect(field('Card').value).toBe('10.000')
    expect(field('Cash').value).toBe('4.025')
    fireEvent.click(refundButton())
    await waitFor(() => expect(refunds).toHaveLength(1))
    expect(refunds[0].moneyBack).toEqual([
      { method: 'CARD', amount: 10, reference: null },
      { method: 'CASH', amount: 4.025 },
    ])
  })

  it('stops a quote that sends more to the card than it can take', async () => {
    quote = () => json({ ...QUOTE, cardLimit: 9 })
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    expect(screen.getByRole('alert').textContent).toMatch(
      /At most .*9\.000 can go back to the card/,
    )
    expect(refundButton().disabled).toBe(true)
  })

  it('stops a route that does not add up when the server names nothing to choose', async () => {
    quote = () => json({ ...QUOTE, suggested: [{ method: 'CARD', amount: 10 }] })
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    expect(screen.getByRole('alert').textContent).toMatch(
      /does not add up to .*14\.025 the way the sale was paid/,
    )
    expect(field('Cash').readOnly).toBe(true)
    expect(refundButton().disabled).toBe(true)
  })

  it('blocks a refund the route sends by bank transfer: no beneficiary check exists yet', async () => {
    lookup = {
      ...LOOKUP,
      paid: { ...LOOKUP.paid, byMethod: [{ method: 'TRANSFER', amount: 14.025 }] },
    } as typeof LOOKUP
    quote = () =>
      json({ ...QUOTE, suggested: [{ method: 'TRANSFER', amount: 14.025 }], cardLimit: 0 })
    await open()
    await waitFor(() => expect(field('Bank transfer').value).toBe('14.025'))
    expect(screen.getByRole('alert').textContent).toContain(
      i18n.t('pos.refund.transferUnverified'),
    )
    expect(screen.queryByLabelText(new RegExp(`^${i18n.t('pos.pay.transferReference')}`))).toBeNull()
    expect(refundButton().disabled).toBe(true)
    fireEvent.click(refundButton())
    expect(refunds).toEqual([])
  })

  it('words the server refusal, and asks again for what is left now', async () => {
    refund = () =>
      json(
        { status: 422, code: 'POS_REFUND_CARD_MORE_THAN_PAID', maxCard: 4.75, requested: 10 },
        422,
      )
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    fireEvent.click(refundButton())
    await waitFor(() =>
      expect(screen.getByText(/At most 4\.750 can go back to the card/)).toBeTruthy(),
    )
    await waitFor(() => expect(quotes).toHaveLength(2))
  })

  it('shows what a company owes as going to its account, with nothing to change', async () => {
    quote = () =>
      json({
        ...QUOTE,
        suggested: [{ method: 'REDUCE_BALANCE', amount: 14.025 }],
        cardLimit: 0,
        payOutLimit: 0,
        reduceBalance: 14.025,
      })
    await open()
    await screen.findByText(/comes off what they owe/)
    expect(screen.queryByLabelText(/^Card/)).toBeNull()
    fireEvent.click(refundButton())
    await waitFor(() => expect(refunds).toHaveLength(1))
    expect(refunds[0].moneyBack).toEqual([{ method: 'REDUCE_BALANCE', amount: 14.025 }])
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    await open()
    await screen.findByText(i18n.t('pos.refund.howItGoesBack'))
    expect(i18n.t('pos.refund.howItGoesBack')).not.toBe('How it goes back')
    expect(i18n.t('pos.refusal.POS_REFUND_CARD_MORE_THAN_PAID', { maxCard: '1.000' })).toContain(
      '1.000',
    )
  })
})

describe('the money back sentence before a line is ticked', () => {
  const paidBy = (...byMethod: { method: string; amount: number }[]) => {
    lookup = { ...LOOKUP, paid: { ...LOOKUP.paid, byMethod } } as typeof LOOKUP
  }

  it('names every way a split sale was paid, not just cash', async () => {
    showPage()
    await screen.findByText(/the way it was paid: Card · Cash\./)
  })

  it('names the one way a sale paid once was paid', async () => {
    paidBy({ method: 'CARD', amount: 14.025 })
    showPage()
    await screen.findByText(/the way it was paid: Card\./)
  })

  it('names on account too, as the server lists a part left on account', async () => {
    paidBy({ method: 'CASH', amount: 4 }, { method: 'ON_ACCOUNT', amount: 10.025 })
    lookup = { ...lookup, owed: 10.025 }
    showPage()
    await screen.findByText(/the way it was paid: Cash · On account\./)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    showPage()
    const card = i18n.t('pos.refund.method.CARD')
    const cash = i18n.t('pos.refund.method.CASH')
    await screen.findByText(new RegExp(`${card} · ${cash}\\.`))
  })

  it('on a server without the quote, still names every way it was paid', async () => {
    quote = () => json({ type: 'about:blank', status: 404 }, 404)
    await open()
    await waitFor(() => expect(quotes).toHaveLength(1))
    await screen.findByText(/the way it was paid: Card · Cash\./)
  })
})

describe('the refund page without a quote (A-03: no one-method fallback)', () => {
  it.each([404, 503])('refunds nothing when the quote route answers %s', async (status) => {
    quote = () => json({ type: 'about:blank', status }, status)
    await open()
    await waitFor(() => expect(quotes).toHaveLength(1))
    await screen.findByText(i18n.t('pos.refund.quoteUnavailable'))
    expect(screen.queryByText(i18n.t('pos.refund.howItGoesBack'))).toBeNull()
    expect(refundButton().disabled).toBe(true)
    fireEvent.click(refundButton())
    expect(refunds).toEqual([])
  })

  it('words a refusal of the lines by its code, and refunds nothing', async () => {
    quote = () =>
      json({ status: 422, code: 'POS_REFUND_LINE_INVALID', detail: 'not shown' }, 422)
    await open()
    await screen.findByText(i18n.t('pos.refusal.POS_REFUND_LINE_INVALID'))
    expect(document.body.textContent).not.toContain('not shown')
    expect(refundButton().disabled).toBe(true)
  })
})

describe('money the quote leaves to choose', () => {
  it('is never put in cash by itself: the refund waits until the cashier puts it under cash', async () => {
    quote = () =>
      json({ ...QUOTE, suggested: [{ method: 'CARD', amount: 10 }], toChoose: 4.025 })
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    expect(field('Cash').value).toBe('0.000')
    expect(field('Cash').readOnly).toBe(false)
    expect(document.body.textContent).toMatch(/4\.025 cannot go back the way the sale was paid/)
    expect(screen.getByRole('alert').textContent).toMatch(/4\.025 still has to be put under cash/)
    expect(refundButton().disabled).toBe(true)
    // Transfer is shown, not offered: typing there changes nothing.
    fireEvent.change(field('Bank transfer'), { target: { value: '4.025' } })
    fireEvent.blur(field('Bank transfer'))
    expect(field('Bank transfer').value).toBe('0.000')
    expect(refundButton().disabled).toBe(true)
    // More than is left to choose is held at what is left; the card is untouched.
    fireEvent.change(field('Cash'), { target: { value: '9.000' } })
    fireEvent.blur(field('Cash'))
    await waitFor(() => expect(field('Cash').value).toBe('4.025'))
    expect(field('Card').value).toBe('10.000')
    await waitFor(() => expect(refundButton().disabled).toBe(false))
    fireEvent.click(refundButton())
    await waitFor(() => expect(refunds).toHaveLength(1))
    expect(refunds[0].moneyBack).toEqual([
      { method: 'CARD', amount: 10, reference: null },
      { method: 'CASH', amount: 4.025 },
    ])
  })
})

describe('a line with an unclear credit (DEC-30-01)', () => {
  it('is not offered, and the page says why', async () => {
    lookup = {
      ...LOOKUP,
      lines: [
        ...LOOKUP.lines,
        {
          ...LOOKUP.lines[0],
          lineNumber: 2,
          description: 'Juice',
          refundable: false,
          creditUnclear: true,
        },
      ],
    } as typeof LOOKUP
    showPage()
    await screen.findByText(i18n.t('pos.refund.creditUnclear', { name: 'Juice' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })
})

describe('the split in baisa', () => {
  const split = splitFromQuote(QUOTE)

  it('puts what is left to choose under cash, never more and never below the routed cash (FIN-A5)', () => {
    const route = { card: 10000, cash: 0, transfer: 0, reduce: 0 }
    expect(chooseCash(route, route, 4025, 2000)).toEqual({ ...route, cash: 2000 })
    expect(chooseCash(route, route, 4025, 9000)).toEqual({ ...route, cash: 4025 })
    expect(chooseCash(route, route, 4025, -5)).toEqual(route)
    // Nothing to choose: the routed cash stays exactly as quoted, and the card never moves.
    expect(chooseCash(split, split, 0, 14025)).toEqual(split)
    expect(chooseCash(split, split, 0, 0)).toEqual(split)
  })

  it('says when it cannot go', () => {
    expect(splitProblem(split, split, 0, 14025, 10000)).toBeNull()
    expect(splitProblem(split, split, 0, 14025, 9000)).toBe('overCard')
    expect(splitProblem({ ...split, card: 6000, cash: 8025 }, split, 0, 14025, 10000)).toBe(
      'offRoute',
    )
    expect(splitProblem({ ...split, cash: 1 }, split, 0, 14025, 10000)).toBe('offRoute')
    const cardOnly = { card: 10000, cash: 0, transfer: 0, reduce: 0 }
    expect(splitProblem(cardOnly, cardOnly, 4025, 14025, 10000)).toBe('toChooseLeft')
    expect(splitProblem({ ...cardOnly, cash: 4025 }, cardOnly, 4025, 14025, 10000)).toBeNull()
    expect(splitProblem(cardOnly, cardOnly, 0, 14025, 10000)).toBe('notAsQuoted')
    // A toChoose the route and the total do not leave room for is the server's to explain.
    expect(splitProblem(cardOnly, cardOnly, 1000, 14025, 10000)).toBe('notAsQuoted')
    const byTransfer = { card: 0, cash: 0, transfer: 14025, reduce: 0 }
    expect(splitProblem(byTransfer, byTransfer, 0, 14025, 0)).toBe('transferUnverified')
  })

  it('leaves out a method given nothing and a blank reference', () => {
    expect(
      moneyBackLines(
        { card: 500, cash: 0, transfer: 0, reduce: 0 },
        { approval: ' ', transfer: '' },
      ),
    ).toEqual([{ method: 'CARD', amount: 0.5, reference: null }])
  })
})

describe('refundLines', () => {
  it('numbers lines by the sale and states an HS code only where one was chosen', () => {
    expect(
      refundLines(
        [
          { lineNumber: 1, qty: 2 },
          { lineNumber: 3, qty: 0 },
          { lineNumber: 4, qty: 1 },
        ],
        true,
        { 4: '000000000000', 1: '  ' },
      ),
    ).toEqual([
      { lineNumber: 1, quantity: 2, backOnShelf: true },
      { lineNumber: 4, quantity: 1, backOnShelf: true, hsCode: '000000000000' },
    ])
  })
})

describe('the close, card refunds', () => {
  const preview = (terminal: number) =>
    ({
      openingFloat: 0,
      cashRefunded: 0,
      paidOut: 0,
      paidIn: 0,
      expectedCash: 0,
      companyInvoices: 0,
      salesAmount: 10,
      salesCount: 1,
      byMethod: [{ method: 'CARD', sales: 1, taken: 10, refunded: 3.333, tips: 0 }],
      looseEnds: { cardSalesForTerminalCheck: { count: 1, amount: terminal } },
    }) as unknown as PosClosePreviewDto

  it('reads what went back to cards, and whether the machine figure already took it off', () => {
    expect(figuresOf(preview(6.667))).toMatchObject({
      cardRefunded: 3333,
      terminal: 6667,
      terminalNet: true,
    })
    expect(figuresOf(preview(10)).terminalNet).toBe(false)
  })
})

describe('the sale document ceiling (PRV43-CMP F3-1, owner round 12)', () => {
  it.each(['CREDIT_NOTE_NOTHING_CORRECTABLE', 'CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT'])(
    'a %s refusal of the refund is worded by its code on the page, not "Try again"',
    async (code) => {
      refund = () => json({ status: 409, code, detail: 'not shown' }, 409)
      await open()
      await waitFor(() => expect(field('Card').value).toBe('10.000'))
      fireEvent.change(field(i18n.t('pos.pay.approvalCode')), { target: { value: 'AUTH-77' } })
      fireEvent.click(refundButton())
      await waitFor(() => expect(refunds).toHaveLength(1))
      expect(await screen.findByText(i18n.t(`pos.refusal.${code}`))).toBeTruthy()
      expect(screen.queryByText(i18n.t('pos.refusal.failed'))).toBeNull()
      expect(document.body.textContent).not.toContain('not shown')
    },
  )

  it('a ceiling code the till does not know still reads as the general failure', async () => {
    refund = () => json({ status: 409, code: 'CREDIT_NOTE_SOMETHING_NEW', detail: 'not shown' }, 409)
    await open()
    await waitFor(() => expect(field('Card').value).toBe('10.000'))
    fireEvent.change(field(i18n.t('pos.pay.approvalCode')), { target: { value: 'AUTH-77' } })
    fireEvent.click(refundButton())
    await waitFor(() => expect(refunds).toHaveLength(1))
    expect(await screen.findByText(i18n.t('pos.refusal.failed'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('not shown')
  })
})
