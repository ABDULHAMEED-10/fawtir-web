import type {
  ConfirmIntakeDto,
  IntakeCorrectionsDto,
  IntakeDto,
} from '../api/expenditure/billIntake'
import type { ReferenceDataDto, TaxCategoryDto } from '../api/reference/referenceData'
import { calculateInvoice, formatAtScale, projectInvoice } from './invoiceMath'
import { DESIGN_REFERENCE, omanTaxCategories } from './invoiceDraft'

/**
 * The bill form behind Upload a bill, Record a bill and Scan receipts (E-10).
 *
 * Nothing here pretends the file was read: a PDF or photo arrives with every field empty and the
 * person types the bill beside it (decision 1). Only a UBL XML file carries values, and those
 * fill the fields as plain starting text, with no "read" or "unsure" marking.
 */

export type BillLine = {
  id: string
  description: string
  quantity: string
  unitPrice: string
  vatRate: string
  /**
   * The line's VAT category (S5, Z0, E0, O0): the rate above follows it. Optional because Record a
   * bill builds its lines from the order table, which carries the rate only.
   */
  taxCategoryCode?: string
  /** The unit chosen on the row (UN/ECE Rec 20), where the form offers one. */
  unit?: string
}

/**
 * The VAT categories a bill line may take: the platform's list narrowed to Oman's four
 * (PINT-OM CL-04-OM), else the design's own S/Z/E/O while the list is loading or empty. A bill
 * typed by hand is not sent over Peppol, so no exemption reason or HS code goes with it.
 */
export function billTaxCategories(reference: ReferenceDataDto | null): TaxCategoryDto[] {
  const oman = omanTaxCategories(reference?.taxCategories ?? [])
  return oman.length > 0 ? oman : DESIGN_REFERENCE.taxCategories
}

/**
 * The category a supplier's bills and orders start on: its own default when Oman allows it, else
 * standard rate. Reverse charge (AE) and export (G) are not OMTaxCat codes, so a supplier
 * default of either falls back to S5 rather than reaching a line.
 */
export function supplierTaxCategory(
  reference: ReferenceDataDto | null,
  code: string | null | undefined,
): TaxCategoryDto {
  const allowed = billTaxCategories(reference)
  return (
    allowed.find((row) => row.code === (code ?? 'S5')) ??
    allowed.find((row) => row.code === 'S5') ??
    allowed[0]
  )
}

/** The rate a category puts on a line, as the form types it ("5", "0"). */
export function rateOfCategory(categories: readonly TaxCategoryDto[], code: string): string {
  const found = categories.find((row) => row.code === code)
  return found ? String(Number(found.rate)) : code === 'S5' ? '5' : '0'
}

/**
 * The category a rate read from a file stands for when the file names none: 0% is zero-rated and
 * anything else Oman's standard rate. Exempt and out of scope cannot be told from a rate.
 */
export function categoryOfRate(rate: number | string | null | undefined): string {
  return rate !== null && rate !== undefined && rate !== '' && Number(rate) === 0 ? 'Z0' : 'S5'
}

export type BillForm = {
  /** A supplier record, when one is chosen. */
  supplierId: string | null
  /** The chosen record's name, or the name as written on the bill when there is no record. */
  supplierName: string
  billNumber: string
  issueDate: string
  dueDate: string
  currency: string
  lines: BillLine[]
  vat: string
  total: string
  /** An open order of the chosen supplier, matched by hand; empty lets the matcher look. */
  purchaseOrderId: string
}

export type BillField =
  | 'supplier'
  | 'billNumber'
  | 'issueDate'
  | 'dueDate'
  | 'currency'
  | 'vat'
  | 'total'
  | 'lines'

export type BillProblems = Partial<Record<BillField, string>>

export const CURRENCIES = ['OMR', 'USD', 'EUR', 'AED', 'SAR'] as const

