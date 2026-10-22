import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
  subscriptionResponse = () => json(404, { status: 404 })
  invoiceResponse = () => json(200, invoice())
  receivableResponse = () => json(200, RECEIVABLE)
  cancelResponse = () => json(200, invoice({ authoringState: 'CANCELLED', version: 5 }))
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
    // The notes that correct the invoice; none in these fixtures.
    if (url.startsWith('/api/v1/authored-invoices?'))
      return json(200, { content: [], page: 0, size: 50, totalElements: 0 })
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
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    // Cancelling lives in the header's overflow menu, as the design draws it.
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
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
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
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
  })

  it.each([
    ['suspended', standing('SUBSCRIPTION_SUSPENDED')],
    ['trial ended unpaid', standing('SUBSCRIPTION_SUSPENDED', { paidThrough: null, trialEndsOn: '2026-10-21' })],
    ['cancelled', standing('SUBSCRIPTION_CANCELLED', { access: 'CANCELLED' })],
    ['not started', standing('SUBSCRIPTION_NOT_STARTED', { paidThrough: null })],
  ])('hides Credit note, Debit note and Send while %s; reading stays', async (_, status) => {
    who = OWNER
    subscriptionResponse = () => json(200, status)
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'Invoice INV-2026-0042' })
    await waitFor(() => expect(subscriptionReads().length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Send' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Credit note' })).toBeNull()
    // The overflow menu keeps cancelling but no longer offers a debit note.
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Cancel invoice' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: i18n.t('salesNote.debit.action') })).toBeNull()
    // Copying into a new draft is still allowed: drafts can be saved in every state.
    expect(screen.getByRole('link', { name: i18n.t('invoiceDetails.actions.duplicate') })).toBeTruthy()
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
    expect(
      screen.getByText(
        [
          'Queued for transmission, not yet sent',
          'The buyer receives it over Peppol',
          'To the buyer: queued for transmission, not yet sent',
          'To the Tax Authority: queued for transmission, not yet sent',
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
