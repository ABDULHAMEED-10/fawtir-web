import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceDetailDto, InvoiceReceivableDto } from '../../api/invoices/detail'
import { creditEffect, fromInvoice, noteProblems, toNoteRequest } from '../../lib/salesNote'
import { NewCreditNotePage } from './NewCreditNotePage'
import { NewDebitNotePage } from '../NewDebitNotePage'
import { CreditNotesPage } from '../CreditNotesPage'
import { InvoiceDetailsPage } from '../InvoiceDetailsPage'

const INVOICE_ID = '11111111-1111-1111-1111-111111111111'
const NOTE_ID = '22222222-2222-2222-2222-222222222222'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'invoice.issue', 'creditnote.create', 'debitnote.create', 'customer.read'],
  scopes: [],
  featureFlags: {},
}

const line = (lineNumber: number, description: string, quantity: number, unitPrice: number) => ({
  lineNumber,
  productId: `p-${lineNumber}`,
  productCode: `P${lineNumber}`,
  description,
  unitCode: 'KGM',
  quantity,
  unitPrice,
  discountType: 'PERCENTAGE' as const,
  discountValue: 0,
  taxCategoryCode: 'STANDARD',
  en16931Category: 'S',
  taxRate: 5,
  exemptionReason: null,
})

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
  invoiceNumber: 'INV-2026-0042',
  issueDate: '2026-08-01',
  dueDate: '2026-08-31',
  issuedAt: '2026-08-01T07:00:00Z',
  details: {
    deliveryDate: null,
    subject: null,
    purchaseOrderReference: 'PO-77',
    customerVisibleNote: null,
    paymentTerms: { code: 'NET30', label: 'Net 30 days' },
    paymentMethod: null,
    correctionReasonCode: null,
    buyerReference: null,
    contractReference: null,
    transactionType: 'FULL_TAX',
    transactionSubtypes: [],
    invoicingPeriod: null,
  },
  headerDiscount: { type: 'PERCENTAGE', value: 0 },
  lines: [line(1, 'Green beans', 10, 4), line(2, 'Roasting', 2, 15)],
  totals: null,
}

const RECEIVABLE: InvoiceReceivableDto = {
  documentTotal: 73.5,
  paidAmount: 73.5,
  creditedAmount: 0,
  outstandingAmount: 0,
  currency: 'OMR',
  paymentState: 'PAID',
  overdue: false,
  dueDate: '2026-08-31',
}

