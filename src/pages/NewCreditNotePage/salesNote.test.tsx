import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceDetailDto, InvoiceReceivableDto } from '../../api/invoices/detail'
import { createNote, type DraftRequest, type DraftResponse } from '../../api/invoices/drafts'
import type { InvoiceRowDto } from '../../api/invoices/list'
import {
  NOTE_REFUSALS,
  addedLine,
  asksBackOnShelf,
  creditEffect,
  debitPaymentOf,
  fromInvoice,
  fromNoteDraft,
  noteHeaderDiscount,
  noteProblems,
  noteStatusOf,
  noteTotals,
  participantIdText,
  patchLine,
  reasonLabelKey,
  toNoteRequest,
  withMode,
  creditCapRefusal,
  type NoteForm,
  type NoteLine,
} from '../../lib/salesNote'
import { ApiError } from '../../api'
import { issueRefusalOf } from '../../lib/invoiceIssue'
import { CATEGORY_REASON_CONFLICT } from '../../lib/invoiceDraft'
import { NewCreditNotePage } from './NewCreditNotePage'
import { NewSelfBilledCreditNotePage } from './NewSelfBilledCreditNotePage'
import { NewDebitNotePage } from '../NewDebitNotePage'
import { CreditNotesPage } from '../CreditNotesPage'
import { DebitNotesPage } from '../DebitNotesPage'
import { InvoiceDetailsPage } from '../InvoiceDetailsPage'
import { CreditNoteDetailsPage } from '../CreditNoteDetailsPage'
import { SalesNoteDetailPage } from '../CreditNoteDetailsPage/SalesNoteDetailPage'
import { DebitNoteDetailPage } from '../DebitNoteDetailPage'

const INVOICE_ID = '11111111-1111-1111-1111-111111111111'
const NOTE_ID = '22222222-2222-2222-2222-222222222222'

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
  ],
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
  details: {
    deliveryDate: null,
    subject: null,
    purchaseOrderReference: 'PO-77',
    customerVisibleNote: null,
    paymentTerms: null,
    transactionType: 'FULL_TAX',
    correctionReasonCode: 'QTY',
  },
  headerDiscount: { type: 'FIXED_AMOUNT', value: 0 },
  lines: [],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let receivable: InvoiceReceivableDto
let entitlements: Entitlements
/** Per-test answers, tried before the shared ones; `undefined` falls through. */
let override: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined
const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([called, init]) =>
      String(called).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  receivable = RECEIVABLE
  entitlements = ADMIN
  override = () => undefined
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const answered = await override(url, init)
    if (answered) return answered
    if (url === '/api/v1/me/entitlements') return json(200, entitlements)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}`) return json(200, INVOICE)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/receivable`) return json(200, receivable)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes` && method === 'POST')
      return json(201, DRAFT)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes` && method === 'POST')
      return json(201, { ...DRAFT, type: 'DEBIT_NOTE' })
    if (url === `/api/v1/invoice-drafts/${NOTE_ID}/preview`)
      return json(200, { currency: 'OMR', lines: [], totals: { totalAmount: 42 } })
    if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue`)
      return json(200, { ...INVOICE, id: NOTE_ID, type: 'CREDIT_NOTE', invoiceNumber: 'CRN-1' })
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
            payment: {
              state: 'NOT_APPLICABLE',
              overdue: false,
              daysOverdue: null,
              paidAmount: null,
              creditedAmount: null,
              outstandingAmount: null,
            },
            correctionOfInvoiceId: INVOICE_ID,
            correctionOfInvoiceNumber: 'INV-2026-0042',
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
      })
    if (url.startsWith(`/api/v1/authored-invoices/${INVOICE_ID}/`))
      return json(
        200,
        url.endsWith('/history') ? { entries: [], truncated: false, limit: 200 } : [],
      )
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
        <Route path="/income/debit-notes" element={<DebitNotesPage />} />
        <Route path="/income/debit-notes/new" element={<NewDebitNotePage />} />
        <Route path="/income/debit-notes/:id" element={<p>debit note page</p>} />
        <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The design's reason field is a dropdown, not a native select: open it and pick. */
function chooseReason(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Reason' }))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

describe('the note rules', () => {
  it('starts a credit note from every invoice line and a debit note from none', () => {
    expect(fromInvoice(INVOICE, 'CREDIT_NOTE').lines.map((l) => l.include)).toEqual([true, true])
    expect(fromInvoice(INVOICE, 'DEBIT_NOTE').lines.map((l) => l.include)).toEqual([false, false])
  })

  it('refuses a credit above what the invoice charged for a line, and a note with no reason', () => {
    const form = fromInvoice(INVOICE, 'CREDIT_NOTE')
    form.lines[0].quantity = '11'
    expect(noteProblems(form, 'CREDIT_NOTE')).toEqual({
      reason: 'salesNote.error.reason',
      amounts: 'salesNote.error.creditAmounts',
    })
    expect(noteProblems({ ...form, reason: 'additionalDelivery' }, 'DEBIT_NOTE')).toEqual({})
  })

  it('carries the invoice party, currency and terms with the kept lines and the reason code', () => {
    // The design's "Returned goods" travels as the API's QTY code.
    const form = {
      ...fromInvoice(INVOICE, 'CREDIT_NOTE'),
      reason: 'returnedGoods',
      note: ' Two bags returned ',
    }
    form.lines[1].include = false
    const body = toNoteRequest(form, INVOICE, 'CREDIT_NOTE')
    expect(body).toMatchObject({
      customerId: 'c-1',
      branchId: 'b-1',
      currency: 'OMR',
      details: {
        paymentTerms: { code: 'NET30' },
        purchaseOrderReference: 'PO-77',
        customerVisibleNote: 'Two bags returned',
        correctionReasonCode: 'QTY',
      },
    })
    expect(body.lines).toEqual([
      expect.objectContaining({ lineNumber: 1, productId: 'p-1', quantity: 10, unitPrice: 4 }),
    ])
  })

  it("carries each kept line's classification and reason code from the invoice", () => {
    const invoice: InvoiceDetailDto = {
      ...INVOICE,
      lines: [
        {
          ...line(1, 'Cement', 10, 4),
          taxCategoryCode: 'Z0',
          en16931Category: 'Z',
          taxRate: 0,
          exemptionReasonCode: 'VATZR-OM-10',
          classification: {
            goodsOrService: 'G',
            hsCode: '090121000000',
            serviceTypeCode: '00000000',
          },
        },
        {
          ...line(2, 'Advice', 1, 50),
          unitCode: 'HUR',
          classification: { goodsOrService: 'S', serviceTypeCode: '86000000' },
        },
        {
          ...line(3, 'Delivery', 1, 5),
          unitCode: 'HUR',
          classification: { goodsOrService: 'S', serviceTypeCode: '00000000' },
        },
      ],
    }
    const form = { ...fromInvoice(invoice, 'CREDIT_NOTE'), reason: 'returnedGoods' }
    const { lines } = toNoteRequest(form, invoice, 'CREDIT_NOTE')

    expect(lines[0]).toMatchObject({
      taxCategory: { code: 'Z0', exemptionReasonCode: 'VATZR-OM-10' },
      classification: { goodsOrService: 'G', hsCode: '090121000000' },
    })
    expect(lines[1].classification).toEqual({ goodsOrService: 'S', serviceTypeCode: '86000000' })
    // 00000000 is the backend's "not applicable": the note states services and no type.
    expect(lines[2].classification).toEqual({ goodsOrService: 'S' })
  })

  describe('the invoice line’s price rule and bundle (Z-22, backend #842)', () => {
    const RULED: InvoiceDetailDto = {
      ...INVOICE,
      lines: [
        {
          ...line(1, 'Green beans', 10, 4),
          discountValue: 10,
          priceRuleIds: ['rule-1'],
          bundleId: 'bun-1',
        },
        {
          ...line(2, 'Roasting', 2, 15),
          discountType: 'FIXED_AMOUNT',
          discountValue: 3,
          priceRuleIds: ['rule-2'],
        },
        line(3, 'Bag', 1, 2),
      ],
    }
    const note = (edit: (form: NoteForm) => NoteForm = (form) => form) =>
      toNoteRequest(
        { ...edit(fromInvoice(RULED, 'CREDIT_NOTE')), reason: 'Goods returned' },
        RULED,
        'CREDIT_NOTE',
      ).lines as (DraftRequest['lines'][number] & { priceRuleIds?: string[]; bundleId?: string })[]
    const at = (form: NoteForm, lineNumber: number, patch: Partial<NoteLine>) => ({
      ...form,
      lines: form.lines.map((l) => (l.lineNumber === lineNumber ? { ...l, ...patch } : l)),
    })

    it('carries both onto a whole credit, and neither on a line that had none', () => {
      const [first, second, third] = note()
      expect(first.priceRuleIds).toEqual(['rule-1'])
      expect(first.bundleId).toBe('bun-1')
      expect(second.priceRuleIds).toEqual(['rule-2'])
      expect(second.bundleId).toBeUndefined()
      expect(third.priceRuleIds).toBeUndefined()
      expect(third.bundleId).toBeUndefined()
    })

    it('keeps the rule on part of a line at the same rate', () => {
      const [first] = note((form) => at(form, 1, { quantity: '5' }))
      expect(first.priceRuleIds).toEqual(['rule-1'])
      expect(first.bundleId).toBe('bun-1')
    })

    it('drops the rule where the server would refuse it: a larger rate, or a fixed amount on less', () => {
      const raised = note((form) => at(form, 1, { discountValue: '20' }))
      expect(raised[0].priceRuleIds).toBeUndefined()
      expect(raised[0].bundleId).toBe('bun-1')
      const part = note((form) => at(form, 2, { quantity: '1' }))
      expect(part[1].priceRuleIds).toBeUndefined()
      const scaled = note((form) => at(form, 2, { quantity: '1', discountValue: '1.5' }))
      expect(scaled[1].priceRuleIds).toEqual(['rule-2'])
    })

    it('drops the rule when the discount was cleared', () => {
      const [first] = note((form) => at(form, 1, { discountValue: '0' }))
      expect(first.priceRuleIds).toBeUndefined()
    })

    it('does not exceed what the invoice gave the item across the note’s lines', () => {
      const bean = { ...line(1, 'Green beans', 10, 4), productId: 'p-1', priceRuleIds: ['rule-1'] }
      // 4.000 given on the first line, nothing on the second.
      const invoice: InvoiceDetailDto = {
        ...INVOICE,
        lines: [
          { ...bean, discountValue: 10 },
          { ...bean, lineNumber: 2, description: 'Green beans again' },
        ],
      }
      // Half the rate each on the whole of both lines is 2.000 + 2.000: fine. 5% then 7% is over.
      const form = (first: string, second: string) => {
        const start = fromInvoice(invoice, 'CREDIT_NOTE')
        return at(at(start, 1, { discountValue: first }), 2, { discountValue: second })
      }
      const named = (first: string, second: string) =>
        (
          toNoteRequest(form(first, second), invoice, 'CREDIT_NOTE').lines as {
            priceRuleIds?: string[]
          }[]
        ).map((sent) => sent.priceRuleIds)
      expect(named('5', '5')).toEqual([['rule-1'], ['rule-1']])
      expect(named('5', '7')).toEqual([['rule-1'], undefined])
    })

    it('adds nothing for a server that sends neither, and nothing on a line added on the note', () => {
      const { lines } = toNoteRequest(fromInvoice(INVOICE, 'CREDIT_NOTE'), INVOICE, 'CREDIT_NOTE')
      for (const sent of lines) {
        expect(sent).not.toHaveProperty('priceRuleIds')
        expect(sent).not.toHaveProperty('bundleId')
      }
      const custom = withMode(fromInvoice(RULED, 'CREDIT_NOTE'), 'custom', RULED)
      const added = toNoteRequest(custom, RULED, 'CREDIT_NOTE').lines[0]
      expect(added).not.toHaveProperty('priceRuleIds')
      expect(added).not.toHaveProperty('bundleId')
    })

    it('keeps them on a draft reopened from the invoice', () => {
      const saved = toNoteRequest(fromInvoice(RULED, 'CREDIT_NOTE'), RULED, 'CREDIT_NOTE')
      const draft = {
        lines: saved.lines.map((sent) => ({
          ...sent,
          discountType: sent.discount.type,
          discountValue: sent.discount.value,
        })),
        details: {},
      } as unknown as DraftResponse
      const reopened = fromNoteDraft(draft, RULED, 'CREDIT_NOTE')
      expect(reopened.lines[0].priceRuleIds).toEqual(['rule-1'])
      expect(reopened.lines[0].bundleId).toBe('bun-1')
    })
  })

  it('names the refund when a credit is more than is still owed', () => {
    expect(creditEffect(36.7, 10)).toEqual({ after: 26.7, refund: 0 })
    expect(creditEffect(0, 42)).toEqual({ after: 0, refund: 42 })
  })
})

describe('a credit note', () => {
  it('tells the person who issued it when a line did not all go back on the shelf (E2E M-5)', async () => {
    const answer = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue`) {
        return json(200, {
          ...INVOICE,
          id: NOTE_ID,
          type: 'CREDIT_NOTE',
          invoiceNumber: 'CRN-1',
          warnings: [{ line: 1, code: 'STOCK_RETURN_EXCEEDS_SALE' }],
        })
      }
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) {
        // The plain read has no warnings: only the issue answer does.
        return json(200, {
          ...INVOICE,
          id: NOTE_ID,
          type: 'CREDIT_NOTE',
          invoiceNumber: 'CRN-1',
          warnings: null,
        })
      }
      return answer(url, init)
    })
    render(
      <MemoryRouter initialEntries={[`/income/credit-notes/new?invoice=${INVOICE_ID}`]}>
        <Routes>
          <Route path="/income/credit-notes/new" element={<NewCreditNotePage />} />
          <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('Green beans')
    chooseReason('Returned goods')
    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))
    expect(await screen.findByText(/Line 1: not all of it went back on the shelf/)).toBeTruthy()
  })

  it('credits chosen lines of a paid invoice, shows the refund due, and issues from the page with no due date', async () => {
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    // The whole invoice first, as the design opens: every line listed, read-only.
    expect(await screen.findByText('Green beans')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Full invoice/ }).getAttribute('aria-checked')).toBe(
      'true',
    )

    fireEvent.click(screen.getByRole('radio', { name: /Specific lines/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Roasting' }))
    fireEvent.change(screen.getByLabelText('Quantity · Green beans'), { target: { value: '5' } })
    // The invoice is paid in full, so the whole credit (5 × 4.000 + 5% VAT) comes back as a refund.
    const refund = screen
      .getByText('Refund due to customer')
      .closest('[role="status"]') as HTMLElement
    expect(within(refund).getByText('21.000')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))
    expect(await screen.findByText('Choose why the note is issued.')).toBeTruthy()
    expect(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes`)).toHaveLength(0)

    chooseReason('Returned goods')
    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))

    // Nothing opens over the page: the draft is saved and issued with the dates on the page.
    expect(await screen.findByText('credit note page')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    const created = calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes`)
    expect(created).toHaveLength(1)
    expect(bodyOf(created[0]).lines).toEqual([
      expect.objectContaining({ productId: 'p-1', quantity: 5 }),
    ])
    expect(bodyOf(created[0]).details.correctionReasonCode).toBe('QTY')
    expect((created[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^draft-/),
    })
    const issue = calls('POST', `/api/v1/invoice-drafts/${NOTE_ID}/issue`)
    expect(issue).toHaveLength(1)
    const issued = bodyOf(issue[0])
    expect(issued.dueDate).toBe(issued.issueDate)
    expect((issue[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^draft-/),
    })
  }, 30_000)
})

