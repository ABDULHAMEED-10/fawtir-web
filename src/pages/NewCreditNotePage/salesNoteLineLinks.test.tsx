import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceDetailDto, InvoiceReceivableDto } from '../../api/invoices/detail'
import type { DraftRequest, DraftResponse } from '../../api/invoices/drafts'
import { ApiError } from '../../api'
import {
  creditCapRefusal,
  fromInvoice,
  fromNoteDraft,
  originalLineRefusal,
  NOTE_REFUSALS,
  patchLine,
  readsLineLinks,
  toNoteRequest,
  withMode,
} from '../../lib/salesNote'
import { issueRefusalOf } from '../../lib/invoiceIssue'
import { NewCreditNotePage } from './NewCreditNotePage'

/*
 * Backend #834 (DA-1 Option B): a credit-note line built from an invoice line names it, so the
 * server caps the credit per original line. A server before #834 refuses the unknown field, so
 * the link goes only to a server whose invoice lines carry `originalLineNumber`.
 */

const INVOICE_ID = '11111111-1111-1111-1111-111111111111'
const NOTE_ID = '22222222-2222-2222-2222-222222222222'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'invoice.issue', 'creditnote.create', 'customer.read'],
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

/** As a server before #834 answers it: no `originalLineNumber` on any line. */
const OLD_INVOICE: InvoiceDetailDto = {
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

/** As #834 answers it: every line carries the field, null on an invoice. */
const INVOICE: InvoiceDetailDto = {
  ...OLD_INVOICE,
  lines: OLD_INVOICE.lines.map((entry) => ({ ...entry, originalLineNumber: null })),
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
let invoice: InvoiceDetailDto
let override: (url: string, init?: RequestInit) => Response | undefined
const created = () =>
  fetchMock.mock.calls
    .filter(
      ([url, init]) =>
        url === `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes` &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as DraftRequest)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  invoice = INVOICE
  override = () => undefined
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const answered = override(url, init)
    if (answered) return answered
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}`) return json(200, invoice)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/receivable`) return json(200, RECEIVABLE)
    if (url === `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes` && method === 'POST')
      return json(201, DRAFT)
    if (url === `/api/v1/invoice-drafts/${NOTE_ID}/issue`)
      return json(200, { ...INVOICE, id: NOTE_ID, type: 'CREDIT_NOTE', invoiceNumber: 'CRN-1' })
    if (url.startsWith(`/api/v1/authored-invoices/${INVOICE_ID}/`)) return json(200, [])
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

async function issueAFullCredit() {
  render(
    <MemoryRouter initialEntries={[`/income/credit-notes/new?invoice=${INVOICE_ID}`]}>
      <Routes>
        <Route path="/income/credit-notes/new" element={<NewCreditNotePage />} />
        <Route path="/income/credit-notes/:id" element={<p>credit note page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findAllByText('Green beans')
  fireEvent.click(screen.getByRole('button', { name: 'Reason' }))
  fireEvent.click(screen.getByRole('option', { name: 'Returned goods' }))
  fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }))
}

const credit = (source: InvoiceDetailDto = INVOICE) => ({
  ...fromInvoice(source, 'CREDIT_NOTE'),
  reason: 'returnedGoods',
})

