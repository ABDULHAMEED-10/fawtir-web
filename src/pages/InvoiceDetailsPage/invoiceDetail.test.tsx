import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import type {
  InvoiceDetailDto,
  InvoiceDispatchDto,
  InvoiceHistoryDto,
  InvoicePaymentDto,
  InvoiceReceivableDto,
  InvoiceSendResultDto,
} from '../../api/invoices/detail'
import type { ActivityDetailDto, ActivityItemDto } from '../../api/compliance/activity'
import { paymentProblems, paymentRows, statusOf, timelineOf } from '../../lib/invoiceDetail'
import { InvoiceDetailsPage } from './InvoiceDetailsPage'
import { ApiError } from '../../api'
import { dueDateFor, issueProblems, issueRefusalOf, muscatToday } from '../../lib/invoiceIssue'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const ID = '11111111-1111-1111-1111-111111111111'
const URL_BASE = `/api/v1/authored-invoices/${ID}`

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.draft',
    'invoice.cancel',
    'invoice.internal-note.read',
    'invoice.payment.manage',
    'customer.read',
    'creditnote.create',
    'branch.read',
  ],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['invoice.read'] }
const CAN_MANAGE_ATTACHMENTS: Entitlements = {
  ...ADMIN,
  permissions: [...ADMIN.permissions, 'invoice.attachment.manage'],
}

function invoice(overrides: Partial<InvoiceDetailDto> = {}): InvoiceDetailDto {
  return {
    id: ID,
    type: 'INVOICE',
    correctionOfInvoiceId: null,
    version: 4,
    authoringState: 'ISSUED',
    deliveryState: 'NOT_SUBMITTED',
    deliveryBlocker: 'CANONICAL_HANDOFF_NOT_ENABLED',
    customerId: 'c-1',
    branchId: 'b-1',
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    invoiceNumber: 'INV-2026-0042',
    issueDate: '2026-08-01',
    dueDate: '2026-09-30',
    issuedAt: '2026-08-01T07:00:00Z',
    details: {
      deliveryDate: '2026-08-02',
      subject: 'August supply',
      purchaseOrderReference: 'PO-77',
      customerVisibleNote: 'Thank you for your business.',
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      paymentMethod: { code: 'BANK', label: 'Bank transfer' },
      correctionReasonCode: null,
      buyerReference: null,
      contractReference: null,
      transactionType: 'FULL_TAX',
      transactionSubtypes: [],
      invoicingPeriod: null,
    },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: [
      {
        lineNumber: 1,
        productId: 'p-1',
        productCode: 'GB-01',
        description: 'Green beans',
        unitCode: 'KG',
        quantity: 12,
        unitPrice: 4.5,
        discountType: 'PERCENTAGE',
        discountValue: 0,
        taxCategoryCode: 'S5',
        en16931Category: 'S',
        taxRate: 5,
        exemptionReason: null,
      },
    ],
    totals: {
      subtotal: 54,
      itemLevelDiscount: 0,
      headerDiscount: 0,
      totalDiscount: 0,
      taxableAmount: 54,
      vatAmount: 2.7,
      totalAmount: 56.7,
      payableRoundingAmount: 0,
      outputScale: 3,
    },
    ...overrides,
  }
}

const RECEIVABLE: InvoiceReceivableDto = {
  documentTotal: 56.7,
  paidAmount: 20,
  creditedAmount: 0,
  outstandingAmount: 36.7,
  currency: 'OMR',
  paymentState: 'PARTIALLY_PAID',
  overdue: false,
  dueDate: '2026-09-30',
}

/** Nothing paid and nothing credited: the only receivable an issued invoice may be cancelled with. */
const UNSETTLED: InvoiceReceivableDto = {
  ...RECEIVABLE,
  paidAmount: 0,
  outstandingAmount: 56.7,
  paymentState: 'UNPAID',
}

const PAYMENTS: InvoicePaymentDto[] = [
  {
    id: 'pay-1',
    entryType: 'PAYMENT',
    reversalOfPaymentId: null,
    amount: 20,
    currency: 'OMR',
    methodCode: 'BANK',
    paymentReference: 'TRX-9',
    paymentDate: '2026-08-10',
    occurredAt: '2026-08-10T09:00:00Z',
  },
  {
    id: 'pay-2',
    entryType: 'PAYMENT',
    reversalOfPaymentId: null,
    amount: 15,
    currency: 'OMR',
    methodCode: 'CASH',
    paymentReference: null,
    paymentDate: '2026-08-12',
    occurredAt: '2026-08-12T09:00:00Z',
  },
  {
    id: 'rev-1',
    entryType: 'REVERSAL',
    reversalOfPaymentId: 'pay-2',
    amount: 15,
    currency: 'OMR',
    methodCode: 'CASH',
    paymentReference: null,
    paymentDate: '2026-08-13',
    occurredAt: '2026-08-13T09:00:00Z',
  },
]

const HISTORY: InvoiceHistoryDto = {
  entries: [
    {
      id: 'h-1',
      eventType: 'PAYMENT_RECORDED',
      outcome: 'SUCCESS',
      invoiceVersion: 4,
      changedFieldsHash: 'abc',
      actorId: 'u-1',
      occurredAt: '2026-08-10T09:00:00Z',
    },
    {
      id: 'h-2',
      eventType: 'ISSUED',
      outcome: 'SUCCESS',
      invoiceVersion: 3,
      changedFieldsHash: 'def',
      actorId: 'u-2',
      occurredAt: '2026-08-01T07:00:00Z',
    },
  ],
  truncated: false,
  limit: 200,
}

/** What the dispatch read answers for an issued invoice nobody has sent yet. */
const NOT_SENT: InvoiceDispatchDto = {
  state: 'NOT_SENT',
  reasonCode: null,
  attempts: 0,
  nextAttemptAt: null,
  dispatchedAt: null,
  sendable: true,
  buyerDelivery: null,
  buyerEmailReleasable: false,
}

const QUEUED: InvoiceDispatchDto = {
  ...NOT_SENT,
  state: 'QUEUED',
  dispatchedAt: '2026-10-04T10:00:00Z',
  sendable: false,
}

const DISPATCHED: InvoiceSendResultDto = {
  invoiceId: ID,
  invoiceNumber: 'INV-2026-0042',
  outcome: 'DISPATCHED',
  reasonCode: null,
  dispatch: QUEUED,
}

/** An administrator who may issue, which is what Send asks for. */
const SENDER: Entitlements = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let invoiceResponse: () => Response
let receivableResponse: () => Response
let cancelResponse: () => Response
/** The notes that correct the invoice, as `GET /authored-invoices?correctionOf=` lists them. */
let notesResponse: () => Response
let payResponse: () => Response
let issueResponse: () => Response
let dispatchResponse: () => Response
let sendResponse: () => Response
let attachmentFiles: Array<{
  id: string
  filename: string
  contentType: string
  byteSize: number
  sha256: string
  attachedAt: string
  attachedByName?: string | null
}>
let who: Entitlements
/** The compliance ledger, asked by number once the dispatch names a transport row. */
let activityListResponse: () => Response
let activityDetails: Record<string, () => Response>
/** `GET /settings/subscription`, asked only for a reader with `tenant.plan.read`. */
let subscriptionResponse: () => Response

