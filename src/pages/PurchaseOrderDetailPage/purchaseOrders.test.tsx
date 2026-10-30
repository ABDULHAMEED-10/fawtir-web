import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { GoodsReceiptDto, PurchaseOrderDto } from '../../api/expenditure/purchaseOrders'
import {
  acceptsReceipts,
  canCancel,
  draftTotals,
  emptyLine,
  fullyReceived,
  lineProblem,
  nextAction,
  outstandingOn,
  receivedByLine,
} from '../../lib/purchaseOrders'
import { PurchaseOrderDetailPage } from './PurchaseOrderDetailPage'
import { NewPurchaseOrderPage } from '../NewPurchaseOrderPage'
import { answerStanding, settle, standingRead } from '../../testing/subscriptionStanding'

// The pages render slowly on a loaded machine; the default second is not enough for a find.
configure({ asyncUtilTimeout: 15000 })

const ORDER_ID = '90000000-0000-0000-0000-000000000001'
const LINE_A = '90000000-0000-0000-0000-00000000000a'
const LINE_B = '90000000-0000-0000-0000-00000000000b'

const BUYER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['purchase-order.read', 'purchase-order.manage'],
  scopes: [],
  featureFlags: {},
}

const APPROVER: Entitlements = {
  ...BUYER,
  permissions: [...BUYER.permissions, 'purchase-order.approve'],
}

function order(over: Partial<PurchaseOrderDto> = {}): PurchaseOrderDto {
  return {
    id: ORDER_ID,
    supplierId: 's-1',
    number: 'PO-0001',
    state: 'DRAFT',
    orderDate: '2026-09-01',
    wantedBy: '2026-09-20',
    deliverToBranchId: null,
    yourReference: 'REF-9',
    supplierNote: null,
    currency: 'OMR',
    totalNet: 100,
    totalVat: 5,
    totalGross: 105,
    lines: [
      {
        id: LINE_A,
        lineNo: 1,
        description: 'Arabica beans',
        quantity: 10,
        unit: 'kg',
        unitPrice: 8,
        vatRate: 5,
        lineNet: 80,
        vatAmount: 4,
      },
      {
        id: LINE_B,
        lineNo: 2,
        description: 'Filters',
        quantity: 4,
        unit: 'box',
        unitPrice: 5,
        vatRate: 5,
        lineNet: 20,
        vatAmount: 1,
      },
    ],
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    sentAt: null,
    cancelledAt: null,
    createdBy: 'u-1',
    version: 1,
    ...over,
  }
}

const SUPPLIER = {
  profile: {
    id: 's-1',
    type: 'BUSINESS',
    displayName: 'Muscat Roastery Co',
    legalName: 'Muscat Roastery Company LLC',
    vatNumber: 'OM1100447102',
    registeredForVat: true,
    registeredOnPeppol: true,
    participantScheme: '0248',
    participantValue: 'OM1100447102',
    participantId: '0248:OM1100447102',
    defaultCurrency: 'OMR',
    defaultTaxCategory: 'S5',
    paymentTerms: 'NET30',
    defaultPaymentMethod: '30',
    bankDetails: null,
    contactPerson: null,
    roleTitle: null,
    emailRecipients: [],
    telephone: null,
    mobilePhone: null,
    preferredLanguage: 'en',
    receivingChannel: 'PEPPOL',
    requiresApprovalBeforePayment: true,
    earlyPaymentDiscountPercent: 2,
    earlyPaymentDiscountDays: 7,
    commercialRegistrationNumber: null,
    notes: null,
    supplierCategory: null,
    selfBillingAgreement: false,
    health: [],
    supplierSince: '2024-09-02',
    switchedOffAt: null,
    status: 'ACTIVE',
    customerStatus: 'ACTIVE',
    version: 1,
  },
  invoiceAddress: null,
  sameAsInvoicingAddress: true,
  deliveryAddress: null,
}