describe('which credit lines name their invoice line', () => {
  it('names each invoice line of a full credit', () => {
    expect(toNoteRequest(credit(), INVOICE).lines.map((entry) => entry.originalLineNumber)).toEqual([
      1, 2,
    ])
  })

  it('names a line given back in part at the invoice price', () => {
    let form = withMode(credit(), 'lines', INVOICE)
    form = patchLine(form, 'CREDIT_NOTE', 2, { include: false })
    form = patchLine(form, 'CREDIT_NOTE', 1, { quantity: '3' })
    expect(toNoteRequest(form, INVOICE).lines).toEqual([
      expect.objectContaining({ lineNumber: 1, productId: 'p-1', quantity: 3, originalLineNumber: 1 }),
    ])
  })

  it('names nothing on a price-only line: a lower price or another discount than the invoice', () => {
    let form = withMode(credit(), 'lines', INVOICE)
    form = patchLine(form, 'CREDIT_NOTE', 1, { unitPrice: '3.500' })
    form = patchLine(form, 'CREDIT_NOTE', 2, { discountValue: '10' })
    const lines = toNoteRequest(form, INVOICE).lines
    expect(lines).toHaveLength(2)
    for (const entry of lines) expect(entry).not.toHaveProperty('originalLineNumber')
  })

  it('names nothing on a custom credit, whose lines are the note’s own', () => {
    const form = withMode(credit(), 'custom', INVOICE)
    const lines = toNoteRequest(form, INVOICE).lines
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toHaveProperty('originalLineNumber')
  })

  it('names nothing on a debit note', () => {
    let form = { ...fromInvoice(INVOICE, 'DEBIT_NOTE'), reason: 'undercharged' }
    form = patchLine(form, 'DEBIT_NOTE', 2, { unitPrice: '3.000' })
    const lines = toNoteRequest(form, INVOICE, 'DEBIT_NOTE').lines
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toHaveProperty('originalLineNumber')
  })

  it('names nothing on a debit note line kept at the invoice price (D-26)', () => {
    const base = { ...fromInvoice(INVOICE, 'DEBIT_NOTE'), reason: 'undercharged' }
    const form = { ...base, lines: base.lines.map((entry) => ({ ...entry, include: true })) }
    const lines = toNoteRequest(form, INVOICE, 'DEBIT_NOTE').lines
    expect(lines).toHaveLength(2)
    for (const entry of lines) expect(entry).not.toHaveProperty('originalLineNumber')
  })

  it('names nothing on a line of the note’s own, even one numbered as an invoice line', () => {
    const base = credit()
    const form = {
      ...base,
      lines: base.lines.map((entry) =>
        entry.lineNumber === 1 ? { ...entry, fromInvoice: false } : entry,
      ),
    }
    expect(toNoteRequest(form, INVOICE).lines.map((entry) => entry.originalLineNumber)).toEqual([
      undefined,
      2,
    ])
  })

  it('names nothing on a line whose discount is of another type than the invoice line’s', () => {
    const base = credit()
    const form = {
      ...base,
      lines: base.lines.map((entry) =>
        entry.lineNumber === 1 ? { ...entry, discountType: 'FIXED_AMOUNT' as const } : entry,
      ),
    }
    expect(toNoteRequest(form, INVOICE).lines.map((entry) => entry.originalLineNumber)).toEqual([
      undefined,
      2,
    ])
  })

  const discounted = (headerDiscount: InvoiceDetailDto['headerDiscount']): InvoiceDetailDto => ({
    ...INVOICE,
    headerDiscount,
    lines: [
      { ...line(1, 'Green beans', 1, 10000), originalLineNumber: null },
      { ...line(2, 'Roasting', 1, 10000), originalLineNumber: null },
      { ...line(3, 'Sacks', 1, 40000), originalLineNumber: null },
    ],
  })

  it('still names some lines under a fixed invoice discount: the server places the rounded share (B1)', () => {
    const source = discounted({ type: 'FIXED_AMOUNT', value: 4 })
    let form = withMode(credit(source), 'lines', source)
    form = patchLine(form, 'CREDIT_NOTE', 3, { include: false })
    const request = toNoteRequest(form, source)
    // The share rounds down to 1.333 of an exact 1.3333..: the case the per-line cap refused before
    // backend 523173707. The link stays; it is never dropped to get past the cap (A-02).
    expect(request.headerDiscount).toEqual({ type: 'FIXED_AMOUNT', value: 1.333 })
    expect(request.lines.map((entry) => entry.originalLineNumber)).toEqual([1, 2])
    // The whole invoice carries the invoice's own discount, and its lines are named too.
    expect(toNoteRequest(credit(source), source).lines.map((entry) => entry.originalLineNumber)).toEqual([
      1, 2, 3,
    ])
  })

  it('still names some lines under a percentage invoice discount, the same share on every line', () => {
    const source = discounted({ type: 'PERCENTAGE', value: 10 })
    let form = withMode(credit(source), 'lines', source)
    form = patchLine(form, 'CREDIT_NOTE', 3, { include: false })
    expect(toNoteRequest(form, source).lines.map((entry) => entry.originalLineNumber)).toEqual([1, 2])
  })

  it('names the invoice lines a custom note still carries (a reopened mixed draft)', () => {
    const form = { ...credit(), mode: 'custom' as const }
    expect(toNoteRequest(form, INVOICE).lines.map((entry) => entry.originalLineNumber)).toEqual([
      1, 2,
    ])
    // Under an invoice discount too: a custom note carries none, so the line cap is what stops it
    // crediting a line above what that line was charged.
    const source = discounted({ type: 'FIXED_AMOUNT', value: 4 })
    const discountedForm = { ...credit(source), mode: 'custom' as const }
    expect(
      toNoteRequest(discountedForm, source).lines.map((entry) => entry.originalLineNumber),
    ).toEqual([1, 2, 3])
  })

  it('sends no link at all to a server before #834, which would refuse the body', () => {
    expect(readsLineLinks(OLD_INVOICE)).toBe(false)
    expect(readsLineLinks(INVOICE)).toBe(true)
    for (const entry of toNoteRequest(credit(OLD_INVOICE), OLD_INVOICE).lines)
      expect(entry).not.toHaveProperty('originalLineNumber')
  })

  // Deploy-order rule: the web may reach a backend without #834 first, which refuses the key itself.
  it('leaves the key out of the whole request, in every mode, for an invoice read without line links', () => {
    let lines = withMode(credit(OLD_INVOICE), 'lines', OLD_INVOICE)
    lines = patchLine(lines, 'CREDIT_NOTE', 1, { quantity: '3' })
    for (const form of [credit(OLD_INVOICE), lines, { ...credit(OLD_INVOICE), mode: 'custom' as const }])
      expect(JSON.stringify(toNoteRequest(form, OLD_INVOICE))).not.toContain('originalLineNumber')
  })
})

