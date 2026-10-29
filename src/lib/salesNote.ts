import type { InvoiceDetailDto } from '../api/invoices/detail'
import type {
  DiscountDto,
  DraftLineRequest,
  DraftRequest,
  DraftResponse,
  NoteKind,
} from '../api/invoices/drafts'
import type { InvoiceListPayment, InvoiceRowDto, InvoiceSummaryDto } from '../api/invoices/list'
import type { TFunction } from 'i18next'
import {
  CATEGORY_REASON_CONFLICT,
  CODED_REASON,
  PAYMENT_TERMS,
  categoryReasonConflicts,
  itemTypeOfUnit,
  reasonRequired,
} from './invoiceDraft'
import {
  CALC_SCALE,
  calculateInvoice,
  formatAtScale,
  parseAmount,
  projectInvoice,
  type LineInput,
} from './invoiceMath'
import { issueProblems, muscatToday, plusDays } from './invoiceIssue'
import { netDaysFor } from './reference/referenceData'
import type { ReferenceDataDto } from '../api/reference/referenceData'

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

/**
 * The reasons the design offers, per kind, each carried to the API as one of its five BTOM-032
 * codes. Two reasons can share a code (a goodwill discount and a freight charge are both "other"),
 * so the chosen reason also travels as `correctionReasonDetail` (its id here, INCOME.md 4.9); a
 * note saved without one reads as the first reason of its code, and "Other" where the code is OTH.
 */
export type NoteReason = { id: string; code: ReasonCode }
export const NOTE_REASONS: Record<NoteKind, NoteReason[]> = {
  CREDIT_NOTE: [
    { id: 'returnedGoods', code: 'QTY' },
    { id: 'priceCorrection', code: 'VAL' },
    { id: 'orderCancelled', code: 'CAN' },
    { id: 'vatCorrection', code: 'VAT' },
    { id: 'goodwillDiscount', code: 'OTH' },
    { id: 'other', code: 'OTH' },
  ],
  DEBIT_NOTE: [
    { id: 'undercharged', code: 'VAL' },
    { id: 'additionalDelivery', code: 'QTY' },
    { id: 'freightOmitted', code: 'OTH' },
    { id: 'vatCorrection', code: 'VAT' },
    { id: 'latePaymentCharge', code: 'OTH' },
    { id: 'priceEscalation', code: 'VAL' },
    { id: 'other', code: 'OTH' },
  ],
}

/** The design's reason for an API code: the first of its kind with that code, "Other" for OTH. */
export function reasonOfCode(kind: NoteKind, code: string | null | undefined): string {
  if (!code) return ''
  if (code === 'OTH') return 'other'
  return NOTE_REASONS[kind].find((reason) => reason.code === code)?.id ?? ''
}

export function reasonCodeOf(kind: NoteKind, reason: string): ReasonCode | null {
  return NOTE_REASONS[kind].find((entry) => entry.id === reason)?.code ?? null
}

/**
 * The design's reason a note states: its stored `correctionReasonDetail` when that is one of the
 * kind's reasons and pairs with the code (INCOME.md 4.9), else the first reason of the code.
 */
export function reasonOf(
  kind: NoteKind,
  code: string | null | undefined,
  detail: string | null | undefined,
): string {
  const stored = detail ? NOTE_REASONS[kind].find((entry) => entry.id === detail) : undefined
  if (stored && (!code || stored.code === code)) return stored.id
  return reasonOfCode(kind, code)
}

/** The label key of a note's reason, from its stored reason detail, else the code it carries. */
export function reasonLabelKey(
  kind: NoteKind,
  code: string | null | undefined,
  detail?: string | null,
): string | null {
  const reason = reasonOf(kind, code, detail)
  return reason ? `salesNote.reasonOptions.${reason}` : null
}