const DRAFT = {
  id: NOTE_ID,
  version: 0,
  authoringState: 'DRAFT',
  type: 'CREDIT_NOTE',
  correctionOfInvoiceId: INVOICE_ID,
  customerId: 'c-1',
  branchId: 'b-1',
  currency: 'OMR',
  invoiceNumber: null,
  details: { deliveryDate: null, subject: null, purchaseOrderReference: 'PO-77', customerVisibleNote: null, paymentTerms: null, transactionType: 'FULL_TAX', correctionReasonCode: 'QTY' },
  headerDiscount: { type: 'FIXED_AMOUNT', value: 0 },
  lines: [],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let receivable: InvoiceReceivableDto
const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([called, init]) => String(called).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  receivable = RECEIVABLE
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}`) return json(200, INVOICE)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/receivable`) return json(200, receivable)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes` && method === 'POST') return json(201, DRAFT)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes` && method === 'POST') return json(201, { ...DRAFT, type: 'DEBIT_NOTE' })
    if (url === `/api/v1/invoice-drafts/${NOTE_ID}/preview`) return json(200, { currency: 'OMR', lines: [], totals: { totalAmount: 42 } })
    if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue`) return json(200, { ...INVOICE, id: NOTE_ID, type: 'CREDIT_NOTE', invoiceNumber: 'CRN-1' })
    if (url.startsWith('/api/v1/authored-invoices?'))
      return json(200, {
        content: [
          {
            id: NOTE_ID,
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
            totals: { totalAmount: 42 },
            customerName: 'Sohar Port Logistics',
            payment: { state: 'NOT_APPLICABLE', overdue: false, daysOverdue: null, paidAmount: null, creditedAmount: null, outstandingAmount: null },
            correctionOfInvoiceId: INVOICE_ID,
            correctionOfInvoiceNumber: 'INV-2026-0042',
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
      })
    if (url.startsWith(`/api/v1/authored-invoices/${INVOICE_ID}/`)) return json(200, url.endsWith('/history') ? { entries: [], truncated: false, limit: 200 } : [])
    if (url.startsWith('/api/v1/customers/')) return json(200, { id: 'c-1', type: 'BUSINESS', displayName: 'Sohar Port Logistics', profile: { details: { vatRegistrationNumber: 'OM1100999001' }, contact: null, deliveryPreferences: null, invoiceAddress: null }, peppolDelivery: 'ACTIVE', status: 'ACTIVE', updatedAt: '2026-08-01T00:00:00Z' })
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
        <Route path="/income/credit-notes/:id" element={<p>credit note page</p>} />
        <Route path="/income/debit-notes/new" element={<NewDebitNotePage />} />
        <Route path="/income/debit-notes/:id" element={<p>debit note page</p>} />
        <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the note rules', () => {
  it('starts a credit note from every invoice line and a debit note from none', () => {
    expect(fromInvoice(INVOICE, 'CREDIT_NOTE').lines.map((l) => l.include)).toEqual([true, true])
    expect(fromInvoice(INVOICE, 'DEBIT_NOTE').lines.map((l) => l.include)).toEqual([false, false])
  })

  it('refuses a credit above what the invoice charged for a line, and a note with no reason', () => {
    const form = fromInvoice(INVOICE, 'CREDIT_NOTE')
    form.lines[0].quantity = '11'
    expect(noteProblems(form, 'CREDIT_NOTE')).toEqual({ reasonCode: 'salesNote.error.reason', amounts: 'salesNote.error.creditAmounts' })
    expect(noteProblems({ ...form, reasonCode: 'QTY' }, 'DEBIT_NOTE')).toEqual({})
  })

  it('carries the invoice party, currency and terms with the kept lines and the reason code', () => {
    const form = { ...fromInvoice(INVOICE, 'CREDIT_NOTE'), reasonCode: 'QTY' as const, note: ' Two bags returned ' }
    form.lines[1].include = false
    const body = toNoteRequest(form, INVOICE)
    expect(body).toMatchObject({
      customerId: 'c-1',
      branchId: 'b-1',
      currency: 'OMR',
      details: { paymentTerms: { code: 'NET30' }, purchaseOrderReference: 'PO-77', customerVisibleNote: 'Two bags returned', correctionReasonCode: 'QTY' },
    })
    expect(body.lines).toEqual([expect.objectContaining({ lineNumber: 1, productId: 'p-1', quantity: 10, unitPrice: 4 })])
  })

  it('names the refund when a credit is more than is still owed', () => {
    expect(creditEffect(36.7, 10)).toEqual({ after: 26.7, refund: 0 })
    expect(creditEffect(0, 42)).toEqual({ after: 0, refund: 42 })
  })
})

describe('a credit note', () => {
  it('credits chosen lines of a paid invoice, says the refund is outside Fawtir, and issues with no due date', async () => {
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Roasting' }))
    fireEvent.change(screen.getByLabelText('Quantity · Green beans'), { target: { value: '5' } })
    expect(screen.getByText(/21.000 OMR is a refund due to them/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Issue the credit note' }))
    expect(await screen.findByText('Choose why the note is issued.')).toBeTruthy()
    expect(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes`)).toHaveLength(0)

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'QTY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Issue the credit note' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Due date')).toBeNull()
    const created = calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes`)
    expect(created).toHaveLength(1)
    expect(bodyOf(created[0]).lines).toEqual([expect.objectContaining({ productId: 'p-1', quantity: 5 })])
    expect((created[0][1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': expect.stringMatching(/^draft-/) })

    await act(async () => {
      fireEvent.submit(dialog.querySelector('form')!)
    })
    expect(await screen.findByText('credit note page')).toBeTruthy()
    const issued = bodyOf(calls('POST', `/api/v1/invoice-drafts/${NOTE_ID}/issue`)[0])
    expect(issued.dueDate).toBe(issued.issueDate)
  })
})

describe('a debit note', () => {
  it('starts with nothing ticked and saves only the lines charged more', async () => {
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(/separate amount due/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Tick at least one line.')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Roasting' }))
    fireEvent.change(screen.getByLabelText('Unit price · Roasting'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'VAL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('debit note page')).toBeTruthy()
    const body = bodyOf(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)[0])
    expect(body.lines).toEqual([expect.objectContaining({ productId: 'p-2', quantity: 2, unitPrice: 3 })])
    expect(body.details.correctionReasonCode).toBe('VAL')
  })
})

describe('notes around the invoice', () => {
  it('lists credit notes with the invoice each one credits', async () => {
    renderAt('/income/credit-notes')
    const row = (await screen.findByRole('link', { name: 'CRN-1' })).closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'INV-2026-0042' }).getAttribute('href')).toBe(`/invoices/${INVOICE_ID}`)
    expect(calls('GET', '/api/v1/authored-invoices?')[0][0]).toContain('type=CREDIT_NOTE')
    expect(screen.queryByText(/Refund due/)).toBeNull()
  })

  it('offers both notes on an issued invoice and lists the notes against it', async () => {
    renderAt(`/invoices/${INVOICE_ID}`)
    expect(await screen.findByRole('button', { name: 'Debit note' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'CRN-1' })).toBeTruthy()
    expect(calls('GET', '/api/v1/authored-invoices?').some(([url]) => String(url).includes(`correction_of_invoice_id=${INVOICE_ID}`))).toBe(true)
  })
})