describe('a reopened draft whose lines name their invoice lines', () => {
  const TWIN: InvoiceDetailDto = {
    ...INVOICE,
    lines: [
      { ...line(1, 'Green beans', 10, 4), productId: 'p-1', originalLineNumber: null },
      { ...line(2, 'Green beans', 4, 4), productId: 'p-1', originalLineNumber: null },
    ],
  }

  const draftOf = (request: DraftRequest): DraftResponse => ({
    ...(DRAFT as unknown as DraftResponse),
    lines: request.lines.map((entry) => ({
      lineNumber: entry.lineNumber,
      productId: entry.productId ?? null,
      productCode: entry.productCode ?? null,
      description: entry.description,
      unitCode: entry.unitCode,
      quantity: entry.quantity,
      unitPrice: entry.unitPrice,
      discountType: entry.discount.type,
      discountValue: entry.discount.value,
      taxCategoryCode: entry.taxCategory.code,
      en16931Category: entry.taxCategory.en16931Category,
      taxRate: entry.taxCategory.rate,
      exemptionReason: entry.taxCategory.exemptionReason,
      exemptionReasonCode: entry.taxCategory.exemptionReasonCode ?? null,
      classification: entry.classification ?? null,
      originalLineNumber: entry.originalLineNumber ?? null,
    })),
  })

  it('goes back to the line it names, so twin lines are not both credited on the next save', () => {
    let form = withMode(credit(TWIN), 'lines', TWIN)
    form = patchLine(form, 'CREDIT_NOTE', 1, { include: false })
    const saved = toNoteRequest(form, TWIN)
    expect(saved.lines).toEqual([expect.objectContaining({ quantity: 4, originalLineNumber: 2 })])

    const reopened = fromNoteDraft(draftOf(saved), TWIN, 'CREDIT_NOTE')
    expect(reopened.lines.map((entry) => entry.include)).toEqual([false, true])
    expect(toNoteRequest(reopened, TWIN).lines).toEqual(saved.lines)
  })

  it('keeps a linked line that does not read as its invoice line as a line of the note’s own', () => {
    const request = toNoteRequest(credit(), INVOICE)
    const priceFix = {
      ...request.lines[0],
      productId: undefined,
      productCode: undefined,
      description: 'Price correction, line 1',
    }
    const reopened = fromNoteDraft(
      draftOf({ ...request, lines: [priceFix] }),
      INVOICE,
      'CREDIT_NOTE',
    )
    expect(reopened.lines.filter((entry) => entry.include && entry.fromInvoice)).toHaveLength(0)
    expect(reopened.lines.filter((entry) => !entry.fromInvoice).map((entry) => entry.description)).toEqual([
      'Price correction, line 1',
    ])
  })
})

