import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { DraftResponse } from '../../api/invoices/drafts'
import type { AgreementDto } from '../../api/selfBilling/agreements'
import { NewSelfBillPage } from './NewSelfBillPage'

const SELF_BILLER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  tenantName: 'Al Bahja Coffee',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'selfbilling.create',
    'selfbilling.agreement.manage',
    'customer.read',
    'branch.read',
    'invoice.attachment.manage',
  ],
  scopes: [],
  featureFlags: {},
}

/** May write their own invoices, but not one on somebody else's behalf. */
const ORDINARY_WRITER: Entitlements = {
  ...SELF_BILLER,
  permissions: ['invoice.read', 'invoice.draft', 'customer.read', 'branch.read'],
}

const CUSTOMER = {
  id: 'c-1',
  type: 'BUSINESS',
  displayName: 'Muscat Grand Hotel LLC',
  profile: {
    details: { vatRegistrationNumber: 'OM1100447102' },
    contact: null,
    deliveryPreferences: { sendingMethod: 'PEPPOL' },
    invoiceAddress: null,
  },
  peppolDelivery: 'ACTIVE',
  status: 'ACTIVE',
  updatedAt: '2026-09-10T08:00:00Z',
}

function agreement(overrides: Partial<AgreementDto> = {}): AgreementDto {
  return {
    id: 'a-1',
    customerId: 'c-1',
    agreementReference: 'SBA-2026-004',
    status: 'ACTIVE',
    sellerIdentityAssurance: 'COUNTERPARTY_VERIFIED',
    verifiedParticipant: '0248:OM1100447102',
    verifiedAt: '2026-09-01T10:00:00Z',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    withdrawnAt: null,
    withdrawalReason: null,
    version: 0,
    ...overrides,
  }
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
      deliveryDate: '2026-09-20',
      subject: 'July batch',
      purchaseOrderReference: 'PO-88317',
      customerVisibleNote: null,
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      transactionType: 'FULL_TAX',
      buyerReference: 'SB-0115',
      contractReference: 'SBA-2026-004',
    },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: [
      {
        lineNumber: 1,
        productId: '',
        productCode: '',
        description: 'Cappuccino - Large',
        unitCode: 'EA',
        quantity: 12,
        unitPrice: 1.8,
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
    subtotal: 21.6,
    itemLevelDiscount: 0,
    headerDiscount: 0,
    totalDiscount: 0,
    taxableAmount: 21.6,
    vatAmount: 1.08,
    totalAmount: 22.68,
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
let agreements: AgreementDto[]
let draftRead: DraftResponse
let storedFiles: unknown[]

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      ((init as RequestInit | undefined)?.method ?? 'GET') === method &&
      String(url).startsWith(prefix),
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = SELF_BILLER
  agreements = [agreement()]
  draftRead = draft({ version: 3 })
  storedFiles = []
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/branches')
      return json(200, [
        { id: 'b-2', code: 'SEEB', name: 'Seeb', type: 'BRANCH', city: 'Seeb' },
        { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
      ])
    if (url.startsWith('/api/v1/customers?'))
      return json(200, { content: [CUSTOMER], page: 0, size: 100, totalElements: 1 })
    if (url.startsWith('/api/v1/self-billing-agreements')) return json(200, agreements)
    if (url === '/api/v1/self-billed-invoice-drafts' && method === 'POST') return json(201, draft())
    if (url === '/api/v1/invoice-drafts/sb-1' && method === 'GET')
      return json(200, draftRead)
    if (url === '/api/v1/invoice-drafts/sb-1' && method === 'PUT')
      return json(200, draft({ version: 4 }))
    if (url === '/api/v1/invoice-drafts/sb-1/preview') return json(200, PREVIEW)
    if (url === '/api/v1/authored-invoices/sb-1/attachments' && method === 'GET')
      return json(200, storedFiles)
    if (url === '/api/v1/authored-invoices/sb-1/attachments' && method === 'POST')
      return json(201, {
        id: 'f-2',
        filename: 'delivery-note.pdf',
        contentType: 'application/pdf',
        byteSize: 1200,
        sha256: 'x',
        attachedAt: '2026-09-30T08:00:00Z',
      })
    if (url === '/api/v1/authored-invoices/sb-1/attachments/f-1' && method === 'DELETE')
      return json(204)
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/income/self-billing/new" element={<NewSelfBillPage />} />
        <Route path="/income/self-billing/:id/edit" element={<NewSelfBillPage />} />
        <Route path="/income/self-billing" element={<p>self-billing list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function chooseSupplierAndOneLine() {
  fireEvent.click(await screen.findByRole('button', { name: 'Choose a supplier' }))
  fireEvent.click(await screen.findByRole('option', { name: /Muscat Grand Hotel/ }))
  // The branch is pre-filled with the head office once the list answers.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Receiving branch' }).textContent).toContain(
      'Head office',
    ),
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Description 1' }), {
    target: { value: 'Cappuccino - Large' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Price excl. 1' }), {
    target: { value: '1.800' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Quantity 1' }), { target: { value: '12' } })
}

describe('the dedicated self-billed composer', () => {
  it('creates on the self-billed route, unwrapped, and lands on its own edit address', async () => {
    renderAt('/income/self-billing/new')
    await chooseSupplierAndOneLine()
    fireEvent.change(screen.getByLabelText(/Self-bill number/), { target: { value: 'SB-0115' } })
    fireEvent.change(screen.getByLabelText('Purchase order reference'), {
      target: { value: 'PO-88317' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('POST', '/api/v1/self-billed-invoice-drafts')).toHaveLength(1))
    // Not the ordinary draft route, and not the {type, draft} wrapper that route takes.
    expect(
      calls('POST', '/api/v1/invoice-drafts').filter(([url]) => url === '/api/v1/invoice-drafts'),
    ).toHaveLength(0)
    const body = bodyOf(calls('POST', '/api/v1/self-billed-invoice-drafts')[0])
    expect(body.draft).toBeUndefined()
    expect(body).toMatchObject({
      customerId: 'c-1',
      branchId: 'b-1',
      currency: 'OMR',
      vatMode: 'EXCLUSIVE',
    })
    // A free-text line under the composer rules: no product, the document's category on the line.
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0]).toMatchObject({
      lineNumber: 1,
      description: 'Cappuccino - Large',
      unitCode: 'EA',
      quantity: 12,
      unitPrice: 1.8,
      taxCategory: { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
    })
    // IBT-010 and IBT-012, which only a self-billed document may carry: the self-bill number and
    // the locked agreement reference.
    expect(body.details).toMatchObject({
      buyerReference: 'SB-0115',
      contractReference: 'SBA-2026-004',
      purchaseOrderReference: 'PO-88317',
      transactionType: 'FULL_TAX',
    })
    // Omitted, as the invoice composer omits them on a free-text line, rather than sent empty.
    expect(body.lines[0]).not.toHaveProperty('productId')
    expect(body.lines[0]).not.toHaveProperty('productCode')
    // IBT-081: the method the form opens on, with the label the reader saw.
    expect(body.details.paymentMethod).toEqual({ code: '30', label: 'Bank transfer' })

    expect(await screen.findByRole('heading', { name: 'Edit self-billed invoice' })).toBeTruthy()
  })

  it('reads the payment method back and sends it again on the next save', async () => {
    draftRead = draft({
      version: 3,
      details: { ...draft().details, paymentMethod: { code: '10', label: 'Cash' } },
    })
    renderAt('/income/self-billing/sb-1/edit')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Payment method' }).textContent).toContain('Cash'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/sb-1')).toHaveLength(1))
    const body = bodyOf(calls('PUT', '/api/v1/invoice-drafts/sb-1')[0])
    expect(body.draft.details.paymentMethod).toEqual({ code: '10', label: 'Cash' })
  })

  it('lists the draft files, and sends a dropped file to the saved draft on save', async () => {
    storedFiles = [
      {
        id: 'f-1',
        filename: 'contract.pdf',
        contentType: 'application/pdf',
        byteSize: 900,
        sha256: 'y',
        attachedAt: '2026-09-29T08:00:00Z',
      },
    ]
    renderAt('/income/self-billing/sb-1/edit')
    expect(await screen.findByText('contract.pdf')).toBeTruthy()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF'], 'delivery-note.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('delivery-note.pdf')).toBeTruthy()
    // Held until the save: nothing goes up on the drop.
    expect(calls('POST', '/api/v1/authored-invoices/sb-1/attachments')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(calls('POST', '/api/v1/authored-invoices/sb-1/attachments')).toHaveLength(1),
    )
    const sent = calls('POST', '/api/v1/authored-invoices/sb-1/attachments')[0][1] as RequestInit
    expect((sent.body as FormData).get('file')).toBeInstanceOf(File)

    fireEvent.click(screen.getByRole('button', { name: 'Remove contract.pdf' }))
    await waitFor(() =>
      expect(calls('DELETE', '/api/v1/authored-invoices/sb-1/attachments/f-1')).toHaveLength(1),
    )
    await waitFor(() => expect(screen.queryByText('contract.pdf')).toBeNull())
  })

  it('names a counterparty refusal instead of the generic message', async () => {
    renderAt('/income/self-billing/sb-1/edit')
    await waitFor(() =>
      expect(screen.getByLabelText(/Self-bill number/)).toHaveProperty('value', 'SB-0115'),
    )
    fetchMock.mockImplementationOnce(async () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/request-rejected',
        title: 'Request rejected',
        status: 400,
        code: 'COUNTERPARTY_VATIN_MISSING',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(
      await screen.findByText(
        'This supplier has no VAT registration number on its record. Add it, then issue.',
      ),
    ).toBeTruthy()
  })

  it('reads a saved draft back and saves it through the shared draft route', async () => {
    renderAt('/income/self-billing/sb-1/edit')

    // The field exists before the draft answers; wait for the value, not the control.
    await waitFor(() =>
      expect(screen.getByLabelText(/Self-bill number/)).toHaveProperty('value', 'SB-0115'),
    )
    expect(screen.getByRole('textbox', { name: 'Description 1' })).toHaveProperty(
      'value',
      'Cappuccino - Large',
    )
    // The supplier card, the seller box and the picker all name the seller.
    expect((await screen.findAllByText(/Muscat Grand Hotel LLC/)).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/sb-1')).toHaveLength(1))
    const body = bodyOf(calls('PUT', '/api/v1/invoice-drafts/sb-1')[0])
    expect(body.expectedVersion).toBe(3)
    // Left out of the read, the next save would clear them: the PUT replaces the whole draft.
    expect(body.draft.details).toMatchObject({
      buyerReference: 'SB-0115',
      contractReference: 'SBA-2026-004',
    })
  })

  it('says per supplier whether issuing would be refused, in the words the server would use', async () => {
    agreements = [agreement({ sellerIdentityAssurance: 'UNVERIFIED', verifiedParticipant: null })]
    renderAt('/income/self-billing/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a supplier' }))
    fireEvent.click(await screen.findByRole('option', { name: /Muscat Grand Hotel/ }))

    expect(await screen.findByText(/Waiting on Fawtir to verify/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /verify/i })).toBeNull()
  })

  it('refuses to save without a supplier, and never asks the server', async () => {
    renderAt('/income/self-billing/new')
    await screen.findByRole('heading', { name: 'New self-billed invoice' })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Choose the supplier you are billing for first.')).toBeTruthy()
    expect(calls('POST', '/api/v1/self-billed-invoice-drafts')).toHaveLength(0)
  })

  it('needs selfbilling.create, not invoice.draft', async () => {
    who = ORDINARY_WRITER
    renderAt('/income/self-billing/new')

    // Writing your own invoice is a different authority from writing one on someone else's behalf.
    expect(await screen.findByText('You can see this draft but not save it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
  })
})
