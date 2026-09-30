import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceDetailDto, InvoiceReceivableDto } from '../../api/invoices/detail'
import { createNote, type DraftRequest, type DraftResponse } from '../../api/invoices/drafts'
import type { InvoiceRowDto } from '../../api/invoices/list'
import {
  NOTE_REFUSALS,
  addedLine,
  creditEffect,
  debitPaymentOf,
  fromInvoice,
  fromNoteDraft,
  noteHeaderDiscount,
  noteProblems,
  noteTotals,
  participantIdText,
  patchLine,
  reasonLabelKey,
  toNoteRequest,
  withMode,
} from '../../lib/salesNote'
import { CATEGORY_REASON_CONFLICT } from '../../lib/invoiceDraft'
import { NewCreditNotePage } from './NewCreditNotePage'
import { NewSelfBilledCreditNotePage } from './NewSelfBilledCreditNotePage'
import { NewDebitNotePage } from '../NewDebitNotePage'
import { CreditNotesPage } from '../CreditNotesPage'
import { DebitNotesPage } from '../DebitNotesPage'
import { InvoiceDetailsPage } from '../InvoiceDetailsPage'
import { CreditNoteDetailsPage } from '../CreditNoteDetailsPage'

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

  it('names the refund when a credit is more than is still owed', () => {
    expect(creditEffect(36.7, 10)).toEqual({ after: 26.7, refund: 0 })
    expect(creditEffect(0, 42)).toEqual({ after: 0, refund: 42 })
  })
})

describe('a credit note', () => {
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

  const openWith = async (original: InvoiceReceivableDto) => {
    receivable = original
    override = (url) => {
      if (url === `/api/v1/authored-invoices/${NOTE_ID}`) return json(200, issuedNote)
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
          <Route path="/income/self-billing" element={<p>self-billing list</p>} />
          <Route
            path="/income/self-billing/credit-notes/new"
            element={<NewSelfBilledCreditNotePage />}
          />
          <Route path="/income/self-billing/:id" element={<p>self-bill page</p>} />
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
    renderSelfBilled(`/income/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()
    // The breadcrumb and the original point back into self-billing, not the sales invoice pages.
    expect(screen.getByRole('link', { name: 'Self-billed' }).getAttribute('href')).toBe(
      '/income/self-billing',
    )
    expect(screen.getAllByRole('link', { name: 'SBI-2026-0001' })[0].getAttribute('href')).toBe(
      `/income/self-billing/${INVOICE_ID}`,
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
    renderSelfBilled(`/income/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
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
    renderSelfBilled(`/income/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText('Green beans')).toBeTruthy()
    expect(
      screen.getByText('This invoice is not issued (or was cancelled), so it cannot be corrected.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Issue credit note' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('asks for selfbilling.create, not creditnote.create', async () => {
    entitlements = { ...ADMIN }
    renderSelfBilled(`/income/self-billing/credit-notes/new?invoice=${INVOICE_ID}`)
    expect(await screen.findByText(/doesn't have access to this part of Fawtir/)).toBeTruthy()
    expect(screen.queryByText('Green beans')).toBeNull()
  })

  it('returns to the self-billing list when no invoice is named', async () => {
    renderSelfBilled('/income/self-billing/credit-notes/new')
    expect(await screen.findByText('self-billing list')).toBeTruthy()
  })
})