describe('the composer against #834', () => {
  it('sends the invoice line numbers of a full credit', async () => {
    await issueAFullCredit()
    expect(await screen.findByText('credit note page')).toBeTruthy()
    expect(created()).toHaveLength(1)
    expect(created()[0].lines.map((entry) => entry.originalLineNumber)).toEqual([1, 2])
  }, 30_000)

  it('sends none to a server before #834', async () => {
    invoice = OLD_INVOICE
    await issueAFullCredit()
    expect(await screen.findByText('credit note page')).toBeTruthy()
    expect(created()).toHaveLength(1)
    for (const entry of created()[0].lines) expect(entry).not.toHaveProperty('originalLineNumber')
  }, 30_000)

  it('says what the line has left when the server refuses the credit per line (409)', async () => {
    override = (url) =>
      url === `/api/v1/invoice-drafts/${NOTE_ID}/issue`
        ? json(409, {
            status: 409,
            code: 'CREDIT_NOTE_EXCEEDS_LINE_REMAINING',
            originalLineNumber: 1,
            remainingTaxableAmount: '12.000',
            remainingQuantity: '3',
          })
        : undefined
    await issueAFullCredit()
    const shown = await screen.findByText(/^Line 1 of the invoice has only/)
    expect(shown.textContent).toContain('12.000')
    expect(shown.textContent).toContain('a quantity of 3')
    expect(shown.querySelectorAll('svg').length).toBe(1)
  }, 30_000)

  it('says the invoice has no such line when the server refuses the link (400)', async () => {
    override = (url, init) =>
      url === `/api/v1/authored-invoices/${INVOICE_ID}/credit-notes` && init?.method === 'POST'
        ? json(400, {
            status: 400,
            code: 'ORIGINAL_LINE_NOT_FOUND',
            line: 2,
            originalLineNumber: 7,
          })
        : undefined
    await issueAFullCredit()
    expect(
      await screen.findByText(
        'This note points to line 7 of the invoice, which the invoice does not have. Start the note again from the invoice.',
      ),
    ).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/issue'))).toBe(false)
  }, 30_000)
})

