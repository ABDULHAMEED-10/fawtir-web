import type { InvoiceDetailDto } from '../api/invoices/detail'
import type {
  DraftLineRequest,
  DraftRequest,
  DraftResponse,
  NoteKind,
} from '../api/invoices/drafts'
import type { InvoiceListPayment, InvoiceRowDto } from '../api/invoices/list'
import type { SelectOption } from '../components/ui/Select'
import { calculateInvoice, formatAtScale, projectInvoice } from './invoiceMath'
import { dueDateFor, issueProblems, muscatToday } from './invoiceIssue'

/**
 * A sales credit or debit note against an issued invoice (I-10/I-11), as the Income designs draw
 * it: a note is built one of three ways (the whole invoice, some of its lines, or a free amount),
 * against the invoice's own lines, and issued from the page with its dates on it.
 *
 * The server copies nothing and checks nothing against the invoice except, for a credit note, the
 * ceiling at issue — the invoice total less credit notes already issued.
 */

export const REASON_CODES = ['CAN', 'VAT', 'VAL', 'QTY', 'OTH'] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export type NoteLineKind = 'goods' | 'service'
export type CreditMode = 'full' | 'lines' | 'custom'
export type DebitMode = 'correctLines' | 'additionalItems' | 'flatCharge'
export type NoteMode = CreditMode | DebitMode

/** The three ways each note can be built, in the order the design's option cards show them. */
export const NOTE_MODES: Record<NoteKind, NoteMode[]> = {
  CREDIT_NOTE: ['full', 'lines', 'custom'],
  DEBIT_NOTE: ['correctLines', 'additionalItems', 'flatCharge'],
}

/** The UN/ECE Rec 20 units each kind of line can be measured in; the toggle narrows the list. */
export const UNITS_BY_KIND: Record<NoteLineKind, SelectOption[]> = {
  goods: [
    { value: 'EA', label: 'EA', hint: 'Each' },
    { value: 'KGM', label: 'KG', hint: 'Kilogram' },
    { value: 'LTR', label: 'L', hint: 'Litre' },
    { value: 'BG', label: 'BG', hint: 'Bag' },
    { value: 'BX', label: 'BX', hint: 'Box' },
    { value: 'SA', label: 'SA', hint: 'Sack' },
    { value: 'PK', label: 'PK', hint: 'Pack' },
    { value: 'MTR', label: 'M', hint: 'Metre' },
  ],
  service: [
    { value: 'EA', label: 'EA', hint: 'Each' },
    { value: 'HUR', label: 'HR', hint: 'Hour' },
    { value: 'DAY', label: 'DAY', hint: 'Day' },
  ],
}

export function kindOfUnit(unitCode: string): NoteLineKind {
  return unitCode === 'HUR' || unitCode === 'DAY' ? 'service' : 'goods'
}

export type NoteLine = {
  /** The key while editing: the invoice line it starts from, or a number above them for an added line. */
  lineNumber: number
  include: boolean
  /** From the invoice, so it has a ceiling and an "on the invoice" caption; false for a line added on the note. */
  fromInvoice: boolean
  productId: string | null
  productCode: string | null
  description: string
  kind: NoteLineKind
  unitCode: string
  /** As on the invoice, the most a credit note should take for the line. Null on an added line. */
  invoiceQuantity: number | null
  invoiceUnitPrice: number | null
  quantity: string
  /** Excluding VAT, three decimals, never negative. */
  unitPrice: string
  discountType: DraftLineRequest['discount']['type']
  discountValue: string
  taxCategory: DraftLineRequest['taxCategory']
}

export type NoteForm = {
  mode: NoteMode
  reasonCode: ReasonCode | ''
  /** The design's "Reference / RMA". */
  reference: string
  note: string
  issueDate: string
  /** A credit note is not collected: its due date is sent as the issue date. */
  dueDate: string
  /** Drawn as the design shows it; delivery is not in the API yet (B4). */
  sendPeppol: boolean
  lines: NoteLine[]
}

