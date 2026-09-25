import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { DraftResponse } from '../../api/invoices/drafts'
import { CreateInvoicePage } from './CreateInvoicePage'
import { muscatToday, plusDays } from '../../lib/invoiceIssue'

const WRITER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'customer.read', 'product.read', 'branch.read'],
  scopes: [],
  featureFlags: {},
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
    id: 'd-1',
    version: 3,
    authoringState: 'DRAFT',
    customerId: 'c-1',
    branchId: 'b-1',
    currency: 'OMR',
    invoiceNumber: null,
    details: {
      deliveryDate: null,
      subject: 'September supply',
      purchaseOrderReference: null,
      customerVisibleNote: null,
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      transactionType: 'FULL_TAX',
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
        // A backend ask: a stored draft returning its goods line's HS code (IBR-079-OM).
        hsCode: '090121000000',
        serviceType: null,
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
let putResponse: () => Response
let loaded: DraftResponse
let issueResponse: () => Response

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
  who = WRITER
  loaded = draft()
  putResponse = () => json(200, draft({ version: 4 }))
  issueResponse = () =>
    json(200, {
      ...draft({ version: 5, authoringState: 'ISSUED' }),
      invoiceNumber: 'INV-2026-000003',
    })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/branches')
      return json(200, [
        { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
      ])
    if (url.startsWith('/api/v1/customers?'))
      return json(200, { content: [CUSTOMER], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    if (url === '/api/v1/customers/c-1') return json(200, CUSTOMER)
    if (url.startsWith('/api/v1/products'))
      return json(200, { content: [PRODUCT], page: 0, size: 20, totalElements: 1 })
    if (url === '/api/v1/invoice-drafts' && method === 'POST')
      return json(201, draft({ version: 0 }))
    if (url === '/api/v1/invoice-drafts/d-1' && method === 'GET') return json(200, loaded)
    if (url === '/api/v1/invoice-drafts/d-1' && method === 'PUT') return putResponse()
    if (url.startsWith('/api/v1/invoice-drafts/d-1?expected_version=') && method === 'DELETE')
      return json(200, draft({ authoringState: 'DISCARDED' }))
    if (url === '/api/v1/invoice-drafts/d-1/preview') return json(200, PREVIEW)
    if (url === '/api/v1/invoice-drafts/d-1/issue' && method === 'POST') return issueResponse()
    if (url === '/api/v1/authored-invoices/d-1/internal-note')
      return json(200, { internalNote: 'Call first' })
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function IssuedLanding() {
  const state = useLocation().state as { issuedNumber?: string } | null
  return <p>invoice page for {state?.issuedNumber}</p>
}

function renderAt(path: string) {
  return render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices/new" element={<CreateInvoicePage />} />
        <Route path="/invoices/:id/edit" element={<CreateInvoicePage />} />
        <Route path="/invoices" element={<p>invoices list</p>} />
        <Route path="/invoices/:id" element={<IssuedLanding />} />
      </Routes>
    </MemoryRouter>
      </ReferenceDataContext.Provider>,
  )
}

async function chooseCustomerAndProduct() {
  fireEvent.click(await screen.findByRole('button', { name: 'Select customer' }))
  fireEvent.click(await screen.findByRole('option', { name: /Sohar Port Logistics/ }))
  // The description is free text; the catalogue beside it fills the line with a product.
  fireEvent.click(screen.getByRole('button', { name: /Pick from catalogue/ }))
  fireEvent.click(await screen.findByRole('option', { name: /Flat White/ }))
  expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', 'Flat White')
  fireEvent.change(screen.getByRole('textbox', { name: 'Quantity' }), { target: { value: '12' } })
}

describe('a new invoice draft', () => {
  it('saves once with an idempotency key, lands on its edit address and shows the server figures', async () => {
    renderAt('/invoices/new')
    await chooseCustomerAndProduct()
    expect(
      screen.getByText('Estimate. Save the draft to see the figures the invoice will carry.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    const [post] = calls('POST', '/api/v1/invoice-drafts')
    expect((post[1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^draft-.{16,}/),
    })
    expect(bodyOf(post)).toMatchObject({
      type: 'INVOICE',
      draft: {
        customerId: 'c-1',
        branchId: 'b-1',
        vatMode: 'EXCLUSIVE',
        lines: [
          {
            lineNumber: 1,
            productId: 'p-1',
            productCode: 'FLT-1',
            quantity: 12,
            unitPrice: 1.6,
            taxCategory: { en16931Category: 'S', rate: 5 },
          },
        ],
        details: { transactionType: 'FULL_TAX' },
      },
    })
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    expect(screen.getAllByText('20.160').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Edit draft' })).toBeTruthy()
    expect(calls('GET', '/api/v1/invoice-drafts/d-1')).toHaveLength(0)
  })

  it('names what is missing and sends nothing', async () => {
    renderAt('/invoices/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Choose a customer.')).toBeTruthy()
    expect(screen.getByText('Line 1: Enter a description.')).toBeTruthy()
    expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(0)
  })

  it('shows no invoice number before issue', async () => {
    renderAt('/invoices/new')
    expect(await screen.findByText('Assigned when the invoice is issued')).toBeTruthy()
    expect(screen.getByText('New draft · not saved yet')).toBeTruthy()
  })
})

describe('an existing draft', () => {
  it('opens with its saved content and figures, and saves back without the note it cannot see', async () => {
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
    expect(screen.getByText('Sohar Port Logistics')).toBeTruthy()
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    expect(screen.getByText(/may have an internal note you can't see/)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Subject / about' }), {
      target: { value: 'October supply' },
    })
    expect(
      screen.getByText('Estimate of unsaved changes. Save to update the saved figures.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(1))
    const body = bodyOf(calls('PUT', '/api/v1/invoice-drafts/d-1')[0])
    expect(body.expectedVersion).toBe(3)
    expect(body.draft.details.subject).toBe('October supply')
    expect('internalNote' in body.draft.details).toBe(false)
    expect(await screen.findByText('Draft saved.')).toBeTruthy()
  })

  it('reads and sends the internal note for someone allowed to see it', async () => {
    who = { ...WRITER, permissions: [...WRITER.permissions, 'invoice.internal-note.read'] }
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('Call first')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(1))
    expect(bodyOf(calls('PUT', '/api/v1/invoice-drafts/d-1')[0]).draft.details.internalNote).toBe(
      'Call first',
    )
  })

  it('says when someone else saved first, and offers a reload', async () => {
    putResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/stale-invoice-version',
        status: 409,
        code: 'STALE_INVOICE_VERSION',
      })
    renderAt('/invoices/d-1/edit')
    await screen.findByDisplayValue('September supply')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Someone else saved this draft')
    expect(within(alert).getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('puts the server field errors on their line', async () => {
    putResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/validation-failed',
        status: 400,
        errors: [
          { field: 'draft.lines[0].unitPrice', message: 'must be greater than or equal to 0.0' },
        ],
      })
    renderAt('/invoices/d-1/edit')
    await screen.findByDisplayValue('September supply')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Line 1: must be greater than or equal to 0.0')).toBeTruthy()
  })

  it('discards with the version it was read at', async () => {
    renderAt('/invoices/d-1/edit')
    await screen.findByDisplayValue('September supply')
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard this draft?' })).getByRole(
        'button',
        { name: 'Discard' },
      ),
    )
    expect(await screen.findByText('invoices list')).toBeTruthy()
    expect(calls('DELETE', '/api/v1/invoice-drafts/d-1')[0][0]).toBe(
      '/api/v1/invoice-drafts/d-1?expected_version=3',
    )
  })

  it('does not offer to save an invoice that is no longer a draft', async () => {
    loaded = draft({ authoringState: 'ISSUED', invoiceNumber: 'INV-2026-000001' })
    renderAt('/invoices/d-1/edit')
    expect(
      await screen.findByText('This invoice is issued. Only drafts can be edited.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
    expect(calls('POST', '/api/v1/invoice-drafts/d-1/preview')).toHaveLength(0)
  })
})

describe('issuing from the composer', () => {
  const ISSUER: Entitlements = { ...WRITER, permissions: [...WRITER.permissions, 'invoice.issue'] }
  const issueCalls = () => calls('POST', '/api/v1/invoice-drafts/d-1/issue')

  it('is not offered without the issue permission', async () => {
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create invoice' })).toBeNull()
  })

  it('confirms a saved draft with its dates and server total, issues it once and lands on the invoice', async () => {
    who = ISSUER
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    expect(await within(dialog).findByText('20.160')).toBeTruthy()
    expect(
      within(dialog).getByText('Nothing is sent to the customer or the Tax Authority yet.'),
    ).toBeTruthy()
    // Nothing changed on screen, so nothing is saved first.
    expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(0)

    // Two submits in one tick, before the disabled button can render, are one request.
    const form = dialog.querySelector('form')!
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    expect(await screen.findByText('invoice page for INV-2026-000003')).toBeTruthy()
    expect(issueCalls()).toHaveLength(1)
    const [call] = issueCalls()
    expect((call[1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^draft-.{16,}/),
    })
    const today = muscatToday()
    expect(bodyOf(call)).toEqual({
      expectedVersion: 3,
      issueDate: today,
      dueDate: plusDays(today, 30),
    })
  })

  it('refuses a business invoice whose goods line has no HS code, naming the rule, until one is chosen', async () => {
    who = ISSUER
    loaded = draft({ lines: [{ ...draft().lines[0], hsCode: null }] })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(
      await screen.findByText('Line 1: Choose an HS code for this goods line (IBR-079-OM).'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(0)
    expect(issueCalls()).toHaveLength(0)

    // Searched by product name; the stored value is the 12-digit code, never sent to the draft
    // (the request refuses unknown members) but enough to let the issue go ahead.
    fireEvent.click(screen.getByRole('button', { name: 'HS code' }))
    fireEvent.change(await screen.findByPlaceholderText('Search by product name'), {
      target: { value: 'coffee, roasted' },
    })
    // "Other" stays offered whatever is typed, after the matches.
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      '0901.21 · Coffee, roasted, not decaffeinated090121000000',
      '0901.22 · Coffee, roasted, decaffeinated090122000000',
      'Other000000000000',
    ])
    fireEvent.click(options[0])
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(await screen.findByRole('dialog', { name: 'Issue this invoice?' })).toBeTruthy()
    const body = bodyOf(calls('PUT', '/api/v1/invoice-drafts/d-1')[0])
    expect('hsCode' in body.draft.lines[0]).toBe(false)
  })

  it('saves unsaved changes first and issues the version that save returned', async () => {
    who = ISSUER
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject / about' }), {
      target: { value: 'October supply' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(1))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    await waitFor(() => expect(issueCalls()).toHaveLength(1))
    expect(bodyOf(issueCalls()[0]).expectedVersion).toBe(4)
  })

  it('says why a company that may not issue yet was refused, and keeps the confirmation open', async () => {
    who = ISSUER
    issueResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        status: 409,
        code: 'COMPANY_VERIFICATION_PENDING',
      })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    expect(
      await within(dialog).findByText(
        "Your company is still being verified, so it can't issue invoices yet.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/invoice page for/)).toBeNull()
  })

  it('puts a closed-period refusal on the issue date', async () => {
    who = ISSUER
    issueResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/period-closed',
        status: 409,
        code: 'PERIOD_CLOSED',
      })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe(
      'That date is in a closed accounting period. Reopen the period or choose another date.',
    )
    expect(alert.closest('[data-field]')?.getAttribute('data-field')).toBe('issueDate')
  })
})
