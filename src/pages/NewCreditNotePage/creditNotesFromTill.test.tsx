import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceDetailDto, InvoiceReceivableDto } from '../../api/invoices/detail'
import { NewCreditNotePage } from './NewCreditNotePage'
import { NewDebitNotePage } from '../NewDebitNotePage'
import { CreditNotesPage } from '../CreditNotesPage'
import { DebitNotesPage } from '../DebitNotesPage'
import { CreditNoteDetailsPage } from '../CreditNoteDetailsPage'

/**
 * Credit notes and the till: a till refund's credit note is marked "From the till" on Income ›
 * Credit notes (with the same Source filter as Sales › Invoices), and a credit note started from a
 * till sale's invoice points at the till's refund without ever being refused. Both only once the
 * server says where a document was made (`source`); an older server sends nothing and nothing new
 * is drawn.
 */

const INVOICE_ID = '11111111-1111-1111-1111-111111111111'
const NOTE_ID = '22222222-2222-2222-2222-222222222222'
const TILL = { id: 'till-1', code: 'T01', name: 'Front counter' }

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.draft',
    'invoice.issue',
    'creditnote.create',
    'debitnote.create',
    'customer.read',
    'pos.refund',
  ],
  scopes: [],
  featureFlags: {},
}

const INVOICE: InvoiceDetailDto = {
  id: INVOICE_ID,
  type: 'INVOICE',
  correctionOfInvoiceId: null,
  version: 3,
  authoringState: 'ISSUED',
  deliveryState: 'NOT_SUBMITTED',
  deliveryBlocker: null,
  customerId: 'c-1',
  branchId: 'b-1',
  currency: 'OMR',
  vatMode: 'EXCLUSIVE',
  invoiceNumber: 'MAIN-T01-INV-2026-000001',
  issueDate: '2026-08-01',
  dueDate: '2026-08-01',
  issuedAt: '2026-08-01T07:00:00Z',
  details: {
    deliveryDate: null,
    subject: null,
    purchaseOrderReference: null,
    customerVisibleNote: null,
    paymentTerms: null,
    paymentMethod: null,
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
      productCode: 'P1',
      description: 'Cappuccino',
      unitCode: 'C62',
      quantity: 2,
      unitPrice: 1.5,
      discountType: 'PERCENTAGE',
      discountValue: 0,
      taxCategoryCode: 'STANDARD',
      en16931Category: 'S',
      taxRate: 5,
      exemptionReason: null,
    },
  ],
  totals: null,
}

const RECEIVABLE: InvoiceReceivableDto = {
  documentTotal: 3.15,
  paidAmount: 3.15,
  creditedAmount: 0,
  outstandingAmount: 0,
  currency: 'OMR',
  paymentState: 'PAID',
  overdue: false,
  dueDate: '2026-08-01',
}

const SUMMARY = {
  currencyCode: 'OMR',
  asOf: '2026-09-25',
  all: 2,
  drafts: 0,
  toSend: 0,
  awaiting: 0,
  overdue: 0,
  paid: 0,
  outstandingTotal: 0,
  outstandingInvoices: 0,
  awaitingTotal: 0,
  dueSoonInvoices: 0,
  dueSoonDays: 7,
  overdueTotal: 0,
  overdueInvoices: 0,
  oldestOverdueDueDate: null,
  paidTotal: 0,
  paidInvoices: 0,
  issuedLast30Days: { count: 2, total: 4 },
  issuedTotal: { count: 2, total: 4 },
  issuedThisQuarter: { count: 2, total: 4 },
}