describe('the per-line refusal sentences, in English and Arabic', () => {
  const refusal = (code: string, problem: Record<string, unknown>, status = 409) =>
    new ApiError({ status, problemType: code.toLowerCase(), code, problem })

  it.each([
    [
      'en',
      '3',
      'Line 1 of the invoice has only OMR 12.000 before VAT and a quantity of 3 left to credit after the earlier credit notes. Lower the amounts on that line, then issue again.',
    ],
    [
      'ar',
      '3',
      'لم يتبقَّ للخصم من البند 1 في الفاتورة بعد الإشعارات الدائنة السابقة سوى OMR 12.000 قبل الضريبة وكمية 3. خفّض المبالغ في هذا البند، ثم أصدره مرة أخرى.',
    ],
    [
      'en',
      null,
      'Line 1 of the invoice has only OMR 12.000 before VAT left to credit after the earlier credit notes. Lower the amounts on that line, then issue again.',
    ],
    [
      'ar',
      null,
      'لم يتبقَّ للخصم من البند 1 في الفاتورة بعد الإشعارات الدائنة السابقة سوى OMR 12.000 قبل الضريبة. خفّض المبالغ في هذا البند، ثم أصدره مرة أخرى.',
    ],
  ])('names what line 1 has left (%s, quantity %s)', (language, remainingQuantity, text) => {
    const t = i18n.getFixedT(language)
    const named = creditCapRefusal(
      refusal('CREDIT_NOTE_EXCEEDS_LINE_REMAINING', {
        originalLineNumber: 1,
        remainingTaxableAmount: '12',
        remainingQuantity,
      }),
      t,
      'OMR',
      'en',
    )!
    expect(t(named.key, named.values)).toBe(text)
  })

  it.each([
    [
      'en',
      'Nothing is left to credit on line 1 of the invoice after the earlier credit notes. Remove that line, then issue again.',
    ],
    [
      'ar',
      'لم يتبقَّ شيء للخصم من البند 1 في الفاتورة بعد الإشعارات الدائنة السابقة. احذف هذا البند، ثم أصدره مرة أخرى.',
    ],
  ])('says a spent line has nothing left rather than "only 0.000" (%s)', (language, text) => {
    const t = i18n.getFixedT(language)
    const named = creditCapRefusal(
      refusal('CREDIT_NOTE_EXCEEDS_LINE_REMAINING', {
        originalLineNumber: 1,
        remainingTaxableAmount: '0.000',
        remainingQuantity: '0',
      }),
      t,
      'OMR',
      'en',
    )!
    expect(t(named.key, named.values)).toBe(text)
  })

  it('prints the remaining quantity as the server wrote it', () => {
    const named = creditCapRefusal(
      refusal('CREDIT_NOTE_EXCEEDS_LINE_REMAINING', {
        originalLineNumber: 1,
        remainingTaxableAmount: '0.001',
        remainingQuantity: '0.0000001',
      }),
      i18n.t,
      'OMR',
      'en',
    )!
    expect(named.values?.quantity).toBe('0.0000001')
  })

  it('falls back to the plain sentence when the server names no figures', () => {
    expect(creditCapRefusal(refusal('CREDIT_NOTE_EXCEEDS_LINE_REMAINING', {}), i18n.t, 'OMR', 'en')).toEqual({
      key: 'salesNote.refused.lineRemaining',
    })
  })

  it.each([
    [
      'en',
      'This note points to line 7 of the invoice, which the invoice does not have. Start the note again from the invoice.',
    ],
    [
      'ar',
      'يشير هذا الإشعار إلى البند 7 في الفاتورة، وهو بند لا تحتويه الفاتورة. ابدأ الإشعار من جديد من الفاتورة.',
    ],
  ])('names the missing invoice line (%s)', (language, text) => {
    const t = i18n.getFixedT(language)
    const named = originalLineRefusal(
      refusal('ORIGINAL_LINE_NOT_FOUND', { line: 2, originalLineNumber: 7 }, 400),
    )!
    expect(t(named.key, named.values)).toBe(text)
  })

  it.each(['en', 'ar'])('words ORIGINAL_LINE_ONLY_ON_CORRECTIONS (%s)', (language) => {
    const key = NOTE_REFUSALS.ORIGINAL_LINE_ONLY_ON_CORRECTIONS
    expect(key).toBe('salesNote.refused.originalLineOnlyOnCorrections')
    expect(i18n.getFixedT(language)(key)).not.toBe(key)
  })

  it('reads ORIGINAL_LINE_NOT_FOUND at issue from the note’s own page as its plain sentence', () => {
    expect(issueRefusalOf(refusal('ORIGINAL_LINE_NOT_FOUND', {}, 400))).toEqual({
      field: null,
      key: 'salesNote.refused.originalLineNotFound',
    })
    expect(i18n.getFixedT('ar')('salesNote.refused.originalLineNotFound')).not.toBe(
      'salesNote.refused.originalLineNotFound',
    )
  })
})
