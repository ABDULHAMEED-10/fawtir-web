import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { DraftResponse } from '../../api/invoices/drafts'
import { CreateInvoicePage } from './CreateInvoicePage'
import { muscatToday, plusDays } from '../../lib/invoiceIssue'
import { resetSharedRequests } from '../../api/inflight'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'

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

const GOVERNMENT_CUSTOMER = {
  ...CUSTOMER,
  id: 'g-1',
  type: 'GOVERNMENT',
  displayName: 'Ministry of Health',
  profile: {
    ...CUSTOMER.profile,
    details: { vatRegistrationNumber: null, defaultBuyerReference: 'MOH-BR-7' },
  },
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
        // A stored draft returns its goods line's HS code (IBR-079-OM).
        classification: {
          goodsOrService: 'G',
          hsCode: '090121000000',
          serviceTypeCode: '00000000',
        },
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

/** Two entries of the published HS list, named by their whole heading path. */
const HS_ENTRIES = [
  {
    code: '090121000000',
    name: 'Coffee, whether or not roasted or decaffeinated > Roasted coffee > Not decaffeinated',
    nameAr: 'البن، محمص أو غير محمص أو منزوع الكافيين > بن محمص > غير منزوع الكافيين',
  },
  {
    code: '090122000000',
    name: 'Coffee, whether or not roasted or decaffeinated > Roasted coffee > Decaffeinated',
    nameAr: 'البن، محمص أو غير محمص أو منزوع الكافيين > بن محمص > منزوع الكافيين',
  },
]

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let putResponse: () => Response
let loaded: DraftResponse
let issueResponse: () => Response
let activityCode: string | null
let paymentResponse: () => Response
let storedFiles: unknown[]
let attachmentResponse: () => Response
let readinessResponse: () => Response

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
  activityCode = '561001'
  putResponse = () => json(200, draft({ version: 4 }))
  paymentResponse = () => json(201, { id: 'pay-1' })
  storedFiles = []
  attachmentResponse = () =>
    json(201, {
      id: 'att-1',
      filename: 'po.pdf',
      contentType: 'application/pdf',
      byteSize: 4,
      sha256: 'a'.repeat(64),
      attachedAt: '2026-09-29T08:00:00Z',
      attachedByName: 'Hafidh Saif',
    })
  readinessResponse = () => json(404, { type: 'about:blank' })
  issueResponse = () =>
    json(200, {
      ...draft({ version: 5, authoringState: 'ISSUED' }),
      invoiceNumber: 'INV-2026-000003',
    })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/code-lists/hs')) {
      const q = new URL(url, 'http://x').searchParams.get('q') ?? ''
      const items = HS_ENTRIES.filter(
        (entry) =>
          q === '' ||
          entry.name.toLowerCase().includes(q.toLowerCase()) ||
          entry.code.startsWith(q),
      )
      return json(200, { items, total: items.length })
    }
    if (url === '/api/v1/company-profile/industrial-classification')
      return json(200, { code: activityCode })
    if (url === '/api/v1/invoicing/readiness') return readinessResponse()
    if (url === '/api/v1/branches')
      return json(200, [
        { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
      ])
    if (url.startsWith('/api/v1/customers?') && url.includes('type=GOVERNMENT'))
      return json(200, {
        content: [GOVERNMENT_CUSTOMER],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      })
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
    if (url === '/api/v1/authored-invoices/d-1/attachments' && method === 'GET')
      return json(200, storedFiles)
    if (url === '/api/v1/authored-invoices/d-1/attachments' && method === 'POST')
      return attachmentResponse()
    if (url === '/api/v1/authored-invoices/d-1/receivable')
      return json(200, {
        documentTotal: 20.16,
        paidAmount: 0,
        creditedAmount: 0,
        outstandingAmount: 20.16,
        currency: 'OMR',
        paymentState: 'UNPAID',
        overdue: false,
        dueDate: null,
      })
    if (url === '/api/v1/authored-invoices/d-1/payments' && method === 'POST')
      return paymentResponse()
    if (url === '/api/v1/authored-invoices/d-1/manual-delivery' && method === 'POST')
      return json(200, { recordedAt: '2026-09-29T08:00:00Z' })
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function IssuedLanding() {
  const state = useLocation().state as {
    issuedNumber?: string
    marksFailed?: string[]
    stockWarnings?: { line: number; code: string }[]
  } | null
  return (
    <p>
      invoice page for {state?.issuedNumber}
      {state?.marksFailed?.length ? ` (marks refused: ${state.marksFailed.join(', ')})` : ''}
      {state?.stockWarnings?.length
        ? ` (stock: ${state.stockWarnings.map((w) => `${w.line} ${w.code}`).join(', ')})`
        : ''}
    </p>
  )
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
          <Route path="/expenditure/self-billing/:id/edit" element={<p>self-billing editor</p>} />
          <Route
            path="/expenditure/self-billing/credit-notes/:id/edit"
            element={<p>self-billed credit note editor</p>}
          />
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

  it('defaults a consumer to Due on receipt and puts business and government back on Net 30', async () => {
    renderAt('/invoices/new')
    const terms = async () =>
      (await screen.findByRole('button', { name: 'Payment terms' })).textContent
    expect(await terms()).toContain('Net 30 days')
    fireEvent.click(screen.getByRole('button', { name: /Consumer/ }))
    await waitFor(async () => expect(await terms()).toContain('Due on receipt'))
    fireEvent.click(screen.getByRole('button', { name: /Government/ }))
    await waitFor(async () => expect(await terms()).toContain('Net 30 days'))
  })

  it('notes, without blocking, that a government buyer may ask for its references', async () => {
    renderAt('/invoices/new')
    const note = /Government buyers may ask for a buyer reference/
    expect(await screen.findByRole('button', { name: 'Payment terms' })).toBeTruthy()
    expect(screen.queryByText(note)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Government/ }))
    expect(await screen.findByText(note)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Business/ }))
    await waitFor(() => expect(screen.queryByText(note)).toBeNull())
  })

  it("shows the company's stored business activity, or warns that none is set", async () => {
    renderAt('/invoices/new')
    expect(await screen.findByText('Business activity: 561001 · Restaurants')).toBeTruthy()

    cleanup()
    activityCode = null
    renderAt('/invoices/new')
    expect(await screen.findByText(/Business activity not set/)).toBeTruthy()
    expect(screen.queryByText(/Business activity: /)).toBeNull()
  })

  it('shows no invoice number before issue', async () => {
    renderAt('/invoices/new')
    expect(await screen.findByText('Assigned when the invoice is issued')).toBeTruthy()
    expect(screen.getByText('New draft · not saved yet')).toBeTruthy()
  })
})