describe('a debit note', () => {
  it('lists every invoice line untick-free and saves only the lines given a difference', async () => {
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(/Only the difference is charged/)).toBeTruthy()
    // As the frame draws it: no checkboxes; a line is charged when it carries a difference.
    expect(screen.queryByRole('checkbox', { name: /Include/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/Enter the difference on at least one line/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Unit price · Roasting'), { target: { value: '3' } })
    chooseReason('Undercharged')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('debit note page')).toBeTruthy()
    const body = bodyOf(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)[0])
    expect(body.lines).toEqual([
      expect.objectContaining({ productId: 'p-2', quantity: 2, unitPrice: 3 }),
    ])
    expect(body.details.correctionReasonCode).toBe('VAL')
  }, 30_000)

  it('splits a custom credit over more than one line, each at its own VAT category', async () => {
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    fireEvent.click(await screen.findByRole('radio', { name: /Custom amount/ }))
    expect(screen.getAllByRole('button', { name: /^VAT \(%\) · / })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Add a line/ }))
    expect(screen.getAllByRole('button', { name: /^VAT \(%\) · / })).toHaveLength(2)
  }, 30_000)

  it('lets a line added on a debit note pick its own VAT category, with its own reason', async () => {
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    fireEvent.click(await screen.findByRole('radio', { name: /Additional items/ }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Delivery' } })

    fireEvent.click(screen.getByRole('button', { name: 'VAT (%) · Delivery' }))
    fireEvent.click(screen.getByRole('option', { name: /Zero-rated/ }))
    expect(screen.getByRole('button', { name: 'Reason no VAT is charged · Delivery' })).toBeTruthy()

    chooseReason('Undercharged')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/Say why no VAT is charged on the lines you added/)).toBeTruthy()
    expect(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)).toHaveLength(0)
  }, 30_000)
})

describe('notes around the invoice', () => {
  it('lists credit notes with the invoice each one credits, under the design tabs and figures', async () => {
    renderAt('/income/credit-notes')
    const row = (await screen.findByRole('link', { name: 'CRN-1' })).closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'INV-2026-0042' }).getAttribute('href')).toBe(
      `/invoices/${INVOICE_ID}`,
    )
    expect(within(row).getByText('To be sent')).toBeTruthy()
    expect(calls('GET', '/api/v1/authored-invoices?')[0][0]).toContain('type=CREDIT_NOTE')
    expect(screen.getByRole('tab', { name: /Refund due/ })).toBeTruthy()
    expect(screen.getByText('Credited · 30 days')).toBeTruthy()
  })

  it('offers both notes on an issued invoice and lists the notes against it', async () => {
    renderAt(`/invoices/${INVOICE_ID}`)
    // The credit note is a named button; the debit note sits in the header's overflow menu.
    expect(
      await screen.findByRole('button', { name: i18n.t('invoiceDetails.actions.creditNote') }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('invoiceDetails.actions.more') }))
    expect(await screen.findByRole('menuitem', { name: 'Debit note' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'CRN-1' })).toBeTruthy()
    expect(
      calls('GET', '/api/v1/authored-invoices?').some(([url]) =>
        String(url).includes(`correction_of_invoice_id=${INVOICE_ID}`),
      ),
    ).toBe(true)
  })
})

/** The draft the server answers for a note request: what `fromNoteDraft` reads back. */
function draftOf(request: DraftRequest, type: 'CREDIT_NOTE' | 'DEBIT_NOTE'): DraftResponse {
  return {
    ...(DRAFT as unknown as DraftResponse),
    type,
    details: { ...DRAFT.details, ...request.details } as DraftResponse['details'],
    lines: request.lines.map((line) => ({
      lineNumber: line.lineNumber,
      productId: line.productId ?? null,
      productCode: line.productCode ?? null,
      description: line.description,
      unitCode: line.unitCode,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountType: line.discount.type,
      discountValue: line.discount.value,
      taxCategoryCode: line.taxCategory.code,
      en16931Category: line.taxCategory.en16931Category,
      taxRate: line.taxCategory.rate,
      exemptionReason: line.taxCategory.exemptionReason,
      exemptionReasonCode: line.taxCategory.exemptionReasonCode ?? null,
      classification: line.classification ?? null,
    })),
  }
}

describe('a reopened note draft (W-1) and lines with no product (W-3)', () => {
  it('sends back the same body it was saved with, reason code and classification included', () => {
    const start = withMode(
      { ...fromInvoice(INVOICE, 'DEBIT_NOTE'), reason: 'freightOmitted' },
      'additionalItems',
      INVOICE,
    )
    const [first] = start.lines.filter((line) => !line.fromInvoice)
    const second = addedLine(start, INVOICE, 'service')
    const form = {
      ...start,
      lines: [
        ...start.lines.filter((line) => line.lineNumber !== first.lineNumber),
        {
          ...first,
          description: 'Export packing',
          classification: '090121000000',
          unitPrice: '12.000',
          taxCategory: {
            code: 'Z0',
            en16931Category: 'Z',
            rate: 0,
            exemptionReason: null,
            exemptionReasonCode: 'VATZR-OM-10',
          },
        },
        {
          ...second,
          description: 'Consulting',
          unitCode: 'HUR',
          classification: '86000000',
          unitPrice: '40.000',
        },
      ],
    }
    const saved = toNoteRequest(form, INVOICE, 'DEBIT_NOTE')
    expect(saved.lines[0]).toMatchObject({
      taxCategory: { code: 'Z0', exemptionReasonCode: 'VATZR-OM-10' },
      classification: { goodsOrService: 'G', hsCode: '090121000000' },
    })

    const reopened = fromNoteDraft(draftOf(saved, 'DEBIT_NOTE'), INVOICE, 'DEBIT_NOTE')
    expect(toNoteRequest(reopened, INVOICE, 'DEBIT_NOTE')).toEqual(saved)
  })

  it('leaves productId and productCode out of a line added on the note', () => {
    const form = withMode(
      { ...fromInvoice(INVOICE, 'DEBIT_NOTE'), reason: 'freightOmitted' },
      'flatCharge',
      INVOICE,
    )
    const [line] = toNoteRequest(form, INVOICE, 'DEBIT_NOTE').lines
    expect(line).not.toHaveProperty('productId')
    expect(line).not.toHaveProperty('productCode')
  })
})