/** A list row; `source`/`till` are left out entirely to play an older server. */
function noteRow(overrides: Record<string, unknown>) {
  return {
    id: 'crn-1',
    type: 'CREDIT_NOTE',
    version: 1,
    authoringState: 'ISSUED',
    deliveryState: 'NOT_SUBMITTED',
    customerId: 'c-1',
    currency: 'OMR',
    invoiceNumber: 'CRN-1',
    issueDate: '2026-09-10',
    dueDate: '2026-09-10',
    details: null,
    lines: [],
    totals: { totalAmount: 2 },
    customerName: 'Sohar Port Logistics',
    payment: null,
    correctionOfInvoiceId: INVOICE_ID,
    correctionOfInvoiceNumber: 'INV-2026-0042',
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let entitlements: Entitlements
let invoice: InvoiceDetailDto
let rows: unknown[]
let note: InvoiceDetailDto
const listCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/v1/authored-invoices?'))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  entitlements = ADMIN
  invoice = INVOICE
  rows = []
  note = {
    ...INVOICE,
    id: NOTE_ID,
    type: 'CREDIT_NOTE',
    correctionOfInvoiceId: INVOICE_ID,
    invoiceNumber: 'MAIN-T01-CRN-2026-000001',
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, entitlements)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}`) return json(200, invoice)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/receivable`) return json(200, RECEIVABLE)
    if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, note)
    if (url === `/api/v1/authored-invoices/${NOTE_ID}/receivable`) return json(404, { status: 404 })
    if (
      url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/`) ||
      url.startsWith(`/api/v1/authored-invoices/${INVOICE_ID}/`)
    )
      return json(
        200,
        url.endsWith('/history')
          ? { entries: [], truncated: false, limit: 200 }
          : url.endsWith('/internal-note')
            ? { internalNote: null }
            : [],
      )
    if (url.startsWith('/api/v1/authored-invoices/summary')) return json(200, SUMMARY)
    if (url.startsWith('/api/v1/authored-invoices?'))
      return json(200, { content: rows, page: 0, size: 10, totalElements: rows.length })
    if (url.startsWith('/api/v1/customers/'))
      return json(200, {
        id: 'c-1',
        type: 'CONSUMER',
        displayName: 'Walk-in customer',
        profile: { details: {}, contact: null, deliveryPreferences: null, invoiceAddress: null },
        peppolDelivery: 'NONE',
        status: 'ACTIVE',
        updatedAt: '2026-08-01T00:00:00Z',
      })
    if (url === '/api/v1/branches') return json(200, [])
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/income/credit-notes" element={<CreditNotesPage />} />
        <Route path="/income/credit-notes/new" element={<NewCreditNotePage />} />
        <Route path="/income/debit-notes" element={<DebitNotesPage />} />
        <Route path="/income/debit-notes/new" element={<NewDebitNotePage />} />
        <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
        <Route path="/pos/refund" element={<p>till refund page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Income › Credit notes: From the till', () => {
  it('marks a till refund From the till, names the till, and filters by source', async () => {
    rows = [
      noteRow({ source: 'OTHER', till: null }),
      noteRow({
        id: 'crn-t1',
        invoiceNumber: 'MAIN-T01-CRN-2026-000001',
        correctionOfInvoiceNumber: 'MAIN-T01-INV-2026-000001',
        source: 'TILL',
        till: TILL,
      }),
    ]
    renderAt('/income/credit-notes')
    const tillRow = (await screen.findByRole('link', { name: 'MAIN-T01-CRN-2026-000001' })).closest(
      'tr',
    )!
    expect(within(tillRow).getByText('From the till').getAttribute('title')).toBe(
      'From the till · Front counter',
    )
    const otherRow = screen.getByRole('link', { name: 'CRN-1' }).closest('tr')!
    expect(within(otherRow).queryByText('From the till')).toBeNull()

    expect(listCalls().at(-1)).not.toContain('source=')
    fireEvent.click(await screen.findByRole('button', { name: /^Source/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'From the till' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('source=TILL'))

    fireEvent.click(screen.getByRole('button', { name: /^Source|^From the till/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Other' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('source=OTHER'))

    fireEvent.click(screen.getByRole('button', { name: /^Source|^Other/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'All sources' }))
    await waitFor(() => expect(listCalls().at(-1)).not.toContain('source='))
  }, 30_000)

  it('draws no badge and offers no source filter while the server does not send source', async () => {
    rows = [noteRow({})]
    renderAt('/income/credit-notes')
    await screen.findByRole('link', { name: 'CRN-1' })
    expect(screen.queryByRole('button', { name: /^Source/ })).toBeNull()
    expect(screen.queryByText('From the till')).toBeNull()
  })

  it('keeps a source filter from the address visible so it can be cleared, even with no rows', async () => {
    renderAt('/income/credit-notes?source=till')
    await waitFor(() => expect(listCalls().at(-1)).toContain('source=TILL'))
    expect(await screen.findByRole('button', { name: /From the till/ })).toBeTruthy()
  })

  it('offers no source filter on debit notes, which the till never makes', async () => {
    rows = [noteRow({ type: 'DEBIT_NOTE', source: 'OTHER', till: null })]
    renderAt('/income/debit-notes?source=till')
    await screen.findByRole('link', { name: 'CRN-1' })
    expect(screen.queryByRole('button', { name: /^Source|From the till/ })).toBeNull()
    expect(listCalls().at(-1)).not.toContain('source=')
  })
})

describe('a credit note from a till sale’s invoice', () => {
  const HINT = /Giving cash back at the counter\?/

  it("points at the till's refund for that sale and still lets the note be saved and issued", async () => {
    invoice = { ...INVOICE, source: 'TILL', till: TILL }
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(HINT)).toBeTruthy()
    const link = screen.getByRole('link', {
      name: "Use the till's refund so the drawer balances.",
    })
    expect(link.getAttribute('href')).toBe('/pos/refund?invoice=MAIN-T01-INV-2026-000001')
    // Never blocks: Save draft and Issue stay enabled.
    expect(
      (screen.getByRole('button', { name: 'Issue credit note' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    fireEvent.click(link)
    expect(await screen.findByText('till refund page')).toBeTruthy()
  })

  it('keeps the line without a link for someone who may not refund at the till', async () => {
    entitlements = { ...ADMIN, permissions: ADMIN.permissions.filter((p) => p !== 'pos.refund') }
    invoice = { ...INVOICE, source: 'TILL', till: TILL }
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(HINT)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /till's refund/ })).toBeNull()
  })

  it('says nothing for an invoice made elsewhere, or from a server that does not send source', async () => {
    invoice = { ...INVOICE, source: 'OTHER', till: null }
    const first = renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    await screen.findByText('Cappuccino')
    expect(screen.queryByText(HINT)).toBeNull()
    first.unmount()

    invoice = INVOICE
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    await screen.findByText('Cappuccino')
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('says nothing on a debit note against a till sale', async () => {
    invoice = { ...INVOICE, source: 'TILL', till: TILL }
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    await screen.findAllByRole('link', { name: 'MAIN-T01-INV-2026-000001' })
    expect(screen.queryByText(HINT)).toBeNull()
  })
})

describe('a credit note opened', () => {
  it('carries From the till and the till in its header when a till refund made it', async () => {
    note = { ...note, source: 'TILL', till: TILL }
    renderAt(`/income/credit-notes/${NOTE_ID}`)
    expect(await screen.findByRole('heading', { name: 'MAIN-T01-CRN-2026-000001' })).toBeTruthy()
    expect(await screen.findByText('From the till · Front counter')).toBeTruthy()
  }, 30_000)

  it('carries no mark from a server that does not send source', async () => {
    renderAt(`/income/credit-notes/${NOTE_ID}`)
    expect(await screen.findByRole('heading', { name: 'MAIN-T01-CRN-2026-000001' })).toBeTruthy()
    expect(screen.queryByText(/From the till/)).toBeNull()
  }, 30_000)
})