const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`,
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  forgetSubscriptionStanding()
  who = ADMIN
  // No record found unless a test says otherwise: the bar then says the report is not available.
  activityListResponse = () => json(200, { items: [], page: 0, page_size: 5, has_more: false })
  activityDetails = {}
  subscriptionResponse = () => json(404, { status: 404 })
  invoiceResponse = () => json(200, invoice())
  receivableResponse = () => json(200, RECEIVABLE)
  cancelResponse = () => json(200, invoice({ authoringState: 'CANCELLED', version: 5 }))
  notesResponse = () => json(200, { content: [], page: 0, size: 50, totalElements: 0 })
  payResponse = () => json(200, PAYMENTS[0])
  issueResponse = () => json(200, invoice({ version: 5 }))
  dispatchResponse = () => json(200, NOT_SENT)
  sendResponse = () => json(200, DISPATCHED)
  attachmentFiles = [
    {
      id: 'f-1',
      filename: 'delivery-note.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
      sha256: 'x',
      attachedAt: '2026-08-01T08:00:00Z',
    },
  ]
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === `${URL_BASE}/receivable`) return receivableResponse()
    if (url === `${URL_BASE}/payments`)
      return method === 'POST' ? payResponse() : json(200, PAYMENTS)
    if (url.startsWith(`${URL_BASE}/payments/`)) return payResponse()
    if (url === `${URL_BASE}/attachments` && method === 'GET') return json(200, attachmentFiles)
    if (url === `${URL_BASE}/attachments` && method === 'POST') {
      const created = {
        id: 'f-2',
        filename: 'scan.pdf',
        contentType: 'application/pdf',
        byteSize: 1024,
        sha256: 'y',
        attachedAt: '2026-08-05T08:00:00Z',
      }
      attachmentFiles = [...attachmentFiles, created]
      return json(201, created)
    }
    if (url.startsWith(`${URL_BASE}/attachments/`) && method === 'DELETE') {
      const removedId = url.slice(`${URL_BASE}/attachments/`.length)
      attachmentFiles = attachmentFiles.filter((file) => file.id !== removedId)
      return json(204)
    }
    if (url === `${URL_BASE}/history`) return json(200, HISTORY)
    if (url === `${URL_BASE}/dispatch`) return dispatchResponse()
    if (url === `${URL_BASE}/send` && method === 'POST') return sendResponse()
    if (url === `${URL_BASE}/internal-note`)
      return json(200, { internalNote: 'Chase Hamed in September.' })
    if (url === `${URL_BASE}/cancel`) return cancelResponse()
    if (url === `/api/v1/invoice-drafts/${ID}/preview`)
      return json(200, {
        currency: 'OMR',
        lines: [],
        totals: {
          subtotal: 54,
          itemLevelDiscount: 0,
          headerDiscount: 0,
          totalDiscount: 0,
          taxableAmount: 54,
          vatAmount: 2.7,
          totalAmount: 56.7,
        },
      })
    if (url === `/api/v1/invoice-drafts/${ID}/issue`) return issueResponse()
    if (url.startsWith('/api/v1/customers/'))
      return json(200, {
        id: 'c-1',
        type: 'BUSINESS',
        displayName: 'Sohar Port Logistics',
        profile: {
          details: { vatRegistrationNumber: 'OM1100999001' },
          contact: null,
          deliveryPreferences: null,
          invoiceAddress: null,
        },
        peppolDelivery: 'ACTIVE',
        status: 'ACTIVE',
        updatedAt: '2026-08-01T00:00:00Z',
      })
    if (url === '/api/v1/branches')
      return json(200, [
        { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
      ])
    if (url === URL_BASE) return invoiceResponse()
    if (url === '/api/v1/settings/subscription') return subscriptionResponse()
    if (url === '/api/v1/payment-reminders/schedule')
      return json(200, { offsets: [-3, 0, 7, 14], enabled: true })
    // The notes that correct the invoice; none unless a test says otherwise.
    if (url.startsWith('/api/v1/authored-invoices?')) return notesResponse()
    if (url.startsWith('/api/v1/compliance/activity?') && method === 'GET')
      return activityListResponse()
    if (url.startsWith('/api/v1/compliance/activity/') && method === 'GET') {
      const answer = activityDetails[url.slice('/api/v1/compliance/activity/'.length)]
      if (answer) return answer()
    }
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderInvoice() {
  return render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter initialEntries={[`/invoices/${ID}`]}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
          <Route path="/invoices/:id/edit" element={<p>draft editor</p>} />
          <Route path="/invoices" element={<p>invoices list</p>} />
          <Route path="/login" element={<p>sign-in page</p>} />
          <Route path="/expenditure/self-billing/:id" element={<p>self-billing page</p>} />
        </Routes>
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
}

describe('uploader, duplicate and the marks applied at issue', () => {
  it('names who uploaded an attachment', async () => {
    attachmentFiles = [{ ...attachmentFiles[0], attachedByName: 'Hafidh Saif' }]
    renderInvoice()
    expect(await screen.findByText(/Uploaded .* by Hafidh Saif/)).toBeTruthy()
  })

  it('duplicates an issued invoice by opening the composer filled from it', async () => {
    renderInvoice()
    const duplicate = await screen.findByRole('link', { name: 'Duplicate' })
    expect(duplicate.getAttribute('href')).toBe(`/invoices/new?duplicate=${ID}`)
  })

  it('says which of the composer marks the server refused after issue', async () => {
    render(
      <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: `/invoices/${ID}`,
              state: { issuedNumber: 'INV-2026-0042', marksFailed: ['paid', 'sent'] },
            },
          ]}
        >
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </ReferenceDataContext.Provider>,
    )
    expect(await screen.findByText(/Issued as INV-2026-0042\./)).toBeTruthy()
    expect(
      screen.getByText(/The payment was not recorded\. Use Record payment on this invoice\./),
    ).toBeTruthy()
    expect(screen.getByText(/It was not marked as sent manually\./)).toBeTruthy()
  })
})

describe('An invoice, wired to the API', () => {
  it('shows the document, its balance, its lines and the customer', async () => {
    renderInvoice()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' }),
    ).toBeTruthy()
    // The status pill, and the same word on the preview's paper.
    expect((await screen.findAllByText('Partially paid')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sohar Port Logistics').length).toBeGreaterThan(0)
    expect(screen.getAllByText('VAT OM1100999001').length).toBeGreaterThan(0)
    // There is no /customers/:id route; the catch-all sent this link to the marketing home.
    expect((await screen.findByRole('link', { name: /View customer/ })).getAttribute('href')).toBe(
      '/customers/c-1/edit',
    )
    // The branch and the terms are on the page and again on the preview's paper.
    expect(screen.getAllByText('Head office').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Net 30 days').length).toBeGreaterThan(0)

    // The headline figure, the "Outstanding" column, the payments footer and the activity's head
    // entry are the same number, by design.
    // The activity's entry arrives with its own request, so wait for all four under a loaded run.
    await waitFor(() => expect(screen.getAllByText('36.700')).toHaveLength(4))
    // The invoice total: the balance card, under the lines, the payments footer and the preview.
    await waitFor(() => expect(screen.getAllByText('56.700')).toHaveLength(4))
    // Paid on the balance card, and again as the payment itself.
    expect(screen.getAllByText('20.000').length).toBeGreaterThan(0)
    // The API sends no line total; 12 × 4.500 is computed here.
    expect(screen.getAllByText('54.000').length).toBeGreaterThan(0)
    // The line and the note are in the items and notes cards, and again on the preview's paper.
    expect(screen.getAllByText('Green beans')).toHaveLength(2)
    expect(screen.getAllByText('Thank you for your business.')).toHaveLength(2)
  })

  it('shows the internal note in its box, as designed, and refreshes the trail its read is written to', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    expect(await screen.findByText('Chase Hamed in September.')).toBeTruthy()
    expect(calls().filter((call) => call.endsWith('/internal-note'))).toHaveLength(1)
    // The read is the audit event, so the timeline is fetched again once it has happened.
    await waitFor(() => expect(calls().filter((call) => call.endsWith('/history'))).toHaveLength(2))
  })

  it('never claims a Peppol delivery, and draws the PDF pane from the data with no file to fetch', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    expect(screen.queryByText(/Delivered on Peppol/i)).toBeNull()
    expect(await screen.findByText(/Not yet sent to Sohar Port Logistics/)).toBeTruthy()
    // The customer's own Peppol readiness is a customer fact, and may be said.
    expect(screen.getByText('On Peppol')).toBeTruthy()
    expect(screen.getByText('Invoice PDF')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: 'Print' }) as HTMLButtonElement).disabled).toBe(true)
    expect(calls().some((call) => /\.pdf|\/pdf/.test(call))).toBe(false)
  })

  it('builds the timeline from recorded events only, and says which were yours', async () => {
    renderInvoice()
    const timeline = (await screen.findByText('Payment recorded')).closest('ol')!
    expect(within(timeline).getByText(/^You · /)).toBeTruthy()
    expect(within(timeline).getByText('Issued')).toBeTruthy()
    expect(screen.queryByText(/Tax Authority/)).toBeNull()
  })

  it('strikes through a payment that was reversed rather than listing the reversal as another', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    expect(await screen.findByText('Reversed')).toBeTruthy()
    expect(screen.getByText('15.000').className).toContain('line-through')
  })

  it('issues a draft from its own page with the due date its terms give, then shows it issued and unsent', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    const DRAFT = invoice({
      authoringState: 'DRAFT',
      version: 2,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      issuedAt: null,
      totals: null,
    })
    invoiceResponse = () => json(200, DRAFT)
    receivableResponse = () =>
      json(200, {
        ...RECEIVABLE,
        paymentState: 'NOT_APPLICABLE',
        documentTotal: null,
        outstandingAmount: null,
        paidAmount: 0,
      })
    renderInvoice()

    fireEvent.click(await screen.findByRole('button', { name: 'Issue invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    expect(await within(dialog).findByText('56.700')).toBeTruthy()

    // The reread after issue answers the issued document.
    invoiceResponse = () => json(200, invoice({ version: 3 }))
    receivableResponse = () => json(200, RECEIVABLE)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    expect(
      await screen.findByText(
        "Issued as INV-2026-0042. It hasn't been sent to the customer or the Tax Authority yet.",
      ),
    ).toBeTruthy()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' }),
    ).toBeTruthy()
    const issue = fetchMock.mock.calls.filter(
      ([url]) => String(url) === `/api/v1/invoice-drafts/${ID}/issue`,
    )
    expect(issue).toHaveLength(1)
    const today = muscatToday()
    expect(JSON.parse((issue[0][1] as RequestInit).body as string)).toEqual({
      expectedVersion: 2,
      issueDate: today,
      dueDate: dueDateFor(SEEDED_REFERENCE, today, 'NET30'),
    })
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull()
  })

  it('offers no issue without the permission, or on an issued invoice', async () => {
    invoiceResponse = () =>
      json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null, totals: null }))
    const view = renderInvoice()
    expect(await screen.findByRole('link', { name: /Edit draft/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull()
    view.unmount()

    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    forgetEntitlements()
    invoiceResponse = () => json(200, invoice())
    renderInvoice()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull()
  })

  it('opens a draft in the editor and shows no figures for it', async () => {
    invoiceResponse = () =>
      json(
        200,
        invoice({
          authoringState: 'DRAFT',
          invoiceNumber: null,
          issueDate: null,
          dueDate: null,
          issuedAt: null,
          totals: null,
        }),
      )
    receivableResponse = () =>
      json(200, {
        ...RECEIVABLE,
        documentTotal: null,
        outstandingAmount: null,
        paidAmount: 0,
        paymentState: 'NOT_APPLICABLE',
      })
    renderInvoice()
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft invoice' })).toBeTruthy()
    expect(screen.getByText(/no number and no figures until it is issued/)).toBeTruthy()
    expect(screen.getAllByText('A draft is priced when it is issued.').length).toBeGreaterThan(0)
    expect(screen.queryByText('Outstanding balance')).toBeNull()
    // A draft has no payments to ask about.
    expect(calls().some((call) => call.endsWith('/payments'))).toBe(false)

    fireEvent.click(screen.getByRole('link', { name: /Edit draft/ }))
    expect(await screen.findByText('draft editor')).toBeTruthy()
  })

  it('cancels with a reason, and reads a refusal as its own sentence', async () => {
    receivableResponse = () => json(200, UNSETTLED)
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    // Cancelling lives in the header's overflow menu, as the design draws it. The menu waits on
    // the receivable and the notes list, which decide whether Cancel may be offered (A-0).
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    expect(await screen.findByText(/does not tell the customer/)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Cancel the invoice' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Wrong customer' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/cancel`))
    const body = JSON.parse(
      String(fetchMock.mock.calls.find(([url]) => url === `${URL_BASE}/cancel`)?.[1]?.body),
    )
    expect(body).toEqual({ expectedVersion: 4, reason: 'Wrong customer' })
    expect(await screen.findByText('The invoice is cancelled.')).toBeTruthy()
  })

  it('says a delivered invoice must be corrected instead of cancelled', async () => {
    cancelResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/conflict',
        code: 'DELIVERED_INVOICE_CANCELLATION_NOT_APPROVED',
        detail: 'no',
      })
    receivableResponse = () => json(200, UNSETTLED)
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Too late' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the invoice' }))
    expect(await screen.findByText(/Issue a credit note instead/)).toBeTruthy()
  })

  it('asks for nothing a reader may not have, and offers no actions', async () => {
    who = READ_ONLY
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Credit note/i })).toBeNull()
    expect(calls().some((call) => call.endsWith('/internal-note'))).toBe(false)
    expect(calls().some((call) => call.includes('/customers/'))).toBe(false)
    expect(screen.getByText('Customer not shown')).toBeTruthy()
    expect(screen.queryByText(/Not yet sent to/)).toBeNull()
  })

  it('shows the not-found state for an invoice this tenant does not have', async () => {
    invoiceResponse = () => json(404, { type: 'https://api.fawtir.om/problems/not-found' })
    renderInvoice()
    expect(await screen.findByText('Not found')).toBeTruthy()
  })

  it('reads a malformed id (400 on the read) as not found, with nothing to retry', async () => {
    invoiceResponse = () =>
      json(400, { type: 'https://api.fawtir.om/problems/validation-failed', status: 400 })
    renderInvoice()
    expect(await screen.findByText('Not found')).toBeTruthy()
    expect(screen.queryByText(/Some details were not accepted/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('names the VAT category on the totals line as the header does, zero-rated included', async () => {
    const base = invoice()
    invoiceResponse = () =>
      json(
        200,
        invoice({
          lines: [{ ...base.lines[0], taxCategoryCode: 'Z', en16931Category: 'Z', taxRate: 0 }],
          totals: { ...base.totals!, vatAmount: 0, totalAmount: 54 },
        }),
      )
    renderInvoice()
    expect(await screen.findByText('VAT · Zero-rated 0%')).toBeTruthy()
    expect(screen.queryByText(/Standard 0%/)).toBeNull()
  })

  it('words the totals VAT line in natural Arabic, standard and zero-rated', async () => {
    await i18n.changeLanguage('ar')
    const view = renderInvoice()
    expect(await screen.findByText('الضريبة · القياسية 5%')).toBeTruthy()
    view.unmount()
    const base = invoice()
    invoiceResponse = () =>
      json(
        200,
        invoice({
          lines: [{ ...base.lines[0], taxCategoryCode: 'Z', en16931Category: 'Z', taxRate: 0 }],
          totals: { ...base.totals!, vatAmount: 0, totalAmount: 54 },
        }),
      )
    renderInvoice()
    expect(await screen.findByText('الضريبة · بنسبة صفرية 0%')).toBeTruthy()
  })

  it.each([
    ['en', 'S', 5, 'Standard rate · 5%'],
    ['en', 'Z', 0, 'Zero-rated · 0%'],
    ['ar', 'S', 5, 'النسبة القياسية · 5%'],
    ['ar', 'Z', 0, 'بنسبة صفرية · 0%'],
  ])('heads the VAT treatment in plain words, %s %s (A-8)', async (lang, category, rate, words) => {
    await i18n.changeLanguage(lang)
    const base = invoice()
    invoiceResponse = () =>
      json(
        200,
        invoice({
          lines: [{ ...base.lines[0], taxCategoryCode: category, en16931Category: category, taxRate: rate }],
        }),
      )
    renderInvoice()
    expect(await screen.findByText(words)).toBeTruthy()
    // "Zero-rated rate" and "نسبة بنسبة صفر" were the words this replaces.
    expect(screen.queryByText(/Zero-rated rate|نسبة بنسبة/)).toBeNull()
  })

  it('names the credit in the payments footer, so paid, credited and outstanding add up', async () => {
    receivableResponse = () =>
      json(200, {
        ...RECEIVABLE,
        documentTotal: 52.5,
        paidAmount: 0,
        creditedAmount: 10.5,
        outstandingAmount: 42,
        paymentState: 'UNPAID',
      })
    renderInvoice()
    const footer = await screen.findAllByText(
      (_, element) =>
        element?.tagName === 'SPAN' &&
        /Paid.*of.*52\.500.*·\s*Credited.*10\.500/.test(element.textContent ?? ''),
    )
    expect(footer.length).toBeGreaterThan(0)
  })

  it('names no credit in the payments footer when nothing was credited', async () => {
    renderInvoice()
    await waitFor(() => expect(screen.getAllByText('56.700')).toHaveLength(4))
    expect(
      screen.queryAllByText(
        (_, element) =>
          element?.tagName === 'SPAN' && /Paid.*of.*·\s*Credited/.test(element.textContent ?? ''),
      ),
    ).toHaveLength(0)
  })

  it('marks an invoice a till sale issued From the till, naming the till, in English and Arabic', async () => {
    invoiceResponse = () =>
      json(
        200,
        invoice({ source: 'TILL', till: { id: 't-1', code: 'T01', name: 'Front counter' } }),
      )
    renderInvoice()
    expect(await screen.findByText('From the till · Front counter')).toBeTruthy()
    cleanup()
    await i18n.changeLanguage('ar')
    renderInvoice()
    expect(await screen.findByText('من الصندوق · Front counter')).toBeTruthy()
  })

  it('draws no till mark on a document made elsewhere, or from a server that does not say', async () => {
    invoiceResponse = () => json(200, invoice({ source: 'OTHER', till: null }))
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    expect(screen.queryByText(/From the till/)).toBeNull()
    cleanup()
    invoiceResponse = () => json(200, invoice())
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    expect(screen.queryByText(/From the till/)).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderInvoice()
    expect(await screen.findByText('الرصيد المستحق')).toBeTruthy()
    // The history is its own request, so wait for it rather than assume it beat the balance.
    expect(await screen.findByText('سُجّل دفع')).toBeTruthy()
  })
})

// A self-billed document has its own page (SelfBillDetailPage, Figma 154:167694); its test lives
// beside it in src/pages/SelfBillDetailPage/selfBillDetail.test.tsx.

describe('A credit or debit note on the same page', () => {
  const NOTE_RECEIVABLE = {
    ...RECEIVABLE,
    paymentState: 'NOT_APPLICABLE',
    documentTotal: null,
    outstandingAmount: null,
    paidAmount: 0,
  }

  it('shows a credit note as a note: no due date, no payments, and its own words to cancel it', async () => {
    invoiceResponse = () =>
      json(
        200,
        invoice({
          type: 'CREDIT_NOTE',
          correctionOfInvoiceId: 'inv-0',
          invoiceNumber: 'CRN-2026-0001',
          dueDate: '2026-08-01',
        }),
      )
    receivableResponse = () => json(200, NOTE_RECEIVABLE)
    cancelResponse = () =>
      json(200, invoice({ type: 'CREDIT_NOTE', authoringState: 'CANCELLED', version: 5 }))
    renderInvoice()

    await screen.findByRole('heading', { level: 1, name: 'Credit note CRN-2026-0001' })
    expect(screen.queryByText('Due date')).toBeNull()
    expect(screen.queryByText('Payments')).toBeNull()
    expect(screen.getByText('on the note')).toBeTruthy()
    // The drop zone is drawn as designed; using it on an issued note says why nothing can be added.
    fireEvent.click(screen.getByRole('button', { name: /Drop files or click to upload/ }))
    expect(
      await screen.findByText('Files can only be added or removed while a note is a draft.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Cancel invoice' })).toBeNull()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel credit note' }))
    expect(await screen.findByRole('dialog', { name: 'Cancel this credit note?' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raised twice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the credit note' }))
    expect(await screen.findByText('The credit note is cancelled.')).toBeTruthy()
  })

  it('asks to issue a debit note in its own words, with a due date, in English and Arabic', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    const DRAFT = invoice({
      type: 'DEBIT_NOTE',
      correctionOfInvoiceId: 'inv-0',
      authoringState: 'DRAFT',
      version: 2,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      issuedAt: null,
      totals: null,
    })
    invoiceResponse = () => json(200, DRAFT)
    receivableResponse = () => json(200, NOTE_RECEIVABLE)
    const view = renderInvoice()

    fireEvent.click(await screen.findByRole('button', { name: 'Issue debit note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this debit note?' })
    expect(within(dialog).getByRole('button', { name: 'Issue debit note' })).toBeTruthy()
    expect(within(dialog).getByText('Due date')).toBeTruthy()
    view.unmount()

    await i18n.changeLanguage('ar')
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'إصدار الإشعار المدين' }))
    const arabic = await screen.findByRole('dialog', { name: 'إصدار هذا الإشعار المدين؟' })
    expect(within(arabic).getByRole('button', { name: 'إصدار الإشعار المدين' })).toBeTruthy()
  })

  it('issues a credit note without asking for a due date, sending the issue date as it', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    invoiceResponse = () =>
      json(
        200,
        invoice({
          type: 'CREDIT_NOTE',
          correctionOfInvoiceId: 'inv-0',
          authoringState: 'DRAFT',
          version: 2,
          invoiceNumber: null,
          issueDate: null,
          dueDate: null,
          issuedAt: null,
          totals: null,
        }),
      )
    receivableResponse = () => json(200, NOTE_RECEIVABLE)
    renderInvoice()

    fireEvent.click(await screen.findByRole('button', { name: 'Issue credit note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this credit note?' })
    expect(within(dialog).queryByText('Due date')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue credit note' }))
    await waitFor(() => expect(calls()).toContain(`POST /api/v1/invoice-drafts/${ID}/issue`))
    const issue = fetchMock.mock.calls.find(
      ([url]) => String(url) === `/api/v1/invoice-drafts/${ID}/issue`,
    )
    const today = muscatToday()
    expect(JSON.parse((issue?.[1] as RequestInit).body as string)).toEqual({
      expectedVersion: 2,
      issueDate: today,
      dueDate: today,
    })
  })
})

describe('Recording and reversing payments', () => {
  const body = (suffix: string) =>
    JSON.parse(
      String(
        fetchMock.mock.calls.find(
          ([url, init]) =>
            url === `${URL_BASE}${suffix}` && (init as RequestInit)?.method === 'POST',
        )?.[1]?.body,
      ),
    )
  const headers = (suffix: string) =>
    (
      fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).startsWith(`${URL_BASE}${suffix}`) &&
          (init as RequestInit)?.method === 'POST',
      )?.[1] as RequestInit
    )?.headers as Record<string, string> | Headers

  const key = (h: Record<string, string> | Headers) =>
    h instanceof Headers ? h.get('Idempotency-Key') : h['Idempotency-Key']

  it('records a payment for what is still owed, with its own idempotency key, and refreshes what it changes', async () => {
    renderInvoice()
    // The card's action reads "Add payment", as the design draws it; the dialog records it.
    fireEvent.click(await screen.findByRole('button', { name: 'Add payment' }))
    const amount = (await screen.findByRole('textbox', {
      name: /Amount received/,
    })) as HTMLInputElement
    expect(amount.value).toBe('36.700')

    fireEvent.change(screen.getByRole('textbox', { name: /Reference/ }), {
      target: { value: '  TRX-42 ' },
    })
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/payments`))
    expect(body('/payments')).toMatchObject({
      amount: 36.7,
      methodCode: '30',
      paymentReference: 'TRX-42',
    })
    expect(key(headers('/payments'))).toMatch(/^payment-[0-9a-f-]{36}$/)
    expect(await screen.findByText('Payment recorded.')).toBeTruthy()
    await waitFor(() =>
      expect(calls().filter((call) => call === `GET ${URL_BASE}/receivable`)).toHaveLength(2),
    )
  })

  it('refuses more than is owed before asking, and puts a server refusal on its field', async () => {
    payResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/invalid',
        code: 'PAYMENT_DATE_BEFORE_ISSUE_DATE',
        detail: 'no',
      })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Add payment' }))
    fireEvent.change(await screen.findByRole('textbox', { name: /Amount received/ }), {
      target: { value: '99.000' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }),
    )
    expect(await screen.findByText('That is more than is still owed on this invoice.')).toBeTruthy()
    expect(calls()).not.toContain(`POST ${URL_BASE}/payments`)

    fireEvent.change(screen.getByRole('textbox', { name: /Amount received/ }), {
      target: { value: '10.1234' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }),
    )
    expect(await screen.findByText('Use no more than 3 decimals.')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: /Amount received/ }), {
      target: { value: '10' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }),
    )
    expect(
      await screen.findByText('A payment cannot be dated before the invoice was issued.'),
    ).toBeTruthy()
  })

  it('reverses a payment after confirming, and offers no reversal of one already reversed', async () => {
    renderInvoice()
    await screen.findByText('Reversed')
    // pay-2 is reversed already; only pay-1 offers the action.
    const reverseButtons = await screen.findAllByRole('button', { name: 'Reverse' })
    expect(reverseButtons).toHaveLength(1)

    fireEvent.click(reverseButtons[0])
    expect(await screen.findByText(/stays on the record, with a reversal dated today/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reverse the payment' }))
    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/payments/pay-1/reverse`))
    expect(key(headers('/payments/pay-1/reverse'))).toMatch(/^payment-/)
    expect(await screen.findByText('Payment reversed.')).toBeTruthy()
  })

  it('offers neither to someone who may not manage payments, nor on a paid invoice', async () => {
    who = {
      ...ADMIN,
      permissions: ADMIN.permissions.filter((code) => code !== 'invoice.payment.manage'),
    }
    const { unmount } = renderInvoice()
    await screen.findByText('Reversed')
    expect(screen.queryByRole('button', { name: 'Add payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull()
    unmount()

    who = ADMIN
    receivableResponse = () =>
      json(200, { ...RECEIVABLE, outstandingAmount: 0, paidAmount: 56.7, paymentState: 'PAID' })
    renderInvoice()
    // "Paid" is both the status pill and the balance card's column label; wait for the balance.
    await waitFor(() => expect(screen.getAllByText('Paid').length).toBeGreaterThan(1))
    expect(screen.queryByRole('button', { name: 'Add payment' })).toBeNull()
  })
})

describe('Attachments', () => {
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

  it('uploads a file on a draft invoice with the permission, and refreshes the list', async () => {
    who = CAN_MANAGE_ATTACHMENTS
    invoiceResponse = () => json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null }))
    renderInvoice()
    await screen.findByText('delivery-note.pdf')

    const picked = new File(['%PDF-1.4 fake'], 'scan.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput(), { target: { files: [picked] } })

    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/attachments`))
    expect(await screen.findByText('scan.pdf')).toBeTruthy()
    await waitFor(() =>
      expect(calls().filter((call) => call === `GET ${URL_BASE}/attachments`)).toHaveLength(2),
    )
  })

  it('removes a file on a draft invoice with the permission', async () => {
    who = CAN_MANAGE_ATTACHMENTS
    invoiceResponse = () => json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null }))
    renderInvoice()
    await screen.findByText('delivery-note.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls()).toContain(`DELETE ${URL_BASE}/attachments/f-1`))
    await waitFor(() => expect(screen.queryByText('delivery-note.pdf')).toBeNull())
  })

  it('rejects an oversized or wrong-type file locally, without calling the API', async () => {
    who = CAN_MANAGE_ATTACHMENTS
    invoiceResponse = () => json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null }))
    renderInvoice()
    await screen.findByText('delivery-note.pdf')

    const wrongType = new File(['GIF87a'], 'photo.gif', { type: 'image/gif' })
    fireEvent.change(fileInput(), { target: { files: [wrongType] } })
    expect(await screen.findByText('photo.gif is not a supported file type.')).toBeTruthy()
    expect(calls()).not.toContain(`POST ${URL_BASE}/attachments`)
  })

  it('offers neither upload nor removal without the permission, or once the invoice is issued', async () => {
    who = { ...ADMIN, permissions: ['invoice.read'] }
    invoiceResponse = () => json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null }))
    const { unmount } = renderInvoice()
    await screen.findByText('delivery-note.pdf')
    expect(fileInput()).toBeNull()
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    unmount()

    who = CAN_MANAGE_ATTACHMENTS
    invoiceResponse = () => json(200, invoice({ authoringState: 'ISSUED' }))
    renderInvoice()
    await screen.findByText('delivery-note.pdf')
    expect(fileInput()).toBeNull()
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('invoice detail mapping', () => {
  it('reads the status from the state, and from what is owed once issued', () => {
    expect(statusOf(invoice({ authoringState: 'DRAFT' }), null).tone).toBe('draft')
    expect(statusOf(invoice({ authoringState: 'CANCELLED' }), RECEIVABLE).tone).toBe('cancelled')
    expect(statusOf(invoice(), { ...RECEIVABLE, paymentState: 'PAID', overdue: false }).tone).toBe(
      'paid',
    )
    expect(statusOf(invoice(), { ...RECEIVABLE, overdue: true }).tone).toBe('overdue')
    // The pill counts the days late from the due date, as the balance line does.
    expect(statusOf(invoice(), { ...RECEIVABLE, overdue: true }, '2026-10-07')).toMatchObject({
      key: 'invoicesPage.payment.overdue',
      values: { count: 7 },
    })
    expect(i18n.t('invoicesPage.payment.overdue', { count: 7 })).toBe('Overdue · 7 days')
    expect(i18n.t('invoicesPage.payment.overdue', { count: 1 })).toBe('Overdue · 1 day')
    // Nothing is owed on a credit note, so it reads as issued rather than as unpaid.
    expect(
      statusOf(invoice({ type: 'CREDIT_NOTE' }), { ...RECEIVABLE, paymentState: 'NOT_APPLICABLE' })
        .tone,
    ).toBe('issued')
  })

  it('says what a payment would be refused for before it is sent', () => {
    const context = {
      outstanding: 36.7,
      currency: 'OMR',
      issueDate: '2026-08-01',
      today: '2026-09-16',
    }
    const form = { amount: '10.000', methodCode: '30', reference: '', paymentDate: '2026-09-01' }
    expect(paymentProblems(form, context)).toEqual({})
    expect(paymentProblems({ ...form, amount: '' }, context)).toEqual({
      amount: 'invoiceDetails.pay.error.amountRequired',
    })
    expect(paymentProblems({ ...form, amount: '0' }, context)).toEqual({
      amount: 'invoiceDetails.pay.error.amountPositive',
    })
    expect(paymentProblems({ ...form, amount: '1.0001' }, context)).toEqual({
      amount: 'invoiceDetails.pay.error.amountScale',
    })
    expect(paymentProblems({ ...form, amount: '36.701' }, context)).toEqual({
      amount: 'invoiceDetails.pay.error.amountTooMuch',
    })
    expect(paymentProblems({ ...form, paymentDate: '2026-09-17' }, context)).toEqual({
      paymentDate: 'invoiceDetails.pay.error.dateFuture',
    })
    expect(paymentProblems({ ...form, paymentDate: '2026-07-31' }, context)).toEqual({
      paymentDate: 'invoiceDetails.pay.error.dateBeforeIssue',
    })
  })

  it('says what issuing would be refused for, and dates the due day from the terms', () => {
    expect(issueProblems({ issueDate: '2026-09-16', dueDate: '2026-10-16' }, '2026-09-16')).toEqual(
      {},
    )
    expect(issueProblems({ issueDate: '2026-09-17', dueDate: '2026-10-16' }, '2026-09-16')).toEqual(
      { issueDate: 'invoiceIssue.error.issueDateFuture' },
    )
    expect(issueProblems({ issueDate: '2025-12-31', dueDate: '2026-01-30' }, '2026-09-16')).toEqual(
      { issueDate: 'invoiceIssue.error.issueDateYear' },
    )
    expect(issueProblems({ issueDate: '2026-09-16', dueDate: '2026-09-15' }, '2026-09-16')).toEqual(
      { dueDate: 'invoiceIssue.error.dueDateBeforeIssue' },
    )
    // The same day is allowed.
    expect(issueProblems({ issueDate: '2026-09-16', dueDate: '2026-09-16' }, '2026-09-16')).toEqual(
      {},
    )
    expect(dueDateFor(SEEDED_REFERENCE, '2026-12-20', 'NET30')).toBe('2027-01-19')
    // Terms this build has no day count for leave the due date on the issue date, for the reader to set.
    expect(dueDateFor(SEEDED_REFERENCE, '2026-09-16', 'EOM')).toBe('2026-09-16')
  })

  it('names a readiness reason it has no sentence for rather than hiding it', () => {
    const refusal = issueRefusalOf(
      new ApiError({ status: 409, problemType: 'resource-conflict', code: 'IDENTITY_NOT_READY' }),
    )
    expect(refusal).toEqual({
      field: null,
      key: 'invoiceIssue.refused.notReady',
      values: { reason: 'IDENTITY_NOT_READY' },
    })
    // A 409 with no code is not a readiness refusal; the general failure text answers it.
    expect(
      issueRefusalOf(new ApiError({ status: 409, problemType: 'resource-conflict' })),
    ).toBeNull()
  })

  it('folds a reversal into the payment it undoes', () => {
    const rows = paymentRows(PAYMENTS)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.reversed)).toEqual([false, true])
  })

  it('keeps an event this build does not know rather than dropping it', () => {
    const entries = timelineOf(
      {
        entries: [
          {
            id: 'h-9',
            eventType: 'SOMETHING_NEW',
            outcome: 'REFUSED',
            invoiceVersion: 1,
            changedFieldsHash: null,
            actorId: 'u-1',
            occurredAt: '2026-08-01T07:00:00Z',
          },
        ],
        truncated: false,
        limit: 200,
      },
      'u-1',
    )
    expect(entries).toEqual([
      {
        key: 'invoiceDetails.event.other',
        at: '2026-08-01T07:00:00Z',
        byYou: true,
        outcome: 'REFUSED',
      },
    ])
  })
})

describe('Send', () => {
  const sends = () => calls().filter((call) => call === `POST ${URL_BASE}/send`)
  const dispatchReads = () => calls().filter((call) => call === `GET ${URL_BASE}/dispatch`)

  it('sends this invoice once, with its own Idempotency-Key, and shows what the server says', async () => {
    who = SENDER
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Send invoice INV-2026-0042?')).toBeTruthy()

    const submit = within(dialog).getByRole('button', { name: 'Send invoice' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(
      await screen.findByText('The invoice was validated and queued for sending.'),
    ).toBeTruthy()
    expect(sends()).toHaveLength(1)
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url) === `${URL_BASE}/send`)!
    expect(new Headers((init as RequestInit).headers).get('Idempotency-Key')).toMatch(
      /^send-[0-9a-f-]{36}$/,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    // Under the title and in the delivery bar, both the server's answer; Send is gone with `sendable`.
    expect(screen.getAllByText('Validated and queued for sending')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('offers no Send to a reader who may not issue', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    await waitFor(() => expect(dispatchReads()).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  // The design draws Send on every issued invoice: an unreadable dispatch keeps it, and the server
  // answers the press.
  it('keeps the designed Send when the dispatch cannot be read', async () => {
    who = SENDER
    dispatchResponse = () => json(404, { type: 'https://api.fawtir.om/problems/not-found' })
    renderInvoice()
    await waitFor(() => expect(dispatchReads()).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Send' })).toBeTruthy()
    expect(sends()).toHaveLength(0)
  })

  it('offers no Send once the server says the invoice is not sendable, and says where it stands', async () => {
    who = SENDER
    dispatchResponse = () => json(200, QUEUED)
    renderInvoice()
    expect(await screen.findAllByText('Validated and queued for sending')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(sends()).toHaveLength(0)
  })

  it('keeps a refusal of the request in the dialog, in words, not the server detail', async () => {
    who = SENDER
    sendResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/dispatch-in-progress',
        code: 'DISPATCH_IN_PROGRESS',
        detail: 'This invoice is already being sent',
      })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invoice' }))

    expect(
      await within(dialog).findByText(
        'This invoice is already being sent. Check again in a moment.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  // Backend V386 part 2: `sendable` does not account for sender standing, so Send stays offered and
  // the press answers 409 with the standing code (AuthoredInvoiceSendService).
  it('says a sender-standing refusal in words, not "reload", and keeps Send', async () => {
    who = SENDER
    sendResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        code: 'SENDER_PARTICIPANT_NOT_REGISTERED',
        detail: 'Your company has no verified Peppol participant yet, so it cannot send documents.',
      })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invoice' }))

    expect(
      await within(dialog).findByText(/^Your company's Peppol participant is not verified yet, so invoices cannot be sent\./),
    ).toBeTruthy()
    expect(screen.queryByText(/Reload to see the latest version|Someone changed this/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/SENDER_PARTICIPANT_NOT_REGISTERED|no verified Peppol participant yet/)
    expect(sends()).toHaveLength(1)
  })

  it('words the ownership-review refusal in Arabic', async () => {
    await i18n.changeLanguage('ar')
    who = SENDER
    sendResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        code: 'SENDER_PARTICIPANT_CLAIM_CONFLICT',
      })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('invoiceDetails.actions.send') }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('invoiceDispatch.modal.submit') }))
    expect(
      await within(dialog).findByText(i18n.t('invoiceDispatch.refused.senderClaimConflict')),
    ).toBeTruthy()
    expect(i18n.t('invoiceDispatch.refused.senderClaimConflict')).toMatch(/مراجعة الملكية/)
  })

  describe('moving to another invoice on the same page', () => {
    const ID_B = '22222222-2222-2222-2222-222222222222'
    const URL_B = `/api/v1/authored-invoices/${ID_B}`
    const REFUSED: InvoiceDispatchDto = {
      ...NOT_SENT,
      state: 'DEAD_LETTERED',
      reasonCode: 'SELLER_ADDRESS_INCOMPLETE',
      attempts: 1,
      sendable: false,
    }

    /** Invoice B answers like A except for its id and number; its dispatch is NOT_SENT and sendable. */
    function withInvoiceB() {
      const base = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === URL_B) return json(200, invoice({ id: ID_B, invoiceNumber: 'INV-2026-0043' }))
        if (url === `${URL_B}/dispatch`) return json(200, NOT_SENT)
        if (url.startsWith(URL_B)) return base(url.replace(URL_B, URL_BASE), init)
        return base(url, init)
      })
    }

    // The header search links straight to /invoices/{id}, which keeps this page mounted.
    function renderWithLinkToB() {
      return render(
        <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
          <MemoryRouter initialEntries={[`/invoices/${ID}`]}>
            <Link to={`/invoices/${ID_B}`}>open B</Link>
            <Link to={`/invoices/${ID}`}>open A</Link>
            <Routes>
              <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
            </Routes>
          </MemoryRouter>
        </ReferenceDataContext.Provider>,
      )
    }

    it("does not paint invoice A's Send answer on invoice B", async () => {
      who = SENDER
      withInvoiceB()
      sendResponse = () =>
        json(200, {
          ...DISPATCHED,
          outcome: 'REFUSED',
          reasonCode: 'SELLER_ADDRESS_INCOMPLETE',
          dispatch: REFUSED,
        })
      renderWithLinkToB()
      fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send invoice' }),
      )
      expect(await screen.findByText(/^Not sent: needs attention · /)).toBeTruthy()
      // The notice on A carries the refusal sentence on its own.
      const refusal = /^Your company address on this invoice is incomplete/
      expect(screen.getByText(refusal)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()

      fireEvent.click(screen.getByRole('link', { name: 'open B' }))
      await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0043' })
      // B's own dispatch decides: not sent yet, and Send offered by its `sendable`.
      expect(await screen.findByRole('button', { name: 'Send' })).toBeTruthy()
      expect(screen.queryByText(/^Not sent: needs attention/)).toBeNull()
      expect(screen.getAllByText('Not sent yet').length).toBeGreaterThan(0)
      // A's notice does not follow the reader either.
      expect(screen.queryByText(refusal)).toBeNull()

      // Back on A, the server's read decides again, not the answer kept from before.
      fireEvent.click(screen.getByRole('link', { name: 'open A' }))
      await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
      expect(await screen.findByRole('button', { name: 'Send' })).toBeTruthy()
      expect(screen.queryByText(refusal)).toBeNull()
    })

    it('closes an open Send confirmation when the reader opens another invoice', async () => {
      who = SENDER
      withInvoiceB()
      renderWithLinkToB()
      fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
      const dialogA = await screen.findByRole('dialog')
      expect(within(dialogA).getByText('Send invoice INV-2026-0042?')).toBeTruthy()

      fireEvent.click(screen.getByRole('link', { name: 'open B' }))
      await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0043' })
      expect(screen.queryByRole('dialog')).toBeNull()

      // B's own confirmation, its key minted when it opened, posts to B only.
      fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
      const dialogB = await screen.findByRole('dialog')
      expect(within(dialogB).getByText('Send invoice INV-2026-0043?')).toBeTruthy()
      fireEvent.click(within(dialogB).getByRole('button', { name: 'Send invoice' }))
      await waitFor(() => expect(calls()).toContain(`POST ${URL_B}/send`))
      expect(calls().filter((call) => call.endsWith('/send'))).toEqual([`POST ${URL_B}/send`])
    })
  })

  it('says why a refused invoice cannot be sent and what to do instead', async () => {
    who = SENDER
    const refused: InvoiceDispatchDto = {
      ...NOT_SENT,
      state: 'DEAD_LETTERED',
      reasonCode: 'SELLER_ADDRESS_INCOMPLETE',
      attempts: 1,
      sendable: false,
    }
    sendResponse = () =>
      json(200, {
        ...DISPATCHED,
        outcome: 'REFUSED',
        reasonCode: 'SELLER_ADDRESS_INCOMPLETE',
        dispatch: refused,
      })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send invoice' }),
    )

    const sentence =
      'Your company address on this invoice is incomplete. It was fixed when the invoice was issued, so this invoice cannot be sent: cancel it and issue a new one after completing the address.'
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.getByText(`Not sent: needs attention · ${sentence}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  const AWAITING_MLS = "Received by the receiver's access point, awaiting its delivery status"
  /** The delivery bar's glyph: green tick for a delivery, grey clock for anything short of one. */
  const barTicked = (barText: string) =>
    screen
      .getAllByText(barText)
      .map((node) => node.previousElementSibling?.getAttribute('class') ?? '')
      .some((className) => className.includes('text-success-700'))

  // Before, only PROCESSING and an active transmission were watched, so the AS4 receipt and the
  // MLS reached the page only on a reload.
  it('keeps reading through QUEUED, SENDING and SENT until the MLS outcome, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const answers: InvoiceDispatchDto[] = [
        { ...NOT_SENT, state: 'PROCESSING', sendable: false },
        QUEUED,
        { ...QUEUED, state: 'SENDING' },
        { ...QUEUED, state: 'SENT' },
        { ...QUEUED, state: 'DELIVERED' },
      ]
      let reads = 0
      dispatchResponse = () => json(200, answers[Math.min(reads++, answers.length - 1)])
      renderInvoice()
      expect(await screen.findAllByText('Being prepared for sending')).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(3000)
      expect(await screen.findAllByText('Validated and queued for sending')).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(5000)
      expect(await screen.findAllByText('Sending')).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(8000)
      expect(await screen.findAllByText(AWAITING_MLS)).toHaveLength(2)
      expect(barTicked(AWAITING_MLS)).toBe(false)
      await vi.advanceTimersByTimeAsync(13000)
      expect(await screen.findAllByText('Delivered')).toHaveLength(2)
      expect(barTicked('Delivered')).toBe(true)
      expect(dispatchReads()).toHaveLength(5)

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(dispatchReads()).toHaveLength(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops asking after its cap when the MLS never comes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      dispatchResponse = () => json(200, { ...QUEUED, state: 'SENT' } satisfies InvoiceDispatchDto)
      renderInvoice()
      expect(await screen.findAllByText(AWAITING_MLS)).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      // The page's own read, then fifteen re-reads over about ten minutes, then nothing.
      expect(dispatchReads()).toHaveLength(16)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(dispatchReads()).toHaveLength(16)
      expect(barTicked(AWAITING_MLS)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not re-read an outcome', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      dispatchResponse = () =>
        json(200, { ...QUEUED, state: 'UNDELIVERABLE' } satisfies InvoiceDispatchDto)
      renderInvoice()
      expect(await screen.findAllByText('Could not be delivered')).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(dispatchReads()).toHaveLength(1)
      expect(barTicked('Could not be delivered')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  // `peppolResponse` and `deliveredAt` are TODO(backend): an RE in them must not read as delivered.
  it('claims no delivery from the unanswered response fields', async () => {
    invoiceResponse = () =>
      json(200, invoice({ peppolResponse: 'RE', deliveredAt: '2026-10-04T10:05:00Z' }))
    dispatchResponse = () => json(200, { ...QUEUED, state: 'SENT' } satisfies InvoiceDispatchDto)
    renderInvoice()
    expect(await screen.findAllByText(AWAITING_MLS)).toHaveLength(2)
    expect(screen.queryByText('Sent via Peppol')).toBeNull()
    expect(screen.queryByText(/Delivered on Peppol/)).toBeNull()
    expect(barTicked(AWAITING_MLS)).toBe(false)
  })

  it('says the access point received it, awaiting its delivery status, in Arabic', async () => {
    await i18n.changeLanguage('ar')
    dispatchResponse = () => json(200, { ...QUEUED, state: 'SENT' } satisfies InvoiceDispatchDto)
    renderInvoice()
    expect(
      await screen.findAllByText('استلمتها نقطة الوصول لدى المستلم، بانتظار حالة التسليم'),
    ).toHaveLength(2)
  })

  it('says how the buyer is reached, from the server, never from the customer preference', async () => {
    dispatchResponse = () =>
      json(200, { ...QUEUED, buyerDelivery: 'PEPPOL' } satisfies InvoiceDispatchDto)
    renderInvoice()
    expect(
      await screen.findByText(
        'Validated and queued for sending · The buyer receives it over Peppol',
      ),
    ).toBeTruthy()
  })

  it('releases a held buyer e-mail from the menu, once, only when the server allows it', async () => {
    who = SENDER
    const held: InvoiceDispatchDto = {
      ...QUEUED,
      buyerDelivery: 'EMAIL_HELD',
      buyerEmailReleasable: true,
    }
    dispatchResponse = () => json(200, held)
    let released = 0
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `${URL_BASE}/buyer-email/release` && init?.method === 'POST') {
        released += 1
        return json(200, { ...held, buyerDelivery: 'EMAIL_SENT', buyerEmailReleasable: false })
      }
      return base(url, init)
    })
    renderInvoice()
    await screen.findByText(/Buyer e-mail copy held/)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Send held e-mail to buyer' }))

    expect(await screen.findByText('The held e-mail was released to the buyer.')).toBeTruthy()
    expect(released).toBe(1)
    expect(screen.getByText(/E-mailed to the buyer/)).toBeTruthy()
  })

  it('offers no release while the server says nothing may be released', async () => {
    who = SENDER
    dispatchResponse = () =>
      json(200, { ...QUEUED, buyerDelivery: 'EMAIL_HELD', buyerEmailReleasable: false })
    renderInvoice()
    await screen.findByText(/Buyer e-mail copy held/)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Send held e-mail to buyer' })).toBeNull()
  })

  // Review L4: a quiet re-read that set out before the release answered must not repaint the
  // state from before it.
  it('drops a quiet read that set out before the release answered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      who = SENDER
      const held: InvoiceDispatchDto = {
        ...QUEUED,
        buyerDelivery: 'EMAIL_HELD',
        buyerEmailReleasable: true,
        // The Tax Authority leg still on its way is what keeps the page re-reading.
        transport: {
          buyer: null,
          taxAuthority: {
            messageId: 'm-2',
            state: 'QUEUED_NOT_ATTEMPTED',
            attempts: 0,
            lastAttemptAt: null,
            nextAttemptAt: null,
          },
        },
      }
      let reads = 0
      let answerQuietRead: () => void = () => undefined
      const base = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === `${URL_BASE}/dispatch`) {
          reads += 1
          if (reads === 1) return json(200, held)
          return new Promise<Response>((resolve) => {
            answerQuietRead = () => resolve(json(200, held))
          })
        }
        if (url === `${URL_BASE}/buyer-email/release` && init?.method === 'POST') {
          return json(200, { ...held, buyerDelivery: 'EMAIL_SENT', buyerEmailReleasable: false })
        }
        return base(url, init)
      })
      renderInvoice()
      await screen.findByText(/Buyer e-mail copy held/)
      await vi.advanceTimersByTimeAsync(3000)
      expect(reads).toBe(2)

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Send held e-mail to buyer' }))
      expect(await screen.findByText('The held e-mail was released to the buyer.')).toBeTruthy()
      expect(screen.getByText(/E-mailed to the buyer/)).toBeTruthy()

      answerQuietRead()
      await vi.advanceTimersByTimeAsync(50)
      expect(screen.getByText(/E-mailed to the buyer/)).toBeTruthy()
      expect(screen.queryByText(/Buyer e-mail copy held/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('is offered and answered in Arabic', async () => {
    await i18n.changeLanguage('ar')
    who = SENDER
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'إرسال' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('إرسال الفاتورة INV-2026-0042؟')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال الفاتورة' }))
    expect(await screen.findByText('تم التحقق من الفاتورة ووُضعت في قائمة الإرسال.')).toBeTruthy()
    expect(screen.getAllByText('تم التحقق منها وهي في قائمة الإرسال')).toHaveLength(2)
  })
})

describe('E28: a read-only subscription hides new documents and sending (plan v4 §8)', () => {
  const OWNER: Entitlements = {
    ...SENDER,
    permissions: [...SENDER.permissions, 'tenant.plan.read', 'debitnote.create'],
  }
  const standing = (restriction: string | null, extra: Record<string, unknown> = {}) => ({
    tracked: true,
    access: restriction ? 'PAYMENT_REQUIRED' : 'ACTIVE',
    restrictionsEnforced: true,
    restriction,
    today: '2026-10-22',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodPrice: '80.000',
    trialStartsOn: null,
    trialEndsOn: null,
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: '2026-10-14',
    renewsOn: '2026-10-15',
    graceDays: 7,
    graceUntil: '2026-10-21',
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: null,
    enterprise: null,
    ...extra,
  })
  const subscriptionReads = () =>
    calls().filter((call) => call === 'GET /api/v1/settings/subscription')

  it('offers Credit note and Send while the subscription is usable', async () => {
    who = OWNER
    subscriptionResponse = () => json(200, standing(null))
    renderInvoice()
    expect(await screen.findByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Credit note' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(
      await screen.findByRole('menuitem', { name: i18n.t('salesNote.debit.action') }),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('invoiceDetails.actions.duplicate') }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('invoiceDetails.actions.periodic') })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send by email' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share on WhatsApp' })).toBeTruthy()
  })

  it.each([
    ['suspended', standing('SUBSCRIPTION_SUSPENDED')],
    ['trial ended unpaid', standing('SUBSCRIPTION_SUSPENDED', { paidThrough: null, trialEndsOn: '2026-10-21' })],
    ['cancelled', standing('SUBSCRIPTION_CANCELLED', { access: 'CANCELLED' })],
    ['not started', standing('SUBSCRIPTION_NOT_STARTED', { paidThrough: null })],
  ])('hides Credit note, Debit note, Send, Duplicate and periodic while %s; reading stays', async (_, status) => {
    who = OWNER
    subscriptionResponse = () => json(200, status)
    receivableResponse = () => json(200, UNSETTLED)
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    await waitFor(() => expect(subscriptionReads().length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Send' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Credit note' })).toBeNull()
    // The overflow menu keeps cancelling but no longer offers a debit note.
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Cancel invoice' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: i18n.t('salesNote.debit.action') })).toBeNull()
    // No new drafts while read-only (owner, 23 Oct 2026): no Duplicate, no periodic invoice.
    expect(
      screen.queryByRole('link', { name: i18n.t('invoiceDetails.actions.duplicate') }),
    ).toBeNull()
    expect(screen.queryByRole('link', { name: i18n.t('invoiceDetails.actions.periodic') })).toBeNull()
    // Nothing is shared while read-only (owner, 23 Oct 2026); Download and Print stay.
    expect(screen.queryByRole('button', { name: 'Send by email' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share on WhatsApp' })).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('invoiceDetails.print') })).toBeTruthy()
  })
})