let lineSeed = 0
export function blankLine(): BillLine {
  lineSeed += 1
  return {
    id: `line-${lineSeed}`,
    description: '',
    quantity: '1',
    unitPrice: '',
    vatRate: '5',
    taxCategoryCode: 'S5',
  }
}

export function blankBillForm(): BillForm {
  return {
    supplierId: null,
    supplierName: '',
    billNumber: '',
    issueDate: '',
    dueDate: '',
    currency: 'OMR',
    lines: [],
    vat: '',
    total: '',
    purchaseOrderId: '',
  }
}

const text = (value: string | null | undefined) => (value ?? '').trim()
const amount = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value)
/** Money as the form shows it: three decimals, so a saved 30.6 comes back as 30.600. */
const money3 = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : value.toFixed(3)

const DESIGN_CODES = new Set(DESIGN_REFERENCE.taxCategories.map((row) => row.code))

/**
 * What an XML bill carried, or what a person saved on the intake earlier, as starting values. A
 * fresh PDF or photo has nothing, so the form stays blank.
 */
export function fromIntake(intake: IntakeDto, base: BillForm = blankBillForm()): BillForm {
  const read = intake.extracted
  if (!read) return base
  return {
    ...base,
    supplierName: base.supplierId
      ? base.supplierName
      : text(read.supplierName) || base.supplierName,
    billNumber: text(read.billNumber) || base.billNumber,
    issueDate: read.issueDate ?? base.issueDate,
    dueDate: read.dueDate ?? base.dueDate,
    currency: read.currency ?? base.currency,
    vat: money3(read.vat) || base.vat,
    total: money3(read.total) || base.total,
    lines:
      read.lines.length > 0
        ? read.lines.map((line) => {
            // A category the file or an earlier save named wins; else 5% is S5 and 0% Z0.
            const code =
              line.taxCategoryCode && DESIGN_CODES.has(line.taxCategoryCode)
                ? line.taxCategoryCode
                : categoryOfRate(line.vatRate ?? 0)
            return {
              ...blankLine(),
              description: text(line.description),
              quantity: amount(line.quantity) || '1',
              unitPrice: money3(line.unitPrice),
              vatRate: rateOfCategory(DESIGN_REFERENCE.taxCategories, code),
              taxCategoryCode: code,
            }
          })
        : base.lines,
  }
}

/**
 * Whether a person saved details on this intake earlier: the server marks every field a
 * correction carried, so a saved-and-resumed PDF has marks where a fresh one has none. An XML
 * bill's marks are the extractor's, told apart by its status.
 */
export function savedDetails(intake: IntakeDto): boolean {
  const read = intake.extracted
  if (!read || intake.extractionStatus === 'EXTRACTED') return false
  return Object.values(read.confidence).some(Boolean) || read.lines.length > 0
}

/** Plain `123.450` for the API; the engine's own string groups thousands for display. */
const plain = (value: bigint) => formatAtScale(value).replace(/,/g, '')

/**
 * The lines' net, VAT and total through the invoice engine, so a bill's arithmetic is the same
 * audited arithmetic as an invoice's. Null when there are no lines to add up.
 */
export function linesTotals(
  lines: BillLine[],
): { net: string; vat: string; total: string; lineNets: string[] } | null {
  if (lines.length === 0) return null
  const projected = projectInvoice(
    calculateInvoice(
      lines.map((line, index) => ({
        id: line.id,
        lineNumber: index + 1,
        quantity: line.quantity.trim() || '0',
        unitPrice: line.unitPrice.trim() || '0',
        vatRate: line.vatRate.trim() || '0',
        discountType: 'PERCENTAGE' as const,
        discountValue: '0',
      })),
      'PERCENTAGE',
      '0',
    ),
  )
  return {
    net: plain(projected.taxable),
    vat: plain(projected.vat),
    total: plain(projected.total),
    lineNets: projected.lines.map((line) => plain(line.taxable)),
  }
}

