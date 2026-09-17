import type { InvoiceDetailDto } from '../api/invoices/detail'
import type { DraftLineRequest, DraftRequest, DraftResponse, NoteKind } from '../api/invoices/drafts'
import { calculateInvoice, formatAtScale, projectInvoice } from './invoiceMath'

/**
 * A sales credit or debit note against an issued invoice (I-10/I-11).
 *
 * The note starts from the invoice's own lines (decision 1): every line is offered with its
 * quantity and price, and the person keeps, drops or lowers them. The server copies nothing and
 * checks nothing against the invoice except, for a credit note, the ceiling at issue — the invoice
 * total less credit notes already issued.
 */

export const REASON_CODES = ['CAN', 'VAT', 'VAL', 'QTY', 'OTH'] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export type NoteLine = {
  /** The invoice line it starts from; the key while editing. */
  lineNumber: number
  include: boolean
  productId: string
  productCode: string
  description: string
  unitCode: string
  /** As on the invoice, the most a credit note should take for the line. */
  invoiceQuantity: number
  invoiceUnitPrice: number
  quantity: string
  unitPrice: string
  discount: DraftLineRequest['discount']
  taxCategory: DraftLineRequest['taxCategory']
}

export type NoteForm = {
  reasonCode: ReasonCode | ''
  note: string
  lines: NoteLine[]
}

export type NoteProblems = Partial<Record<'reasonCode' | 'lines' | 'amounts', string>>

/**
 * The invoice's lines as the note's starting point. A credit note keeps them all ("full invoice");
 * a debit note keeps none, because it charges only what was missed.
 */
export function fromInvoice(invoice: InvoiceDetailDto, kind: NoteKind): NoteForm {
  return {
    reasonCode: '',
    note: '',
    lines: invoice.lines
      .filter((line) => line.productId && line.productCode)
      .map((line) => ({
        lineNumber: line.lineNumber,
        include: kind === 'CREDIT_NOTE',
        productId: line.productId!,
        productCode: line.productCode!,
        description: line.description,
        unitCode: line.unitCode,
        invoiceQuantity: line.quantity,
        invoiceUnitPrice: line.unitPrice,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discount: { type: line.discountType, value: line.discountValue },
        taxCategory: {
          code: line.taxCategoryCode,
          en16931Category: line.en16931Category,
          rate: line.taxRate ?? 0,
          exemptionReason: line.exemptionReason,
        },
      })),
  }
}

/**
 * A saved note draft against the invoice it corrects: the invoice's lines, with the draft's own
 * quantity and price on the lines the draft kept.
 */
export function fromNoteDraft(draft: DraftResponse, invoice: InvoiceDetailDto): NoteForm {
  const base = fromInvoice(invoice, 'CREDIT_NOTE')
  const kept = new Map(draft.lines.map((line) => [line.productId + '|' + line.description, line]))
  return {
    reasonCode: (REASON_CODES as readonly string[]).includes(draft.details.correctionReasonCode ?? '')
      ? (draft.details.correctionReasonCode as ReasonCode)
      : '',
    note: draft.details.customerVisibleNote ?? '',
    lines: base.lines.map((line) => {
      const saved = kept.get(line.productId + '|' + line.description)
      return saved
        ? { ...line, include: true, quantity: String(saved.quantity), unitPrice: String(saved.unitPrice) }
        : { ...line, include: false }
    }),
  }
}

const QUANTITY = /^\d{1,12}(\.\d{1,6})?$/
const PRICE = /^\d{1,15}(\.\d{1,6})?$/

/** Net, VAT and total of the kept lines, through the invoice engine. */
export function noteTotals(form: NoteForm): { net: string; vat: string; total: string } {
  const kept = form.lines.filter((line) => line.include)
  if (kept.length === 0) return { net: '0.000', vat: '0.000', total: '0.000' }
  const projected = projectInvoice(
    calculateInvoice(
      kept.map((line, index) => ({
        id: String(line.lineNumber),
        lineNumber: index + 1,
        quantity: QUANTITY.test(line.quantity.trim()) ? line.quantity.trim() : '0',
        unitPrice: PRICE.test(line.unitPrice.trim()) ? line.unitPrice.trim() : '0',
        vatRate: String(line.taxCategory.rate),
        discountType: line.discount.type,
        discountValue: String(line.discount.value),
      })),
      'PERCENTAGE',
      '0',
    ),
  )
  const plain = (value: bigint) => formatAtScale(value).replace(/,/g, '')
  return { net: plain(projected.taxable), vat: plain(projected.vat), total: plain(projected.total) }
}

/**
 * What the server would refuse, plus the one rule it cannot see: a credit note that credits more of
 * a line than the invoice charged. The server only checks the note's total against the invoice's.
 */
export function noteProblems(form: NoteForm, kind: NoteKind): NoteProblems {
  const problems: NoteProblems = {}
  if (!form.reasonCode) problems.reasonCode = 'salesNote.error.reason'
  const kept = form.lines.filter((line) => line.include)
  if (kept.length === 0) problems.lines = 'salesNote.error.noLines'
  const badAmount = kept.some(
    (line) =>
      !QUANTITY.test(line.quantity.trim()) ||
      Number(line.quantity) <= 0 ||
      !PRICE.test(line.unitPrice.trim()) ||
      (kind === 'CREDIT_NOTE' && (Number(line.quantity) > line.invoiceQuantity || Number(line.unitPrice) > line.invoiceUnitPrice)),
  )
  if (badAmount) problems.amounts = kind === 'CREDIT_NOTE' ? 'salesNote.error.creditAmounts' : 'salesNote.error.debitAmounts'
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
        productId: line.productId,
        productCode: line.productCode,
        description: line.description,
        unitCode: line.unitCode,
        quantity: Number(line.quantity.trim()),
        unitPrice: Number(line.unitPrice.trim()),
        discount: line.discount,
        taxCategory: line.taxCategory,
      })),
    headerDiscount: { type: 'FIXED_AMOUNT', value: 0 },
    details: {
      deliveryDate: null,
      subject: null,
      purchaseOrderReference: invoice.details?.purchaseOrderReference ?? null,
      customerVisibleNote: form.note.trim() || null,
      paymentTerms: invoice.details?.paymentTerms ?? null,
      transactionType: invoice.details?.transactionType === 'SIMPLIFIED' ? 'SIMPLIFIED' : 'FULL_TAX',
      correctionReasonCode: form.reasonCode || null,
    },
  }
}

/**
 * Where a credit note leaves the invoice (decision 2): what it will still owe, and — when the note
 * credits more than is still owed, because the invoice was paid — the refund the customer is due,
 * which Fawtir does not record yet.
 */
export function creditEffect(outstanding: number, credit: number): { after: number; refund: number } {
  const owedMinor = Math.round(outstanding * 1000)
  const creditMinor = Math.round(credit * 1000)
  return { after: Math.max(owedMinor - creditMinor, 0) / 1000, refund: Math.max(creditMinor - owedMinor, 0) / 1000 }
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