describe('Transport progress', () => {
  // TEST, 7 October 2026: the ledger said SENDING the moment a transport record existed, and the
  // page said "Sending" while nothing had been attempted.
  const queuedLeg = (messageId: string) => ({
    messageId,
    state: 'QUEUED_NOT_ATTEMPTED' as const,
    attempts: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
  })
  const SENDING_UNATTEMPTED: InvoiceDispatchDto = {
    ...QUEUED,
    state: 'SENDING',
    buyerDelivery: 'PEPPOL',
    transport: { buyer: queuedLeg('m-1'), taxAuthority: queuedLeg('m-2') },
  }

  it('says queued, not sending, while no transmission has been attempted', async () => {
    dispatchResponse = () => json(200, SENDING_UNATTEMPTED)
    renderInvoice()
    expect(await screen.findByText('Queued for transmission, not yet sent')).toBeTruthy()
    // The ledger in this harness holds no record for the number, so the report is said to be
    // unavailable rather than left unsaid.
    expect(
      await screen.findByText(
        [
          'Queued for transmission, not yet sent',
          'The buyer receives it over Peppol',
          'To the buyer: queued for transmission, not yet sent',
          'To the Tax Authority: queued for transmission, not yet sent',
          'Tax Authority report: status not available on this page',
        ].join(' · '),
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Sending')).toBeNull()
  })

  it('names a scheduled retry and the leg it belongs to', async () => {
    dispatchResponse = () =>
      json(200, {
        ...SENDING_UNATTEMPTED,
        transport: {
          buyer: {
            ...queuedLeg('m-1'),
            state: 'RETRY_SCHEDULED',
            attempts: 2,
            lastAttemptAt: '2026-10-07T10:00:00Z',
            nextAttemptAt: '2026-10-07T10:04:00Z',
          },
          taxAuthority: null,
        },
      } satisfies InvoiceDispatchDto)
    renderInvoice()
    expect(await screen.findByText('Transmission failed and will be retried')).toBeTruthy()
    expect(screen.getByText(/To the buyer: failed, next attempt /)).toBeTruthy()
    expect(screen.queryByText(/To the Tax Authority/)).toBeNull()
  })

  it('keeps the ledger sentence when the server sends no transport record', async () => {
    dispatchResponse = () => json(200, { ...QUEUED, state: 'SENDING' } satisfies InvoiceDispatchDto)
    renderInvoice()
    expect(await screen.findAllByText('Sending')).toHaveLength(2)
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    dispatchResponse = () => json(200, SENDING_UNATTEMPTED)
    renderInvoice()
    expect(await screen.findByText('في قائمة الإرسال، لم تُرسل بعد')).toBeTruthy()
    expect(screen.getByText(/إلى جهاز الضرائب: في قائمة الإرسال، لم تُرسل بعد/)).toBeTruthy()
    expect(screen.queryByText('جارٍ الإرسال')).toBeNull()
  })
})

// Audit A1 F-10: the dispatch's Tax Authority leg ends at the AS4 receipt, so C5's answer to the
// TDD was never on the invoice. It is read from the compliance record proven to be this invoice's.
describe('the Tax Authority report on the invoice', () => {
  const UUID = '0f9e8d7c-0000-5000-8000-000000000042'
  const LIST_URL =
    '/api/v1/compliance/activity?direction=ISSUED&invoice_number=INV-2026-0042&page=0&page_size=5'
  const DETAIL_URL = `/api/v1/compliance/activity/${UUID}`
  const transmittedLeg = (messageId: string) => ({
    messageId,
    state: 'TRANSMITTED' as const,
    attempts: 1,
    lastAttemptAt: '2026-10-19T08:00:00Z',
    nextAttemptAt: null,
  })
  const DELIVERED_BOTH: InvoiceDispatchDto = {
    ...QUEUED,
    state: 'DELIVERED',
    buyerDelivery: 'PEPPOL',
    transport: { buyer: transmittedLeg('m-1'), taxAuthority: transmittedLeg('m-2') },
  }
  type Leg = NonNullable<ActivityItemDto['tdd_leg']>
  const tddLeg = (overrides: Partial<Leg> = {}): Leg => ({
    variant: 'SUBMIT',
    status: 'SUBMITTED',
    validated_at: '2026-10-19T08:00:00Z',
    sla_deadline: '2026-10-19T08:15:00Z',
    submitted_at: '2026-10-19T08:00:30Z',
    sla_met: true,
    ack: 'NONE',
    ack_at: null,
    reason: null,
    delivered_at: '2026-10-19T08:01:00Z',
    transport_state: 'DELIVERED',
    correction_held: false,
    ...overrides,
  })
  const row = (uuid: string, leg: Leg | null, links: Partial<ActivityItemDto['links']> = {}): ActivityItemDto => ({
    invoice_uuid: uuid,
    direction: 'ISSUED',
    document_kind: 'STANDARD_INVOICE',
    document_type_code: null,
    invoice_number: 'INV-2026-0042',
    counterparty: '0248:OM1100999001',
    occurred_at: '2026-10-19T08:00:00Z',
    validated_at: '2026-10-19T08:00:00Z',
    b2c: false,
    transport_state: 'DELIVERED',
    invoice_leg: { ack: 'AP', ack_at: '2026-10-19T08:00:40Z', reason: null },
    tdd_leg: leg,
    attention: false,
    links: { document: '/api/v1/invoices/s-1', tdd_xml: '/api/v1/invoices/s-1/tdd', resubmit: null, ...links },
  })
  const detailOf = (summary: ActivityItemDto, transmissionIds: string[]): ActivityDetailDto => ({
    invoice_uuid: summary.invoice_uuid,
    summary,
    tdd_lineage: [],
    mls: [],
    transmissions: transmissionIds.map((id) => ({
      id,
      channel: 'TDD',
      direction: 'OUTBOUND',
      state: 'DELIVERED',
      attempts: 1,
      last_attempt_at: null,
      last_failure_reason: null,
      sbdh_instance_identifier: null,
      last_mls_code: null,
      created_at: '2026-10-19T08:00:00Z',
    })),
  })
  /** One proven record for this invoice, answering `legs` in turn on each read. */
  const serve = (legs: (Leg | null)[], links: Partial<ActivityItemDto['links']> = {}) => {
    let reads = 0
    activityListResponse = () =>
      json(200, { items: [row(UUID, legs[0], links)], page: 0, page_size: 5, has_more: false })
    activityDetails[UUID] = () =>
      json(200, detailOf(row(UUID, legs[Math.min(reads++, legs.length - 1)], links), ['m-1', 'm-2']))
  }
  /** An hour after the fixtures' validation: inside the window in which a record is re-read. */
  const TODAY = new Date('2026-10-19T09:00:00Z')
  const listReads = () => calls().filter((call) => call === `GET ${LIST_URL}`)
  const detailReads = () => calls().filter((call) => call === `GET ${DETAIL_URL}`)

  // Review of #250, L1: an old document whose report never settles (the TEST transport hold, or
  // a C5 that never answered) is read once, not re-read on every visit.
  it('reads the record of an old invoice once and does not keep re-reading it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-21T09:00:00Z'))
    try {
      dispatchResponse = () => json(200, DELIVERED_BOTH)
      serve([tddLeg({ delivered_at: null, transport_state: 'PENDING' })])
      renderInvoice()
      expect(
        await screen.findByText(/Tax Authority report: not delivered to the Tax Authority yet/),
      ).toBeTruthy()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(detailReads()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // Review of #250, L2: a record that lands just after the first lookup is found on one retry.
  it('asks an unproven lookup once more and shows a record that landed late', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
    try {
      dispatchResponse = () => json(200, DELIVERED_BOTH)
      serve([tddLeg({ ack: 'AP', status: 'ACCEPTED', ack_at: '2026-10-19T08:02:00Z' })])
      const landed = activityListResponse
      let lists = 0
      activityListResponse = () =>
        lists++ === 0
          ? json(200, { items: [], page: 0, page_size: 5, has_more: false })
          : landed()
      renderInvoice()
      expect(
        await screen.findByText(/Tax Authority report: status not available on this page/),
      ).toBeTruthy()
      await vi.advanceTimersByTimeAsync(3000)
      expect(await screen.findByText(/Tax Authority report: accepted/)).toBeTruthy()
      expect(listReads()).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries an unproven lookup only once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
    try {
      dispatchResponse = () => json(200, DELIVERED_BOTH)
      renderInvoice()
      expect(
        await screen.findByText(/Tax Authority report: status not available on this page/),
      ).toBeTruthy()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(listReads()).toHaveLength(2)
      expect(screen.getByText(/Tax Authority report: status not available on this page/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows C5's acceptance once the record is proven, from one list and one detail read", async () => {
    dispatchResponse = () => json(200, DELIVERED_BOTH)
    serve([tddLeg({ ack: 'AP', status: 'ACCEPTED', ack_at: '2026-10-19T08:02:00Z' })])
    renderInvoice()
    expect(await screen.findByText(/Tax Authority report: accepted/)).toBeTruthy()
    expect(listReads()).toHaveLength(1)
    expect(detailReads()).toHaveLength(1)
    expect(calls().filter((call) => !call.startsWith('GET '))).toEqual([])
  })

  it('keeps reading past the AS4 receipt until C5 answers, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
    try {
      dispatchResponse = () => json(200, DELIVERED_BOTH)
      serve([
        tddLeg({ delivered_at: null, transport_state: 'SENDING' }),
        tddLeg(),
        tddLeg({ ack: 'AP', status: 'ACCEPTED', ack_at: '2026-10-19T08:02:00Z' }),
      ])
      renderInvoice()
      expect(
        await screen.findByText(/Tax Authority report: not delivered to the Tax Authority yet/),
      ).toBeTruthy()
      // The pending report never ticks anything nor reads as delivered.
      expect(screen.queryByText(/Tax Authority report: accepted/)).toBeNull()
      await vi.advanceTimersByTimeAsync(3000)
      expect(
        await screen.findByText(/Tax Authority report: delivered, awaiting the Tax Authority's answer/),
      ).toBeTruthy()
      await vi.advanceTimersByTimeAsync(5000)
      expect(await screen.findByText(/Tax Authority report: accepted/)).toBeTruthy()
      const reads = detailReads().length
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(detailReads()).toHaveLength(reads)
      // Found once; only the proven record is re-read.
      expect(listReads()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says not available when no record holds this invoice\'s transport rows', async () => {
    dispatchResponse = () => json(200, DELIVERED_BOTH)
    activityListResponse = () =>
      json(200, { items: [row(UUID, tddLeg({ ack: 'AP' }))], page: 0, page_size: 5, has_more: false })
    activityDetails[UUID] = () => json(200, detailOf(row(UUID, tddLeg({ ack: 'AP' })), ['m-other']))
    renderInvoice()
    expect(await screen.findByText(/Tax Authority report: status not available on this page/)).toBeTruthy()
    expect(screen.queryByText(/Tax Authority report: accepted/)).toBeNull()
  })

  it('says not available to a person the ledger refuses, and reads no record', async () => {
    dispatchResponse = () => json(200, DELIVERED_BOTH)
    activityListResponse = () =>
      json(403, { type: 'https://api.fawtir.om/problems/branch-scope-company-report' })
    renderInvoice()
    expect(await screen.findByText(/Tax Authority report: status not available on this page/)).toBeTruthy()
    expect(detailReads()).toHaveLength(0)
  })

  it('asks nothing of the ledger before a transport row exists', async () => {
    dispatchResponse = () => json(200, { ...QUEUED, state: 'SENDING' } satisfies InvoiceDispatchDto)
    renderInvoice()
    expect(await screen.findAllByText('Sending')).toHaveLength(2)
    // The sidebar's own badge reads /compliance/activity/summary; nothing else may.
    expect(
      calls().filter(
        (call) => call.includes('/compliance/activity') && !call.includes('/compliance/activity/summary'),
      ),
    ).toEqual([])
    expect(screen.queryByText(/Tax Authority report/)).toBeNull()
  })

  it('words a refusal and points at the record, offering no resubmit here', async () => {
    who = { ...SENDER, permissions: [...SENDER.permissions, 'invoice.submit'] }
    dispatchResponse = () => json(200, DELIVERED_BOTH)
    serve([tddLeg({ ack: 'RE', status: 'REJECTED', reason: 'IBR-TDD-57 failed' })], {
      resubmit: '/api/v1/invoices/s-1/tdd/resubmit',
    })
    renderInvoice()
    expect(
      await screen.findByText(
        /Tax Authority report: turned down\. The reason is on its record in Compliance › Activity · It can be resubmitted from that record/,
      ),
    ).toBeTruthy()
    // C5's own English reason stays on the record, and no button posts anything from this page.
    expect(screen.queryByText(/IBR-TDD-57/)).toBeNull()
    expect(screen.queryByRole('button', { name: /resubmit/i })).toBeNull()
    expect(calls().filter((call) => call.startsWith('POST '))).toEqual([])
  })

  it('says a report past its deadline that has not reached C5', async () => {
    dispatchResponse = () => json(200, DELIVERED_BOTH)
    // Dead-lettered by the SLA watchdog while the transport still retries: not stopped.
    serve([
      tddLeg({
        status: 'DEAD_LETTERED',
        transport_state: 'RETRY_SCHEDULED',
        delivered_at: null,
        sla_met: false,
      }),
    ])
    renderInvoice()
    expect(
      await screen.findByText(
        /Tax Authority report: not delivered to the Tax Authority yet · Its reporting deadline has passed/,
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/stopped at Fawtir/)).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    dispatchResponse = () => json(200, DELIVERED_BOTH)
    serve([tddLeg({ ack: 'AB', status: 'DELIVERED_UNCONFIRMED' })])
    renderInvoice()
    expect(await screen.findByText(/إبلاغ جهاز الضرائب: سُلّم دون تأكيد، ولا يُحتسب مقبولًا/)).toBeTruthy()
  })
})

describe('self-billed documents', () => {
  // Owner decision, 6 Oct 2026: self-billing is a purchase and lives under Expenditure, so an old
  // /invoices link to a self-billed document opens its Expenditure page instead.
  it.each(['SELF_BILLED_INVOICE', 'SELF_BILLED_CREDIT_NOTE'] as const)(
    'sends a %s to Expenditure › Self-billing',
    async (type) => {
      invoiceResponse = () => json(200, invoice({ type }))
      renderInvoice()
      expect(await screen.findByText('self-billing page')).toBeTruthy()
    },
  )
})

describe('the preview paper names the seller and the buyer', () => {
  const ADDRESS = {
    streetName: 'Way 3021',
    additionalStreetName: 'Al Khuwair',
    addressLine3: null,
    buildingNumber: '12',
    cityName: 'Bawshar',
    postalCode: '112',
    countrySubentity: 'Muscat',
    countryCode: 'OM',
    poBox: '450',
  }
  const SELLER = {
    legalName: 'Nizwa Dates Trading LLC',
    vatin: 'OM1100000001',
    participantId: '0235:OM1100000001',
    address: ADDRESS,
  }
  const BUYER = {
    name: 'Sohar Port Logistics SAOC',
    vatin: 'OM1100999001',
    participantId: null,
    address: { ...ADDRESS, streetName: 'Port Road', buildingNumber: null, cityName: 'Sohar' },
  }
  const PROFILE = {
    tenantId: 't-1',
    tenantCode: 'NIZWA',
    tenantName: 'Nizwa Dates',
    legalName: 'Nizwa Dates Trading LLC (live profile)',
    legalNameAr: null,
    tradingName: null,
    taxNumber: 'OM1100000002',
    commercialRegistrationNumber: '1234567',
    country: 'OM',
    registeredAddress: 'Souq Street',
    registeredAddressLine2: null,
    registeredAddressLine3: null,
    registeredCity: 'Nizwa',
    registeredPostalCode: '611',
    registeredCountrySubdivision: 'Ad Dakhiliyah',
    registeredPoBox: null,
    contactPersonName: null,
    contactPhone: null,
    contactEmail: null,
    profileRevision: 3,
    verificationStatus: 'VERIFIED',
  }
  const SETTINGS_ADMIN: Entitlements = {
    ...ADMIN,
    permissions: [...ADMIN.permissions, 'admin.settings.manage'],
  }

  /** The paper's "From" and "Bill to" blocks, found by their headings. */
  const party = (heading: string) =>
    within(screen.getByText(heading, { selector: 'p.tracking-wide' }).parentElement!)

  /** Answers the reads these cases add, and hands every other one to the suite's own mock. */
  function alsoAnswer(extra: Record<string, unknown>) {
    const suite = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const match = Object.keys(extra).find((prefix) => url.startsWith(prefix))
      return match ? json(200, extra[match]) : suite(url, init)
    })
  }

  it('prints the issued snapshot: legal name, VAT number, the whole address, the branch beneath', async () => {
    invoiceResponse = () => json(200, invoice({ seller: SELLER, buyer: BUYER }))
    renderInvoice()
    await screen.findByText('From', { selector: 'p.tracking-wide' })
    const from = party('From')
    expect(from.getByText('Nizwa Dates Trading LLC')).toBeTruthy()
    expect(from.getByText('VAT OM1100000001')).toBeTruthy()
    for (const line of [
      'Way 3021',
      'Al Khuwair',
      'Building 12',
      'PO Box 450',
      '112 Bawshar',
      'Muscat',
      'Oman',
    ]) {
      expect(from.getByText(line)).toBeTruthy()
    }
    await waitFor(() => expect(from.getByText('Head office')).toBeTruthy())
    const billTo = party('Bill to')
    expect(billTo.getByText('Sohar Port Logistics SAOC')).toBeTruthy()
    expect(billTo.getByText('VAT OM1100999001')).toBeTruthy()
    expect(billTo.getByText('Port Road')).toBeTruthy()
    expect(billTo.getByText('112 Sohar')).toBeTruthy()
    // The snapshot is the issued truth, so the live profile is not even asked for.
    expect(calls().some((call) => call.includes('/company-profile'))).toBe(false)
  })

  it('stands the live company profile in for the seller on a draft', async () => {
    who = SETTINGS_ADMIN
    invoiceResponse = () =>
      json(
        200,
        invoice({
          authoringState: 'DRAFT',
          invoiceNumber: null,
          totals: null,
          seller: null,
          buyer: null,
        }),
      )
    alsoAnswer({ '/api/v1/company-profile': PROFILE })
    renderInvoice()
    expect(
      await screen.findAllByText('Nizwa Dates Trading LLC (live profile)'),
    ).not.toHaveLength(0)
    const from = party('From')
    expect(from.getByText('VAT OM1100000002')).toBeTruthy()
    expect(from.getByText('Souq Street')).toBeTruthy()
    expect(from.getByText('611 Nizwa')).toBeTruthy()
    expect(from.getByText('Ad Dakhiliyah')).toBeTruthy()
    // The buyer falls back to the customer the draft names.
    await waitFor(() => expect(party('Bill to').getByText('Sohar Port Logistics')).toBeTruthy())
  })

  it('names the consumer on a B2C invoice from the customer it references', async () => {
    alsoAnswer({
      '/api/v1/customers/': {
        id: 'c-1',
        type: 'CONSUMER',
        displayName: 'Salim Al Harthy',
        profile: {
          details: { vatRegistrationNumber: null },
          contact: null,
          deliveryPreferences: null,
          invoiceAddress: { cityName: 'Muscat', countryCode: 'OM', streetName: 'Way 12' },
        },
        peppolDelivery: 'NOT_APPLICABLE',
        status: 'ACTIVE',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    })
    renderInvoice()
    await screen.findByText('From', { selector: 'p.tracking-wide' })
    await waitFor(() => expect(party('Bill to').getByText('Salim Al Harthy')).toBeTruthy())
    expect(party('Bill to').getByText('Way 12')).toBeTruthy()
    expect(party('Bill to').queryByText('—')).toBeNull()
  })

  it('names the buyer from the snapshot for a reader who may not open the customer', async () => {
    who = READ_ONLY
    invoiceResponse = () => json(200, invoice({ buyer: { ...BUYER, name: 'Salim Al Harthy' } }))
    renderInvoice()
    await screen.findByText('From', { selector: 'p.tracking-wide' })
    expect(party('Bill to').getByText('Salim Al Harthy')).toBeTruthy()
    expect(calls().some((call) => call.includes('/api/v1/customers/'))).toBe(false)
  })
})

describe('the invoice in Arabic', () => {
  it('words the payment terms and means from their codes, never the stored English label', async () => {
    await i18n.changeLanguage('ar')
    invoiceResponse = () =>
      json(
        200,
        invoice({
          details: {
            ...invoice().details!,
            paymentTerms: { code: 'NET30', label: 'Net 30 days' },
            paymentMethod: { code: '30', label: 'Bank transfer' },
          },
        }),
      )
    renderInvoice()
    expect(await screen.findByText('الرصيد المستحق')).toBeTruthy()
    // On the page and again on the preview paper.
    expect(screen.getAllByText('صافي 30 يومًا').length).toBeGreaterThan(1)
    expect(screen.getByText('تحويل بنكي')).toBeTruthy()
    expect(screen.queryByText(/Net 30 days/)).toBeNull()
    expect(screen.queryByText(/Bank transfer/)).toBeNull()
  })

  it('falls back to the stored label only for a code this build has no words for', async () => {
    await i18n.changeLanguage('ar')
    invoiceResponse = () =>
      json(
        200,
        invoice({
          details: {
            ...invoice().details!,
            paymentTerms: { code: 'NET90', label: 'Net 90 days' },
            paymentMethod: { code: '97', label: 'Clearing between partners' },
          },
        }),
      )
    renderInvoice()
    expect(await screen.findByText('الرصيد المستحق')).toBeTruthy()
    // A NETn term is still worded from its days; an unknown means keeps what was stored.
    expect(screen.getAllByText('صافي 90 يومًا').length).toBeGreaterThan(0)
    expect(screen.getByText('Clearing between partners')).toBeTruthy()
  })
})

describe('Sales approval on a draft', () => {
  it('keeps the refusal on screen when nobody else can approve (409 SALES_APPROVAL_NO_APPROVER)', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.draft'] }
    invoiceResponse = () =>
      json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null, totals: null }))
    const approvalPath = `/api/v1/invoice-drafts/${ID}/approval`
    const served = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === approvalPath)
        return json(200, {
          status: 'NOT_REQUESTED',
          requiredApprovals: 1,
          distinctApprovals: 0,
          draftVersion: 2,
          payableAmount: 56.7,
          currency: 'OMR',
          requestedBy: null,
          requestedAt: null,
          lastDecision: null,
          callerMayRequest: true,
          callerMayDecide: false,
        })
      if (url === `${approvalPath}/request`)
        return json(409, {
          status: 409,
          code: 'SALES_APPROVAL_NO_APPROVER',
          detail: 'Not enough people other than those who prepared this document can approve it',
        })
      return served(url, init)
    })
    renderInvoice()

    fireEvent.click(await screen.findByRole('button', { name: 'Send for approval' }))

    // The page re-reads after the refusal; the refusal must survive that re-read.
    await waitFor(() =>
      expect(calls().filter((call) => call === `GET ${approvalPath}`).length).toBe(2),
    )
    expect(
      await screen.findByText(
        'Nobody else can approve this yet. Ask your administrator to give someone the Approve permission.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeTruthy()
    expect(screen.queryByText(/Not enough people/)).toBeNull()
  })
})

describe('Cancel is not offered on an invoice something already settles (A-0)', () => {
  const ISSUED_CREDIT_NOTE = {
    id: 'cn-1',
    type: 'CREDIT_NOTE',
    version: 1,
    authoringState: 'ISSUED',
    deliveryState: 'NOT_SUBMITTED',
    customerId: 'c-1',
    currency: 'OMR',
    invoiceNumber: 'CRN-2026-0003',
    issueDate: '2026-08-05',
    dueDate: null,
    details: null,
    lines: [],
    totals: { totalAmount: 10 },
    customerName: null,
    payment: null,
    correctionOfInvoiceId: ID,
  }

  const openMenu = async () => {
    renderInvoice()
    await screen.findByRole('heading', {
      level: 1,
      name: i18n.t('invoiceDetails.title', { id: 'INV-2026-0042' }),
    })
    // Both reads decide the menu, so the menu is opened only once both have answered.
    await waitFor(() => expect(calls()).toContain(`GET ${URL_BASE}/receivable`))
    await waitFor(() =>
      expect(calls().some((call) => call.startsWith('GET /api/v1/authored-invoices?'))).toBe(true),
    )
    fireEvent.click(screen.getByRole('button', { name: i18n.t('invoiceDetails.actions.more') }))
  }

  it('offers Cancel on an issued invoice with no payment and no note', async () => {
    receivableResponse = () => json(200, UNSETTLED)
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    expect(await screen.findByRole('dialog', { name: 'Cancel this invoice?' })).toBeTruthy()
  })

  it('does not open the cancel dialog once a credit note is issued against it, and says why', async () => {
    receivableResponse = () => json(200, { ...UNSETTLED, creditedAmount: 10, outstandingAmount: 46.7 })
    notesResponse = () =>
      json(200, { content: [ISSUED_CREDIT_NOTE], page: 0, size: 50, totalElements: 1 })
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    expect(
      await screen.findByText(
        'This invoice cannot be cancelled: credit or debit notes have been issued against it.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Cancel this invoice?' })).toBeNull()
    expect(calls()).not.toContain(`POST ${URL_BASE}/cancel`)
  })

  it('reads an issued debit note on the list as a correction even before the balance shows it', async () => {
    receivableResponse = () => json(200, UNSETTLED)
    notesResponse = () =>
      json(200, {
        content: [{ ...ISSUED_CREDIT_NOTE, id: 'dn-1', type: 'DEBIT_NOTE', invoiceNumber: 'DBN-1' }],
        page: 0,
        size: 50,
        totalElements: 1,
      })
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    expect(await screen.findByText(/credit or debit notes have been issued against it/)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Cancel this invoice?' })).toBeNull()
  })

  it('does not open the cancel dialog once a payment is recorded, and says why', async () => {
    receivableResponse = () => json(200, RECEIVABLE)
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    expect(
      await screen.findByText(
        'This invoice cannot be cancelled: payments are recorded against it.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Cancel this invoice?' })).toBeNull()
    expect(calls()).not.toContain(`POST ${URL_BASE}/cancel`)
  })

  it('a draft or cancelled note on the list does not block cancelling', async () => {
    receivableResponse = () => json(200, UNSETTLED)
    notesResponse = () =>
      json(200, {
        content: [
          { ...ISSUED_CREDIT_NOTE, authoringState: 'DRAFT', invoiceNumber: null },
          { ...ISSUED_CREDIT_NOTE, id: 'cn-2', authoringState: 'CANCELLED' },
        ],
        page: 0,
        size: 50,
        totalElements: 2,
      })
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }))
    expect(await screen.findByRole('dialog', { name: 'Cancel this invoice?' })).toBeTruthy()
  })

  it.each([
    [
      'en',
      'INVOICE_CANCEL_HAS_CORRECTIONS',
      'This invoice cannot be cancelled: credit or debit notes have been issued against it.',
    ],
    ['en', 'INVOICE_CANCEL_HAS_PAYMENTS', 'This invoice cannot be cancelled: payments are recorded against it.'],
    [
      'ar',
      'INVOICE_CANCEL_HAS_CORRECTIONS',
      'لا يمكن إلغاء هذه الفاتورة: صدرت عليها إشعارات دائنة أو مدينة.',
    ],
    ['ar', 'INVOICE_CANCEL_HAS_PAYMENTS', 'لا يمكن إلغاء هذه الفاتورة: سُجّلت عليها دفعات.'],
  ])('a page that is out of date reads the 409 %s %s as its own sentence', async (lang, code, sentence) => {
    // The page still believes nothing settles the invoice; the server knows better.
    receivableResponse = () => json(200, UNSETTLED)
    cancelResponse = () =>
      json(409, { type: 'https://api.fawtir.om/problems/conflict', status: 409, code, detail: 'no' })
    await i18n.changeLanguage(lang)
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: i18n.t('invoiceDetails.actions.cancel') }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Wrong customer' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('invoiceDetails.cancel.confirm') }))
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText('no')).toBeNull()
  })
})