const MONEY = /^\d{1,15}(\.\d{1,3})?$/
const QUANTITY = /^\d{1,12}(\.\d{1,6})?$/
const RATE = /^\d{1,3}(\.\d{1,2})?$/

/** Whether the typed total differs from what the lines add up to. */
export function totalDisagrees(form: BillForm): boolean {
  const totals = linesTotals(form.lines)
  if (!totals || !MONEY.test(form.total.trim())) return false
  return Number(totals.total) !== Number(form.total.trim())
}

/**
 * What the server would refuse, said before sending. `needsNumber` is the bill pages' rule: a
 * supplier's bill always carries a number, and the duplicate check needs it. A receipt may not.
 */
export function billProblems(
  form: BillForm,
  { needsNumber, partial = false }: { needsNumber: boolean; partial?: boolean },
): BillProblems {
  const problems: BillProblems = {}
  // A bill kept for later may be half typed; what it may not be is malformed, because the server
  // would refuse the figures and the person would only find out on coming back.
  if (!partial && !form.supplierId && !form.supplierName.trim())
    problems.supplier = 'billIntake.error.supplier'
  if (!partial && needsNumber && !form.billNumber.trim())
    problems.billNumber = 'validation.required'
  if (!partial && !form.issueDate) problems.issueDate = 'validation.required'
  if (form.issueDate && form.dueDate && form.dueDate < form.issueDate)
    problems.dueDate = 'billIntake.error.dueBeforeIssue'
  if (!partial && !form.currency) problems.currency = 'validation.required'
  const total = form.total.trim()
  if (!total && !partial) problems.total = 'validation.required'
  else if (total && !MONEY.test(total)) problems.total = 'billIntake.error.amount'
  const vat = form.vat.trim()
  if (vat && !MONEY.test(vat)) problems.vat = 'billIntake.error.amount'
  else if (vat && MONEY.test(total) && Number(vat) > Number(total))
    problems.vat = 'billIntake.error.vatOverTotal'
  const badLine = form.lines.some(
    (line) =>
      (!partial && !line.description.trim()) ||
      !QUANTITY.test(line.quantity.trim()) ||
      Number(line.quantity) <= 0 ||
      !MONEY.test(line.unitPrice.trim()) ||
      !RATE.test(line.vatRate.trim()) ||
      Number(line.vatRate) > 100,
  )
  if (badLine) problems.lines = 'billIntake.error.lines'
  return problems
}

export type ConfirmExtras = {
  category?: string | null
  paidOnTheSpot?: ConfirmIntakeDto['paidOnTheSpot']
  notDuplicateOf?: string | null
  /**
   * Defaults to a bill. A caller confirming a supplier's credit or debit note states it, because
   * the same intake takes all three and the type is what decides which way the money points.
   */
  documentTypeCode?: ConfirmIntakeDto['documentTypeCode']
  /**
   * The whole document's VAT category, for a receipt typed without lines (its 5% / 0% / Exempt
   * chips): sent only when given.
   */
  taxCategoryCode?: string | null
  /** The note typed on a receipt, kept on the bill: sent only when something was typed. */
  note?: string | null
}