export type NoteProblems = Partial<
  Record<'reasonCode' | 'lines' | 'amounts' | 'descriptions' | 'issueDate' | 'dueDate', string>
>

const FIRST_ADDED_LINE = 1000

function money3(value: number | string): string {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(3) : '0.000'
}

function invoiceLine(
  line: InvoiceDetailDto['lines'][number],
  include: boolean,
  unitPrice: string,
): NoteLine {
  return {
    lineNumber: line.lineNumber,
    include,
    fromInvoice: true,
    productId: line.productId,
    productCode: line.productCode,
    description: line.description,
    kind: kindOfUnit(line.unitCode),
    unitCode: line.unitCode,
    invoiceQuantity: line.quantity,
    invoiceUnitPrice: line.unitPrice,
    quantity: String(line.quantity),
    unitPrice,
    discountType: line.discountType,
    discountValue: String(line.discountValue),
    taxCategory: {
      code: line.taxCategoryCode,
      en16931Category: line.en16931Category,
      rate: line.taxRate ?? 0,
      exemptionReason: line.exemptionReason,
    },
  }
}

/** A line added on the note itself: free text, priced from nothing, taxed like the invoice's first line. */
export function addedLine(
  form: NoteForm,
  invoice: InvoiceDetailDto,
  kind: NoteLineKind = 'goods',
): NoteLine {
  const first = invoice.lines[0]
  const next = Math.max(FIRST_ADDED_LINE - 1, ...form.lines.map((line) => line.lineNumber)) + 1
  return {
    lineNumber: next,
    include: true,
    fromInvoice: false,
    productId: null,
    productCode: null,
    description: '',
    kind,
    unitCode: 'EA',
    invoiceQuantity: null,
    invoiceUnitPrice: null,
    quantity: '1',
    unitPrice: '0.000',
    discountType: 'PERCENTAGE',
    discountValue: '0',
    taxCategory: first
      ? {
          code: first.taxCategoryCode,
          en16931Category: first.en16931Category,
          rate: first.taxRate ?? 0,
          exemptionReason: first.exemptionReason,
        }
      : { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
  }
}

/**
 * The invoice's lines as the note's starting point. A credit note keeps them all ("full invoice");
 * a debit note keeps none, because it charges only what was missed — and only the difference, so
 * its lines start at a price of nothing.
 */
export function fromInvoice(
  invoice: InvoiceDetailDto,
  kind: NoteKind,
  today = muscatToday(),
): NoteForm {
  const credit = kind === 'CREDIT_NOTE'
  return {
    mode: credit ? 'full' : 'correctLines',
    reasonCode: '',
    reference: '',
    note: '',
    issueDate: today,
    dueDate: credit ? today : dueDateFor(today, invoice.details?.paymentTerms?.code),
    sendPeppol: true,
    lines: invoice.lines.map((line) =>
      invoiceLine(line, credit, credit ? String(line.unitPrice) : '0.000'),
    ),
  }
}

/**
 * A saved note draft against the invoice it corrects: the invoice's lines with the draft's own
 * quantity and price on the ones it kept, plus any line the draft added of its own.
 */
export function fromNoteDraft(
  draft: DraftResponse,
  invoice: InvoiceDetailDto,
  kind?: NoteKind,
  today = muscatToday(),
): NoteForm {
  const noteKind: NoteKind = kind ?? (draft.type === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'CREDIT_NOTE')
  const base = fromInvoice(invoice, noteKind, today)
  const keyOf = (productId: string | null, description: string) =>
    `${productId ?? ''}|${description}`
  const kept = new Map(
    draft.lines.map((line) => [keyOf(line.productId || null, line.description), line]),
  )
  const matched = new Set<string>()
  const lines: NoteLine[] = base.lines.map((line) => {
    const key = keyOf(line.productId, line.description)
    const saved = kept.get(key)
    if (!saved) return { ...line, include: false }
    matched.add(key)
    return {
      ...line,
      include: true,
      quantity: String(saved.quantity),
      unitPrice: money3(saved.unitPrice),
      unitCode: saved.unitCode,
      kind: kindOfUnit(saved.unitCode),
      discountType: saved.discountType,
      discountValue: String(saved.discountValue),
    }
  })
  let form: NoteForm = { ...base, lines }
  for (const line of draft.lines) {
    if (matched.has(keyOf(line.productId || null, line.description))) continue
    const added = addedLine(form, invoice, kindOfUnit(line.unitCode))
    form = {
      ...form,
      lines: [
        ...form.lines,
        {
          ...added,
          description: line.description,
          unitCode: line.unitCode,
          quantity: String(line.quantity),
          unitPrice: money3(line.unitPrice),
          discountType: line.discountType,
          discountValue: String(line.discountValue),
          taxCategory: {
            code: line.taxCategoryCode,
            en16931Category: line.en16931Category,
            rate: line.taxRate,
            exemptionReason: line.exemptionReason,
          },
        },
      ],
    }
  }
  const fromInvoiceKept = form.lines.filter((line) => line.fromInvoice && line.include)
  const added = form.lines.filter((line) => !line.fromInvoice)
  const whole =
    added.length === 0 &&
    fromInvoiceKept.length === form.lines.length &&
    fromInvoiceKept.every(
      (line) =>
        Number(line.quantity) === line.invoiceQuantity &&
        Number(line.unitPrice) === line.invoiceUnitPrice,
    )
  const mode: NoteMode =
    noteKind === 'CREDIT_NOTE'
      ? added.length > 0
        ? 'custom'
        : whole
          ? 'full'
          : 'lines'
      : added.length > 0
        ? fromInvoiceKept.length === 0 && added.length === 1
          ? 'flatCharge'
          : 'additionalItems'
        : 'correctLines'
  return {
    ...form,
    mode,
    reasonCode: (REASON_CODES as readonly string[]).includes(
      draft.details.correctionReasonCode ?? '',
    )
      ? (draft.details.correctionReasonCode as ReasonCode)
      : '',
    reference: draft.details.subject ?? '',
    note: draft.details.customerVisibleNote ?? '',
  }
}

/**
 * Switching between the three ways to build the note. The whole invoice ticks every line at its
 * invoiced figures; the line pickers keep what was ticked; a free amount or added items hide the
 * invoice's lines and work on lines of the note's own.
 */
export function withMode(form: NoteForm, mode: NoteMode, invoice: InvoiceDetailDto): NoteForm {
  const invoiceLines = form.lines.filter((line) => line.fromInvoice)
  const added = form.lines.filter((line) => !line.fromInvoice)
  switch (mode) {
    case 'full':
      return {
        ...form,
        mode,
        lines: invoiceLines.map((line) => ({
          ...line,
          include: true,
          quantity: String(line.invoiceQuantity),
          unitPrice: money3(line.invoiceUnitPrice ?? 0),
        })),
      }
    case 'lines':
    case 'correctLines':
      return { ...form, mode, lines: invoiceLines }
    case 'custom':
    case 'flatCharge': {
      const base = {
        ...form,
        mode,
        lines: invoiceLines.map((line) => ({ ...line, include: false })),
      }
      const keep = added[0] ? { ...added[0], include: true } : addedLine(base, invoice, 'service')
      return { ...base, lines: [...base.lines, keep] }
    }
    case 'additionalItems': {
      const base = {
        ...form,
        mode,
        lines: invoiceLines.map((line) => ({ ...line, include: false })),
      }
      const keep =
        added.length > 0
          ? added.map((line) => ({ ...line, include: true }))
          : [addedLine(base, invoice)]
      return { ...base, lines: [...base.lines, ...keep] }
    }
  }
}

/** Whether the mode works on lines of the note's own rather than the invoice's. */
export function ownLines(mode: NoteMode): boolean {
  return mode === 'custom' || mode === 'flatCharge' || mode === 'additionalItems'
}

/** The lines the table shows for the form's mode: the invoice's, or the note's own. */
export function visibleLines(form: NoteForm): NoteLine[] {
  const own = ownLines(form.mode)
  return form.lines.filter((line) => line.fromInvoice !== own)
}

const QUANTITY = /^\d{1,12}(\.\d{1,6})?$/
const PRICE = /^\d{1,15}(\.\d{1,6})?$/

export type NoteTotals = {
  net: string
  vat: string
  total: string
  /** Each kept line's amount after its discount, excluding VAT, by line number. */
  lines: Map<number, string>
  /** The one VAT rate on the note, or null when its lines mix rates. */
  rate: number | null
}

/** Net, VAT and total of the kept lines, through the invoice engine. */
export function noteTotals(form: NoteForm): NoteTotals {
  const kept = form.lines.filter((line) => line.include)
  const rates = new Set(kept.map((line) => line.taxCategory.rate))
  const rate = rates.size === 1 ? [...rates][0] : null
  if (kept.length === 0)
    return { net: '0.000', vat: '0.000', total: '0.000', lines: new Map(), rate }
  const projected = projectInvoice(
    calculateInvoice(
      kept.map((line, index) => ({
        id: String(line.lineNumber),
        lineNumber: index + 1,
        quantity: QUANTITY.test(line.quantity.trim()) ? line.quantity.trim() : '0',
        unitPrice: PRICE.test(line.unitPrice.trim()) ? line.unitPrice.trim() : '0',
        vatRate: String(line.taxCategory.rate),
        discountType: line.discountType,
        discountValue: QUANTITY.test(line.discountValue.trim()) ? line.discountValue.trim() : '0',
      })),
      'PERCENTAGE',
      '0',
    ),
  )
  const plain = (value: bigint) => formatAtScale(value).replace(/,/g, '')
  const lines = new Map<number, string>()
  kept.forEach((line, index) =>
    lines.set(line.lineNumber, plain(projected.lines[index]?.afterLineDiscount ?? 0n)),
  )
  return {
    net: plain(projected.taxable),
    vat: plain(projected.vat),
    total: plain(projected.total),
    lines,
    rate,
  }
}

/**
 * What the server would refuse, plus the rules it cannot see: a credit note that credits more of
 * a line than the invoice charged, and the dates it will be issued with.
 */
export function noteProblems(form: NoteForm, kind: NoteKind, today = muscatToday()): NoteProblems {
  const problems: NoteProblems = {}
  if (!form.reasonCode) problems.reasonCode = 'salesNote.error.reason'
  const kept = form.lines.filter((line) => line.include)
  if (kept.length === 0) problems.lines = 'salesNote.error.noLines'
  const badAmount = kept.some(
    (line) =>
      !QUANTITY.test(line.quantity.trim()) ||
      Number(line.quantity) <= 0 ||
      !PRICE.test(line.unitPrice.trim()) ||
      (kind === 'CREDIT_NOTE' &&
        line.fromInvoice &&
        (Number(line.quantity) > (line.invoiceQuantity ?? Infinity) ||
          Number(line.unitPrice) > (line.invoiceUnitPrice ?? Infinity))),
  )
  if (badAmount)
    problems.amounts =
      kind === 'CREDIT_NOTE' ? 'salesNote.error.creditAmounts' : 'salesNote.error.debitAmounts'
  if (kept.some((line) => line.description.trim() === ''))
    problems.descriptions = 'salesNote.error.description'
  const dates = issueProblems(
    { issueDate: form.issueDate, dueDate: kind === 'CREDIT_NOTE' ? form.issueDate : form.dueDate },
    today,
  )
  if (dates.issueDate) problems.issueDate = dates.issueDate
  if (dates.dueDate && kind === 'DEBIT_NOTE') problems.dueDate = dates.dueDate
  return problems
}

/** The note's request: the invoice's party, branch, currency and terms, with the kept lines. */
export function toNoteRequest(form: NoteForm, invoice: InvoiceDetailDto): DraftRequest {
  return {
    customerId: invoice.customerId,
    branchId: invoice.branchId,
    currency: invoice.currency,
    vatMode: 'EXCLUSIVE',
    lines: form.lines
      .filter((line) => line.include)
      .map((line, index) => ({
        lineNumber: index + 1,
        // TODO(backend): a line added on the note has no catalogue product (client rule: free-text
        // description, no product code). The draft line still requires productId/productCode, so
        // they go empty until the API accepts product-less lines.
        productId: line.productId ?? '',
        productCode: line.productCode ?? '',
        description: line.description.trim(),
        unitCode: line.unitCode,
        quantity: Number(line.quantity.trim()),
        unitPrice: Number(line.unitPrice.trim()),
        discount: { type: line.discountType, value: Number(line.discountValue.trim()) || 0 },
        taxCategory: line.taxCategory,
      })),
    headerDiscount: { type: 'FIXED_AMOUNT', value: 0 },
    details: {
      deliveryDate: null,
      // TODO(backend): a reference field of its own on the draft (`buyerReference` exists on the
      // read side); until then the design's "Reference / RMA" travels as the subject.
      subject: form.reference.trim() || null,
      purchaseOrderReference: invoice.details?.purchaseOrderReference ?? null,
      customerVisibleNote: form.note.trim() || null,
      paymentTerms: invoice.details?.paymentTerms ?? null,
      transactionType:
        invoice.details?.transactionType === 'SIMPLIFIED' ? 'SIMPLIFIED' : 'FULL_TAX',
      correctionReasonCode: form.reasonCode || null,
    },
  }
}

/**
 * Where a credit note leaves the invoice (decision 2): what it will still owe, and — when the note
 * credits more than is still owed, because the invoice was paid — the refund the customer is due,
 * which Fawtir does not record yet.
 */
export function creditEffect(
  outstanding: number,
  credit: number,
): { after: number; refund: number } {
  const owedMinor = Math.round(outstanding * 1000)
  const creditMinor = Math.round(credit * 1000)
  return {
    after: Math.max(owedMinor - creditMinor, 0) / 1000,
    refund: Math.max(creditMinor - owedMinor, 0) / 1000,
  }
}

export const NOTE_ROUTES: Record<NoteKind, string> = {
  CREDIT_NOTE: '/income/credit-notes',
  DEBIT_NOTE: '/income/debit-notes',
}

/** Note refusals a person can act on, in the page's words. */
export const NOTE_REFUSALS: Record<string, string> = {
  CORRECTED_INVOICE_NOT_ISSUED: 'salesNote.refused.invoiceNotIssued',
  CORRECTION_REASON_CODE_INVALID: 'salesNote.error.reason',
  CORRECTION_REASON_CODE_REQUIRED: 'salesNote.error.reason',
  CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT: 'salesNote.refused.exceeds',
  CREDIT_NOTE_NOTHING_CORRECTABLE: 'salesNote.refused.nothingLeft',
  CREDIT_NOTE_REFERENCE_REQUIRED: 'salesNote.refused.invoiceNotIssued',
  DEBIT_NOTE_REFERENCE_REQUIRED: 'salesNote.refused.invoiceNotIssued',
}

/* ---------------------------------------------------------------------------------------------
 * The lists (Credit notes / Debit notes), as the designs draw them: a status per row, tabs with
 * counts, and four figures on top. The list API answers with authoring state, delivery state and
 * — for a debit note, a receivable — payment; it records no refunds, so a credit note's refund
 * states are derived as far as the data allows and marked where it cannot.
 * ------------------------------------------------------------------------------------------- */

export type NoteListStatus =
  | 'draft'
  | 'toSend'
  | 'refundDue'
  | 'applied'
  | 'refunded'
  | 'awaiting'
  | 'overdue'
  | 'paid'
  | 'cancelled'

export function noteStatusOf(kind: NoteKind, row: InvoiceRowDto): NoteListStatus {
  if (row.authoringState === 'DRAFT') return 'draft'
  if (row.authoringState !== 'ISSUED') return 'cancelled'
  if (row.deliveryState !== 'SENT_MANUALLY') return 'toSend'
  if (kind === 'CREDIT_NOTE') {
    // TODO(backend): a credit note's refund state (refund due / refunded) — the API records no
    // refunds, so a delivered credit note can only be shown as applied to its invoice.
    return 'applied'
  }
  const payment = row.payment
  if (!payment || payment.state === 'NOT_APPLICABLE') return 'awaiting'
  if (payment.overdue) return 'overdue'
  if (payment.state === 'PAID') return 'paid'
  return 'awaiting'
}

export type NoteTab = {
  id: string
  state: string | null
  payment: InvoiceListPayment | null
  /** Narrowed on the client where the API has no filter for it; null takes every row it answers. */
  only: NoteListStatus[] | null
  danger?: boolean
}

export const NOTE_TABS: Record<NoteKind, NoteTab[]> = {
  CREDIT_NOTE: [
    { id: 'all', state: 'DRAFT,ISSUED,CANCELLED', payment: null, only: null },
    { id: 'drafts', state: 'DRAFT', payment: null, only: null },
    { id: 'toSend', state: 'ISSUED', payment: null, only: ['toSend'] },
    { id: 'refundDue', state: 'ISSUED', payment: null, only: ['refundDue'] },
    { id: 'applied', state: 'ISSUED', payment: null, only: ['applied'] },
    { id: 'refunded', state: 'ISSUED', payment: null, only: ['refunded'] },
  ],
  DEBIT_NOTE: [
    { id: 'all', state: 'DRAFT,ISSUED,CANCELLED', payment: null, only: null },
    { id: 'drafts', state: 'DRAFT', payment: null, only: null },
    { id: 'toSend', state: 'ISSUED', payment: null, only: ['toSend'] },
    { id: 'awaiting', state: null, payment: 'AWAITING', only: null },
    { id: 'overdue', state: null, payment: 'OVERDUE', only: null, danger: true },
    { id: 'paid', state: null, payment: 'PAID', only: null },
  ],
}

export function noteMatchesTab(kind: NoteKind, row: InvoiceRowDto, tab: NoteTab): boolean {
  return tab.only === null || tab.only.includes(noteStatusOf(kind, row))
}

export type NoteFigure = { amount: number; count: number; days?: number }

export type NoteSummary = {
  counts: Record<string, number>
  /** Issued this quarter: the subtitle under the title. */
  quarter: NoteFigure
  cards: Record<string, NoteFigure>
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * The tab counts and the four figures on top, read off the notes the list can show. The list API
 * has no summary by document type, so these come from a wide read of the notes themselves.
 * TODO(backend): `GET /v1/authored-invoices/summary?type=CREDIT_NOTE|DEBIT_NOTE`.
 */
export function summariseNotes(
  kind: NoteKind,
  rows: readonly InvoiceRowDto[],
  today = muscatToday(),
): NoteSummary {
  const statuses = rows.map((row) => ({ row, status: noteStatusOf(kind, row) }))
  const counts: Record<string, number> = {}
  for (const tab of NOTE_TABS[kind]) {
    counts[tab.id] = statuses.filter(({ row, status }) => {
      if (tab.id === 'all') return row.authoringState !== 'DISCARDED'
      if (tab.id === 'drafts') return status === 'draft'
      if (tab.only) return tab.only.includes(status)
      return status === tab.id
    }).length
  }
  const amountOf = (row: InvoiceRowDto) => row.totals?.totalAmount ?? 0
  const figure = (
    list: { row: InvoiceRowDto }[],
    amount: (row: InvoiceRowDto) => number = amountOf,
  ): NoteFigure => ({
    amount: Math.round(list.reduce((sum, { row }) => sum + amount(row), 0) * 1000) / 1000,
    count: list.length,
  })
  const issued = statuses.filter(({ row }) => row.authoringState === 'ISSUED' && row.issueDate)
  const quarterMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1
  const quarterStart = `${today.slice(0, 4)}-${String(quarterMonth).padStart(2, '0')}-01`
  const quarter = figure(issued.filter(({ row }) => row.issueDate! >= quarterStart))
  const last30 = figure(issued.filter(({ row }) => daysBetween(row.issueDate!, today) <= 30))
  if (kind === 'CREDIT_NOTE') {
    return {
      counts,
      quarter,
      cards: {
        credited: last30,
        refundDue: figure(statuses.filter(({ status }) => status === 'refundDue')),
        applied: figure(statuses.filter(({ status }) => status === 'applied')),
        refunded: figure(statuses.filter(({ status }) => status === 'refunded')),
      },
    }
  }
  const overdue = statuses.filter(({ status }) => status === 'overdue')
  return {
    counts,
    quarter,
    cards: {
      charged: last30,
      awaiting: figure(
        statuses.filter(({ status }) => status === 'awaiting' || status === 'toSend'),
        (row) => row.payment?.outstandingAmount ?? amountOf(row),
      ),
      collected: figure(
        statuses.filter(({ status }) => status === 'paid'),
        (row) => row.payment?.paidAmount ?? amountOf(row),
      ),
      overdue: {
        ...figure(overdue, (row) => row.payment?.outstandingAmount ?? amountOf(row)),
        days: Math.max(0, ...overdue.map(({ row }) => row.payment?.daysOverdue ?? 0)),
      },
    },
  }
}

/** The design's "Refund" column on a credit note row. */
export type CreditRefundCell =
  | { kind: 'applied' }
  | { kind: 'refundDue'; amount: number }
  | { kind: 'refunded'; amount: number; on: string | null }
  | null

export function creditRefundOf(row: InvoiceRowDto): CreditRefundCell {
  const status = noteStatusOf('CREDIT_NOTE', row)
  if (status === 'applied' || status === 'toSend') return { kind: 'applied' }
  // TODO(backend): refund amount and date per credit note; the API records no refunds.
  if (status === 'refundDue') return { kind: 'refundDue', amount: row.totals?.totalAmount ?? 0 }
  if (status === 'refunded')
    return { kind: 'refunded', amount: row.totals?.totalAmount ?? 0, on: null }
  return null
}

/** The design's "Payment" column on a debit note row. */
export type DebitPaymentCell =
  | { kind: 'due'; date: string; addedToInvoice: boolean; daysLeft: number | null }
  | { kind: 'late'; date: string; days: number }
  | { kind: 'paid'; date: string | null }
  | null

export function debitPaymentOf(row: InvoiceRowDto, today = muscatToday()): DebitPaymentCell {
  const status = noteStatusOf('DEBIT_NOTE', row)
  if (status === 'draft' || status === 'cancelled') return null
  // TODO(backend): the paid date and method per row; the list carries only the payment state.
  if (status === 'paid') return { kind: 'paid', date: null }
  if (!row.dueDate) return null
  if (status === 'overdue') {
    return {
      kind: 'late',
      date: row.dueDate,
      days: row.payment?.daysOverdue ?? daysBetween(row.dueDate, today),
    }
  }
  return {
    kind: 'due',
    date: row.dueDate,
    addedToInvoice: status === 'toSend',
    daysLeft: status === 'awaiting' ? daysBetween(today, row.dueDate) : null,
  }
}