describe('a reader who may only read (B-14, C-9)', () => {
  it('is offered no sharing and asks for no branches or reminder schedule', async () => {
    who = READ_ONLY
    receivableResponse = () => json(200, UNSETTLED)
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    await waitFor(() => expect(calls()).toContain(`GET ${URL_BASE}/receivable`))
    expect(screen.queryByRole('button', { name: 'Send by email' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share on WhatsApp' })).toBeNull()
    expect(calls()).not.toContain('GET /api/v1/branches')
    expect(calls()).not.toContain('GET /api/v1/payment-reminders/schedule')
  })
})

describe('Cancel when the page cannot tell, and on a note (A-0 review)', () => {
  const menuItems = async () => {
    await screen.findByRole('heading', { level: 1 })
    const more = screen.queryByRole('button', { name: 'More actions' })
    if (more) fireEvent.click(more)
    return screen.queryAllByRole('menuitem').map((item) => item.textContent ?? '')
  }

  it.each([
    ['the receivable', () => (receivableResponse = () => json(500, { status: 500 }))],
    ['the notes list', () => (notesResponse = () => json(500, { status: 500 }))],
  ])('offers no Cancel, and no hint, when %s cannot be read', async (_, fail) => {
    receivableResponse = () => json(200, UNSETTLED)
    fail()
    renderInvoice()
    await waitFor(() => expect(calls()).toContain(`GET ${URL_BASE}/receivable`))
    await waitFor(() =>
      expect(calls().some((call) => call.startsWith('GET /api/v1/authored-invoices?'))).toBe(true),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await menuItems()).some((text) => /Cancel/.test(text))).toBe(false)
    expect(screen.queryByText(/cannot be cancelled/)).toBeNull()
  })

  it('says a paid debit note cannot be cancelled in its own words', async () => {
    invoiceResponse = () =>
      json(200, invoice({ type: 'DEBIT_NOTE', correctionOfInvoiceId: 'inv-0', invoiceNumber: 'DBN-2026-0001' }))
    receivableResponse = () => json(200, { ...UNSETTLED, paidAmount: 5, outstandingAmount: 51.7 })
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Debit note DBN-2026-0001' })
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel debit note' }))
    expect(
      await screen.findByText('This note cannot be cancelled: payments are recorded against it.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    ['en', 'This note cannot be cancelled: credit or debit notes have been issued against it.'],
    ['ar', 'لا يمكن إلغاء هذا الإشعار: صدرت عليه إشعارات دائنة أو مدينة.'],
  ])('reads a corrections refusal on a note page as the note’s (%s)', async (lang, sentence) => {
    await i18n.changeLanguage(lang)
    invoiceResponse = () =>
      json(200, invoice({ type: 'DEBIT_NOTE', correctionOfInvoiceId: 'inv-0', invoiceNumber: 'DBN-2026-0001' }))
    receivableResponse = () => json(200, UNSETTLED)
    cancelResponse = () =>
      json(409, { status: 409, code: 'INVOICE_CANCEL_HAS_CORRECTIONS', detail: 'no' })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('invoiceDetails.actions.more') }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('salesNote.detail.cancelAction.DEBIT_NOTE') }),
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raised twice' } })
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('salesNote.detail.cancelConfirm.DEBIT_NOTE') }),
    )
    expect(await screen.findByText(sentence)).toBeTruthy()
  })
})

