import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { DraftResponse } from '../../api/invoices/drafts'
import { CreateInvoicePage, SelfBilledComposerPage } from './CreateInvoicePage'

const SELF_BILLER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'selfbilling.create', 'customer.read', 'product.read', 'branch.read'],
  scopes: [],
  featureFlags: {},
}

/** May write their own invoices, but not one on somebody else's behalf. */
const ORDINARY_WRITER: Entitlements = {
  ...SELF_BILLER,
  permissions: ['invoice.read', 'invoice.draft', 'customer.read', 'product.read', 'branch.read'],
}

const CUSTOMER = {
  id: 'c-1',
  type: 'BUSINESS',
  displayName: 'Sohar Port Logistics',
  profile: {
    details: { vatRegistrationNumber: 'OM1100999001' },
    contact: null,
    deliveryPreferences: { sendingMethod: 'PEPPOL' },
    invoiceAddress: null,
  },
  peppolDelivery: 'ACTIVE',
  invoiceEligible: true,
  missingInvoiceFields: [],
  status: 'ACTIVE',
  updatedAt: '2026-09-10T08:00:00Z',
}

const PRODUCT = {
  id: 'p-1',
  code: 'FLT-1',
  name: 'Flat White',
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 1.6,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 0,
}

function draft(overrides: Partial<DraftResponse> = {}): DraftResponse {
  return {
    id: 'sb-1',
    version: 0,
    authoringState: 'DRAFT',
    customerId: 'c-1',
    branchId: 'b-1',
    currency: 'OMR',
    invoiceNumber: null,
    type: 'SELF_BILLED_INVOICE',
    details: {
      deliveryDate: null,
      subject: 'September supply',
      purchaseOrderReference: null,
      customerVisibleNote: null,
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      transactionType: 'FULL_TAX',
      buyerReference: 'PO-7781',
      contractReference: 'CTR-2026-14',
    },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: [
      {
        lineNumber: 1,
        productId: 'p-1',
        productCode: 'FLT-1',
        description: 'Flat White',
        unitCode: 'EA',
        quantity: 12,
        unitPrice: 1.6,
        discountType: 'PERCENTAGE',
        discountValue: 0,
        taxCategoryCode: 'S5',
        en16931Category: 'S',
        taxRate: 5,
        exemptionReason: null,
      },
    ],
    ...overrides,
  }
}

const PREVIEW = {
  currency: 'OMR',
  lines: [],
  totals: {
    subtotal: 19.2,
    itemLevelDiscount: 0,
    headerDiscount: 0,
    totalDiscount: 0,
    taxableAmount: 19.2,
    vatAmount: 0.96,
    totalAmount: 20.16,
  },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && String(url).startsWith(prefix),
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = SELF_BILLER
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/branches') return json(200, [{ id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' }])
    if (url.startsWith('/api/v1/customers?')) return json(200, { content: [CUSTOMER], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    if (url === '/api/v1/customers/c-1') return json(200, CUSTOMER)
    if (url.startsWith('/api/v1/products')) return json(200, { content: [PRODUCT], page: 0, size: 20, totalElements: 1 })
    if (url === '/api/v1/self-billed-invoice-drafts' && method === 'POST') return json(201, draft())
    if (url === '/api/v1/invoice-drafts/sb-1' && method === 'GET') return json(200, draft({ version: 3 }))
    if (url === '/api/v1/invoice-drafts/sb-1' && method === 'PUT') return json(200, draft({ version: 4 }))
    if (url === '/api/v1/invoice-drafts/sb-1/preview') return json(200, PREVIEW)
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/income/self-billing/new" element={<SelfBilledComposerPage />} />
        <Route path="/income/self-billing/:id/edit" element={<SelfBilledComposerPage />} />
        <Route path="/invoices/new" element={<CreateInvoicePage />} />
        <Route path="/income/self-billing" element={<p>self-billing list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillOneLine() {
  fireEvent.click(await screen.findByRole('button', { name: 'Select customer' }))
  fireEvent.click(await screen.findByRole('option', { name: /Sohar Port Logistics/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Description' }))
  fireEvent.click(await screen.findByRole('option', { name: /Flat White/ }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Quantity' }), { target: { value: '12' } })
}

describe('the self-billed composer', () => {
  it('creates on the self-billed route, unwrapped, and lands on its own edit address', async () => {
    renderAt('/income/self-billing/new')
    await fillOneLine()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('POST', '/api/v1/self-billed-invoice-drafts')).toHaveLength(1))
    // Not the ordinary draft route, and not the {type, draft} wrapper that route takes.
    // Exact, because the draft PREVIEW is also a POST under /api/v1/invoice-drafts.
    expect(calls('POST', '/api/v1/invoice-drafts').filter(([url]) => url === '/api/v1/invoice-drafts')).toHaveLength(0)
    const body = bodyOf(calls('POST', '/api/v1/self-billed-invoice-drafts')[0])
    expect(body.draft).toBeUndefined()
    expect(body).toMatchObject({ customerId: 'c-1', branchId: 'b-1', vatMode: 'EXCLUSIVE' })

    expect(await screen.findByRole('heading', { name: 'Edit self-billed invoice' })).toBeTruthy()
  })

  it('sends IBT-010 and IBT-012, which only a self-billed document may carry', async () => {
    renderAt('/income/self-billing/new')
    await fillOneLine()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your reference' }), { target: { value: 'PO-7781' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Contract reference' }), { target: { value: 'CTR-2026-14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('POST', '/api/v1/self-billed-invoice-drafts')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/self-billed-invoice-drafts')[0]).details).toMatchObject({
      buyerReference: 'PO-7781',
      contractReference: 'CTR-2026-14',
    })
  })

  it('never sends those references on an ordinary invoice, which the server refuses outright', async () => {
    who = ORDINARY_WRITER
    renderAt('/invoices/new')
    await fillOneLine()

    // The fields are not even offered here — the buyer is the customer on this document.
    expect(screen.queryByRole('textbox', { name: 'Your reference' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Contract reference' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    const details = bodyOf(calls('POST', '/api/v1/invoice-drafts')[0]).draft.details
    expect(details).not.toHaveProperty('buyerReference')
    expect(details).not.toHaveProperty('contractReference')
  })

  it('reads the references back, because the draft PUT replaces the whole draft', async () => {
    renderAt('/income/self-billing/sb-1/edit')

    // Left out of the read, the next save would clear them - the server's own DTO says so.
    expect(await screen.findByRole('textbox', { name: 'Your reference' })).toHaveProperty('value', 'PO-7781')
    expect(screen.getByRole('textbox', { name: 'Contract reference' })).toHaveProperty('value', 'CTR-2026-14')

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/sb-1')).toHaveLength(1))
    expect(bodyOf(calls('PUT', '/api/v1/invoice-drafts/sb-1')[0]).draft.details).toMatchObject({
      buyerReference: 'PO-7781',
      contractReference: 'CTR-2026-14',
    })
  })

  it('says whose invoice this is, and that issuing can still be refused', async () => {
    renderAt('/income/self-billing/new')
    expect(await screen.findByText(/writing this invoice on the seller's behalf/)).toBeTruthy()
    expect(screen.getByText(/refused unless an agreement with that seller is in force/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Seller' })).toBeTruthy()
  })

  it('needs selfbilling.create, not invoice.draft', async () => {
    who = ORDINARY_WRITER
    renderAt('/income/self-billing/new')

    // Writing your own invoice is a different authority from writing one on someone else's behalf.
    expect(await screen.findByText('You can see this draft but not save it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
  })
})