/** A debit note ready to save: Roasting charged 3.000 more, reason "Undercharged". */
async function readyDebitNote() {
  renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
  expect(await screen.findByText(/Only the difference is charged/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Unit price · Roasting'), { target: { value: '3' } })
  chooseReason('Undercharged')
}

const keyOf = (call: unknown[]) =>
  ((call[1] as RequestInit).headers as Record<string, string>)['Idempotency-Key']

describe('idempotency keys (W-4)', () => {
  const idle = (name: string) =>
    vi.waitFor(() =>
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(false),
    )
  const created = () => calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)
  const issued = () => calls('POST', `/api/v1/invoice-drafts/${NOTE_ID}/issue`)

  it('sends the create under a new key after the server refused it', async () => {
    let refuse = true
    override = (url, init) => {
      if (url !== `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes` || init?.method !== 'POST')
        return undefined
      if (!refuse) return undefined
      refuse = false
      return json(422, { title: 'Refused', status: 422, code: 'CORRECTED_INVOICE_NOT_ISSUED' })
    }
    await readyDebitNote()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await vi.waitFor(() => expect(created()).toHaveLength(1))
    await idle('Save draft')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    expect(created()).toHaveLength(2)
    expect(bodyOf(created()[1])).toEqual(bodyOf(created()[0]))
    expect(keyOf(created()[1])).not.toBe(keyOf(created()[0]))
  }, 30_000)

  it('replays the create under the same key after a network error', async () => {
    let fail = true
    override = (url, init) => {
      if (url !== `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes` || init?.method !== 'POST')
        return undefined
      if (!fail) return undefined
      fail = false
      throw new TypeError('Failed to fetch')
    }
    await readyDebitNote()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await vi.waitFor(() => expect(created()).toHaveLength(1))
    await idle('Save draft')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    expect(created()).toHaveLength(2)
    expect(keyOf(created()[1])).toBe(keyOf(created()[0]))
  }, 30_000)

  it('sends the issue under a new key after the server refused it', async () => {
    let version = 0
    let refuse = true
    override = (url, init) => {
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}` && init?.method === 'PUT')
        return json(200, { ...DRAFT, type: 'DEBIT_NOTE', version: ++version })
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue` && refuse) {
        refuse = false
        return json(409, { title: 'Stale', status: 409, code: 'STALE_INVOICE_VERSION' })
      }
      return undefined
    }
    await readyDebitNote()
    fireEvent.click(screen.getByRole('button', { name: 'Issue debit note' }))
    await vi.waitFor(() => expect(issued()).toHaveLength(1))
    await idle('Issue debit note')
    fireEvent.click(screen.getByRole('button', { name: 'Issue debit note' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    // The draft was saved again first (PUT), and the resend goes under a new key.
    expect(calls('PUT', `/api/v1/invoice-drafts/${NOTE_ID}`)).toHaveLength(1)
    expect(bodyOf(issued()[1]).expectedVersion).toBe(1)
    expect(keyOf(issued()[1])).not.toBe(keyOf(issued()[0]))
  }, 30_000)

  it('replays the issue under the same key after a network error, even with a new version', async () => {
    let version = 0
    let fail = true
    override = (url, init) => {
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}` && init?.method === 'PUT')
        return json(200, { ...DRAFT, type: 'DEBIT_NOTE', version: ++version })
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue` && fail) {
        fail = false
        throw new TypeError('Failed to fetch')
      }
      return undefined
    }
    await readyDebitNote()
    fireEvent.click(screen.getByRole('button', { name: 'Issue debit note' }))
    await vi.waitFor(() => expect(issued()).toHaveLength(1))
    await idle('Issue debit note')
    fireEvent.click(screen.getByRole('button', { name: 'Issue debit note' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    // The first issue may have reached the server: the retry must not be able to issue twice.
    expect(keyOf(issued()[1])).toBe(keyOf(issued()[0]))
  }, 30_000)

  it('replays the issue under the same key after a 5xx', async () => {
    let fail = true
    override = (url, init) => {
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}` && init?.method === 'PUT')
        return json(200, { ...DRAFT, type: 'DEBIT_NOTE' })
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue` && fail) {
        fail = false
        return json(503, { title: 'Unavailable', status: 503 })
      }
      return undefined
    }
    await readyDebitNote()
    fireEvent.click(screen.getByRole('button', { name: 'Issue debit note' }))
    await vi.waitFor(() => expect(issued()).toHaveLength(1))
    await idle('Issue debit note')
    fireEvent.click(screen.getByRole('button', { name: 'Issue debit note' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    expect(bodyOf(issued()[1])).toEqual(bodyOf(issued()[0]))
    expect(keyOf(issued()[1])).toBe(keyOf(issued()[0]))
  }, 30_000)
})

describe("the note detail's participant id (4.14)", () => {
  it('prints scheme:value from the record, without doubling a prefix the value already has', () => {
    expect(participantIdText({ scheme: '0248', value: 'OM1100447102' })).toBe('0248:OM1100447102')
    expect(participantIdText({ scheme: '0248', value: '0248:OM1100447102' })).toBe(
      '0248:OM1100447102',
    )
  })

  it('takes a plain string as it is, and nothing when there is no id', () => {
    expect(participantIdText('0248:OM1100447102')).toBe('0248:OM1100447102')
    expect(participantIdText(null)).toBeNull()
    expect(participantIdText({ scheme: '0248', value: '' })).toBeNull()
  })
})

describe('the debit composer', () => {
  it('names the tax category of the lines it charges (W-5)', async () => {
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    const field = () => screen.getByText('Default tax category').closest('label') as HTMLElement
    await screen.findByText(/Only the difference is charged/)
    expect(within(field()).getByText('Standard rate · 5%')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Additional items/ }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Delivery' } })
    fireEvent.click(screen.getByRole('button', { name: 'VAT (%) · Delivery' }))
    fireEvent.click(screen.getByRole('option', { name: /Zero-rated/ }))
    expect(within(field()).getByText('Zero-rated - 0%')).toBeTruthy()
  }, 30_000)

  it('offers Save draft only to someone who may save drafts (W-6)', async () => {
    entitlements = {
      ...ADMIN,
      permissions: ADMIN.permissions.filter((permission) => permission !== 'invoice.draft'),
    }
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByRole('button', { name: 'Issue debit note' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
  }, 30_000)
})

describe('attachments on the note draft (4.6)', () => {
  const file = (name: string) => new File(['x'], name, { type: 'application/pdf' })
  const drop = (container: HTMLElement, files: File[]) =>
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, {
      target: { files },
    })

  it('uploads the queued files to the saved draft, each once, and keeps the draft on a failure', async () => {
    entitlements = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.attachment.manage'] }
    let failSecond = true
    override = (url, init) => {
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}` && init?.method === 'PUT')
        return json(200, { ...DRAFT, type: 'DEBIT_NOTE', version: 1 })
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/attachments` && init?.method === 'POST') {
        const name = ((init.body as FormData).get('file') as File).name
        if (name === 'po.pdf' && failSecond) {
          failSecond = false
          return json(500, { title: 'Boom', status: 500 })
        }
        return json(201, { id: `att-${name}`, filename: name })
      }
      return undefined
    }
    const { container } = render(
      <MemoryRouter initialEntries={[`/income/debit-notes/new?invoice=${INVOICE_ID}`]}>
        <Routes>
          <Route path="/income/debit-notes/new" element={<NewDebitNotePage />} />
          <Route path="/income/debit-notes/:id" element={<p>debit note page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Only the difference is charged/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Unit price · Roasting'), { target: { value: '3' } })
    chooseReason('Undercharged')
    drop(container, [file('delivery.pdf'), file('po.pdf')])

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    const uploads = () => calls('POST', `/api/v1/authored-invoices/${NOTE_ID}/attachments`)
    await vi.waitFor(() => expect(uploads()).toHaveLength(2))
    // The draft was created, the second file failed: the page stays, with the notice.
    expect(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)).toHaveLength(1)
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save draft' }).hasAttribute('disabled')).toBe(
        false,
      ),
    )
    expect(screen.getByRole('alert').textContent).toContain('temporarily unavailable')
    expect(screen.queryByText('debit note page')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    // Saved again (PUT, no second create), and only the file that failed went up again.
    expect(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)).toHaveLength(1)
    expect(calls('PUT', `/api/v1/invoice-drafts/${NOTE_ID}`)).toHaveLength(1)
    const names = uploads().map(
      (call) => (((call[1] as RequestInit).body as FormData).get('file') as File).name,
    )
    expect(names).toEqual(['delivery.pdf', 'po.pdf', 'po.pdf'])
  }, 30_000)

  it('shows no drop zone to someone who may not attach files', async () => {
    renderAt(`/income/debit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(/Only the difference is charged/)).toBeTruthy()
    expect(screen.queryByText('Attachments')).toBeNull()
  }, 30_000)
})

const DEBIT_SUMMARY = {
  currencyCode: 'OMR',
  asOf: '2026-09-25',
  all: 13,
  drafts: 1,
  toSend: 1,
  awaiting: 2,
  overdue: 1,
  paid: 8,
  outstandingTotal: 18.375,
  outstandingInvoices: 3,
  awaitingTotal: 12.075,
  dueSoonInvoices: 0,
  dueSoonDays: 7,
  overdueTotal: 6.3,
  overdueInvoices: 1,
  oldestOverdueDueDate: '2026-09-13',
  paidTotal: 48.195,
  paidInvoices: 8,
  issuedLast30Days: { count: 2, total: 69.06 },
  issuedThisQuarter: { count: 11, total: 66.57 },
}

describe('the debit notes list figures (4.1)', () => {
  it('reads the tabs and the four figures from the summary by type, not from a wide read', async () => {
    override = (url) =>
      url.startsWith('/api/v1/authored-invoices/summary') ? json(200, DEBIT_SUMMARY) : undefined
    renderAt('/income/debit-notes')
    expect(await screen.findByText('69.060')).toBeTruthy()
    const summaries = calls('GET', '/api/v1/authored-invoices/summary')
    expect(summaries).toHaveLength(1)
    expect(summaries[0][0]).toBe('/api/v1/authored-invoices/summary?type=DEBIT_NOTE')
    expect(
      calls('GET', '/api/v1/authored-invoices?').some(([url]) => String(url).includes('size=200')),
    ).toBe(false)
    expect(screen.getByText('2 debit notes issued')).toBeTruthy()
    // The designed subtitle, from the quarter the summary answers.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /^11 debit notes · .*66\.570 charged this quarter$/.test(element.textContent ?? ''),
      ),
    ).toBeTruthy()
    expect(screen.getByText('12.075')).toBeTruthy()
    expect(screen.getByText('48.195')).toBeTruthy()
    // One overdue note, due 13 Sep, read on 25 Sep: 12 days late.
    expect(screen.getByText('1 note · 12 days late')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /All/ })).getByText('13')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Paid/ })).getByText('8')).toBeTruthy()
  })

  it('reads the list description in the subtitle when the summary has no quarter', async () => {
    const withoutQuarter: Partial<typeof DEBIT_SUMMARY> = { ...DEBIT_SUMMARY }
    delete withoutQuarter.issuedThisQuarter
    override = (url) =>
      url.startsWith('/api/v1/authored-invoices/summary') ? json(200, withoutQuarter) : undefined
    renderAt('/income/debit-notes')
    expect(await screen.findByText('69.060')).toBeTruthy()
    expect(screen.getByText(/Debit notes charge a customer more on an issued invoice/)).toBeTruthy()
    expect(screen.queryByText(/charged this quarter/)).toBeNull()
  })

  it('says the figures are unavailable when the summary fails', async () => {
    override = (url) =>
      url.startsWith('/api/v1/authored-invoices/summary')
        ? json(500, { title: 'Boom', status: 500 })
        : undefined
    renderAt('/income/debit-notes')
    expect((await screen.findAllByText('Figures unavailable')).length).toBe(4)
    expect(screen.getByText(/Debit notes charge a customer more on an issued invoice/)).toBeTruthy()
  })
})

describe('a paid debit note row (4.7)', () => {
  const row = (payment: Partial<NonNullable<InvoiceRowDto['payment']>>) =>
    ({
      id: 'd-1',
      type: 'DEBIT_NOTE',
      version: 2,
      authoringState: 'ISSUED',
      deliveryState: 'SENT_MANUALLY',
      customerId: 'c-1',
      currency: 'OMR',
      invoiceNumber: 'DBN-1',
      issueDate: '2026-09-01',
      dueDate: '2026-10-01',
      details: null,
      lines: [],
      totals: { totalAmount: 10 },
      customerName: 'Sohar Port Logistics',
      payment: {
        state: 'PAID',
        overdue: false,
        daysOverdue: null,
        paidAmount: 10,
        creditedAmount: 0,
        outstandingAmount: 0,
        ...payment,
      },
    }) as InvoiceRowDto

  it('prints the paid date when the row carries it, and "Paid" alone when it does not', () => {
    expect(
      debitPaymentOf(row({ lastPaymentDate: '2026-09-20', lastPaymentMethodCode: '30' })),
    ).toEqual({ kind: 'paid', date: '2026-09-20' })
    expect(debitPaymentOf(row({}))).toEqual({ kind: 'paid', date: null })
  })

  it('reads a note delivered over Peppol as delivered, by the same rule as the invoices list', () => {
    const peppol = { ...row({}), deliveryState: 'NOT_SUBMITTED', peppolResponse: 'AP' } as InvoiceRowDto
    const unsent = { ...row({}), deliveryState: 'NOT_SUBMITTED' } as InvoiceRowDto
    const credit = (base: InvoiceRowDto) => ({ ...base, type: 'CREDIT_NOTE' }) as InvoiceRowDto
    // Before, only a manual send counted, so a note with a Peppol response read "To be sent".
    expect(noteStatusOf('CREDIT_NOTE', credit(peppol))).toBe('applied')
    expect(noteStatusOf('CREDIT_NOTE', credit(unsent))).toBe('toSend')
    expect(noteStatusOf('DEBIT_NOTE', peppol)).toBe('paid')
    expect(noteStatusOf('DEBIT_NOTE', unsent)).toBe('toSend')
    // A rejection is not a delivery.
    const rejected = { ...unsent, peppolResponse: 'RE' } as InvoiceRowDto
    expect(noteStatusOf('CREDIT_NOTE', credit(rejected))).toBe('toSend')
    expect(noteStatusOf('DEBIT_NOTE', rejected)).toBe('toSend')
  })

  it('reads a paid or late note from its payment even before it is delivered', () => {
    const undelivered = (payment: Partial<NonNullable<InvoiceRowDto['payment']>>) =>
      ({ ...row(payment), deliveryState: 'NOT_SUBMITTED' }) as InvoiceRowDto
    expect(debitPaymentOf(undelivered({ lastPaymentDate: '2026-09-29' }))).toEqual({
      kind: 'paid',
      date: '2026-09-29',
    })
    expect(
      debitPaymentOf(
        undelivered({ state: 'UNPAID', overdue: true, daysOverdue: 4, outstandingAmount: 10 }),
      ),
    ).toEqual({ kind: 'late', date: '2026-10-01', days: 4 })
    expect(
      debitPaymentOf(undelivered({ state: 'UNPAID', outstandingAmount: 10 }), '2026-09-29'),
    ).toEqual({ kind: 'due', date: '2026-10-01', addedToInvoice: true, daysLeft: null })
  })
})

const CREDIT_SUMMARY = {
  currencyCode: 'OMR',
  asOf: '2026-09-25',
  all: 17,
  drafts: 1,
  toSend: 2,
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
  issuedLast30Days: { count: 6, total: 97.137 },
  issuedTotal: { count: 14, total: 144.831 },
  issuedThisQuarter: { count: 9, total: 118.281 },
}

describe('the credit notes list figures and tabs (4.1, 4.2, 4.3)', () => {
  const summaryReply = (body: unknown) => (url: string) =>
    url.startsWith('/api/v1/authored-invoices/summary') ? json(200, body) : undefined
  const listCalls = () => calls('GET', '/api/v1/authored-invoices?')

  it('reads the tabs, the subtitle and the figures from the summary by type, not a wide read', async () => {
    override = summaryReply(CREDIT_SUMMARY)
    renderAt('/income/credit-notes')
    expect(await screen.findByText('97.137')).toBeTruthy()
    const summaries = calls('GET', '/api/v1/authored-invoices/summary')
    expect(summaries).toHaveLength(1)
    expect(summaries[0][0]).toBe('/api/v1/authored-invoices/summary?type=CREDIT_NOTE')
    // The 200-row read is gone: the list refuses a size above 100.
    expect(listCalls().some(([url]) => String(url).includes('size=200'))).toBe(false)
    expect(listCalls()).toHaveLength(1)
    expect(screen.getByText('6 credit notes issued')).toBeTruthy()
    // Applied to invoices: every issued credit note, as no refund is recorded.
    expect(screen.getByText('144.831')).toBeTruthy()
    expect(screen.getByText('14 offset, no cash out')).toBeTruthy()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /^9 credit notes · .*118\.281 credited this quarter$/.test(element.textContent ?? ''),
      ),
    ).toBeTruthy()
    // Refund due and Refunded: no refund data, so no figure rather than a false 0, and read as
    // words, never a rial sign before "…".
    expect(screen.getAllByText('Figures unavailable')).toHaveLength(2)
    expect(screen.getAllByText('Not available yet')).toHaveLength(2)
    for (const name of ['Refund due', 'Refunded']) {
      const tile = screen.getByRole('heading', { name }).closest('article') as HTMLElement
      expect(within(tile).getByText('Not available yet')).toBeTruthy()
      expect(within(tile).queryByText('OMR')).toBeNull()
      expect(within(tile).queryByText('…')).toBeNull()
    }
    expect(within(screen.getByRole('tab', { name: /All/ })).getByText('17')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Drafts/ })).getByText('1')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /To send/ })).getByText('2')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Applied/ })).getByText('14')).toBeTruthy()
    // The refund tabs stay drawn, with no count.
    expect(screen.getByRole('tab', { name: 'Refund due' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Refunded' })).toBeTruthy()
  })

  it('asks the server for issued notes on Applied, and shows each row it answers', async () => {
    override = summaryReply(CREDIT_SUMMARY)
    renderAt('/income/credit-notes?tab=applied')
    // The only row is issued but not sent yet: it is still applied to its invoice.
    const row = (await screen.findByRole('link', { name: 'CRN-1' })).closest('tr') as HTMLElement
    expect(within(row).getByText('To be sent')).toBeTruthy()
    expect(listCalls()).toHaveLength(1)
    expect(listCalls()[0][0]).toContain('state=ISSUED')
    expect(listCalls()[0][0]).toContain('type=CREDIT_NOTE')
  })

  it('shows the refund tabs empty without asking the list', async () => {
    override = summaryReply(CREDIT_SUMMARY)
    renderAt('/income/credit-notes?tab=refundDue')
    expect(await screen.findByText('97.137')).toBeTruthy()
    expect(screen.getByText(i18n.t('salesNote.list.noResults'))).toBeTruthy()
    expect(listCalls()).toHaveLength(0)
  })

  it('says every figure is unavailable when the summary fails, and keeps the description', async () => {
    override = (url) =>
      url.startsWith('/api/v1/authored-invoices/summary')
        ? json(500, { title: 'Boom', status: 500 })
        : undefined
    renderAt('/income/credit-notes')
    expect((await screen.findAllByText('Figures unavailable')).length).toBe(4)
    expect(screen.getAllByText('Not available yet')).toHaveLength(4)
    expect(screen.getByText(/Credit notes reduce what a customer owes/)).toBeTruthy()
  })
})

describe("a credit note's document discount (W-2)", () => {
  // 20 × 1.800 = 36.000, and 5 × 9.500 less 10% = 42.750: 78.750 after line discounts.
  const discounted = (headerDiscount: InvoiceDetailDto['headerDiscount']): InvoiceDetailDto => ({
    ...INVOICE,
    headerDiscount,
    lines: [
      line(1, 'Cappuccino, Large', 20, 1.8),
      { ...line(2, 'Coffee Beans 1kg', 5, 9.5), discountValue: 10 },
    ],
  })
  const creditLineTwo = (invoice: InvoiceDetailDto) => {
    const form = withMode(
      { ...fromInvoice(invoice, 'CREDIT_NOTE'), reason: 'returnedGoods' },
      'lines',
      invoice,
    )
    return patchLine(form, 'CREDIT_NOTE', 1, { include: false })
  }

  it('copies the invoice discount as it is when the whole invoice is credited', () => {
    for (const discount of [
      { type: 'FIXED_AMOUNT' as const, value: 5 },
      { type: 'PERCENTAGE' as const, value: 10 },
    ]) {
      const invoice = discounted(discount)
      const form = { ...fromInvoice(invoice, 'CREDIT_NOTE'), reason: 'orderCancelled' }
      expect(toNoteRequest(form, invoice, 'CREDIT_NOTE').headerDiscount).toEqual(discount)
    }
    // The whole invoice, credited, is what it charged: 78.750 - 5.000 = 73.750, and 5% VAT.
    const invoice = discounted({ type: 'FIXED_AMOUNT', value: 5 })
    const form = fromInvoice(invoice, 'CREDIT_NOTE')
    expect(noteTotals(form, noteHeaderDiscount(form, invoice, 'CREDIT_NOTE'))).toMatchObject({
      net: '73.750',
      vat: '3.688',
      total: '77.438',
    })
  })

  it('sends the same percentage on some of the lines, and prices the note with it', () => {
    const invoice = discounted({ type: 'PERCENTAGE', value: 10 })
    const form = creditLineTwo(invoice)
    const header = noteHeaderDiscount(form, invoice, 'CREDIT_NOTE')
    expect(header).toEqual({ type: 'PERCENTAGE', value: 10 })
    expect(toNoteRequest(form, invoice, 'CREDIT_NOTE').headerDiscount).toEqual(header)
    // 42.750 less 10% = 38.475; VAT 1.924.
    expect(noteTotals(form, header)).toMatchObject({ net: '38.475', vat: '1.924', total: '40.399' })
  })

  it('sends a fixed discount in proportion on some of the lines, following an edited quantity', () => {
    const invoice = discounted({ type: 'FIXED_AMOUNT', value: 5 })
    const form = creditLineTwo(invoice)
    // 5.000 × 42.750 / 78.750 = 2.714285…, HALF_UP to 2.714.
    const header = noteHeaderDiscount(form, invoice, 'CREDIT_NOTE')
    expect(header).toEqual({ type: 'FIXED_AMOUNT', value: 2.714 })
    expect(toNoteRequest(form, invoice, 'CREDIT_NOTE').headerDiscount).toEqual(header)
    // What the customer was charged for the line, to within rounding: 40.036 and 2.002 VAT.
    expect(noteTotals(form, header)).toMatchObject({ net: '40.036', vat: '2.002', total: '42.038' })

    // Two of the five bags: 17.100 after the line discount, so 5.000 × 17.100 / 78.750 = 1.086.
    const fewer = patchLine(form, 'CREDIT_NOTE', 2, { quantity: '2' })
    expect(noteHeaderDiscount(fewer, invoice, 'CREDIT_NOTE')).toEqual({
      type: 'FIXED_AMOUNT',
      value: 1.086,
    })
    expect(noteTotals(fewer, noteHeaderDiscount(fewer, invoice, 'CREDIT_NOTE'))).toMatchObject({
      net: '16.014',
      total: '16.815',
    })
  })

  it('sends no document discount on a custom amount, on a debit note, or when the invoice has none', () => {
    const invoice = discounted({ type: 'FIXED_AMOUNT', value: 5 })
    const custom = withMode(fromInvoice(invoice, 'CREDIT_NOTE'), 'custom', invoice)
    expect(noteHeaderDiscount(custom, invoice, 'CREDIT_NOTE')).toEqual({
      type: 'FIXED_AMOUNT',
      value: 0,
    })
    const debit = patchLine(fromInvoice(invoice, 'DEBIT_NOTE'), 'DEBIT_NOTE', 2, {
      unitPrice: '1.000',
    })
    expect(toNoteRequest(debit, invoice, 'DEBIT_NOTE').headerDiscount).toEqual({
      type: 'FIXED_AMOUNT',
      value: 0,
    })
    const plain = fromInvoice(INVOICE, 'CREDIT_NOTE')
    expect(toNoteRequest(plain, INVOICE, 'CREDIT_NOTE').headerDiscount).toEqual({
      type: 'FIXED_AMOUNT',
      value: 0,
    })
  })
})

describe('one reason per VAT category and rate on a note (V.6)', () => {
  const zeroRated = (code: string) => ({
    code: 'Z0',
    en16931Category: 'Z',
    rate: 0,
    exemptionReason: null,
    exemptionReasonCode: code,
  })

  it('refuses two added lines at the same category and rate with different reasons', () => {
    const start = withMode(
      { ...fromInvoice(INVOICE, 'CREDIT_NOTE'), reason: 'priceCorrection' },
      'custom',
      INVOICE,
    )
    const [first] = start.lines.filter((l) => !l.fromInvoice)
    const second = addedLine(start, INVOICE, 'goods')
    const form = {
      ...start,
      lines: [
        ...start.lines.filter((l) => l.fromInvoice),
        {
          ...first,
          description: 'Export',
          unitPrice: '5.000',
          taxCategory: zeroRated('VATZR-OM-10'),
        },
        {
          ...second,
          description: 'Re-export',
          unitPrice: '5.000',
          taxCategory: zeroRated('VATZR-OM-12'),
        },
      ],
    }
    expect(noteProblems(form, 'CREDIT_NOTE')).toEqual({ lines: CATEGORY_REASON_CONFLICT })
    form.lines[form.lines.length - 1].taxCategory = zeroRated('VATZR-OM-10')
    expect(noteProblems(form, 'CREDIT_NOTE')).toEqual({})
  })

  it("reads the engine's refusal of it in the same words", () => {
    expect(NOTE_REFUSALS.TAX_CATEGORY_REASON_CONFLICT).toBe(CATEGORY_REASON_CONFLICT)
    expect(NOTE_REFUSALS.TAX_CATEGORY_METADATA_CONFLICT).toBe(CATEGORY_REASON_CONFLICT)
  })
})

describe("the note's reason detail (4.9)", () => {
  it('sends the chosen reason beside its code, and a reopened draft shows it', () => {
    const form = { ...fromInvoice(INVOICE, 'CREDIT_NOTE'), reason: 'goodwillDiscount' }
    const saved = toNoteRequest(form, INVOICE, 'CREDIT_NOTE')
    expect(saved.details).toMatchObject({
      correctionReasonCode: 'OTH',
      correctionReasonDetail: 'goodwillDiscount',
    })
    const reopened = fromNoteDraft(draftOf(saved, 'CREDIT_NOTE'), INVOICE, 'CREDIT_NOTE')
    expect(reopened.reason).toBe('goodwillDiscount')
    expect(toNoteRequest(reopened, INVOICE, 'CREDIT_NOTE')).toEqual(saved)
  })

  it('reads the first reason of the code when a note has no detail, or one that does not pair', () => {
    const draft = draftOf(
      toNoteRequest({ ...fromInvoice(INVOICE, 'DEBIT_NOTE'), reason: '' }, INVOICE, 'DEBIT_NOTE'),
      'DEBIT_NOTE',
    )
    const reasonFor = (details: Partial<DraftResponse['details']>) =>
      fromNoteDraft({ ...draft, details: { ...draft.details, ...details } }, INVOICE, 'DEBIT_NOTE')
        .reason
    expect(reasonFor({ correctionReasonCode: 'VAL', correctionReasonDetail: null })).toBe(
      'undercharged',
    )
    expect(
      reasonFor({ correctionReasonCode: 'VAL', correctionReasonDetail: 'priceEscalation' }),
    ).toBe('priceEscalation')
    // A credit key on a debit note, or a key of another code, is not this note's reason.
    expect(
      reasonFor({ correctionReasonCode: 'OTH', correctionReasonDetail: 'goodwillDiscount' }),
    ).toBe('other')
    expect(reasonFor({ correctionReasonCode: 'QTY', correctionReasonDetail: 'undercharged' })).toBe(
      'additionalDelivery',
    )
    expect(noteProblems({ ...fromInvoice(INVOICE, 'DEBIT_NOTE') }, 'DEBIT_NOTE').reason).toBe(
      'salesNote.error.reason',
    )
  })

  it('labels the list row and the detail with the detail when there is one', () => {
    expect(reasonLabelKey('CREDIT_NOTE', 'OTH', 'goodwillDiscount')).toBe(
      'salesNote.reasonOptions.goodwillDiscount',
    )
    expect(reasonLabelKey('CREDIT_NOTE', 'OTH')).toBe('salesNote.reasonOptions.other')
    expect(reasonLabelKey('CREDIT_NOTE', 'OTH', null)).toBe('salesNote.reasonOptions.other')
  })

  it('prints the stored reason on the credit notes list row', async () => {
    override = (url) => {
      if (url.startsWith('/api/v1/authored-invoices/summary')) return json(200, CREDIT_SUMMARY)
      if (!url.startsWith('/api/v1/authored-invoices?')) return undefined
      return json(200, {
        content: [
          {
            id: NOTE_ID,
            type: 'CREDIT_NOTE',
            version: 1,
            authoringState: 'ISSUED',
            deliveryState: 'SENT_MANUALLY',
            customerId: 'c-1',
            currency: 'OMR',
            invoiceNumber: 'CRN-2',
            issueDate: '2026-09-10',
            dueDate: '2026-09-10',
            details: {
              subject: null,
              purchaseOrderReference: null,
              correctionReasonCode: 'OTH',
              correctionReasonDetail: 'goodwillDiscount',
            },
            lines: [],
            totals: { totalAmount: 3 },
            customerName: 'Sohar Port Logistics',
            payment: null,
            correctionOfInvoiceId: INVOICE_ID,
            correctionOfInvoiceNumber: 'INV-2026-0042',
          },
        ],
        page: 0,
        size: 10,
        totalElements: 1,
      })
    }
    renderAt('/income/credit-notes')
    const row = (await screen.findByRole('link', { name: 'CRN-2' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Goodwill discount')).toBeTruthy()
  })
})

describe("the credit note detail's refund and applied figures (4.19)", () => {
  // A 35.910 note, as in the owner's example: the invoice owed 28.590 when it was credited.
  const issuedNote: InvoiceDetailDto = {
    ...INVOICE,
    id: NOTE_ID,
    type: 'CREDIT_NOTE',
    correctionOfInvoiceId: INVOICE_ID,
    deliveryState: 'SENT_MANUALLY',
    invoiceNumber: 'CRN-3',
    details: {
      ...INVOICE.details!,
      correctionReasonCode: 'OTH',
      correctionReasonDetail: 'goodwillDiscount',
    },
    lines: [line(1, 'Green beans', 1, 34.2)],
    totals: {
      subtotal: 34.2,
      itemLevelDiscount: 0,
      headerDiscount: 0,
      totalDiscount: 0,
      taxableAmount: 34.2,
      vatAmount: 1.71,
      totalAmount: 35.91,
      payableRoundingAmount: 0,
      outputScale: 3,
    } as InvoiceDetailDto['totals'],
  }

  const openWith = async (
    original: InvoiceReceivableDto,
    originalUnanswered = false,
    note: InvoiceDetailDto = issuedNote,
  ) => {
    receivable = original
    override = (url) => {
      if (originalUnanswered && url === `/api/v1/authored-invoices/${INVOICE_ID}`)
        return new Promise<Response>(() => {})
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, note)
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/receivable`)
        return json(404, { status: 404 })
      if (url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/`))
        return json(
          200,
          url.endsWith('/history')
            ? { entries: [], truncated: false, limit: 200 }
            : url.endsWith('/internal-note')
              ? { internalNote: null }
              : [],
        )
      return undefined
    }
    render(
      <MemoryRouter initialEntries={[`/income/credit-notes/${NOTE_ID}`]}>
        <Routes>
          <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'CRN-3' })).toBeTruthy()
  }

  it("as the invoice's only credit note, applies what was owed and refunds the rest", async () => {
    // 100.000 invoice, 71.410 paid, so 28.590 owed; this note is its only credit (35.910).
    await openWith({
      ...RECEIVABLE,
      documentTotal: 100,
      paidAmount: 71.41,
      creditedAmount: 35.91,
      outstandingAmount: 0,
    })
    await vi.waitFor(() =>
      expect(screen.getByText(/Refund due to Sohar Port Logistics/)).toBeTruthy(),
    )
    expect(screen.getAllByText('28.590').length).toBeGreaterThan(0)
    expect(screen.getAllByText('7.320').length).toBeGreaterThan(0)
    expect(screen.getByText('Settled by this credit')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Record refund/ }).length).toBe(2)
    expect(screen.queryByText('Not available yet')).toBeNull()
    expect(screen.getAllByText('Goodwill discount').length).toBeGreaterThan(0)
  }, 30_000)

  it('as the only credit note on an invoice still owed, applies the whole note', async () => {
    await openWith({
      ...RECEIVABLE,
      documentTotal: 100,
      paidAmount: 0,
      creditedAmount: 35.91,
      outstandingAmount: 64.09,
      paymentState: 'UNPAID',
    })
    // Until the invoice's receivable answers, both figures read "Not available yet".
    await vi.waitFor(() => expect(screen.queryByText('Not available yet')).toBeNull())
    expect(screen.getAllByText('35.910').length).toBeGreaterThan(2)
    expect(screen.getByText('nothing to refund', { exact: false })).toBeTruthy()
    expect(screen.queryByText(/Refund due to/)).toBeNull()
    expect(screen.queryByText('Settled by this credit')).toBeNull()
  }, 30_000)

  it('links the customer to its record page, which is the only customer route', async () => {
    await openWith({ ...RECEIVABLE, documentTotal: 100, creditedAmount: 35.91 })
    expect((await screen.findByRole('link', { name: /View customer/ })).getAttribute('href')).toBe(
      '/customers/c-1/edit',
    )
    expect(screen.getAllByText('INV-2026-0042').length).toBeGreaterThan(0)
  }, 30_000)

  it('reads delivery from the manual send only, never from a Peppol response', async () => {
    // detail.ts: the detail screens do not read peppolResponse until the API defines it.
    const unsent = { ...issuedNote, deliveryState: 'NOT_SUBMITTED', peppolResponse: 'AP' as const }
    await openWith({ ...RECEIVABLE, documentTotal: 100, creditedAmount: 35.91 }, false, unsent)
    expect(screen.getAllByText('To be sent').length).toBeGreaterThan(0)
    expect(screen.queryByText('Applied')).toBeNull()
  }, 30_000)

  it('shows a placeholder, not the raw invoice id, while the original invoice is unread', async () => {
    await openWith({ ...RECEIVABLE, documentTotal: 100, creditedAmount: 35.91 }, true)
    expect(screen.queryAllByText(INVOICE_ID)).toHaveLength(0)
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
  }, 30_000)

  it('with more than one credit note on the invoice, reads "Not available yet" for both', async () => {
    await openWith({ ...RECEIVABLE, documentTotal: 100, paidAmount: 71.41, creditedAmount: 50 })
    await vi.waitFor(() => expect(screen.getAllByText('Not available yet')).toHaveLength(3))
    expect(screen.queryByText(/Refund due to/)).toBeNull()
    expect(screen.queryByText('Settled by this credit')).toBeNull()
  }, 30_000)
})

describe('a self-billed credit note (SW3, D6)', () => {
  const SELF_BILLED: InvoiceDetailDto = {
    ...INVOICE,
    type: 'SELF_BILLED_INVOICE',
    invoiceNumber: 'SBI-2026-0001',
    details: { ...INVOICE.details!, buyerReference: 'SB-0114', contractReference: 'SBA-2025-011' },
  }
  const SB_ROUTE = `/api/v1/authored-invoices/${INVOICE_ID}/self-billed-credit-notes`
  /** A buyer who may self-bill but holds neither sales note permission. */
  const SELF_BILLER: Entitlements = {
    ...ADMIN,
    permissions: ['invoice.read', 'invoice.draft', 'invoice.issue', 'selfbilling.create'],
  }
  let original: InvoiceDetailDto
  let issueAnswer: () => Response

  beforeEach(() => {
    entitlements = SELF_BILLER
    original = SELF_BILLED
    receivable = {
      ...RECEIVABLE,
      paymentState: 'NOT_APPLICABLE',
      paidAmount: 0,
      outstandingAmount: 0,
    }
    issueAnswer = () =>
      json(200, {
        ...SELF_BILLED,
        id: NOTE_ID,
        type: 'SELF_BILLED_CREDIT_NOTE',
        invoiceNumber: 'SBC-1',
      })
    override = (url, init) => {
      const method = init?.method ?? 'GET'
      if (url === `/api/v1/authored-invoices/${INVOICE_ID}`) return json(200, original)
      if (url === SB_ROUTE && method === 'POST')
        return json(201, { ...DRAFT, type: 'SELF_BILLED_CREDIT_NOTE' })
      if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue`) return issueAnswer()
      return undefined
    }
  })

  function renderSelfBilled(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/expenditure/self-billing" element={<p>self-billing list</p>} />
          <Route
            path="/expenditure/self-billing/credit-notes/new"
            element={<NewSelfBilledCreditNotePage />}
          />
          <Route path="/expenditure/self-billing/:id" element={<p>self-bill page</p>} />
          <Route path="/income/credit-notes/:id" element={<p>credit note page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('posts to the self-billed credit note route', async () => {
    const body = toNoteRequest(fromInvoice(SELF_BILLED, 'CREDIT_NOTE'), SELF_BILLED)
    await createNote('SELF_BILLED_CREDIT_NOTE', INVOICE_ID, 'draft-key-0000000001', body)
    const sent = calls('POST', SB_ROUTE)
    expect(sent).toHaveLength(1)
    expect(bodyOf(sent[0])).toEqual(body)
    expect((sent[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'draft-key-0000000001',
    })
  })

  it('issues from the credit-note composer under selfbilling.create and opens the note in self-billing', async () => {
    renderSelfBilled(`/expenditure/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()
    // The breadcrumb and the original point back into self-billing, not the sales invoice pages.
    expect(screen.getByRole('link', { name: 'Self-billed' }).getAttribute('href')).toBe(
      '/expenditure/self-billing',
    )
    expect(screen.getAllByRole('link', { name: 'SBI-2026-0001' })[0].getAttribute('href')).toBe(
      `/expenditure/self-billing/${INVOICE_ID}`,
    )

    chooseReason('Returned goods')
    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))

    expect(await screen.findByText('self-bill page')).toBeTruthy()
    const created = calls('POST', SB_ROUTE)
    expect(created).toHaveLength(1)
    expect(bodyOf(created[0]).customerId).toBe('c-1')
    expect(bodyOf(created[0]).details.correctionReasonCode).toBe('QTY')
    expect(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes`)).toHaveLength(0)
    expect(calls('POST', `/api/v1/invoice-drafts/${NOTE_ID}/issue`)).toHaveLength(1)
  }, 30_000)

  it('names the agreement refusal at issue instead of a generic conflict', async () => {
    issueAnswer = () =>
      json(409, {
        type: 'https://fawtir.om/problems/self-billing-agreement-not-in-force',
        title: 'Conflict',
        status: 409,
        code: 'SELF_BILLING_AGREEMENT_NOT_IN_FORCE',
      })
    renderSelfBilled(`/expenditure/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()
    chooseReason('Returned goods')
    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))
    expect(
      await screen.findByText(
        'The agreement with this supplier is not in force on this date: it has not started, or it has ended.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('self-bill page')).toBeNull()
  }, 30_000)

  it('refuses an ordinary invoice as the original, before asking the server', async () => {
    original = INVOICE
    renderSelfBilled(`/expenditure/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()
    expect(
      screen.getByText(
        'Only an issued self-billed invoice can be credited here. Open the self-billed invoice and use Credit note.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Issue credit note' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('names the supplier and input VAT, and reads what is owed from the payable', async () => {
    original = {
      ...SELF_BILLED,
      payable: {
        billId: 'bill-1',
        state: 'PARTIALLY_PAID',
        totalAmount: 100,
        paidAmount: 20,
        creditedAmount: 5,
        outstandingAmount: 75,
        currency: 'OMR',
        dueDate: null,
      },
    }
    renderSelfBilled(`/expenditure/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()
    expect(screen.getByText('Reduces input VAT')).toBeTruthy()
    expect(screen.getByText('Send to supplier over Peppol')).toBeTruthy()
    expect(screen.getAllByText('Note to supplier').length).toBeGreaterThan(0)
    expect(screen.getByText('Still owed to the supplier')).toBeTruthy()
    expect(screen.queryByText('Reduces recognised revenue')).toBeNull()
    expect(screen.queryByText('Send to customer over Peppol')).toBeNull()
    // Already credited and the creditable figure come from the payable, not the receivable.
    expect(screen.getByText('5.000')).toBeTruthy()
    expect(screen.getByText('95.000')).toBeTruthy()
  }, 30_000)

  it('asks for selfbilling.create, not creditnote.create', async () => {
    entitlements = { ...ADMIN }
    renderSelfBilled(`/expenditure/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(/doesn't have access to this part of Fawtir/)).toBeTruthy()
    expect(screen.queryByText('Green beans')).toBeNull()
  })

  it('returns to the self-billing list when no invoice is named', async () => {
    renderSelfBilled('/expenditure/self-billing/credit-notes/new')
    expect(await screen.findByText('self-billing list')).toBeTruthy()
  })
})

describe("a debit note's reminders card", () => {
  const debitNote = (authoringState: string): InvoiceDetailDto => ({
    ...INVOICE,
    id: NOTE_ID,
    type: 'DEBIT_NOTE',
    correctionOfInvoiceId: INVOICE_ID,
    authoringState: authoringState as InvoiceDetailDto['authoringState'],
    deliveryState: 'SENT_MANUALLY',
    invoiceNumber: 'DBN-7',
  })

  const openWith = async (note: InvoiceDetailDto) => {
    override = (url) => {
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, note)
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/receivable`)
        return json(200, {
          ...RECEIVABLE,
          paidAmount: 0,
          outstandingAmount: 73.5,
          paymentState: 'UNPAID',
        })
      if (url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/reminders/preview`))
        return json(200, {
          invoiceId: NOTE_ID,
          invoiceNumber: 'DBN-7',
          verdict: 'NO_RUNG_TODAY',
          rung: null,
          recipient: null,
          language: null,
          subject: null,
          body: null,
        })
      if (url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/`))
        return json(
          200,
          url.endsWith('/history')
            ? { entries: [], truncated: false, limit: 200 }
            : url.endsWith('/internal-note')
              ? { internalNote: null }
              : [],
        )
      return undefined
    }
    const view = render(
      <MemoryRouter initialEntries={[`/income/debit-notes/${NOTE_ID}`]}>
        <Routes>
          <Route path="/income/debit-notes/:id" element={<DebitNoteDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'DBN-7' })).toBeTruthy()
    return view
  }
  const previews = () => calls('GET', `/api/v1/authored-invoices/${NOTE_ID}/reminders/preview`)

  it('is shown on an issued debit note, which the sweep chases', async () => {
    const view = await openWith(debitNote('ISSUED'))
    await vi.waitFor(() => expect(previews().length).toBeGreaterThan(0))
    expect(view.container.querySelector('#reminders')).not.toBeNull()
  }, 30_000)

  it('is not shown on a cancelled debit note, so no preview is asked for', async () => {
    const view = await openWith(debitNote('CANCELLED'))
    // Let the page settle, then check nothing asked the server for a reminder.
    await vi.waitFor(() =>
      expect(calls('GET', `/api/v1/authored-invoices/${NOTE_ID}/history`).length).toBeGreaterThan(
        0,
      ),
    )
    expect(view.container.querySelector('#reminders')).toBeNull()
    expect(previews()).toHaveLength(0)
  }, 30_000)
})

describe("the note's preview paper names the seller and the buyer", () => {
  const ADDRESS = {
    streetName: 'Way 3021',
    additionalStreetName: null,
    addressLine3: null,
    buildingNumber: null,
    cityName: 'Bawshar',
    postalCode: '112',
    countrySubentity: 'Muscat',
    countryCode: 'OM',
    poBox: '450',
  }

  it('prints the issued snapshot instead of "Your company"', async () => {
    const issuedNote: InvoiceDetailDto = {
      ...INVOICE,
      id: NOTE_ID,
      type: 'CREDIT_NOTE',
      correctionOfInvoiceId: INVOICE_ID,
      invoiceNumber: 'CRN-4',
      lines: [line(1, 'Green beans', 1, 10)],
      seller: {
        legalName: 'Nizwa Dates Trading LLC',
        vatin: 'OM1100000001',
        participantId: null,
        address: ADDRESS,
      },
      buyer: {
        name: 'Sohar Port Logistics SAOC',
        vatin: 'OM1100999001',
        participantId: null,
        address: { ...ADDRESS, streetName: 'Port Road', cityName: 'Sohar', poBox: null },
      },
    }
    override = (url) => {
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, issuedNote)
      if (url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/`))
        return json(
          200,
          url.endsWith('/history')
            ? { entries: [], truncated: false, limit: 200 }
            : url.endsWith('/internal-note')
              ? { internalNote: null }
              : url.endsWith('/receivable')
                ? RECEIVABLE
                : [],
        )
      return undefined
    }
    render(
      <MemoryRouter initialEntries={[`/income/credit-notes/${NOTE_ID}`]}>
        <Routes>
          <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'CRN-4' })).toBeTruthy()
    const paper = document.querySelector('[data-document-preview]') as HTMLElement
    const sheet = within(paper)
    // In the masthead and again under "From".
    expect(sheet.getAllByText('Nizwa Dates Trading LLC')).toHaveLength(2)
    expect(sheet.getAllByText('VAT OM1100000001')).toHaveLength(2)
    expect(sheet.getByText('PO Box 450')).toBeTruthy()
    expect(sheet.getByText('Way 3021')).toBeTruthy()
    expect(sheet.getByText('Sohar Port Logistics SAOC')).toBeTruthy()
    expect(sheet.getByText('Port Road')).toBeTruthy()
    expect(sheet.queryByText('Your company')).toBeNull()
  }, 30_000)
})

describe('"Back on the shelf?" on a credit note (V473)', () => {
  /** p-1 (Green beans) keeps a count; p-2 (Roasting) does not. */
  const products = (url: string) => {
    if (url === '/api/v1/products/p-1') return json(200, { id: 'p-1', keepCount: true })
    if (url === '/api/v1/products/p-2') return json(200, { id: 'p-2', keepCount: false })
    return undefined
  }

  it('asks it on a counted line only, and sends the answer on that line alone', async () => {
    override = products
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    const shelf = await screen.findByRole('switch', { name: 'Back on the shelf? · Green beans' })
    expect(screen.queryByRole('switch', { name: 'Back on the shelf? · Roasting' })).toBeNull()
    expect(shelf.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(shelf)
    expect(shelf.getAttribute('aria-checked')).toBe('true')

    chooseReason('Returned goods')
    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))
    expect(await screen.findByText('credit note page')).toBeTruthy()
    const [created] = calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes`)
    const [beans, roasting] = bodyOf(created).lines
    expect(beans).toMatchObject({ productId: 'p-1', backOnShelf: true })
    expect(roasting.productId).toBe('p-2')
    expect(roasting).not.toHaveProperty('backOnShelf')
  }, 30_000)

  it('reads keepCount from the invoice lines when they carry it, and no product (backend #808)', async () => {
    override = (url) =>
      url === `/api/v1/authored-invoices/${INVOICE_ID}`
        ? json(200, {
            ...INVOICE,
            lines: INVOICE.lines.map((entry) => ({
              ...entry,
              keepCount: entry.productId === 'p-1',
            })),
          })
        : undefined
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(
      await screen.findByRole('switch', { name: 'Back on the shelf? · Green beans' }),
    ).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Back on the shelf? · Roasting' })).toBeNull()
    expect(calls('GET', '/api/v1/products/')).toHaveLength(0)
  }, 30_000)

  it('never asks or sends it on a debit note, even for a counted product', async () => {
    override = products
    await readyDebitNote()
    expect(screen.queryByRole('switch', { name: /Back on the shelf/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    const body = bodyOf(calls('POST', `/api/v1/authored-invoices/${INVOICE_ID}/debit-notes`)[0])
    for (const sent of body.lines) expect(sent).not.toHaveProperty('backOnShelf')
    // The debit composer does not even read the products.
    expect(calls('GET', '/api/v1/products/')).toHaveLength(0)
  }, 30_000)

  it('sends it on an ordinary credit note only, never a self-billed one, and reads it back', () => {
    const counted = new Set(['p-1'])
    const form = fromInvoice(INVOICE, 'CREDIT_NOTE')
    form.lines[0].backOnShelf = true
    const credit = toNoteRequest(
      { ...form, reason: 'returnedGoods' },
      INVOICE,
      'CREDIT_NOTE',
      counted,
    )
    expect(credit.lines[0].backOnShelf).toBe(true)
    expect(credit.lines[1]).not.toHaveProperty('backOnShelf')
    const selfBilled = toNoteRequest(form, INVOICE, 'CREDIT_NOTE', counted, true)
    for (const sent of selfBilled.lines) expect(sent).not.toHaveProperty('backOnShelf')
    const debit = toNoteRequest(fromInvoice(INVOICE, 'DEBIT_NOTE'), INVOICE, 'DEBIT_NOTE', counted)
    for (const sent of debit.lines) expect(sent).not.toHaveProperty('backOnShelf')
    expect(asksBackOnShelf(form.lines[0], 'CREDIT_NOTE', counted, true)).toBe(false)

    const reopened = fromNoteDraft(
      {
        ...DRAFT,
        lines: [{ ...line(1, 'Green beans', 10, 4), backOnShelf: true }],
      } as unknown as DraftResponse,
      INVOICE,
      'CREDIT_NOTE',
    )
    expect(reopened.lines[0].backOnShelf).toBe(true)
  })

  it('words the refusal of it on another document type', () => {
    expect(NOTE_REFUSALS.BACK_ON_SHELF_ONLY_ON_CREDIT_NOTES).toBe(
      'salesNote.backOnShelf.onlyOnCreditNotes',
    )
    expect(i18n.exists('salesNote.backOnShelf.onlyOnCreditNotes', { lng: 'ar' })).toBe(true)
  })
})

describe('cancelling a refunded credit note (DA-2)', () => {
  const CANCELLER: Entitlements = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.cancel'] }
  const refundNote: InvoiceDetailDto = {
    ...INVOICE,
    id: NOTE_ID,
    type: 'CREDIT_NOTE',
    correctionOfInvoiceId: INVOICE_ID,
    invoiceNumber: 'CRN-7',
  }
  const refund = (overrides: Record<string, unknown> = {}) => ({
    id: 'r-1',
    entryType: 'REFUND',
    reversalOfPaymentId: null,
    amount: 26.25,
    currency: 'OMR',
    methodCode: 'CASH',
    paymentReference: null,
    paymentDate: '2026-10-29',
    occurredAt: '2026-10-29T08:00:00Z',
    creditNoteId: NOTE_ID,
    ...overrides,
  })

  const open = async (
    originalPayments: () => Response,
    cancel?: () => Response,
    note: object = refundNote,
  ) => {
    entitlements = CANCELLER
    override = (url, init) => {
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, note)
      if (url === `/api/v1/authored-invoices/${INVOICE_ID}/payments`) return originalPayments()
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/cancel` && init?.method === 'POST' && cancel)
        return cancel()
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/receivable`) return json(404, { status: 404 })
      if (url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/`))
        return json(
          200,
          url.endsWith('/history')
            ? { entries: [], truncated: false, limit: 200 }
            : url.endsWith('/internal-note')
              ? { internalNote: null }
              : [],
        )
      return undefined
    }
    render(
      <MemoryRouter initialEntries={[`/income/credit-notes/${NOTE_ID}`]}>
        <Routes>
          <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'CRN-7' })
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === `/api/v1/authored-invoices/${INVOICE_ID}/payments`),
      ).toBe(true),
    )
  }
  const menuItem = async (name: string) => {
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('invoiceDetails.actions.more') }))
    return screen.findByRole('menuitem', { name })
  }

  it('explains instead of cancelling once a refund is recorded against the note', async () => {
    await open(() => json(200, [refund()]))
    fireEvent.click(await menuItem('Cancel credit note'))
    expect(
      await screen.findByText('This credit note cannot be cancelled: a refund is recorded against it.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reads Refunded with nothing due once the whole note was paid back, whoever else credited', async () => {
    await open(() => json(200, [refund()]), undefined, {
      ...refundNote,
      deliveryState: 'SENT_MANUALLY',
      totals: { ...refundNote.totals, totalAmount: 26.25 },
    })
    expect((await screen.findAllByText(i18n.t('salesNote.status.refunded'))).length).toBeGreaterThan(0)
    expect(screen.queryByText(i18n.t('salesNote.detail.notAvailableYet'))).toBeNull()
  })

  it('offers Cancel when the refund was reversed, or was for another note', async () => {
    await open(() =>
      json(200, [
        refund(),
        refund({ id: 'r-2', entryType: 'REVERSAL', reversalOfPaymentId: 'r-1', creditNoteId: null }),
        refund({ id: 'r-3', creditNoteId: 'another-note' }),
      ]),
    )
    fireEvent.click(await menuItem('Cancel credit note'))
    expect(await screen.findByRole('dialog', { name: 'Cancel this credit note?' })).toBeTruthy()
  })

  it('offers no Cancel, and no hint, while the refunds cannot be read', async () => {
    await open(() => json(500, { status: 500 }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    const more = screen.queryByRole('button', { name: i18n.t('invoiceDetails.actions.more') })
    if (more) fireEvent.click(more)
    expect(screen.queryByRole('menuitem', { name: 'Cancel credit note' })).toBeNull()
    expect(screen.queryByText(/cannot be cancelled/)).toBeNull()
  })

  it.each([
    ['en', 'This credit note cannot be cancelled: a refund is recorded against it.'],
    ['ar', 'لا يمكن إلغاء هذا الإشعار الدائن: سُجّل عليه استرداد.'],
  ])('reads the server refusing a refunded note as the note’s own sentence (%s)', async (lang, sentence) => {
    await i18n.changeLanguage(lang)
    await open(
      () => json(200, []),
      () => json(409, { status: 409, code: 'INVOICE_CANCEL_HAS_PAYMENTS', detail: 'no' }),
    )
    fireEvent.click(await menuItem(i18n.t('salesNote.detail.cancelAction.CREDIT_NOTE')))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raised twice' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('salesNote.detail.cancelConfirm.CREDIT_NOTE') }))
    expect(await screen.findByText(sentence)).toBeTruthy()
  })
})

describe('a debit note with payments, and a stale payment on it (DA-2, DA-12 review)', () => {
  const STAFF: Entitlements = {
    ...ADMIN,
    permissions: [...ADMIN.permissions, 'invoice.cancel', 'invoice.payment.manage'],
  }
  const debitNote: InvoiceDetailDto = {
    ...INVOICE,
    id: NOTE_ID,
    type: 'DEBIT_NOTE',
    correctionOfInvoiceId: INVOICE_ID,
    invoiceNumber: 'DBN-4',
  }
  const owedOnNote = (paidAmount: number) => ({
    ...RECEIVABLE,
    documentTotal: 10.5,
    paidAmount,
    creditedAmount: 0,
    outstandingAmount: 10.5 - paidAmount,
    paymentState: paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
  })

  const open = async (noteReceivable: () => Response, pay?: () => Response) => {
    entitlements = STAFF
    override = (url, init) => {
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, debitNote)
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/receivable`) return noteReceivable()
      if (url === `/api/v1/authored-invoices/${NOTE_ID}/payments` && init?.method === 'POST' && pay)
        return pay()
      if (url.startsWith(`/api/v1/authored-invoices/${NOTE_ID}/`))
        return json(
          200,
          url.endsWith('/history')
            ? { entries: [], truncated: false, limit: 200 }
            : url.endsWith('/internal-note')
              ? { internalNote: null }
              : [],
        )
      return undefined
    }
    render(
      <MemoryRouter initialEntries={[`/income/debit-notes/${NOTE_ID}`]}>
        <Routes>
          <Route path="/income/debit-notes/:id" element={<SalesNoteDetailPage kind="DEBIT_NOTE" />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'DBN-4' })
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === `/api/v1/authored-invoices/${NOTE_ID}/receivable`),
      ).toBe(true),
    )
  }
  const moreMenu = async () =>
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('invoiceDetails.actions.more') }))

  it('explains instead of cancelling a debit note with a payment', async () => {
    await open(() => json(200, owedOnNote(4)))
    await moreMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel debit note' }))
    expect(
      await screen.findByText('This note cannot be cancelled: payments are recorded against it.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the confirmation for an unpaid debit note', async () => {
    await open(() => json(200, owedOnNote(0)))
    await moreMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel debit note' }))
    expect(await screen.findByRole('dialog', { name: 'Cancel this debit note?' })).toBeTruthy()
  })

  it('reads the note again when the payment dialog closes after the balance moved', async () => {
    await open(
      () => json(200, owedOnNote(0)),
      () => json(400, { status: 400, code: 'PAYMENT_EXCEEDS_OUTSTANDING', detail: 'too much' }),
    )
    fireEvent.click((await screen.findAllByRole('button', { name: 'Record payment' }))[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('invoiceDetails.pay.submit') }))
    expect(await within(dialog).findByText(i18n.t('invoiceDetails.pay.balanceChanged'))).toBeTruthy()
    const reads = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === `/api/v1/authored-invoices/${NOTE_ID}/receivable` &&
          ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET',
      ).length
    const before = reads()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.cancel') }))
    await waitFor(() => expect(reads()).toBe(before + 1))
  })
})

describe('the cumulative credit caps, as the server refuses them (DA-1 option B)', () => {
  const refuseIssue = (body: Record<string, unknown>) => {
    override = (url) =>
      url === `/api/v1/invoice-drafts/${NOTE_ID}/issue` ? json(409, { status: 409, ...body }) : undefined
  }
  const issueAFullCredit = async () => {
    renderAt(`/income/credit-notes/new?invoice=${INVOICE_ID}`)
    await screen.findAllByText('Green beans')
    chooseReason('Returned goods')
    fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))
  }

  it.each([
    [
      'CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING',
      'This credits more at one VAT rate than the invoice and its debit notes have left after the earlier credit notes. Lower the amounts, then issue again.',
    ],
    [
      'CREDIT_NOTE_VAT_CATEGORY_NOT_ON_ORIGINAL',
      "A line uses a VAT category or rate that neither the invoice nor its debit notes charged. Use one of the invoice's rates, then issue again.",
    ],
    [
      'CREDIT_NOTE_EXCEEDS_LINE_REMAINING',
      'This credits more of an invoice line than is left after the earlier credit notes. Lower the amounts, then issue again.',
    ],
  ])('says %s in plain words when the server names no figures', async (code, text) => {
    refuseIssue({ code })
    await issueAFullCredit()
    expect(await screen.findByText(text)).toBeTruthy()
  }, 30_000)

  it('names the rate and what is left before VAT and in VAT, with the rial sign', async () => {
    refuseIssue({
      code: 'CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING',
      taxCategory: 'S',
      taxRate: '5',
      remainingTaxableAmount: '12.5',
      remainingVatAmount: '0.625',
    })
    await issueAFullCredit()
    const shown = await screen.findByText(/^Only .* left to credit in the Standard category/)
    expect(shown.textContent).toContain('12.500')
    expect(shown.textContent).toContain('0.625')
    expect(shown.querySelectorAll('svg').length).toBe(2)
  }, 30_000)

  const refusalOf = (code: string, problem: Record<string, unknown>) =>
    new ApiError({ status: 409, problemType: 'resource-conflict', code, problem })

  it.each([
    [
      'en',
      'Only OMR 12.500 before VAT and OMR 0.625 VAT are left to credit in the Standard category (5%) after the earlier credit notes. Lower the amounts there, then issue again.',
    ],
    [
      'ar',
      'لم يتبقَّ للخصم في الفئة القياسية (5%) بعد الإشعارات الدائنة السابقة سوى OMR 12.500 قبل الضريبة وOMR 0.625 ضريبة. خفّض المبالغ فيها، ثم أصدره مرة أخرى.',
    ],
  ])('words what is left at a rate from the server’s own properties (%s)', (language, text) => {
    const t = i18n.getFixedT(language)
    const refusal = creditCapRefusal(
      refusalOf('CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING', {
        taxCategory: 'S',
        taxRate: '5',
        remainingTaxableAmount: '12.5',
        remainingVatAmount: '0.625',
      }),
      t,
      'OMR',
      'en',
    )!
    expect(t(refusal.key, refusal.values)).toBe(text)
  })

  it.each([
    [
      'en',
      'S',
      '5',
      "Neither the invoice nor its debit notes charged anything in the Standard category (5%), so this note cannot credit there. Use one of the invoice's rates.",
    ],
    [
      'ar',
      'S',
      '5',
      'لم تفرض الفاتورة ولا إشعاراتها المدينة شيئًا في الفئة القياسية (5%)، فلا يمكن لهذا الإشعار الخصم فيها. استخدم إحدى نسب الفاتورة.',
    ],
    [
      'en',
      'E',
      null,
      "Neither the invoice nor its debit notes charged anything in the Exempt category, so this note cannot credit there. Use one of the invoice's categories.",
    ],
    [
      'ar',
      'E',
      null,
      'لم تفرض الفاتورة ولا إشعاراتها المدينة شيئًا في الفئة المعفاة، فلا يمكن لهذا الإشعار الخصم فيها. استخدم إحدى فئات الفاتورة.',
    ],
  ])('names a category the invoice never charged (%s %s)', (language, taxCategory, taxRate, text) => {
    const t = i18n.getFixedT(language)
    const refusal = creditCapRefusal(
      refusalOf('CREDIT_NOTE_VAT_CATEGORY_NOT_ON_ORIGINAL', { taxCategory, taxRate }),
      t,
      'OMR',
      'en',
    )!
    expect(t(refusal.key, refusal.values)).toBe(text)
  })
})

describe('the caps on the issue dialog path (DA-1 option B)', () => {
  it.each([
    ['CREDIT_NOTE_EXCEEDS_LINE_REMAINING', 'salesNote.refused.lineRemaining'],
    ['CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING', 'salesNote.refused.categoryRemaining'],
    ['CREDIT_NOTE_VAT_CATEGORY_NOT_ON_ORIGINAL', 'salesNote.refused.categoryNotOnInvoice'],
  ])('reads %s as its own sentence', (code, key) => {
    expect(issueRefusalOf(new ApiError({ status: 409, problemType: 'resource-conflict', code }))).toEqual({
      field: null,
      key,
    })
  })
})

describe('the cap sentences name each category without repeating a word (DA-1 review)', () => {
  it.each([
    ['en', 'Z', '0', 'Only OMR 1.000 before VAT and OMR 0.000 VAT are left to credit in the Zero-rated category (0%) after the earlier credit notes. Lower the amounts there, then issue again.'],
    ['ar', 'Z', '0', 'لم يتبقَّ للخصم في الفئة الخاضعة للنسبة الصفرية (0%) بعد الإشعارات الدائنة السابقة سوى OMR 1.000 قبل الضريبة وOMR 0.000 ضريبة. خفّض المبالغ فيها، ثم أصدره مرة أخرى.'],
    ['en', 'O', null, 'Only OMR 1.000 before VAT and OMR 0.000 VAT are left to credit in the Out of scope category after the earlier credit notes. Lower the amounts there, then issue again.'],
    ['ar', 'O', null, 'لم يتبقَّ للخصم في فئة خارج النطاق بعد الإشعارات الدائنة السابقة سوى OMR 1.000 قبل الضريبة وOMR 0.000 ضريبة. خفّض المبالغ فيها، ثم أصدره مرة أخرى.'],
  ])('%s %s', (language, taxCategory, taxRate, text) => {
    const t = i18n.getFixedT(language)
    const refusal = creditCapRefusal(
      new ApiError({
        status: 409,
        problemType: 'resource-conflict',
        code: 'CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING',
        problem: { taxCategory, taxRate, remainingTaxableAmount: '1', remainingVatAmount: '0' },
      }),
      t,
      'OMR',
      'en',
    )!
    const sentence = t(refusal.key, refusal.values)
    expect(sentence).toBe(text)
    expect(sentence).not.toMatch(/بنسبة.*بنسبة|At Exempt|as Out of scope/)
  })
})