export type NoteLineKind = 'goods' | 'service'
export type CreditMode = 'full' | 'lines' | 'custom'
export type DebitMode = 'correctLines' | 'additionalItems' | 'flatCharge'
export type NoteMode = CreditMode | DebitMode

/** The three ways each note can be built, in the order the design's option cards show them. */
export const NOTE_MODES: Record<NoteKind, NoteMode[]> = {
  CREDIT_NOTE: ['full', 'lines', 'custom'],
  DEBIT_NOTE: ['correctLines', 'additionalItems', 'flatCharge'],
}

/**
 * The unit as the frames print it ("KG" for KGM), through the short unit labels the rest of the
 * app uses (`reference.unitShort`), the code itself when there is no label for it.
 */
export function unitLabel(unitCode: string, t: TFunction): string {
  return t(`reference.unitShort.${unitCode}`, { defaultValue: unitCode })
}

/** A line's kind, read from its unit as the invoice draft reads its lines (`ZZ` reads as goods). */
export function kindOfUnit(unitCode: string): NoteLineKind {
  return itemTypeOfUnit(unitCode)
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
  /** Oman 12-digit HS code on a goods line, CL-12-OM service type on a service line; null until chosen. */
  classification: string | null
  /** As on the invoice, the most a credit note should take for the line. Null on an added line. */
  invoiceQuantity: number | null
  invoiceUnitPrice: number | null
  quantity: string
  /** Excluding VAT, three decimals, never negative. */
  unitPrice: string
  discountType: DraftLineRequest['discount']['type']
  discountValue: string
  taxCategory: DraftLineRequest['taxCategory']
  /**
   * The credit note's "Back on the shelf?" for a returned line citing a counted product: true puts
   * it back into the branch's stock when the note is issued. Null while not answered (sent as no).
   */
  backOnShelf: boolean | null
}

export type NoteForm = {
  mode: NoteMode
  /** One of `NOTE_REASONS[kind]` by id; the API code is derived at request time. */
  reason: string
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
  Record<'reason' | 'lines' | 'amounts' | 'descriptions' | 'issueDate' | 'dueDate', string>
>

const FIRST_ADDED_LINE = 1000

function money3(value: number | string): string {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(3) : '0.000'
}

/** The kind the invoice states for a line (its goods/service flag), else the unit's guess. */
function kindOfInvoiceLine(line: InvoiceDetailDto['lines'][number]): NoteLineKind {
  const flag = line.classification?.goodsOrService
  return flag === 'S' ? 'service' : flag === 'G' ? 'goods' : kindOfUnit(line.unitCode)
}

/** The code the note's line starts with: the invoice line's HS code, or its real service type. */
function classificationOfInvoiceLine(line: InvoiceDetailDto['lines'][number]): string | null {
  const c = line.classification
  if (!c) return null
  if (c.goodsOrService === 'S') {
    return c.serviceTypeCode && c.serviceTypeCode !== '00000000' ? c.serviceTypeCode : null
  }
  return c.hsCode ?? null
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
    kind: kindOfInvoiceLine(line),
    unitCode: line.unitCode,
    classification: classificationOfInvoiceLine(line),
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
      exemptionReasonCode: line.exemptionReasonCode ?? null,
    },
    backOnShelf: null,
  }
}