export function toConfirmation(form: BillForm, extras: ConfirmExtras = {}): ConfirmIntakeDto {
  const totals = linesTotals(form.lines)
  const orNull = (value: string) => (value.trim() ? value.trim() : null)
  return {
    supplierId: form.supplierId,
    supplierName: orNull(form.supplierName),
    documentTypeCode: extras.documentTypeCode ?? '380',
    billNumber: orNull(form.billNumber),
    issueDate: form.issueDate,
    dueDate: form.dueDate || null,
    currency: form.currency,
    vat: form.vat.trim() ? Number(form.vat.trim()) : null,
    total: Number(form.total.trim()),
    lines: form.lines.map((line, index) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity.trim()),
      // TODO(backend): EXPENDITURE.md 7.11. The unit is sent; the server may still ignore it.
      unit: line.unit?.trim() ? line.unit.trim() : null,
      unitPrice: Number(line.unitPrice.trim()),
      vatRate: Number(line.vatRate.trim()),
      // TODO(backend): EXPENDITURE.md M.1. The line's category (S5, Z0, E0, O0) beside its rate.
      taxCategoryCode: line.taxCategoryCode ?? null,
      lineNet: Number(totals!.lineNets[index]),
    })),
    purchaseOrderId: form.purchaseOrderId || null,
    goodsReceiptId: null,
    purchaseOrderReference: null,
    category: extras.category ?? null,
    paidOnTheSpot: extras.paidOnTheSpot ?? null,
    notDuplicateOf: extras.notDuplicateOf ?? null,
    // TODO(backend): EXPENDITURE.md M.2. A receipt's category: 0% zero-rated and exempt apart.
    ...(extras.taxCategoryCode ? { taxCategoryCode: extras.taxCategoryCode } : {}),
    ...(extras.note?.trim() ? { note: extras.note.trim() } : {}),
  }
}

/**
 * The form as corrections on the intake (`PUT`): whatever is typed, well-formed figures as numbers
 * and the rest null. Called after `billProblems(…, { partial: true })`, which is what keeps the
 * line arithmetic below off malformed input. The lines' nets come through the same engine as a
 * confirmation's.
 */
export function toCorrections(
  form: BillForm,
  supplierVatNumber: string | null,
): IntakeCorrectionsDto {
  const totals = linesTotals(form.lines)
  const orNull = (value: string) => (value.trim() ? value.trim() : null)
  const money = (value: string) => (MONEY.test(value.trim()) ? Number(value.trim()) : null)
  return {
    supplierName: orNull(form.supplierName),
    supplierVatNumber,
    billNumber: orNull(form.billNumber),
    issueDate: form.issueDate || null,
    dueDate: form.dueDate || null,
    currency: form.currency || null,
    net: totals ? Number(totals.net) : null,
    vat: money(form.vat),
    total: money(form.total),
    lines: form.lines.map((line, index) => ({
      description: orNull(line.description),
      quantity: QUANTITY.test(line.quantity.trim()) ? Number(line.quantity.trim()) : null,
      unitPrice: money(line.unitPrice),
      vatRate: RATE.test(line.vatRate.trim()) ? Number(line.vatRate.trim()) : null,
      taxCategoryCode: line.taxCategoryCode ?? null,
      amount: totals ? Number(totals.lineNets[index]) : null,
    })),
  }
}

/** The confirm refusals a person can fix on the form, by the field they belong to. */
export const CONFIRM_REFUSALS: Record<string, { field: BillField | null; key: string }> = {
  BILL_INTAKE_SUPPLIER_REQUIRED: { field: 'supplier', key: 'billIntake.error.supplier' },
  BILL_INTAKE_SUPPLIER_UNKNOWN: { field: 'supplier', key: 'billIntake.error.supplierUnknown' },
  BILL_INTAKE_ISSUE_DATE_REQUIRED: { field: 'issueDate', key: 'validation.required' },
  BILL_INTAKE_TOTAL_INVALID: { field: 'total', key: 'billIntake.error.amount' },
  BILL_INTAKE_VAT_INVALID: { field: 'vat', key: 'billIntake.error.amount' },
  BILL_INTAKE_CURRENCY_REQUIRED: { field: 'currency', key: 'validation.required' },
  BILL_INTAKE_ALREADY_CONFIRMED: { field: null, key: 'billIntake.error.alreadyConfirmed' },
  BILL_INTAKE_NOT_FOUND: { field: null, key: 'billIntake.error.intakeGone' },
}