describe('issuing to a Peppol customer whose address is incomplete (backend #817)', () => {
  it.each([
    [
      'en',
      "This customer's address is incomplete for Peppol: add the street, additional street, city, postal code and address line 3, then issue again.",
    ],
    [
      'ar',
      'عنوان هذا العميل غير مكتمل لإرسال Peppol: أضف الشارع والشارع الإضافي والمدينة والرمز البريدي وسطر العنوان 3، ثم أصدر الفاتورة مرة أخرى.',
    ],
  ])('says what to complete and links to the customer (%s)', async (lang, sentence) => {
    await i18n.changeLanguage(lang)
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue', 'customer.manage'] }
    invoiceResponse = () =>
      json(
        200,
        invoice({
          authoringState: 'DRAFT',
          version: 2,
          invoiceNumber: null,
          issueDate: null,
          dueDate: null,
          issuedAt: null,
          totals: null,
        }),
      )
    receivableResponse = () =>
      json(200, { ...RECEIVABLE, paymentState: 'NOT_APPLICABLE', documentTotal: null, outstandingAmount: null, paidAmount: 0 })
    issueResponse = () =>
      json(400, { status: 400, code: 'BUYER_ADDRESS_INCOMPLETE', detail: 'The customer address is incomplete' })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('invoiceIssue.action') }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('invoiceIssue.submit') }))
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: i18n.t('invoiceIssue.refused.buyerAddressAction') })
        .getAttribute('href'),
    ).toBe('/customers/c-1/edit')
    expect(screen.queryByText(/The customer address is incomplete/)).toBeNull()
  })
})