/** A counted product with two sizes, as `GET /v1/products/{id}` answers it. */
const BEANS = {
  id: 'p-beans',
  code: 'YIRG',
  name: 'Yirgacheffe beans',
  description: null,
  defaultUnitCode: 'KGM',
  defaultUnitPrice: 7.4,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  active: true,
  version: 1,
  keepCount: true,
  variants: [
    {
      id: 'v-1kg',
      sizeId: 's-1',
      size: '1 kg',
      optionId: null,
      option: null,
      name: 'Yirgacheffe beans · 1 kg',
      code: 'YIRG-1',
      priceOverride: null,
      price: 7.4,
      onSale: true,
    },
    {
      id: 'v-5kg',
      sizeId: 's-5',
      size: '5 kg',
      optionId: null,
      option: null,
      name: 'Yirgacheffe beans · 5 kg',
      code: 'YIRG-5',
      priceOverride: null,
      price: 34,
      onSale: true,
    },
  ],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let current: PurchaseOrderDto
let receipts: GoodsReceiptDto[]
let actions: string[]
let bookedBody: unknown
let createdBody: unknown
/** The variants the product search row carries: null as before, an array with backend #808. */
let listedVariants: unknown[] | null
/** What `GET /purchase-orders/{id}` answers when it is not the order itself. */
let orderRefused: number | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = APPROVER
  current = order()
  receipts = []
  actions = []
  bookedBody = null
  createdBody = null
  orderRefused = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.includes('/me/entitlements')) return json(200, who)
    if (url.includes(`/purchase-orders/${ORDER_ID}/receipts`)) {
      if (init?.method === 'POST') {
        bookedBody = JSON.parse(String(init.body))
        return json(201, {
          id: 'r-1',
          purchaseOrderId: ORDER_ID,
          number: 'GR-1',
          receivedOn: '2026-09-18',
          checkedInBy: 'u-1',
          note: null,
          lines: [],
        })
      }
      return json(200, receipts)
    }
    const move = url.match(/\/purchase-orders\/[^/]+\/(submit|approve|send|cancel|close)$/)
    if (move && init?.method === 'POST') {
      actions.push(move[1])
      return json(200, current)
    }
    if (url.includes(`/purchase-orders/${ORDER_ID}`))
      return orderRefused ? json(orderRefused) : json(200, current)
    if (url.endsWith('/api/v1/purchase-orders') && init?.method === 'POST') {
      createdBody = JSON.parse(String(init.body))
      return json(201, order({ state: 'DRAFT' }))
    }
    if (url.includes('/api/v1/purchase-orders?'))
      return json(200, {
        items: [order({ id: 'po-old', number: 'PO-0000', state: 'CLOSED' })],
        page: 0,
        pageSize: 1,
        count: 1,
      })
    if (url.includes('/api/v1/products/p-beans')) return json(200, BEANS)
    if (url.includes('/api/v1/products?'))
      return json(200, {
        content: [{ ...BEANS, variants: listedVariants, effectivePrice: 7.4 }],
        totalElements: 1,
        number: 0,
        size: 20,
      })
    if (url.endsWith('/api/v1/suppliers/s-1')) return json(200, SUPPLIER)
    if (url.endsWith('/api/v1/suppliers/s-1/overview'))
      return json(200, {
        tabs: { bills: 3, payments: 1, orders: 2, documents: 0 },
        match: { agreed: 3, orderBacked: 3, summary: null },
        usualLeadTimeDays: 6,
        payables: {
          currencyCode: 'OMR',
          notDue: { amount: 0, bills: 0, nextDue: null },
          dueSoon: { amount: 0, bills: 0, nextDue: null },
          late: { amount: 0, bills: 0, nextDue: null },
          onHold: { amount: 0, bills: 0, nextDue: null },
          everLate: false,
          total: 0,
        },
      })
    if (url.endsWith('/api/v1/suppliers/s-1/contacts')) return json(200, [])
    if (url.endsWith('/api/v1/branches'))
      return json(200, [
        { id: 'br-1', code: 'NZW', name: 'Souq Street', type: 'BRANCH', city: 'Nizwa' },
      ])
    return json(404)
  })
  listedVariants = null
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={[`/expenditure/purchase-orders/${ORDER_ID}`]}>
      <Routes>
        <Route path="/expenditure/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('the purchase-order state machine', () => {
  it('offers the one move each state allows, and none from a terminal one', () => {
    expect(nextAction('DRAFT')).toBe('submit')
    expect(nextAction('AWAITING_APPROVAL')).toBe('approve')
    expect(nextAction('APPROVED')).toBe('send')
    expect(nextAction('RECEIVED')).toBe('close')
    // These two advance by goods arriving, not by pressing anything.
    expect(nextAction('SENT')).toBeNull()
    expect(nextAction('PARTIALLY_RECEIVED')).toBeNull()
    expect(nextAction('CLOSED')).toBeNull()
    expect(nextAction('CANCELLED')).toBeNull()
  })

  it('cancels anything unfinished, and nothing finished', () => {
    for (const state of [
      'DRAFT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'SENT',
      'PARTIALLY_RECEIVED',
      'RECEIVED',
    ] as const) {
      expect(canCancel(state)).toBe(true)
    }
    expect(canCancel('CLOSED')).toBe(false)
    expect(canCancel('CANCELLED')).toBe(false)
  })

  it('takes goods only against an order the supplier has been told about', () => {
    expect(acceptsReceipts('SENT')).toBe(true)
    expect(acceptsReceipts('PARTIALLY_RECEIVED')).toBe(true)
    expect(acceptsReceipts('APPROVED')).toBe(false)
    expect(acceptsReceipts('RECEIVED')).toBe(false)
  })
})