/** What a note line states about its goods or service (BTOM-019, IBT-158, BTOM-034), if anything. */
function classificationRequest(line: NoteLine): Pick<DraftLineRequest, 'classification'> {
  if (line.kind === 'goods') {
    return line.classification && /^\d{12}$/.test(line.classification)
      ? { classification: { goodsOrService: 'G', hsCode: line.classification } }
      : {}
  }
  return {
    classification: {
      goodsOrService: 'S',
      ...(line.classification && /^\d{8}$/.test(line.classification)
        ? { serviceTypeCode: line.classification }
        : {}),
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
    classification: null,
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
          exemptionReasonCode: first.exemptionReasonCode ?? null,
        }
      : { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
    backOnShelf: null,
  }
}

/**
 * The invoice's lines as the note's starting point. A credit note keeps them all ("full invoice");
 * a debit note keeps none, because it charges only what was missed — and only the difference, so
 * its lines start at a price of nothing.
 */
/**
 * A debit note's payment due date follows the invoice's terms (154:165351: "Payment due, follows
 * the invoice terms"). The platform's reference list answers the net days when it has arrived;
 * until then, or for a term it does not carry, the composer's own table says what "Net 30" means
 * rather than leaving the note due the day it is issued.
 */
export function noteDueDate(
  reference: ReferenceDataDto | null,
  issueDate: string,
  termsCode: string | null | undefined,
): string {
  const days = netDaysFor(reference, termsCode)
  if (days !== null) return plusDays(issueDate, days)
  const term = PAYMENT_TERMS.find((row) => row.code === termsCode)
  return term ? term.due(issueDate) : issueDate
}

export function fromInvoice(
  invoice: InvoiceDetailDto,
  kind: NoteKind,
  reference: ReferenceDataDto | null = null,
  today = muscatToday(),
): NoteForm {
  const credit = kind === 'CREDIT_NOTE'
  return {
    mode: credit ? 'full' : 'correctLines',
    reason: '',
    reference: '',
    note: '',
    issueDate: today,
    dueDate: credit ? today : noteDueDate(reference, today, invoice.details?.paymentTerms?.code),
    sendPeppol: true,
    lines: invoice.lines.map((line) =>
      invoiceLine(line, credit, credit ? money3(line.unitPrice) : '0.000'),
    ),
  }
}

type DraftLine = DraftResponse['lines'][number]

/** A saved draft line's kind: its goods/service flag, else the unit's guess. */
function kindOfDraftLine(line: DraftLine): NoteLineKind {
  const flag = line.classification?.goodsOrService
  return flag === 'S' ? 'service' : flag === 'G' ? 'goods' : kindOfUnit(line.unitCode)
}

/** A saved draft line's HS code or real service type (00000000 is "not applicable"). */
function classificationOfDraftLine(line: DraftLine, fallback: string | null): string | null {
  const c = line.classification
  if (c?.goodsOrService === 'S') {
    return c.serviceTypeCode && c.serviceTypeCode !== '00000000' ? c.serviceTypeCode : null
  }
  return c?.hsCode ?? fallback
}

/**
 * A saved note draft against the invoice it corrects: the invoice's lines with the draft's own
 * quantity and price on the ones it kept, plus any line the draft added of its own.
 */
export function fromNoteDraft(
  draft: DraftResponse,
  invoice: InvoiceDetailDto,
  kind?: NoteKind,
  reference: ReferenceDataDto | null = null,
  today = muscatToday(),
): NoteForm {
  const noteKind: NoteKind = kind ?? (draft.type === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'CREDIT_NOTE')
  const base = fromInvoice(invoice, noteKind, reference, today)
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
      kind: kindOfDraftLine(saved),
      classification: classificationOfDraftLine(saved, line.classification),
      discountType: saved.discountType,
      discountValue: String(saved.discountValue),
      backOnShelf: saved.backOnShelf ?? null,
    }
  })
  let form: NoteForm = { ...base, lines }
  for (const line of draft.lines) {
    if (matched.has(keyOf(line.productId || null, line.description))) continue
    // Rebuilt from the saved line in full, so a reopened draft sends back what it was saved with:
    // the line's own no-VAT reason code and its HS code or service type included.
    const added = addedLine(form, invoice, kindOfDraftLine(line))
    form = {
      ...form,
      lines: [
        ...form.lines,
        {
          ...added,
          description: line.description,
          unitCode: line.unitCode,
          classification: classificationOfDraftLine(line, null),
          quantity: String(line.quantity),
          unitPrice: money3(line.unitPrice),
          discountType: line.discountType,
          discountValue: String(line.discountValue),
          taxCategory: {
            code: line.taxCategoryCode,
            en16931Category: line.en16931Category,
            rate: line.taxRate,
            exemptionReason: line.exemptionReason,
            exemptionReasonCode: line.exemptionReasonCode ?? null,
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
    reason: reasonOf(
      noteKind,
      draft.details.correctionReasonCode,
      draft.details.correctionReasonDetail,
    ),
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
    case 'flatCharge': {
      const base = {
        ...form,
        mode,
        lines: invoiceLines.map((line) => ({ ...line, include: false })),
      }
      const keep = added[0] ? { ...added[0], include: true } : addedLine(base, invoice, 'service')
      return { ...base, lines: [...base.lines, keep] }
    }
    // A custom credit may need more than one line: an invoice mixing standard and zero-rated lines
    // is credited at each rate, and a line carries one category (PINT-OM allows the mix).
    case 'custom':
    case 'additionalItems': {
      const base = {
        ...form,
        mode,
        lines: invoiceLines.map((line) => ({ ...line, include: false })),
      }
      const keep =
        added.length > 0
          ? added.map((line) => ({ ...line, include: true }))
          : [addedLine(base, invoice, mode === 'custom' ? 'service' : 'goods')]
      return { ...base, lines: [...base.lines, ...keep] }
    }
  }
}

/**
 * A change to one line. On a debit note the invoice's lines are not ticked, as the frame draws
 * them: a line is charged when it carries a difference, so the price decides whether it goes.
 */
export function patchLine(
  form: NoteForm,
  kind: NoteKind,
  lineNumber: number,
  patch: Partial<NoteLine>,
): NoteForm {
  return {
    ...form,
    lines: form.lines.map((line) => {
      if (line.lineNumber !== lineNumber) return line
      const next = { ...line, ...patch }
      if (kind === 'DEBIT_NOTE' && next.fromInvoice && !('include' in patch))
        next.include = Number(next.unitPrice) > 0 && Number(next.quantity) > 0
      return next
    }),
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

/** No document discount: what every note but a credit of an invoice's own lines sends. */
export const NO_HEADER_DISCOUNT: DiscountDto = { type: 'FIXED_AMOUNT', value: 0 }

function engineLine(line: NoteLine, index: number): LineInput {
  return {
    id: String(line.lineNumber),
    lineNumber: index + 1,
    quantity: QUANTITY.test(line.quantity.trim()) ? line.quantity.trim() : '0',
    unitPrice: PRICE.test(line.unitPrice.trim()) ? line.unitPrice.trim() : '0',
    vatRate: String(line.taxCategory.rate),
    discountType: line.discountType,
    discountValue: QUANTITY.test(line.discountValue.trim()) ? line.discountValue.trim() : '0',
  }
}

/** The lines' amount after their own discounts, excluding VAT, at the engine's scale (10). */
function afterLineDiscounts(lines: LineInput[]): bigint {
  if (lines.length === 0) return 0n
  return calculateInvoice(lines, 'FIXED_AMOUNT', '0').lines.reduce(
    (sum, line) => sum + line.afterLineDiscount,
    0n,
  )
}

/** HALF_UP, as the engine rounds (MonetaryScale.ROUNDING_MODE); both operands positive. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  return (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient
}

/**
 * The document (header) discount a credit note carries, so what it credits is what the customer
 * was charged (W-2):
 *
 * - the whole invoice: the invoice's own discount, type and value;
 * - some of its lines: a percentage discount as it is (the engine takes the same share of each
 *   line either way); a fixed amount in proportion, the invoice's discount times the credited
 *   lines' amount after line discounts over the invoice's, HALF_UP to three decimals. The engine
 *   spreads a fixed discount over every line by that same proportion (whatever its VAT category),
 *   so each credited line gets back its own share, to within half a baisa on the whole note. It
 *   follows the quantities and prices as they are edited;
 * - a custom amount, and every debit note: none (the person types what to credit, and a document
 *   discount must not reduce a new charge).
 */
export function noteHeaderDiscount(
  form: NoteForm,
  invoice: InvoiceDetailDto,
  kind: NoteKind,
): DiscountDto {
  const discount = invoice.headerDiscount
  if (kind !== 'CREDIT_NOTE' || !discount || !(Number(discount.value) > 0))
    return NO_HEADER_DISCOUNT
  if (form.mode === 'full') return { type: discount.type, value: Number(discount.value) }
  if (form.mode !== 'lines') return NO_HEADER_DISCOUNT
  if (discount.type === 'PERCENTAGE') return { type: 'PERCENTAGE', value: Number(discount.value) }
  const invoiceBase = afterLineDiscounts(
    invoice.lines.map((line, index) => ({
      id: String(line.lineNumber),
      lineNumber: index + 1,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      vatRate: String(line.taxRate ?? 0),
      discountType: line.discountType,
      discountValue: String(line.discountValue),
    })),
  )
  const credited = afterLineDiscounts(
    form.lines.filter((line) => line.include).map((line, index) => engineLine(line, index)),
  )
  if (invoiceBase <= 0n || credited <= 0n) return NO_HEADER_DISCOUNT
  const toMilli = 10n ** BigInt(CALC_SCALE - 3)
  // One division (discount × credited ÷ base), rounded once, to baisa.
  const share = divideHalfUp(parseAmount(String(discount.value)) * credited, invoiceBase * toMilli)
  // Never more than the credited lines' own amount (the engine refuses HEADER_DISCOUNT_EXCEEDS_BASE).
  const capped = share * toMilli > credited ? credited / toMilli : share
  return { type: 'FIXED_AMOUNT', value: Number(formatAtScale(capped).replace(/,/g, '')) }
}

/**
 * Net, VAT and total of the kept lines, through the invoice engine, with the note's document
 * discount (`noteHeaderDiscount`) as the server will apply it.
 */
export function noteTotals(
  form: NoteForm,
  headerDiscount: DiscountDto = NO_HEADER_DISCOUNT,
): NoteTotals {
  const kept = form.lines.filter((line) => line.include)
  const rates = new Set(kept.map((line) => line.taxCategory.rate))
  const rate = rates.size === 1 ? [...rates][0] : null
  if (kept.length === 0)
    return { net: '0.000', vat: '0.000', total: '0.000', lines: new Map(), rate }
  const projected = projectInvoice(
    calculateInvoice(
      kept.map((line, index) => engineLine(line, index)),
      headerDiscount.type,
      String(headerDiscount.value),
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
  if (!reasonCodeOf(kind, form.reason)) problems.reason = 'salesNote.error.reason'
  const kept = form.lines.filter((line) => line.include)
  if (kept.length === 0)
    problems.lines =
      kind === 'DEBIT_NOTE' && form.mode === 'correctLines'
        ? 'salesNote.error.noDifference'
        : 'salesNote.error.noLines'
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
  // A line added on the note picks its own category, so it needs its own no-VAT reason.
  const reasonMissing = kept.some((line) => {
    if (line.fromInvoice) return false
    const category = line.taxCategory.en16931Category
    return CODED_REASON.has(category)
      ? !line.taxCategory.exemptionReasonCode
      : reasonRequired(category) && !(line.taxCategory.exemptionReason ?? '').trim()
  })
  if (reasonMissing && !problems.lines) problems.lines = 'salesNote.error.vatReason'
  // One reason per VAT category and rate on the note (BR-CO-18, INCOME.md V.6): refused by the
  // server only at preview or issue, so said here before the save.
  if (!problems.lines && categoryReasonConflicts(kept.map((line) => line.taxCategory)).length > 0)
    problems.lines = CATEGORY_REASON_CONFLICT
  const dates = issueProblems(
    { issueDate: form.issueDate, dueDate: kind === 'CREDIT_NOTE' ? form.issueDate : form.dueDate },
    today,
  )
  if (dates.issueDate) problems.issueDate = dates.issueDate
  if (dates.dueDate && kind === 'DEBIT_NOTE') problems.dueDate = dates.dueDate
  return problems
}

/**
 * Whether a note line asks "Back on the shelf?" (V473, Abdul 7): a returned goods line of an
 * ordinary credit note that cites a product the catalogue counts (`keepCount`). Never on a debit
 * note or a self-billed credit note, which the server refuses (BACK_ON_SHELF_ONLY_ON_CREDIT_NOTES).
 */
export function asksBackOnShelf(
  line: Pick<NoteLine, 'productId' | 'kind'>,
  kind: NoteKind,
  counted: ReadonlySet<string>,
  selfBilled = false,
): boolean {
  return (
    kind === 'CREDIT_NOTE' &&
    !selfBilled &&
    line.kind === 'goods' &&
    line.productId !== null &&
    counted.has(line.productId)
  )
}

/** The note's request: the invoice's party, branch, currency and terms, with the kept lines. */
export function toNoteRequest(
  form: NoteForm,
  invoice: InvoiceDetailDto,
  kind: NoteKind = 'CREDIT_NOTE',
  /** The products on the note that the catalogue counts; their lines answer "Back on the shelf?". */
  counted: ReadonlySet<string> = new Set(),
  selfBilled = false,
): DraftRequest {
  return {
    customerId: invoice.customerId,
    branchId: invoice.branchId,
    currency: invoice.currency,
    vatMode: 'EXCLUSIVE',
    lines: form.lines
      .filter((line) => line.include)
      .map((line, index) => ({
        lineNumber: index + 1,
        // A line added on the note has no catalogue product (client rule: free-text description,
        // no product code), so it states neither key: `productId` is a UUID on the API, and a
        // free-text line leaves both out (INCOME.md 4.4).
        ...(line.productId ? { productId: line.productId } : {}),
        ...(line.productCode ? { productCode: line.productCode } : {}),
        // The goods/service flag and the HS code or service type travel as `classification`
        // (below), as the draft accepts them (docs/backend-guides/INCOME.md, part C and 4.10).
        description: line.description.trim(),
        unitCode: line.unitCode,
        quantity: Number(line.quantity.trim()),
        unitPrice: Number(line.unitPrice.trim()),
        discount: { type: line.discountType, value: Number(line.discountValue.trim()) || 0 },
        taxCategory: line.taxCategory,
        ...classificationRequest(line),
        // Only an ordinary credit note's counted goods line states it; every other line leaves it
        // out, since the server refuses it on any other document type, false included.
        ...(asksBackOnShelf(line, kind, counted, selfBilled)
          ? { backOnShelf: line.backOnShelf === true }
          : {}),
      })),
    // The invoice's document discount, on a credit of its own lines (W-2, `noteHeaderDiscount`).
    headerDiscount: noteHeaderDiscount(form, invoice, kind),
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
      correctionReasonCode: reasonCodeOf(kind, form.reason),
      // The reason as chosen, beside its code, so a reopened draft and the lists name it (4.9).
      correctionReasonDetail: reasonCodeOf(kind, form.reason) ? form.reason : null,
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

/**
 * A customer's Peppol participant id as the note detail prints it ("0248:OM1100447102"), from the
 * `{scheme, value}` the customer record answers, or from a plain string. A value that already
 * starts with its scheme ("0248:OM…") is not prefixed a second time.
 */
export function participantIdText(
  id: { scheme?: string | null; value?: string | null } | string | null | undefined,
): string | null {
  if (!id) return null
  if (typeof id === 'string') return id.trim() || null
  const value = (id.value ?? '').trim()
  const scheme = (id.scheme ?? '').trim()
  if (!value) return null
  if (!scheme || value.startsWith(`${scheme}:`)) return value
  return `${scheme}:${value}`
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
  // The reason detail beside the code (INCOME.md 4.9): the page sends a pairing one, so a refusal
  // here means the reason needs choosing again.
  CORRECTION_REASON_DETAIL_CODE_MISMATCH: 'salesNote.error.reason',
  CORRECTION_REASON_DETAIL_INVALID: 'salesNote.error.reason',
  CORRECTION_REASON_DETAIL_NOT_ALLOWED_FOR_TYPE: 'salesNote.error.reason',
  CORRECTION_REASON_DETAIL_REQUIRES_CODE: 'salesNote.error.reason',
  CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT: 'salesNote.refused.exceeds',
  CREDIT_NOTE_NOTHING_CORRECTABLE: 'salesNote.refused.nothingLeft',
  CREDIT_NOTE_REFERENCE_REQUIRED: 'salesNote.refused.invoiceNotIssued',
  DEBIT_NOTE_REFERENCE_REQUIRED: 'salesNote.refused.invoiceNotIssued',
  // One VAT breakdown per category and rate (BR-CO-18): the engine refuses two reasons in one at
  // preview or issue. The page checks it before saving (`categoryReasonConflicts`, INCOME.md V.6).
  TAX_CATEGORY_METADATA_CONFLICT: CATEGORY_REASON_CONFLICT,
  TAX_CATEGORY_REASON_CONFLICT: CATEGORY_REASON_CONFLICT,
  BACK_ON_SHELF_ONLY_ON_CREDIT_NOTES: 'salesNote.backOnShelf.onlyOnCreditNotes',
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

/**
 * Delivered by hand, or acknowledged or accepted on Peppol, for the two lists. `NOT_SUBMITTED` and
 * the like are not, and neither is RE: a rejection is not a delivery. One rule for both lists: the
 * credit-notes list read only the manual send while the invoices list also read the response
 * (TEST verification 2026-10-29). Detail pages never read `peppolResponse` (api/invoices/detail.ts).
 */
export function delivered(row: Pick<InvoiceRowDto, 'deliveryState' | 'peppolResponse'>): boolean {
  return (
    row.deliveryState === 'SENT_MANUALLY' ||
    row.peppolResponse === 'AB' ||
    row.peppolResponse === 'AP'
  )
}

export function noteStatusOf(kind: NoteKind, row: InvoiceRowDto): NoteListStatus {
  if (row.authoringState === 'DRAFT') return 'draft'
  if (row.authoringState !== 'ISSUED') return 'cancelled'
  if (!delivered(row)) return 'toSend'
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
  /**
   * No list can answer the tab yet, so it shows its empty state and asks the server nothing: the
   * API records no refunds (INCOME.md 4.2, 4.3).
   */
  none?: boolean
  danger?: boolean
}

export const NOTE_TABS: Record<NoteKind, NoteTab[]> = {
  CREDIT_NOTE: [
    { id: 'all', state: 'DRAFT,ISSUED,CANCELLED', payment: null, only: null },
    { id: 'drafts', state: 'DRAFT', payment: null, only: null },
    // TODO(backend): a delivery filter on the list (INCOME.md 4.3); until then one page of issued
    // notes is narrowed on the client.
    { id: 'toSend', state: 'ISSUED', payment: null, only: ['toSend'] },
    // TODO(backend): refund tracking (INCOME.md 4.2): no credit note is refund due or refunded yet.
    { id: 'refundDue', state: 'ISSUED', payment: null, only: ['refundDue'], none: true },
    // With no refunds recorded, every issued credit note is applied to its invoice: the server's
    // own filter, so the pages and the count are the tab's (`issuedTotal`, INCOME.md 4.1).
    { id: 'applied', state: 'ISSUED', payment: null, only: null },
    { id: 'refunded', state: 'ISSUED', payment: null, only: ['refunded'], none: true },
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
  /** Issued this quarter: the subtitle under the title. Null when the source does not say. */
  quarter: NoteFigure | null
  cards: Record<string, NoteFigure>
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * The debit notes list's tab counts and four figures, from `GET /v1/authored-invoices/summary
 * ?type=DEBIT_NOTE` (INCOME.md 4.1). The counts are the tabs' (every currency); the figures are
 * the cards' (in `currencyCode`). Overdue's "days late" is the oldest overdue note's, as the wide
 * read's largest `daysOverdue` was.
 * The subtitle's "charged this quarter" is `issuedThisQuarter` (INCOME.md 4.18); absent, the
 * subtitle reads as it does while the figures load.
 */
export function debitSummaryOf(summary: InvoiceSummaryDto): NoteSummary {
  const counts: Record<string, number> = {
    all: summary.all,
    drafts: summary.drafts,
    awaiting: summary.awaiting,
    overdue: summary.overdue,
    paid: summary.paid,
  }
  if (summary.toSend !== undefined) counts.toSend = summary.toSend
  const overdueDays = summary.oldestOverdueDueDate
    ? Math.max(0, daysBetween(summary.oldestOverdueDueDate, summary.asOf))
    : 0
  return {
    counts,
    quarter: summary.issuedThisQuarter
      ? { amount: summary.issuedThisQuarter.total, count: summary.issuedThisQuarter.count }
      : null,
    cards: {
      ...(summary.issuedLast30Days
        ? {
            charged: {
              amount: summary.issuedLast30Days.total,
              count: summary.issuedLast30Days.count,
            },
          }
        : {}),
      awaiting: { amount: summary.awaitingTotal, count: summary.awaiting },
      collected: { amount: summary.paidTotal, count: summary.paidInvoices },
      overdue: {
        amount: summary.overdueTotal,
        count: summary.overdueInvoices,
        days: overdueDays,
      },
    },
  }
}

/**
 * The credit notes list's tab counts, subtitle and figures, from `GET /v1/authored-invoices/summary
 * ?type=CREDIT_NOTE` (INCOME.md 4.1). Credited · 30 days is `issuedLast30Days`; with no refunds
 * recorded, every issued credit note is applied against its invoice, so Applied to invoices (card
 * and tab) is `issuedTotal`. The subtitle's quarter is `issuedThisQuarter`. A figure the summary
 * does not carry is left out, and its card reads as unavailable.
 * TODO(backend): Refund due and Refunded, cards and tabs, need refund tracking (INCOME.md 4.2).
 */
export function creditSummaryOf(summary: InvoiceSummaryDto): NoteSummary {
  const counts: Record<string, number> = { all: summary.all, drafts: summary.drafts }
  if (summary.toSend !== undefined) counts.toSend = summary.toSend
  if (summary.issuedTotal) counts.applied = summary.issuedTotal.count
  const figure = (value: { count: number; total: number } | undefined): NoteFigure | null =>
    value ? { amount: value.total, count: value.count } : null
  const cards: Record<string, NoteFigure> = {}
  const credited = figure(summary.issuedLast30Days)
  const applied = figure(summary.issuedTotal)
  if (credited) cards.credited = credited
  if (applied) cards.applied = applied
  return { counts, quarter: figure(summary.issuedThisQuarter), cards }
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
  // Read from the payment, not from `status`: an undelivered note's status is "to send", and that
  // hid a note already paid (or late) behind "Due ... added to invoice balance". Delivery only
  // decides the added-to-invoice hint below.
  const payment = row.payment
  // The paid date, when the row carries it (INCOME.md 4.7); absent, the cell reads "Paid".
  // TODO(backend): the method (`lastPaymentMethodCode`) has no drawn place in the cell yet (4.7).
  if (payment?.state === 'PAID') return { kind: 'paid', date: payment.lastPaymentDate ?? null }
  if (!row.dueDate) return null
  if (payment?.overdue) {
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