describe('a payment refused because the balance moved in another tab (DA-12)', () => {
  it.each([
    ['en', 'What is owed changed since this page was opened. Closing this dialog shows the current balance.'],
    ['ar', 'تغيّر المبلغ المستحق منذ فتح هذه الصفحة. يُظهر إغلاق هذه النافذة الرصيد الحالي.'],
  ])('says so in the dialog and reads the balance again once it closes (%s)', async (lang, sentence) => {
    await i18n.changeLanguage(lang)
    payResponse = () =>
      json(400, { status: 400, code: 'PAYMENT_EXCEEDS_OUTSTANDING', detail: 'too much' })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('invoiceDetails.payments.add') }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('invoiceDetails.pay.submit') }))
    expect(await within(dialog).findByText(sentence)).toBeTruthy()
    const reads = () => calls().filter((call) => call === `GET ${URL_BASE}/receivable`).length
    const before = reads()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.cancel') }))
    await waitFor(() => expect(reads()).toBe(before + 1))
  })
})

describe('the discount column says what kind of discount it holds (DA-15)', () => {
  const withDiscount = (discountType: 'PERCENTAGE' | 'FIXED_AMOUNT', discountValue: number) => {
    const base = invoice()
    invoiceResponse = () =>
      json(200, invoice({ lines: [{ ...base.lines[0], discountType, discountValue }] }))
  }

  it('heads a fixed discount "Discount" and prints it as money', async () => {
    withDiscount('FIXED_AMOUNT', 4)
    renderInvoice()
    const table = (await screen.findByRole('columnheader', { name: /^(Disc %|Discount)$/ })).closest('table')!
    expect(within(table).getByText('Discount')).toBeTruthy()
    expect(within(table).queryByText('Disc %')).toBeNull()
    expect(within(table).getByText('4.000')).toBeTruthy()
  })

  it('keeps "Disc %" for a percentage', async () => {
    withDiscount('PERCENTAGE', 10)
    renderInvoice()
    const table = (await screen.findByRole('columnheader', { name: /^(Disc %|Discount)$/ })).closest('table')!
    expect(within(table).getByText('Disc %')).toBeTruthy()
    expect(within(table).getByText('10%')).toBeTruthy()
  })
})