describe('what is still due', () => {
  it('adds deliveries up per line rather than reading only the last one', () => {
    const booked: GoodsReceiptDto[] = [
      {
        id: 'r1',
        purchaseOrderId: ORDER_ID,
        number: 'GR-1',
        receivedOn: null,
        checkedInBy: null,
        note: null,
        lines: [{ id: 'l1', purchaseOrderLineId: LINE_A, quantityReceived: 4 }],
      },
      {
        id: 'r2',
        purchaseOrderId: ORDER_ID,
        number: 'GR-2',
        receivedOn: null,
        checkedInBy: null,
        note: null,
        lines: [{ id: 'l2', purchaseOrderLineId: LINE_A, quantityReceived: 3 }],
      },
    ]
    const received = receivedByLine(booked)
    expect(received.get(LINE_A)).toBe(7)
    expect(outstandingOn(order().lines[0], received)).toBe(3)
    // Nothing booked against the second line, so all of it is still due.
    expect(outstandingOn(order().lines[1], received)).toBe(4)
    expect(fullyReceived(order(), booked)).toBe(false)
  })
})

describe('a draft order line', () => {
  it('refuses what the server would', () => {
    expect(lineProblem({ ...emptyLine(), description: 'Beans', unitPrice: '8' })).toBeNull()
    expect(lineProblem({ ...emptyLine(), description: '', unitPrice: '8' })).toBe('description')
    expect(
      lineProblem({ ...emptyLine(), description: 'Beans', quantity: '0', unitPrice: '8' }),
    ).toBe('quantity')
    expect(lineProblem({ ...emptyLine(), description: 'Beans', unitPrice: '' })).toBe('unitPrice')
    expect(
      lineProblem({ ...emptyLine(), description: 'Beans', unitPrice: '8', vatRate: '-1' }),
    ).toBe('vatRate')
    // A free line price is legitimate; only a negative one is not.
    expect(lineProblem({ ...emptyLine(), description: 'Sample', unitPrice: '0' })).toBeNull()
  })

  it('totals VAT on each line net, and ignores lines that are not yet valid', () => {
    const totals = draftTotals([
      { description: 'Beans', quantity: '10', unit: 'kg', unitPrice: '8', vatRate: '5' },
      { description: '', quantity: '1', unit: '', unitPrice: '99', vatRate: '5' },
    ])
    expect(totals.net).toBe(80)
    expect(totals.vat).toBe(4)
    expect(totals.gross).toBe(84)
  })
})