describe('the buyer reference (IBT-010) on a government invoice', () => {
  const field = () => screen.getByRole('textbox', { name: 'Buyer reference' })

  // Owner, 6 Oct 2026: government invoices only; the design draws no such row for business.
  it('is not offered on a business or a consumer invoice', async () => {
    renderAt('/invoices/new')
    await chooseCustomerAndProduct()
    expect(screen.queryByRole('textbox', { name: 'Buyer reference' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/invoice-drafts')[0]).draft.details).not.toHaveProperty(
      'buyerReference',
    )

    cleanup()
    renderAt('/invoices/new')
    fireEvent.click(await screen.findByRole('button', { name: /Consumer/ }))
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Buyer reference' })).toBeNull(),
    )
  })

  it("starts from a government customer's default, which this invoice may change", async () => {
    renderAt('/invoices/new')
    fireEvent.click(await screen.findByRole('button', { name: /Government/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Select customer' }))
    fireEvent.click(await screen.findByRole('option', { name: /Ministry of Health/ }))
    await waitFor(() => expect(field()).toHaveProperty('value', 'MOH-BR-7'))

    fireEvent.change(field(), { target: { value: 'MOH-BR-OCT' } })
    fireEvent.click(screen.getByRole('button', { name: /Pick from catalogue/ }))
    fireEvent.click(await screen.findByRole('option', { name: /Flat White/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/invoice-drafts')[0]).draft.details).toMatchObject({
      buyerReference: 'MOH-BR-OCT',
    })
  })

  it('reads a saved buyer reference and PO reference back and keeps both on the next save', async () => {
    loaded = draft({
      details: {
        ...draft().details,
        buyerReference: 'BR-SAVED',
        purchaseOrderReference: 'PO-77',
      },
    })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('BR-SAVED')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Purchase order reference' })).toHaveProperty(
      'value',
      'PO-77',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(1))
    expect(bodyOf(calls('PUT', '/api/v1/invoice-drafts/d-1')[0]).draft.details).toMatchObject({
      buyerReference: 'BR-SAVED',
      purchaseOrderReference: 'PO-77',
    })
  })
})

describe('the VAT summary label, now that the category is picked per line', () => {
  it('names the one category every line shares, and says "mixed rates" once they differ', async () => {
    loaded = draft({
      lines: [
        { ...draft().lines[0], lineNumber: 1 },
        { ...draft().lines[0], lineNumber: 2, taxCategoryCode: 'S5', en16931Category: 'S' },
      ],
    })
    renderAt('/invoices/d-1/edit')
    expect((await screen.findAllByText('VAT · Standard rate - 5%')).length).toBeGreaterThan(0)

    loaded = draft({
      lines: [
        { ...draft().lines[0], lineNumber: 1, taxCategoryCode: 'S5', en16931Category: 'S' },
        {
          ...draft().lines[0],
          lineNumber: 2,
          taxCategoryCode: 'Z0',
          en16931Category: 'Z',
          taxRate: 0,
          exemptionReasonCode: 'VATZR-OM-01',
        },
      ],
    })
    cleanup()
    renderAt('/invoices/d-1/edit')
    expect((await screen.findAllByText('VAT · mixed rates')).length).toBeGreaterThan(0)
  })
})

describe('an existing draft', () => {
  it("shows the saved draft's zero-rating warnings by line, without blocking (Z.11, Z.13)", async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === '/api/v1/invoice-drafts/d-1/preview'
        ? json(200, {
            ...PREVIEW,
            warnings: [
              {
                line: 1,
                code: 'ZR_FOOD_CHARGED_STANDARD',
                severity: 'warning',
                hsCode: '090121000000',
                hsCodeSource: 'LINE',
                reasonCode: null,
                listKey: 'FOOD',
                effectiveFrom: '2026-10-01',
                judgedOn: '2026-10-26',
                message: 'fallback',
              },
            ],
          })
        : original(input, init),
    )
    renderAt('/invoices/d-1/edit')
    const text = i18n.t('zeroRating.line', {
      line: 1,
      text: i18n.t('zeroRating.warning.ZR_FOOD_CHARGED_STANDARD', {
        hsCode: '090121000000',
        date: '26 Oct 2026',
      }),
    })
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByText('fallback')).toBeNull()
    // Nothing is blocked: the draft can still be saved.
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

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

  it('names, before Issue, the prerequisites the server would refuse on, and leaves Issue to the server', async () => {
    // "Fix this" goes to a settings write, so the card offers it only with admin.settings.manage
    // (#157 review, 78f7700); this issuer may also change settings.
    who = { ...ISSUER, permissions: [...ISSUER.permissions, 'admin.settings.manage'] }
    readinessResponse = () =>
      json(200, {
        ready: false,
        items: [
          { code: 'COMPANY_VERIFIED', status: 'AWAITING_PLATFORM', owner: 'PLATFORM' },
          { code: 'ACTIVE_BRANCH', status: 'ACTION_REQUIRED', owner: 'COMPANY' },
          { code: 'CONTACT_PHONE', status: 'DONE', owner: 'COMPANY' },
        ],
      })
    renderAt('/invoices/d-1/edit')

    const card = within(
      (await screen.findByText(i18n.t('readiness.composer.title'))).closest('section')!,
    )
    expect(card.getByText(i18n.t('readiness.item.COMPANY_VERIFIED'))).toBeTruthy()
    expect(card.getByText(i18n.t('readiness.awaitingFawtir'))).toBeTruthy()
    expect(card.getByRole('link', { name: i18n.t('readiness.fix') }).getAttribute('href')).toBe(
      '/settings/branches/new',
    )
    expect(card.queryByText(i18n.t('readiness.item.CONTACT_PHONE'))).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Create invoice' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('shows no readiness note when the company is ready, or when the answer is unavailable', async () => {
    who = ISSUER
    for (const answer of [
      () => json(200, { ready: true, items: [] }),
      () => json(403, { type: 'about:blank' }),
    ]) {
      readinessResponse = answer
      const view = renderAt('/invoices/d-1/edit')
      expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/invoicing/readiness')).toBe(true),
      )
      expect(screen.queryByText(i18n.t('readiness.composer.title'))).toBeNull()
      view.unmount()
    }
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

  it("carries the issue answer's stock warnings to the invoice page, and only those", async () => {
    who = ISSUER
    issueResponse = () =>
      json(200, {
        ...draft({ version: 5, authoringState: 'ISSUED' }),
        invoiceNumber: 'INV-2026-000003',
        warnings: [
          { line: 1, code: 'STOCK_UNIT_MISMATCH', severity: 'warning', message: 'x' },
          { line: 1, code: 'ZR_NOT_ON_LIST', severity: 'warning', message: 'y' },
        ],
      })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    expect(await within(dialog).findByText('20.160')).toBeTruthy()
    fireEvent.submit(dialog.querySelector('form')!)
    expect(
      await screen.findByText('invoice page for INV-2026-000003 (stock: 1 STOCK_UNIT_MISMATCH)'),
    ).toBeTruthy()
  })

  it('refuses a business invoice whose goods line has no HS code, naming the rule, until one is chosen', async () => {
    who = ISSUER
    loaded = draft({ lines: [{ ...draft().lines[0], classification: null }] })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()

    // Saved with no classification, the line reopens unchosen (A-12): issuing asks which it is.
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(
      await screen.findByText('Line 1: Choose whether this line is goods or a service.'),
    ).toBeTruthy()
    expect(issueCalls()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Goods' }))

    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(
      await screen.findByText('Line 1: Choose an HS code for this goods line (IBR-079-OM).'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(0)
    expect(issueCalls()).toHaveLength(0)

    // Searched by name on the server; each option shows the last two levels of its heading path
    // with the code beneath. The stored value is the 12-digit code, never sent to the draft
    // (the request refuses unknown members) but enough to let the issue go ahead.
    fireEvent.click(screen.getByRole('button', { name: 'HS code' }))
    fireEvent.change(await screen.findByPlaceholderText('Search by product name'), {
      target: { value: 'roasted coffee' },
    })
    await waitFor(async () => {
      const found = await screen.findAllByRole('option')
      expect(found.map((option) => option.textContent)).toEqual([
        'Roasted coffee > Not decaffeinated090121000000',
        'Roasted coffee > Decaffeinated090122000000',
        // Always offered at the foot, whatever the search found.
        'Other000000000000',
      ])
    })
    const options = await screen.findAllByRole('option')
    fireEvent.click(options[0])
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(await screen.findByRole('dialog', { name: 'Issue this invoice?' })).toBeTruthy()
    const body = bodyOf(calls('PUT', '/api/v1/invoice-drafts/d-1')[0])
    expect('hsCode' in body.draft.lines[0]).toBe(false)
  })

  it('names the HS code a reopened draft carries', async () => {
    who = ISSUER
    loaded = draft({
      lines: [
        {
          ...draft().lines[0],
          classification: {
            goodsOrService: 'G',
            hsCode: '090121000000',
            serviceTypeCode: '00000000',
          },
        },
      ],
    })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()

    expect(await screen.findByText('Roasted coffee > Not decaffeinated')).toBeTruthy()
  })

  it('names the HS code in Arabic when the interface is Arabic', async () => {
    await i18n.changeLanguage('ar')
    who = ISSUER
    loaded = draft({
      lines: [
        {
          ...draft().lines[0],
          classification: {
            goodsOrService: 'G',
            hsCode: '090122000000',
            serviceTypeCode: '00000000',
          },
        },
      ],
    })
    renderAt('/invoices/d-1/edit')

    expect(await screen.findByText('بن محمص > منزوع الكافيين')).toBeTruthy()
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

  it('links an issue that needs approval to the draft, where it is sent for approval', async () => {
    who = ISSUER
    for (const code of ['SALES_APPROVAL_REQUIRED', 'SALES_APPROVAL_REJECTED']) {
      issueResponse = () =>
        json(409, {
          type: `https://api.fawtir.om/problems/${code.toLowerCase().replace(/_/g, '-')}`,
          status: 409,
          code,
        })
      const view = renderAt('/invoices/d-1/edit')
      expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
      const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

      const link = await within(dialog).findByRole('link', { name: 'Open the draft' })
      expect(link.getAttribute('href')).toBe('/invoices/d-1')
      expect(screen.queryByText(/invoice page for/)).toBeNull()
      view.unmount()
    }
  })

  it('offers no draft link for a refusal approval cannot answer', async () => {
    who = ISSUER
    issueResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/sales-approval-pending',
        status: 409,
        code: 'SALES_APPROVAL_PENDING',
      })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    expect(
      await within(dialog).findByText(
        'This document is waiting for approval and cannot be issued yet.',
      ),
    ).toBeTruthy()
    expect(within(dialog).queryByRole('link', { name: 'Open the draft' })).toBeNull()
  })

  it('tells a company with no business activity where to set it, and keeps the confirmation open', async () => {
    who = ISSUER
    issueResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/validation-failed',
        status: 400,
        code: 'INDUSTRIAL_CLASSIFICATION_REQUIRED',
      })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    expect(
      await within(dialog).findByText(
        'Set your business activity in Company settings before creating a business or government invoice.',
      ),
    ).toBeTruthy()
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

describe('payment, attachments and duplicate (INCOME.md 3.4, 3.5, 1.4)', () => {
  const ISSUER: Entitlements = { ...WRITER, permissions: [...WRITER.permissions, 'invoice.issue'] }

  it('saves the payment method with the draft, and reopens the one stored', async () => {
    loaded = draft({
      details: { ...draft().details, paymentMethod: { code: '48', label: 'Bank card' } },
    })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject / about' }), {
      target: { value: 'October supply' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(1))
    const method = bodyOf(calls('PUT', '/api/v1/invoice-drafts/d-1')[0]).draft.details.paymentMethod
    expect(method.code).toBe('48')
    expect(method.label).toBe(i18n.t('createInvoice.paymentMethods.48'))
  })

  it('records the payment and the offline delivery once the invoice is issued', async () => {
    who = ISSUER
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Payment reference' }), {
      target: { value: 'TRF-77' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as paid' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as sent manually' }))

    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    await within(dialog).findByText('20.160')
    fireEvent.submit(dialog.querySelector('form')!)

    expect(await screen.findByText('invoice page for INV-2026-000003')).toBeTruthy()
    const [payment] = calls('POST', '/api/v1/authored-invoices/d-1/payments')
    expect((payment[1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^payment-/),
    })
    expect(bodyOf(payment)).toEqual({
      amount: 20.16,
      methodCode: '30',
      paymentReference: 'TRF-77',
      paymentDate: muscatToday(),
    })
    expect(calls('POST', '/api/v1/authored-invoices/d-1/manual-delivery')).toHaveLength(1)
  })

  it('still lands on the issued invoice when a mark is refused, and says which', async () => {
    who = ISSUER
    paymentResponse = () => json(403, { type: 'about:blank', title: 'Forbidden', status: 403 })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as paid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    await within(dialog).findByText('20.160')
    fireEvent.submit(dialog.querySelector('form')!)

    expect(
      await screen.findByText('invoice page for INV-2026-000003 (marks refused: paid)'),
    ).toBeTruthy()
    expect(calls('POST', '/api/v1/authored-invoices/d-1/manual-delivery')).toHaveLength(0)
  })

  it('uploads a held file to the draft when it is saved, and lists it as stored', async () => {
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF'], 'po.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(screen.getByText('po.pdf')).toBeTruthy()
    expect(calls('POST', '/api/v1/authored-invoices/d-1/attachments')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(calls('POST', '/api/v1/authored-invoices/d-1/attachments')).toHaveLength(1),
    )
    const sent = (calls('POST', '/api/v1/authored-invoices/d-1/attachments')[0][1] as RequestInit)
      .body as FormData
    expect((sent.get('file') as File).name).toBe('po.pdf')
    expect(await screen.findByText('Draft saved.')).toBeTruthy()
    expect(screen.getAllByText('po.pdf')).toHaveLength(1)
  })

  it('does not issue while a file failed to upload, and sends only that file again', async () => {
    who = ISSUER
    attachmentResponse = () => json(503, { type: 'about:blank', title: 'Unavailable', status: 503 })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText('Figures from the saved draft.')).toBeTruthy()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'po.pdf', { type: 'application/pdf' })] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(await screen.findByText(/po\.pdf was not uploaded/)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Issue this invoice?' })).toBeNull()
    expect(calls('POST', '/api/v1/invoice-drafts/d-1/issue')).toHaveLength(0)
    expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(1)

    // Storage is back: the held file goes up first, then the confirmation opens.
    attachmentResponse = () =>
      json(201, {
        id: 'att-1',
        filename: 'po.pdf',
        contentType: 'application/pdf',
        byteSize: 4,
        sha256: 'a'.repeat(64),
        attachedAt: '2026-09-29T08:00:00Z',
      })
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(await screen.findByRole('dialog', { name: 'Issue this invoice?' })).toBeTruthy()
    expect(calls('POST', '/api/v1/authored-invoices/d-1/attachments')).toHaveLength(2)
  })

  it('duplicates an invoice into a new draft, created only when saved', async () => {
    loaded = draft({
      authoringState: 'ISSUED',
      invoiceNumber: 'INV-2026-000002',
      details: { ...draft().details, deliveryDate: '2026-09-15' },
    })
    renderAt('/invoices/new?duplicate=d-1')
    expect(await screen.findByDisplayValue('September supply')).toBeTruthy()
    expect(screen.getByDisplayValue('Flat White')).toBeTruthy()
    expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    const body = bodyOf(calls('POST', '/api/v1/invoice-drafts')[0])
    expect(body.type).toBe('INVOICE')
    expect(body.draft.details.subject).toBe('September supply')
    expect(body.draft.lines[0].description).toBe('Flat White')
    expect(body.draft.details.deliveryDate).toBeNull()
    expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(0)
  })
})

describe('a self-billed draft opened from an Income address', () => {
  // Owner decision, 6 Oct 2026: self-billing lives under Expenditure, so its drafts are never
  // edited in the sales composer, and nothing is saved on the way.
  it.each([
    ['SELF_BILLED_INVOICE', 'self-billing editor'],
    ['SELF_BILLED_CREDIT_NOTE', 'self-billed credit note editor'],
  ] as const)('sends a %s draft to its Expenditure editor', async (type, landing) => {
    loaded = draft({ type })
    renderAt('/invoices/d-1/edit')
    expect(await screen.findByText(landing)).toBeTruthy()
    expect(calls('PUT', '/api/v1/invoice-drafts/d-1')).toHaveLength(0)
  })
})

describe('the allowance meter in the header', () => {
  // A Business trial that ended unpaid: the server counts a new period from the day after the
  // trial at the paid plan's 1,000, although nothing can be issued (R8, 23 Oct re-test).
  const PLAN = { usage: { used: 1, quota: 1000 }, allowance: { used: 1, totalAllowance: 1000 } }
  const TRIAL_ENDED = {
    tracked: true,
    access: 'PAYMENT_REQUIRED',
    restrictionsEnforced: true,
    today: '2026-10-23',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodPrice: '80.000',
    trialStartsOn: '2026-10-08',
    trialEndsOn: '2026-10-22',
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: null,
    renewsOn: null,
    graceDays: 7,
    graceUntil: null,
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: null,
    enterprise: null,
    restriction: 'SUBSCRIPTION_SUSPENDED',
  }
  const ACTIVE = { ...TRIAL_ENDED, access: 'ACTIVE', paidThrough: '2026-11-22', restriction: null }

  function serve(subscription: unknown) {
    resetSharedRequests()
    forgetSubscriptionStanding()
    who = { ...WRITER, permissions: [...WRITER.permissions, 'tenant.plan.read'] }
    const served = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/settings/plan') return json(200, PLAN)
      if (url === '/api/v1/settings/subscription') return json(200, subscription)
      return served(url, init)
    })
  }

  afterEach(() => forgetSubscriptionStanding())

  it('shows the documents used against the allowance while the subscription is active', async () => {
    serve(ACTIVE)
    renderAt('/invoices/new')
    expect(await screen.findByText('/ 1,000 used')).toBeTruthy()
  })

  it('draws no meter once a trial has ended unpaid: nothing can be issued, so "of 1,000" misleads', async () => {
    serve(TRIAL_ENDED)
    renderAt('/invoices/new')
    await screen.findByRole('button', { name: 'Select customer' })
    await waitFor(() =>
      expect(calls('GET', '/api/v1/settings/subscription').length).toBeGreaterThan(0),
    )
    await waitFor(() => expect(calls('GET', '/api/v1/settings/plan').length).toBeGreaterThan(0))
    // Let both reads settle before asserting the meter is absent.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(screen.queryByText('/ 1,000 used')).toBeNull()
  })
})