describe('stock warnings recorded at issue, on the single read (batch 39 STK-Q4B)', () => {
  it('shows an issued invoice’s recorded STOCK_BELOW_ZERO in words, never the server’s text', async () => {
    invoiceResponse = () =>
      json(
        200,
        invoice({
          warnings: [
            {
              line: 1,
              code: 'STOCK_BELOW_ZERO',
              message: 'Sold more than the branch had counted; on hand is now -2',
            },
          ],
        }),
      )
    renderInvoice()
    const box = await screen.findByTestId('invoice-recorded-stock-warnings')
    expect(box.textContent).toContain('When it was issued, stock noted:')
    expect(box.textContent).toContain('Line 1: it took the stock below zero. Count it when you can.')
    expect(box.textContent).not.toContain('on hand is now')
  })

  it('shows nothing for a read without stock warnings, an older server, or other codes only', async () => {
    for (const warnings of [undefined, null, [], [{ line: 1, code: 'ZR_NOT_ON_LIST' }]]) {
      cleanup()
      invoiceResponse = () => json(200, invoice({ warnings: warnings as never }))
      renderInvoice()
      expect(await screen.findByRole('link', { name: 'Duplicate' })).toBeTruthy()
      expect(screen.queryByTestId('invoice-recorded-stock-warnings')).toBeNull()
    }
  })

  it('does not say them twice on arrival from the composer, whose notice already does', async () => {
    invoiceResponse = () =>
      json(200, invoice({ warnings: [{ line: 1, code: 'STOCK_BELOW_ZERO' }] }))
    render(
      <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: `/invoices/${ID}`,
              state: {
                issuedNumber: 'INV-2026-0042',
                stockWarnings: [{ line: 1, code: 'STOCK_BELOW_ZERO' }],
              },
            },
          ]}
        >
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </ReferenceDataContext.Provider>,
    )
    expect(await screen.findByText(/Line 1: it took the stock below zero/)).toBeTruthy()
    expect(screen.queryByTestId('invoice-recorded-stock-warnings')).toBeNull()
  })
})