describe('one purchase order', () => {
  it('submits a draft', async () => {
    renderDetail()
    await screen.findByText('PO-0001')
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
    await waitFor(() => expect(actions).toEqual(['submit']))
  })

  it('says marking as sent transmits nothing, because it does not', async () => {
    // The only dispatch channel writes a log line. A screen offering to "send to the supplier"
    // would describe something the platform does not do.
    current = order({ state: 'APPROVED' })
    renderDetail()
    await screen.findByText('PO-0001')

    expect(screen.getByRole('button', { name: 'Mark as sent' })).toBeTruthy()
    expect(screen.getByText(/Nothing is transmitted from here/)).toBeTruthy()
    expect(screen.queryByText(/over Peppol/)).toBeNull()
  })

  it('keeps approval behind its own permission', async () => {
    current = order({ state: 'AWAITING_APPROVAL' })
    who = BUYER
    renderDetail()
    await screen.findByText('PO-0001')

    expect(screen.getByRole('button', { name: 'Approve it' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/approval rights/)).toBeTruthy()
    // Cancelling is a manage right, which this reader has, so it stays available.
    expect(screen.getByRole('button', { name: 'Cancel the order' })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('books goods in against what is left, and refuses more than that', async () => {
    current = order({ state: 'SENT' })
    receipts = [
      {
        id: 'r1',
        purchaseOrderId: ORDER_ID,
        number: 'GR-1',
        receivedOn: '2026-09-15',
        checkedInBy: 'u-1',
        note: null,
        lines: [{ id: 'l1', purchaseOrderLineId: LINE_A, quantityReceived: 6 }],
      },
    ]
    renderDetail()
    await screen.findByText('PO-0001')

    // 10 ordered, 6 already in.
    const forBeans = screen.getByLabelText('Received for Arabica beans')
    fireEvent.change(forBeans, { target: { value: '9' } })
    expect(screen.getByRole('alert').textContent).toContain('Arabica beans')
    expect(screen.getByRole('button', { name: 'Book these in' })).toHaveProperty('disabled', true)

    fireEvent.change(forBeans, { target: { value: '4' } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Book these in' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Book these in' }))

    await waitFor(() =>
      expect(bookedBody).toMatchObject({
        lines: [{ purchaseOrderLineId: LINE_A, quantityReceived: 4 }],
      }),
    )
  })

  it('offers no way to book goods in before the order has been sent', async () => {
    current = order({ state: 'APPROVED' })
    renderDetail()
    await screen.findByText('PO-0001')
    expect(screen.queryByRole('button', { name: 'Book these in' })).toBeNull()
  })

  it('offers nothing to do on a cancelled order', async () => {
    current = order({ state: 'CANCELLED', cancelledAt: '2026-09-10T08:00:00Z' })
    renderDetail()
    await screen.findByText('PO-0001')

    expect(screen.getByText('This order was cancelled.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel the order' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Approve|Mark as sent|Send for approval/ }),
    ).toBeNull()
  })
})

describe('Mark as sent while the subscription is read-only (ST-2, owner 23 Oct, third message)', () => {
  const PLAN_READER: Entitlements = {
    ...APPROVER,
    permissions: [...APPROVER.permissions, 'tenant.plan.read'],
  }

  it('offers it while the subscription is usable', async () => {
    who = PLAN_READER
    current = order({ state: 'APPROVED' })
    answerStanding(fetchMock, null)
    renderDetail()
    await screen.findByText('PO-0001')
    await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
    await settle()
    expect(screen.getByRole('button', { name: 'Mark as sent' })).toBeTruthy()
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'hides it while %s, and keeps Cancel',
    async (restriction) => {
      who = PLAN_READER
      current = order({ state: 'APPROVED' })
      answerStanding(fetchMock, restriction)
      renderDetail()
      await screen.findByText('PO-0001')
      await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
      await settle()
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as sent' })).toBeNull())
      expect(screen.getByRole('button', { name: 'Cancel the order' })).toBeTruthy()
    },
  )
})

describe('a purchase order opened by someone who may only read it', () => {
  /** Reads orders (to match a bill to one) and can neither manage nor approve them. */
  const READER: Entitlements = { ...BUYER, permissions: ['purchase-order.read'] }

  it('shows the order with no "No access" above it and nothing to press', async () => {
    who = READER
    for (const state of ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'RECEIVED'] as const) {
      forgetEntitlements()
      current = order({ state })
      const view = renderDetail()
      await screen.findByText('PO-0001')
      expect(screen.getByText('Arabica beans')).toBeTruthy()
      expect(screen.queryByText('No access')).toBeNull()
      expect(screen.queryByText(/doesn't have access/)).toBeNull()
      expect(
        screen.queryByRole('button', {
          name: /Send for approval|Approve it|Mark as sent|Cancel the order|Book these in|Close the order/,
        }),
      ).toBeNull()
      view.unmount()
    }
    expect(actions).toEqual([])
  })

  it('still reads a refused order as "No access"', async () => {
    who = READER
    orderRefused = 403
    renderDetail()
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(screen.queryByText('PO-0001')).toBeNull()
  })
})

describe('New purchase order (Figma 163:27317)', () => {
  it('creates the order and sends it for approval in one press, with the lines as typed', async () => {
    render(
      <MemoryRouter initialEntries={['/suppliers/s-1/purchase-order']}>
        <Routes>
          <Route path="/suppliers/:slug/purchase-order" element={<NewPurchaseOrderPage />} />
          <Route path="/expenditure/purchase-orders/:id" element={<p>order page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'New purchase order' }),
    ).toBeTruthy()
    // The supplier strip reads the record: terms, early settlement, lead time.
    expect(await screen.findByText('Net 30 days')).toBeTruthy()
    expect(screen.getByText('6 days')).toBeTruthy()
    // The design's line rules: free text, goods or service, a unit on the row, no picker.
    fireEvent.change(screen.getByLabelText('Line 1: what it is'), {
      target: { value: 'Green beans Yirgacheffe' },
    })
    fireEvent.change(screen.getByLabelText('Line 1: quantity'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Line 1: unit price'), { target: { value: '7.4' } })
    expect(screen.getByRole('button', { name: 'Goods', pressed: true })).toBeTruthy()
    expect(screen.getByLabelText('Line 1: unit')).toBeTruthy()
    expect(screen.getAllByText('2,331.000').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
    await waitFor(() => expect(actions).toEqual(['submit']))
    expect(createdBody).toMatchObject({
      supplierId: 's-1',
      currency: 'OMR',
      deliverToBranchId: 'br-1',
    })
    expect((createdBody as { lines: unknown[] }).lines).toEqual([
      {
        lineNo: 1,
        description: 'Green beans Yirgacheffe',
        quantity: 300,
        unit: 'EA',
        unitPrice: 7.4,
        vatRate: 5,
      },
    ])
    expect(await screen.findByText('order page')).toBeTruthy()
  })
})

describe('a purchase-order line picked from the catalogue (S2)', () => {
  it('sends the product, its size and the stock units in one ordered unit', async () => {
    render(
      <MemoryRouter initialEntries={['/suppliers/s-1/purchase-order']}>
        <Routes>
          <Route path="/suppliers/:slug/purchase-order" element={<NewPurchaseOrderPage />} />
          <Route path="/expenditure/purchase-orders/:id" element={<p>order page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Net 30 days')).toBeTruthy()
    // The description stays free text; the catalogue pick is optional, beside it.
    fireEvent.click(screen.getByRole('button', { name: 'Line 1: product from the catalogue' }))
    fireEvent.click(await screen.findByRole('option', { name: /Yirgacheffe beans/ }))
    expect(await screen.findByLabelText('Line 1: size or option')).toBeTruthy()
    expect((screen.getByLabelText('Line 1: what it is') as HTMLInputElement).value).toBe(
      'Yirgacheffe beans',
    )
    // A product with sizes is bought one of them at a time (STOCK_VARIANT_REQUIRED).
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
    expect(await screen.findByText('Choose the size or option this line buys.')).toBeTruthy()
    expect(createdBody).toBeNull()

    fireEvent.click(screen.getByLabelText('Line 1: size or option'))
    fireEvent.click(await screen.findByRole('option', { name: 'Yirgacheffe beans · 5 kg' }))
    fireEvent.change(screen.getByLabelText('Line 1: stock units in one ordered unit'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Line 1: quantity'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
    await waitFor(() => expect(actions).toEqual(['submit']))
    expect((createdBody as { lines: unknown[] }).lines).toEqual([
      {
        lineNo: 1,
        description: 'Yirgacheffe beans · 5 kg',
        quantity: 10,
        unit: 'KGM',
        unitPrice: 34,
        vatRate: 5,
        productId: 'p-beans',
        variantId: 'v-5kg',
        stockUnitsPerOrderUnit: 5,
      },
    ])
  })

  it('takes the sizes from the search row when it carries them, named in Arabic (P.24, backend #808)', async () => {
    await i18n.changeLanguage('ar')
    listedVariants = BEANS.variants.map((variant) => ({
      ...variant,
      nameAr: variant.id === 'v-5kg' ? 'بن يرغاتشيفي · 5 كغ' : null,
    }))
    render(
      <MemoryRouter initialEntries={['/suppliers/s-1/purchase-order']}>
        <Routes>
          <Route path="/suppliers/:slug/purchase-order" element={<NewPurchaseOrderPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const pick = await screen.findByRole('button', {
      name: i18n.t('purchaseOrder.stock.pick', { line: 1 }),
    })
    fireEvent.click(pick)
    fireEvent.click(await screen.findByRole('option', { name: /Yirgacheffe beans/ }))
    const sizes = await screen.findByLabelText(i18n.t('purchaseOrder.stock.variant', { line: 1 }))
    const searched = fetchMock.mock.calls.map(([url]) => String(url))
    expect(
      searched.some((url) => url.includes('/api/v1/products?') && url.includes('include=variants')),
    ).toBe(true)
    expect(searched.some((url) => url.includes('/api/v1/products/p-beans'))).toBe(false)
    fireEvent.click(sizes)
    expect(await screen.findByRole('option', { name: 'بن يرغاتشيفي · 5 كغ' })).toBeTruthy()
    // No Arabic name: the English one, as before.
    expect(screen.getByRole('option', { name: 'Yirgacheffe beans · 1 kg' })).toBeTruthy()
    await i18n.changeLanguage('en')
  })

  it('reads a delivery branch refusal on booking goods in as its own sentence', async () => {
    const { ApiError } = await import('../../api/errors')
    const { orderStockRefusalKey } = await import('../../lib/purchaseOrders')
    const refusal = new ApiError({
      status: 400,
      problemType: null,
      code: 'GOODS_RECEIPT_BRANCH_REQUIRED',
    })
    expect(orderStockRefusalKey(refusal)).toBe('purchaseOrder.stock.refused.branchRequired')
    expect(i18n.t('purchaseOrder.stock.refused.branchRequired')).toMatch(/branch to deliver to/)
  })
})

// Business Rules PL-8: purchase orders are trade documents. A plan without them keeps an order
// made before readable, cancellable and closable; submitting, approving, sending and booking goods
// in wait for a plan that has them.
describe('a plan without trade documents (PL-8)', () => {
  const offPlan = (base: Entitlements): Entitlements => ({
    ...base,
    planFeaturesEnforced: true,
    planFeatures: { tradeDocuments: false },
  })

  it('hides Send for approval on a draft and keeps Cancel', async () => {
    who = offPlan(APPROVER)
    renderDetail()
    await screen.findByText('PO-0001')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Send for approval' })).toBeNull(),
    )
    expect(screen.getByRole('button', { name: 'Cancel the order' })).toBeTruthy()
  })

  it('hides booking goods in on a sent order', async () => {
    who = offPlan(APPROVER)
    current = order({ state: 'SENT' })
    renderDetail()
    await screen.findByText('PO-0001')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Book these in' })).toBeNull())
  })

  it('still closes a received order', async () => {
    who = offPlan(APPROVER)
    current = order({ state: 'RECEIVED' })
    renderDetail()
    await screen.findByText('PO-0001')
    expect(await screen.findByRole('button', { name: 'Close the order' })).toBeTruthy()
  })
})

// Owner change to PL-8, 24 Oct 2026: purchase orders have their own switch, apart from the selling
// documents (quotations, order forms, delivery notes).
describe('the purchase-orders switch (PL-8, owner, 24 Oct 2026)', () => {
  const withSwitches = (
    base: Entitlements,
    planFeatures: Record<string, boolean>,
  ): Entitlements => ({
    ...base,
    planFeaturesEnforced: true,
    planFeatures,
  })

  it('hides Send for approval when purchase orders are off, whatever trade documents say', async () => {
    who = withSwitches(APPROVER, { tradeDocuments: true, purchaseOrders: false })
    renderDetail()
    await screen.findByText('PO-0001')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Send for approval' })).toBeNull(),
    )
    expect(screen.getByRole('button', { name: 'Cancel the order' })).toBeTruthy()
  })

  it('hides booking goods in when purchase orders are off', async () => {
    who = withSwitches(APPROVER, { tradeDocuments: true, purchaseOrders: false })
    current = order({ state: 'SENT' })
    renderDetail()
    await screen.findByText('PO-0001')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Book these in' })).toBeNull())
  })

  it('offers the order actions when purchase orders are on and trade documents off', async () => {
    who = withSwitches(APPROVER, { tradeDocuments: false, purchaseOrders: true })
    renderDetail()
    await screen.findByText('PO-0001')
    expect(await screen.findByRole('button', { name: 'Send for approval' })).toBeTruthy()
  })
})
