import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceDetailDto, InvoiceHistoryDto, InvoicePaymentDto, InvoiceReceivableDto } from '../../api/invoices/detail'
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
  { id: 'pay-1', entryType: 'PAYMENT', reversalOfPaymentId: null, amount: 20, currency: 'OMR', methodCode: 'BANK', paymentReference: 'TRX-9', paymentDate: '2026-08-10', occurredAt: '2026-08-10T09:00:00Z' },
  { id: 'pay-2', entryType: 'PAYMENT', reversalOfPaymentId: null, amount: 15, currency: 'OMR', methodCode: 'CASH', paymentReference: null, paymentDate: '2026-08-12', occurredAt: '2026-08-12T09:00:00Z' },
  { id: 'rev-1', entryType: 'REVERSAL', reversalOfPaymentId: 'pay-2', amount: 15, currency: 'OMR', methodCode: 'CASH', paymentReference: null, paymentDate: '2026-08-13', occurredAt: '2026-08-13T09:00:00Z' },
]

const HISTORY: InvoiceHistoryDto = {
  entries: [
    { id: 'h-1', eventType: 'PAYMENT_RECORDED', outcome: 'SUCCESS', invoiceVersion: 4, changedFieldsHash: 'abc', actorId: 'u-1', occurredAt: '2026-08-10T09:00:00Z' },
    { id: 'h-2', eventType: 'ISSUED', outcome: 'SUCCESS', invoiceVersion: 3, changedFieldsHash: 'def', actorId: 'u-2', occurredAt: '2026-08-01T07:00:00Z' },
  ],
  truncated: false,
  limit: 200,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let invoiceResponse: () => Response
let receivableResponse: () => Response
let cancelResponse: () => Response
let payResponse: () => Response
let issueResponse: () => Response
let who: Entitlements

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  invoiceResponse = () => json(200, invoice())
  receivableResponse = () => json(200, RECEIVABLE)
  cancelResponse = () => json(200, invoice({ authoringState: 'CANCELLED', version: 5 }))
  payResponse = () => json(200, PAYMENTS[0])
  issueResponse = () => json(200, invoice({ version: 5 }))
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === `${URL_BASE}/receivable`) return receivableResponse()
    if (url === `${URL_BASE}/payments`) return method === 'POST' ? payResponse() : json(200, PAYMENTS)
    if (url.startsWith(`${URL_BASE}/payments/`)) return payResponse()
    if (url === `${URL_BASE}/attachments`) return json(200, [{ id: 'f-1', filename: 'delivery-note.pdf', contentType: 'application/pdf', byteSize: 2048, sha256: 'x', attachedAt: '2026-08-01T08:00:00Z' }])
    if (url === `${URL_BASE}/history`) return json(200, HISTORY)
    if (url === `${URL_BASE}/internal-note`) return json(200, { internalNote: 'Chase Hamed in September.' })
    if (url === `${URL_BASE}/cancel`) return cancelResponse()
    if (url === `/api/v1/invoice-drafts/${ID}/preview`) return json(200, { currency: 'OMR', lines: [], totals: { subtotal: 54, itemLevelDiscount: 0, headerDiscount: 0, totalDiscount: 0, taxableAmount: 54, vatAmount: 2.7, totalAmount: 56.7 } })
    if (url === `/api/v1/invoice-drafts/${ID}/issue`) return issueResponse()
    if (url.startsWith('/api/v1/customers/')) return json(200, { id: 'c-1', type: 'BUSINESS', displayName: 'Sohar Port Logistics', profile: { details: { vatRegistrationNumber: 'OM1100999001' }, contact: null, deliveryPreferences: null, invoiceAddress: null }, peppolDelivery: 'ACTIVE', status: 'ACTIVE', updatedAt: '2026-08-01T00:00:00Z' })
    if (url === '/api/v1/branches') return json(200, [{ id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' }])
    if (url === URL_BASE) return invoiceResponse()
    // The notes that correct the invoice; none in these fixtures.
    if (url.startsWith('/api/v1/authored-invoices?')) return json(200, { content: [], page: 0, size: 50, totalElements: 0 })
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
    <MemoryRouter initialEntries={[`/invoices/${ID}`]}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
        <Route path="/invoices/:id/edit" element={<p>draft editor</p>} />
        <Route path="/invoices" element={<p>invoices list</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('An invoice, wired to the API', () => {
  it('shows the document, its balance, its lines and the customer', async () => {
    renderInvoice()
    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })).toBeTruthy()
    expect(await screen.findByText('Partially paid')).toBeTruthy()
    expect(screen.getAllByText('Sohar Port Logistics').length).toBeGreaterThan(0)
    expect(screen.getByText('OM1100999001')).toBeTruthy()
    expect(screen.getByText('Head office')).toBeTruthy()
    expect(screen.getByText('Net 30 days')).toBeTruthy()

    // The headline figure and the "Outstanding" column are the same number, by design.
    expect(screen.getAllByText('36.700')).toHaveLength(2)
    // The invoice total appears on the balance card and again under the lines.
    expect(screen.getAllByText('56.700')).toHaveLength(2)
    // Paid on the balance card, and again as the payment itself.
    expect(screen.getAllByText('20.000').length).toBeGreaterThan(0)
    // The API sends no line total; 12 × 4.500 is computed here.
    expect(screen.getAllByText('54.000').length).toBeGreaterThan(0)
    expect(screen.getByText('Green beans')).toBeTruthy()
    expect(screen.getByText('Thank you for your business.')).toBeTruthy()
  })

  it('reads the internal note only when asked, because reading it is audited', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })
    expect(calls().some((call) => call.endsWith('/internal-note'))).toBe(false)
    expect(screen.queryByText('Chase Hamed in September.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show the internal note' }))
    expect(await screen.findByText('Chase Hamed in September.')).toBeTruthy()
    expect(calls().filter((call) => call.endsWith('/internal-note'))).toHaveLength(1)
    // The read is the audit event, so the timeline is fetched again once it has happened.
    await waitFor(() => expect(calls().filter((call) => call.endsWith('/history'))).toHaveLength(2))
  })

  it('never claims a Peppol delivery or offers a PDF', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })
    expect(screen.queryByText(/Peppol/i)).toBeNull()
    expect(screen.queryByText(/Invoice PDF/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Print/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Duplicate/ })).toBeNull()
  })

  it('builds the timeline from recorded events only, and says which were yours', async () => {
    renderInvoice()
    const timeline = (await screen.findByText('Payment recorded')).closest('ol')!
    expect(within(timeline).getByText(/· by you/)).toBeTruthy()
    expect(within(timeline).getByText('Issued')).toBeTruthy()
    expect(screen.queryByText(/Tax Authority/)).toBeNull()
  })

  it('strikes through a payment that was reversed rather than listing the reversal as another', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })
    expect(await screen.findByText('Reversed')).toBeTruthy()
    expect(screen.getByText('15.000').className).toContain('line-through')
  })

  it('issues a draft from its own page with the due date its terms give, then shows it issued and unsent', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    const DRAFT = invoice({ authoringState: 'DRAFT', version: 2, invoiceNumber: null, issueDate: null, dueDate: null, issuedAt: null, totals: null })
    invoiceResponse = () => json(200, DRAFT)
    receivableResponse = () => json(200, { ...RECEIVABLE, paymentState: 'NOT_APPLICABLE', documentTotal: null, outstandingAmount: null, paidAmount: 0 })
    renderInvoice()

    fireEvent.click(await screen.findByRole('button', { name: 'Issue invoice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this invoice?' })
    expect(await within(dialog).findByText('56.700')).toBeTruthy()

    // The reread after issue answers the issued document.
    invoiceResponse = () => json(200, invoice({ version: 3 }))
    receivableResponse = () => json(200, RECEIVABLE)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    expect(await screen.findByText("Issued as INV-2026-0042. It hasn't been sent to the customer or the Tax Authority yet.")).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })).toBeTruthy()
    const issue = fetchMock.mock.calls.filter(([url]) => String(url) === `/api/v1/invoice-drafts/${ID}/issue`)
    expect(issue).toHaveLength(1)
    const today = muscatToday()
    expect(JSON.parse((issue[0][1] as RequestInit).body as string)).toEqual({ expectedVersion: 2, issueDate: today, dueDate: dueDateFor(today, 'NET30') })
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull()
  })

  it('offers no issue without the permission, or on an issued invoice', async () => {
    invoiceResponse = () => json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null, totals: null }))
    const view = renderInvoice()
    expect(await screen.findByRole('link', { name: /Edit draft/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull()
    view.unmount()

    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    forgetEntitlements()
    invoiceResponse = () => json(200, invoice())
    renderInvoice()
    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull()
  })

  it('opens a draft in the editor and shows no figures for it', async () => {
    invoiceResponse = () =>
      json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null, issueDate: null, dueDate: null, issuedAt: null, totals: null }))
    receivableResponse = () =>
      json(200, { ...RECEIVABLE, documentTotal: null, outstandingAmount: null, paidAmount: 0, paymentState: 'NOT_APPLICABLE' })
    renderInvoice()
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft invoice' })).toBeTruthy()
    expect(screen.getByText(/no number and no figures until it is issued/)).toBeTruthy()
    expect(screen.getByText('A draft is priced when it is issued.')).toBeTruthy()
    expect(screen.queryByText('Outstanding balance')).toBeNull()
    // A draft has no payments to ask about.
    expect(calls().some((call) => call.endsWith('/payments'))).toBe(false)

    fireEvent.click(screen.getByRole('link', { name: /Edit draft/ }))
    expect(await screen.findByText('draft editor')).toBeTruthy()
  })

  it('cancels with a reason, and reads a refusal as its own sentence', async () => {
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel invoice' }))
    expect(await screen.findByText(/does not tell the customer/)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Cancel the invoice' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Wrong customer' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/cancel`))
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => url === `${URL_BASE}/cancel`)?.[1]?.body))
    expect(body).toEqual({ expectedVersion: 4, reason: 'Wrong customer' })
    expect(await screen.findByText('The invoice is cancelled.')).toBeTruthy()
  })

  it('says a delivered invoice must be corrected instead of cancelled', async () => {
    cancelResponse = () =>
      json(409, { type: 'https://api.fawtir.om/problems/conflict', code: 'DELIVERED_INVOICE_CANCELLATION_NOT_APPROVED', detail: 'no' })
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel invoice' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Too late' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the invoice' }))
    expect(await screen.findByText(/Issue a credit note instead/)).toBeTruthy()
  })

  it('asks for nothing a reader may not have, and offers no actions', async () => {
    who = READ_ONLY
    renderInvoice()
    await screen.findByRole('heading', { level: 1, name: 'INV-2026-0042' })
    expect(screen.queryByRole('button', { name: 'Cancel invoice' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Credit note/i })).toBeNull()
    expect(calls().some((call) => call.endsWith('/internal-note'))).toBe(false)
    expect(calls().some((call) => call.includes('/customers/'))).toBe(false)
    expect(screen.getByText(/Customer not shown/)).toBeTruthy()
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
    expect(screen.getByText('سُجّل دفع')).toBeTruthy()
  })
})

describe('A credit or debit note on the same page', () => {
  const NOTE_RECEIVABLE = { ...RECEIVABLE, paymentState: 'NOT_APPLICABLE', documentTotal: null, outstandingAmount: null, paidAmount: 0 }

  it('shows a credit note as a note: no due date, no payments, and its own words to cancel it', async () => {
    invoiceResponse = () => json(200, invoice({ type: 'CREDIT_NOTE', correctionOfInvoiceId: 'inv-0', invoiceNumber: 'CRN-2026-0001', dueDate: '2026-08-01' }))
    receivableResponse = () => json(200, NOTE_RECEIVABLE)
    cancelResponse = () => json(200, invoice({ type: 'CREDIT_NOTE', authoringState: 'CANCELLED', version: 5 }))
    renderInvoice()

    await screen.findByRole('heading', { level: 1, name: 'CRN-2026-0001' })
    expect(screen.queryByText('Due date')).toBeNull()
    expect(screen.queryByText('Payments')).toBeNull()
    expect(screen.getByText('on the note')).toBeTruthy()
    expect(screen.getByText('Files can only be added or removed while a note is a draft.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel invoice' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel credit note' }))
    expect(await screen.findByRole('dialog', { name: 'Cancel this credit note?' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raised twice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the credit note' }))
    expect(await screen.findByText('The credit note is cancelled.')).toBeTruthy()
  })

  it('asks to issue a debit note in its own words, with a due date, in English and Arabic', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    const DRAFT = invoice({ type: 'DEBIT_NOTE', correctionOfInvoiceId: 'inv-0', authoringState: 'DRAFT', version: 2, invoiceNumber: null, issueDate: null, dueDate: null, issuedAt: null, totals: null })
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
      json(200, invoice({ type: 'CREDIT_NOTE', correctionOfInvoiceId: 'inv-0', authoringState: 'DRAFT', version: 2, invoiceNumber: null, issueDate: null, dueDate: null, issuedAt: null, totals: null }))
    receivableResponse = () => json(200, NOTE_RECEIVABLE)
    renderInvoice()

    fireEvent.click(await screen.findByRole('button', { name: 'Issue credit note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Issue this credit note?' })
    expect(within(dialog).queryByText('Due date')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue credit note' }))
    await waitFor(() => expect(calls()).toContain(`POST /api/v1/invoice-drafts/${ID}/issue`))
    const issue = fetchMock.mock.calls.find(([url]) => String(url) === `/api/v1/invoice-drafts/${ID}/issue`)
    const today = muscatToday()
    expect(JSON.parse((issue?.[1] as RequestInit).body as string)).toEqual({ expectedVersion: 2, issueDate: today, dueDate: today })
  })
})

describe('Recording and reversing payments', () => {
  const body = (suffix: string) =>
    JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url === `${URL_BASE}${suffix}` && (init as RequestInit)?.method === 'POST')?.[1]?.body))
  const headers = (suffix: string) =>
    (fetchMock.mock.calls.find(([url, init]) => String(url).startsWith(`${URL_BASE}${suffix}`) && (init as RequestInit)?.method === 'POST')?.[1] as RequestInit)
      ?.headers as Record<string, string> | Headers

  const key = (h: Record<string, string> | Headers) => (h instanceof Headers ? h.get('Idempotency-Key') : h['Idempotency-Key'])

  it('records a payment for what is still owed, with its own idempotency key, and refreshes what it changes', async () => {
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
    const amount = (await screen.findByRole('textbox', { name: /Amount received/ })) as HTMLInputElement
    expect(amount.value).toBe('36.700')

    fireEvent.change(screen.getByRole('textbox', { name: /Reference/ }), { target: { value: '  TRX-42 ' } })
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/payments`))
    expect(body('/payments')).toMatchObject({ amount: 36.7, methodCode: '30', paymentReference: 'TRX-42' })
    expect(key(headers('/payments'))).toMatch(/^payment-[0-9a-f-]{36}$/)
    expect(await screen.findByText('Payment recorded.')).toBeTruthy()
    await waitFor(() => expect(calls().filter((call) => call === `GET ${URL_BASE}/receivable`)).toHaveLength(2))
  })

  it('refuses more than is owed before asking, and puts a server refusal on its field', async () => {
    payResponse = () => json(400, { type: 'https://api.fawtir.om/problems/invalid', code: 'PAYMENT_DATE_BEFORE_ISSUE_DATE', detail: 'no' })
    renderInvoice()
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
    fireEvent.change(await screen.findByRole('textbox', { name: /Amount received/ }), { target: { value: '99.000' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('That is more than is still owed on this invoice.')).toBeTruthy()
    expect(calls()).not.toContain(`POST ${URL_BASE}/payments`)

    fireEvent.change(screen.getByRole('textbox', { name: /Amount received/ }), { target: { value: '10.1234' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Use no more than 3 decimals.')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: /Amount received/ }), { target: { value: '10' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('A payment cannot be dated before the invoice was issued.')).toBeTruthy()
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
    who = { ...ADMIN, permissions: ADMIN.permissions.filter((code) => code !== 'invoice.payment.manage') }
    const { unmount } = renderInvoice()
    await screen.findByText('Reversed')
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull()
    unmount()

    who = ADMIN
    receivableResponse = () => json(200, { ...RECEIVABLE, outstandingAmount: 0, paidAmount: 56.7, paymentState: 'PAID' })
    renderInvoice()
    // "Paid" is both the status pill and the balance card's column label; wait for the balance.
    await waitFor(() => expect(screen.getAllByText('Paid').length).toBeGreaterThan(1))
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
  })
})

describe('invoice detail mapping', () => {
  it('reads the status from the state, and from what is owed once issued', () => {
    expect(statusOf(invoice({ authoringState: 'DRAFT' }), null).tone).toBe('draft')
    expect(statusOf(invoice({ authoringState: 'CANCELLED' }), RECEIVABLE).tone).toBe('cancelled')
    expect(statusOf(invoice(), { ...RECEIVABLE, paymentState: 'PAID', overdue: false }).tone).toBe('paid')
    expect(statusOf(invoice(), { ...RECEIVABLE, overdue: true }).tone).toBe('overdue')
    // Nothing is owed on a credit note, so it reads as issued rather than as unpaid.
    expect(statusOf(invoice({ type: 'CREDIT_NOTE' }), { ...RECEIVABLE, paymentState: 'NOT_APPLICABLE' }).tone).toBe('issued')
  })

  it('says what a payment would be refused for before it is sent', () => {
    const context = { outstanding: 36.7, currency: 'OMR', issueDate: '2026-08-01', today: '2026-09-16' }
    const form = { amount: '10.000', methodCode: '30', reference: '', paymentDate: '2026-09-01' }
    expect(paymentProblems(form, context)).toEqual({})
    expect(paymentProblems({ ...form, amount: '' }, context)).toEqual({ amount: 'invoiceDetails.pay.error.amountRequired' })
    expect(paymentProblems({ ...form, amount: '0' }, context)).toEqual({ amount: 'invoiceDetails.pay.error.amountPositive' })
    expect(paymentProblems({ ...form, amount: '1.0001' }, context)).toEqual({ amount: 'invoiceDetails.pay.error.amountScale' })
    expect(paymentProblems({ ...form, amount: '36.701' }, context)).toEqual({ amount: 'invoiceDetails.pay.error.amountTooMuch' })
    expect(paymentProblems({ ...form, paymentDate: '2026-09-17' }, context)).toEqual({ paymentDate: 'invoiceDetails.pay.error.dateFuture' })
    expect(paymentProblems({ ...form, paymentDate: '2026-07-31' }, context)).toEqual({ paymentDate: 'invoiceDetails.pay.error.dateBeforeIssue' })
  })

  it('says what issuing would be refused for, and dates the due day from the terms', () => {
    expect(issueProblems({ issueDate: '2026-09-16', dueDate: '2026-10-16' }, '2026-09-16')).toEqual({})
    expect(issueProblems({ issueDate: '2026-09-17', dueDate: '2026-10-16' }, '2026-09-16')).toEqual({ issueDate: 'invoiceIssue.error.issueDateFuture' })
    expect(issueProblems({ issueDate: '2025-12-31', dueDate: '2026-01-30' }, '2026-09-16')).toEqual({ issueDate: 'invoiceIssue.error.issueDateYear' })
    expect(issueProblems({ issueDate: '2026-09-16', dueDate: '2026-09-15' }, '2026-09-16')).toEqual({ dueDate: 'invoiceIssue.error.dueDateBeforeIssue' })
    // The same day is allowed.
    expect(issueProblems({ issueDate: '2026-09-16', dueDate: '2026-09-16' }, '2026-09-16')).toEqual({})
    expect(dueDateFor('2026-12-20', 'NET30')).toBe('2027-01-19')
    // Terms this build has no day count for leave the due date on the issue date, for the reader to set.
    expect(dueDateFor('2026-09-16', 'EOM')).toBe('2026-09-16')
  })

  it('names a readiness reason it has no sentence for rather than hiding it', () => {
    const refusal = issueRefusalOf(new ApiError({ status: 409, problemType: 'resource-conflict', code: 'IDENTITY_NOT_READY' }))
    expect(refusal).toEqual({ field: null, key: 'invoiceIssue.refused.notReady', values: { reason: 'IDENTITY_NOT_READY' } })
    // A 409 with no code is not a readiness refusal; the general failure text answers it.
    expect(issueRefusalOf(new ApiError({ status: 409, problemType: 'resource-conflict' }))).toBeNull()
  })

  it('folds a reversal into the payment it undoes', () => {
    const rows = paymentRows(PAYMENTS)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.reversed)).toEqual([false, true])
  })

  it('keeps an event this build does not know rather than dropping it', () => {
    const entries = timelineOf(
      { entries: [{ id: 'h-9', eventType: 'SOMETHING_NEW', outcome: 'REFUSED', invoiceVersion: 1, changedFieldsHash: null, actorId: 'u-1', occurredAt: '2026-08-01T07:00:00Z' }], truncated: false, limit: 200 },
      'u-1',
    )
    expect(entries).toEqual([{ key: 'invoiceDetails.event.other', at: '2026-08-01T07:00:00Z', byYou: true, outcome: 'REFUSED' }])
  })
})
