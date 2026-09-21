import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const APPROVER: Entitlements = { ...BUYER, permissions: [...BUYER.permissions, 'purchase-order.approve'] }

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
      { id: LINE_A, lineNo: 1, description: 'Arabica beans', quantity: 10, unit: 'kg', unitPrice: 8, vatRate: 5, lineNet: 80, vatAmount: 4 },
      { id: LINE_B, lineNo: 2, description: 'Filters', quantity: 4, unit: 'box', unitPrice: 5, vatRate: 5, lineNet: 20, vatAmount: 1 },
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

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = APPROVER
  current = order()
  receipts = []
  actions = []
  bookedBody = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.includes('/me/entitlements')) return json(200, who)
    if (url.includes(`/purchase-orders/${ORDER_ID}/receipts`)) {
      if (init?.method === 'POST') {
        bookedBody = JSON.parse(String(init.body))
        return json(201, { id: 'r-1', purchaseOrderId: ORDER_ID, number: 'GR-1', receivedOn: '2026-09-18', checkedInBy: 'u-1', note: null, lines: [] })
      }
      return json(200, receipts)
    }
    const move = url.match(/\/purchase-orders\/[^/]+\/(submit|approve|send|cancel|close)$/)
    if (move && init?.method === 'POST') {
      actions.push(move[1])
      return json(200, current)
    }
    if (url.includes(`/purchase-orders/${ORDER_ID}`)) return json(200, current)
    return json(404)
  })
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
    for (const state of ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'] as const) {
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
      { id: 'r1', purchaseOrderId: ORDER_ID, number: 'GR-1', receivedOn: null, checkedInBy: null, note: null, lines: [{ id: 'l1', purchaseOrderLineId: LINE_A, quantityReceived: 4 }] },
      { id: 'r2', purchaseOrderId: ORDER_ID, number: 'GR-2', receivedOn: null, checkedInBy: null, note: null, lines: [{ id: 'l2', purchaseOrderLineId: LINE_A, quantityReceived: 3 }] },
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
    expect(lineProblem({ ...emptyLine(), description: 'Beans', quantity: '0', unitPrice: '8' })).toBe('quantity')
    expect(lineProblem({ ...emptyLine(), description: 'Beans', unitPrice: '' })).toBe('unitPrice')
    expect(lineProblem({ ...emptyLine(), description: 'Beans', unitPrice: '8', vatRate: '-1' })).toBe('vatRate')
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
    expect(screen.getByRole('button', { name: 'Cancel the order' })).toHaveProperty('disabled', false)
  })

  it('books goods in against what is left, and refuses more than that', async () => {
    current = order({ state: 'SENT' })
    receipts = [
      { id: 'r1', purchaseOrderId: ORDER_ID, number: 'GR-1', receivedOn: '2026-09-15', checkedInBy: 'u-1', note: null, lines: [{ id: 'l1', purchaseOrderLineId: LINE_A, quantityReceived: 6 }] },
    ]
    renderDetail()
    await screen.findByText('PO-0001')

    // 10 ordered, 6 already in.
    const forBeans = screen.getByLabelText('Received for Arabica beans')
    fireEvent.change(forBeans, { target: { value: '9' } })
    expect(screen.getByRole('alert').textContent).toContain('Arabica beans')
    expect(screen.getByRole('button', { name: 'Book these in' })).toHaveProperty('disabled', true)

    fireEvent.change(forBeans, { target: { value: '4' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Book these in' })).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByRole('button', { name: 'Book these in' }))

    await waitFor(() =>
      expect(bookedBody).toMatchObject({ lines: [{ purchaseOrderLineId: LINE_A, quantityReceived: 4 }] }),
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
    expect(screen.queryByRole('button', { name: /Approve|Mark as sent|Send for approval/ })).toBeNull()
  })
})