/**
 * What a bill's capture screens (Upload a bill, Record a bill, Scan receipts) add to
 * {@link CONFIRM_REFUSALS}, in the owner's approved wording. Kept off the shared map because each sentence says "bill", and a supplier's credit or
 * debit note is captured through the same confirm route.
 *
 * Keyed on the code alone: `PURCHASE_ORDER_NOT_FOUND` answers 404, the rest 400. None belongs to
 * one input of the form, so each reads in the page's notice, where the general refusal read.
 */
export const BILL_CONFIRM_REFUSALS: Record<string, { field: BillField | null; key: string }> = {
  ...CONFIRM_REFUSALS,
  BILL_INTAKE_PAYMENT_AMOUNT_INVALID: { field: null, key: 'billIntake.refused.paidTotalZero' },
  BILL_INTAKE_PAYMENT_METHOD_REQUIRED: {
    field: null,
    key: 'billIntake.refused.paymentMethodRequired',
  },
  PURCHASE_ORDER_NOT_FOUND: { field: null, key: 'billIntake.refused.purchaseOrderGone' },
  BILL_TAX_CATEGORY_INVALID: { field: null, key: 'billIntake.refused.vatCategoryInvalid' },
  BILL_TAX_CATEGORY_RATE_MISMATCH: { field: null, key: 'billIntake.refused.vatRateMismatch' },
  SUPPLIER_SWITCHED_OFF: { field: null, key: 'billIntake.refused.supplierSwitchedOff' },
  // Only Scan receipts sends petty cash or a note today; the codes belong to the confirm route,
  // so all three screens read them.
  BILL_INTAKE_PETTY_CASH_NOT_CASH: { field: null, key: 'billIntake.refused.pettyCashNotCash' },
  BILL_NOTE_TOO_LONG: { field: null, key: 'billIntake.refused.noteTooLong' },
}

/** Why an upload was refused, by the server's code. */
export const UPLOAD_REFUSALS: Record<string, string> = {
  BILL_INTAKE_TOO_LARGE: 'billIntake.upload.tooLarge',
  BILL_INTAKE_TYPE_UNSUPPORTED: 'billIntake.upload.wrongType',
  BILL_INTAKE_EMPTY: 'billIntake.upload.empty',
  // The pickers always send a file, so this shows only if a request reaches the server without
  // one.
  BILL_INTAKE_FILE_REQUIRED: 'billIntake.upload.fileRequired',
}

/** The picker's `accept`, and what the server takes. */
export const BILL_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.xml'
export const RECEIPT_FILE_TYPES = '.jpg,.jpeg,.png,.pdf'

export type FileKind = 'pdf' | 'image' | 'xml'

export function fileKindOf(file: { type: string; name: string }): FileKind {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  // The declared type first, the name only when there is none: a stored file comes back with
  // the type the server recorded, and an SVG ("image/svg+xml") is a picture, not an e-invoice.
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  if (type.includes('xml')) return 'xml'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.xml')) return 'xml'
  return 'image'
}

/** Stored as the English name the rest of the module already uses; shown through `billIntake.category.*`. */
export const EXPENSE_CATEGORIES = [
  { value: 'Repairs & maintenance', key: 'repairs' },
  { value: 'Kitchen supplies', key: 'kitchen' },
  { value: 'Office supplies', key: 'office' },
  { value: 'Vehicle & fuel', key: 'vehicle' },
  { value: 'Travel', key: 'travel' },
  { value: 'Utilities', key: 'utilities' },
  { value: 'Marketing', key: 'marketing' },
  { value: 'Professional fees', key: 'professional' },
] as const

/** A receipt's VAT at a rate that is included in its total: `total × rate / (100 + rate)`, to 3 dp. */
export function vatIncluded(total: string, rate: '5' | '0' | 'exempt'): string {
  if (rate !== '5' || !MONEY.test(total.trim())) return rate === '5' ? '' : '0'
  const minor = Math.round((Number(total.trim()) * 1000 * 5) / 105)
  return (minor / 1000).toFixed(3)
}
