import type { DraftRequest, DraftResponse } from '../api/invoices/drafts'
import type { ProblemFieldError } from '../api/errors'
import type { ReferenceDataDto, TaxCategoryDto } from '../api/reference/referenceData'
import { formatAmount, parseAmount, toExclusivePrice, type DiscountType } from './invoiceMath'
import { taxCategoryOf } from './productLine'

/**
 * The invoice composer's form, and the two directions between it and a saved draft.
 *
 * The form holds prices in the entry mode the person chose; a draft always holds them exclusive of
 * VAT, because the server's engine refuses INCLUSIVE (decision INV-PD-019 option A: inclusive is an
 * entry mode, not a pricing mode).
 *
 * Line strategy (client, 25 Sep 2026): the description is free text a catalogue product may fill,
 * each line says whether it is goods or a service, the unit sits on the row and its choices follow
 * that, the price is exclusive of VAT at three decimals, and the tax category is read, not picked.
 */

export type CustomerKind = 'business' | 'consumer' | 'government'
export type ItemType = 'goods' | 'service'

export type DraftLine = {
  /** Local key only; the server numbers lines 1..n in their order. */
  id: string
  /** Set when a catalogue product filled the line; a typed line has none. */
  productId: string | null
  productCode: string | null
  description: string
  /** Goods or service. Not a draft field yet: kept on the client, read back from the unit. */
  itemType: ItemType
  /**
   * The product's HS code (Oman's 12 digits, IBR-079-OM) on a goods line of a business or
   * government invoice; `000000000000` is "Other". A consumer's invoice never carries one.
   */
  hsCode?: string
  /** The CL-12-OM service type (IBR-155-OM) on a service line of a business or government invoice. */
  serviceType?: string
  unitPrice: string
  vatRate: string
  taxCode: string | null
  exemptionReason: string
  /** IBT-121 on a zero-rated (VATZR-OM-nn) or exempt (VATEX-OM-nn) line, chosen from its list. */
  exemptionReasonCode?: string
  quantity: string
  unit: string
  /**
   * The unit a counted product (`keepCount`) keeps its stock in, set when that product filled the
   * line. While set the unit is fixed to it: a line in another unit moves no stock and the issue
   * warns `STOCK_UNIT_MISMATCH` (Abdul, 28 Oct 2026). Client only, never sent; a typed line and an
   * uncounted product have none.
   */
  countedUnit?: string
  discountType: DiscountType
  discountValue: string
  /**
   * The price rule the line's discount comes from (`POST /v1/price-rules/evaluate` suggested it),
   * sent as `priceRuleIds` (at most one). Absent on a typed discount: the server never adds one.
   */
  priceRuleId?: string | null
  /** The rule's name, for the note under the line. Client only. */
  priceRuleName?: string
  /** The person removed the suggestion or typed their own discount: none is suggested again. */
  priceRuleOff?: boolean
  /** The product's own discount, which the line goes back to when a rule is removed. Client only. */
  productDiscount?: { type: DiscountType; value: string }
}

export type DraftForm = {
  customerType: CustomerKind
  customerId: string | null
  branchId: string | null
  paymentTerms: string
  /** The label a loaded draft carried for a terms code this build does not list; sent back as is. */
  paymentTermsLabel: string | null
  deliveryDate: string
  subject: string
  purchaseOrder: string
  customerNote: string
  /**
   * Null when this person cannot read the note: it is then left out of the save, and the server
   * keeps what is stored rather than erasing it.
   */
  internalNote: string | null
  headerDiscountType: DiscountType
  headerDiscountValue: string
  lines: DraftLine[]
  /**
   * IBT-010 and IBT-012. On a self-billed document both are the tenant's OWN references as buyer.
   * On an ordinary business or government invoice IBT-010 is the invoice's own buyer reference,
   * pre-filled from the customer's default and applied over it at issue (2026-10-05); a consumer's
   * simplified invoice has no field for it and sends none. IBT-012 stays self-billed only: the
   * server refuses it elsewhere (`BUYER_REFERENCES_NOT_SELF_BILLED`).
   */
  buyerReference: string
  contractReference: string
}

/**
 * Stands in while the catalogue has not answered. Not a default rate: an empty code is one the
 * server does not carry, so a line built on it is refused rather than priced.
 */
const NO_CATEGORY: TaxCategoryDto = {
  code: '',
  en16931Category: 'S',
  rate: '0',
  exemptionReasonRequired: false,
  active: true,
}

/**
 * The design's catalogue (Figma 154:160716: "Standard rate - 5%", Net 30 days, Bank transfer,
 * EA), which is also what the platform seeds (V193). The composer draws it whenever the platform's
 * list has not answered: the shell fetches `/v1/reference-data` only behind the session guard,
 * and a build without the guard never fetches it, so without this the header's tax category read
 * "Loading..." and every line was priced at 0% (product owner, 25 Sep 2026: the design first, the
 * integration adapts). A code the server does not carry is still refused on save, as a field
 * error the line shows.
 */
export const DESIGN_REFERENCE: ReferenceDataDto = {
  taxCategories: [
    { code: 'S5', en16931Category: 'S', rate: '5', exemptionReasonRequired: false, active: true },
    { code: 'Z0', en16931Category: 'Z', rate: '0', exemptionReasonRequired: false, active: true },
    { code: 'E0', en16931Category: 'E', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'O0', en16931Category: 'O', rate: '0', exemptionReasonRequired: false, active: true },
  ],
  // Empty on purpose: the line's unit list is the design's own (GOODS_UNITS / SERVICE_UNITS).
  units: [],
  paymentTerms: [
    { code: 'NET0', netDays: 0, active: true },
    { code: 'NET30', netDays: 30, active: true },
    { code: 'NET60', netDays: 60, active: true },
  ],
  paymentMethods: ['30', '10', '20', '48', '68'].map((code) => ({ code, active: true })),
}

/**
 * The VAT categories Oman allows: PINT-OM code list OMTaxCat, enforced by CL-04-OM on invoices,
 * credit notes and self-billing alike. Reverse charge (AE) and export (G) are not in it: an export
 * is zero-rated (Z) with a VATZR-OM export code (09 to 12), and reverse charge is a transaction
 * type (BTOM-001), not a category.
 */
export const OMAN_VAT_CATEGORIES: ReadonlySet<string> = new Set(['S', 'Z', 'E', 'O'])

/** The active categories a composer may offer: the platform's list, narrowed to Oman's four. */
export function omanTaxCategories<T extends { en16931Category: string; active?: boolean }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.active !== false && OMAN_VAT_CATEGORIES.has(row.en16931Category))
}

/** Categories that take a reason: its field is drawn and, unless coded, its text is sent. */
export const NEEDS_EXEMPTION_REASON = new Set(['E', 'AE', 'G', 'O'])
/**
 * Of those, the ones whose reason may be left blank. Outside scope: no PINT-OM rule asks for
 * IBT-120 on an O line (IBR-070-OM only forbids a code there), so the server no longer requires
 * one (backend V210, INCOME.md row V.5). A typed reason is still sent and kept.
 */
export const REASON_OPTIONAL: ReadonlySet<string> = new Set(['O'])

/** Whether a line of this category cannot be saved without its reason (`EXEMPTION_REASON_REQUIRED`). */
export function reasonRequired(category: string): boolean {
  return (
    CODED_REASON.has(category) ||
    (NEEDS_EXEMPTION_REASON.has(category) && !REASON_OPTIONAL.has(category))
  )
}
/** The categories whose reason is a code from their own list (IBT-121): zero-rated and exempt. */
export const CODED_REASON = new Set(['Z', 'E'])

/* ------------------------------------------------------------------ units */

/** UN/ECE Recommendation 20 codes, split by what a line is; labels are `createInvoice.units.<code>`. */
/** UN/ECE Rec. 20 codes, the way PINT-OM carries them; `ZZ` is "Other" (mutually defined). */
export const GOODS_UNITS = [
  'EA',
  'H87',
  'KGM',
  'GRM',
  'TNE',
  'LTR',
  'MLT',
  'MTR',
  'CMT',
  'MTK',
  'MTQ',
  'XBX',
  'XCT',
  'XPK',
  'XBG',
  'XBO',
  'XCA',
  'DZN',
  'SET',
  'PR',
  'XRO',
  'ZZ',
] as const
export { REC21_PACKAGE_UNITS, isBarePackageUnit, offeredUnitCode } from './unitCodes'

export const SERVICE_UNITS = [
  'HUR',
  'DAY',
  'WEE',
  'MON',
  'ANN',
  'E48',
  'C62',
  'LS',
  'KMT',
  'ZZ',
] as const

export function unitsFor(type: ItemType): readonly string[] {
  return type === 'service' ? SERVICE_UNITS : GOODS_UNITS
}

/** A saved line's kind, read back from its unit: a draft stores no goods/service flag yet. */
export function itemTypeOfUnit(unitCode: string): ItemType {
  // `ZZ` (Other) sits on both lists and reads back as goods until the draft carries the flag.
  return unitCode !== 'ZZ' && (SERVICE_UNITS as readonly string[]).includes(unitCode)
    ? 'service'
    : 'goods'
}

/* --------------------------------------------------------------- terms */

export type PaymentTerm = {
  code: string
  /** The English label the API stores beside the code (`ReferenceDto.label`). */
  label: string
  labelKey: string
  /** The due date the terms imply for an issue date; the person may still change it. */
  due: (issueDate: string) => string
}

function plusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function endOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export const PAYMENT_TERMS: PaymentTerm[] = [
  { code: 'NET0', label: 'Due on receipt', labelKey: 'createInvoice.terms.NET0', due: (d) => d },
  {
    code: 'NET15',
    label: 'Net 15 days',
    labelKey: 'createInvoice.terms.NET15',
    due: (d) => plusDays(d, 15),
  },
  {
    code: 'NET30',
    label: 'Net 30 days',
    labelKey: 'createInvoice.terms.NET30',
    due: (d) => plusDays(d, 30),
  },
  {
    code: 'NET60',
    label: 'Net 60 days',
    labelKey: 'createInvoice.terms.NET60',
    due: (d) => plusDays(d, 60),
  },
  { code: 'EOM', label: 'End of month', labelKey: 'createInvoice.terms.EOM', due: endOfMonth },
  // Paid before delivery: due the day it is issued.
  {
    code: 'ADVANCE',
    label: 'Advance payment',
    labelKey: 'createInvoice.terms.ADVANCE',
    due: (d) => d,
  },
]

export function paymentTermOf(code: string): PaymentTerm | undefined {
  return PAYMENT_TERMS.find((term) => term.code === code)
}

/**
 * The due date a terms code implies for an issue date: the design's terms first, then a code the
 * platform's list carries with a day count (a loaded draft may hold one). Null for a code neither
 * knows, so the date the reader is looking at is left alone rather than snapped to a guess.
 */
export function dueDateOf(
  reference: ReferenceDataDto | null,
  code: string,
  issueDate: string,
): string | null {
  const term = paymentTermOf(code)
  if (term) return term.due(issueDate)
  const days = (reference?.paymentTerms ?? []).find((option) => option.code === code)?.netDays
  return days === undefined ? null : plusDays(issueDate, days)
}

/* ---------------------------------------------------------------- form */

let nextLine = 1
/**
 * A blank line.
 *
 * `categories` can be empty — the catalogue is fetched, and a caller may reach here before it has
 * answered. The line then carries no tax code and a zero rate rather than throwing: the server
 * derives the rate it stores from the category and refuses an unknown one, so an unpriced line is
 * refused on save instead of quietly taxed at a guess.
 */
export function blankDraftLine(categories: TaxCategoryDto[], taxCode = 'S5'): DraftLine {
  const tax = categories.find((option) => option.code === taxCode) ?? categories[0] ?? NO_CATEGORY
  return {
    id: `L${nextLine++}`,
    productId: null,
    productCode: null,
    description: '',
    itemType: 'goods',
    unitPrice: '0.000',
    vatRate: tax.rate,
    taxCode: tax.code,
    exemptionReason: '',
    quantity: '1',
    unit: 'EA',
    discountType: 'PERCENTAGE',
    discountValue: '0',
  }
}

export function blankDraftForm(categories: TaxCategoryDto[] = []): DraftForm {
  return {
    customerType: 'business',
    customerId: null,
    branchId: null,
    paymentTerms: 'NET30',
    paymentTermsLabel: null,
    deliveryDate: '',
    subject: '',
    purchaseOrder: '',
    customerNote: '',
    internalNote: '',
    headerDiscountType: 'PERCENTAGE',
    headerDiscountValue: '0',
    lines: [blankDraftLine(categories)],
    buyerReference: '',
    contractReference: '',
  }
}

export function taxOptionOf(
  categories: TaxCategoryDto[],
  line: Pick<DraftLine, 'taxCode' | 'vatRate'>,
): TaxCategoryDto {
  return (
    categories.find((option) => option.code === line.taxCode) ??
    categories.find((option) => option.rate === line.vatRate) ??
    categories[0] ??
    NO_CATEGORY
  )
}

const text = (value: string) => (value.trim() === '' ? null : value.trim())
const number = (value: string) => Number((value || '0').replace(/,/g, ''))

/**
 * @param selfBilled sends IBT-010 and IBT-012. Omitted on every other document, because the
 *                   server refuses them there rather than dropping them quietly.
 * @param termLabel  the label the reader saw for the terms code, stored beside it as a snapshot.
 *                   Without one, the design's English label, then what a loaded draft carried.
 */
export function toDraftRequest(
  reference: ReferenceDataDto | null,
  form: DraftForm,
  exclVat: boolean,
  selfBilled = false,
  termLabel?: (code: string) => string,
): DraftRequest {
  const termsCode = form.paymentTerms
  const known =
    (reference?.paymentTerms ?? []).some((option) => option.code === termsCode) ||
    paymentTermOf(termsCode) !== undefined
  const label = known
    ? (termLabel?.(termsCode) ?? paymentTermOf(termsCode)?.label ?? termsCode)
    : (form.paymentTermsLabel ?? termsCode)
  return {
    customerId: form.customerId ?? '',
    branchId: form.branchId ?? '',
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    lines: form.lines.map((line, index) => {
      const tax = taxOptionOf(reference?.taxCategories ?? [], line)
      // A goods line of a business or government invoice carries its HS code (IBR-079-OM); the
      // industrial classification is never sent, the backend copies the tenant's setting onto
      // every line. A services line of such an invoice states only that it is services (BTOM-019):
      // IBR-155-OM asks for a service type on an export of services alone, and the backend fills
      // CL-12-OM's "not applicable" code otherwise. A service type is passed on only when it is an
      // official eight-digit code, never one of the composer's placeholder codes. A consumer's
      // simplified invoice carries none of it.
      const classification =
        line.itemType === 'goods' && line.hsCode
          ? { goodsOrService: 'G' as const, hsCode: line.hsCode }
          : line.itemType === 'service' && form.customerType !== 'consumer'
            ? {
                goodsOrService: 'S' as const,
                ...(line.serviceType && /^\d{8}$/.test(line.serviceType)
                  ? { serviceTypeCode: line.serviceType }
                  : {}),
              }
            : undefined
      return {
        lineNumber: index + 1,
        ...(line.productId
          ? { productId: line.productId, productCode: line.productCode ?? '' }
          : {}),
        description: line.description.trim(),
        unitCode: line.unit,
        quantity: number(line.quantity),
        unitPrice: number(
          exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', tax.rate),
        ),
        discount: { type: line.discountType, value: number(line.discountValue) },
        ...(line.priceRuleId ? { priceRuleIds: [line.priceRuleId] } : {}),
        taxCategory: {
          code: tax.code,
          en16931Category: tax.en16931Category,
          rate: Number(tax.rate),
          // Z and E state their reason as a code, never as text; AE, G and O still give text.
          exemptionReason:
            NEEDS_EXEMPTION_REASON.has(tax.en16931Category) &&
            !CODED_REASON.has(tax.en16931Category)
              ? text(line.exemptionReason)
              : null,
          exemptionReasonCode: CODED_REASON.has(tax.en16931Category)
            ? line.exemptionReasonCode || null
            : null,
        },
        ...(classification ? { classification } : {}),
      }
    }),
    headerDiscount: { type: form.headerDiscountType, value: number(form.headerDiscountValue) },
    details: {
      deliveryDate: form.deliveryDate || null,
      subject: text(form.subject),
      purchaseOrderReference: text(form.purchaseOrder),
      customerVisibleNote: text(form.customerNote),
      ...(form.internalNote === null ? {} : { internalNote: form.internalNote }),
      // The label is a SNAPSHOT of what the reader saw, which is why the server stores it
      // beside the code rather than resolving it later. The design's terms (Net 15, End of
      // month, Advance payment) are sent by code even where the platform's list lacks them.
      paymentTerms: termsCode ? { code: termsCode, label } : null,
      transactionType: form.customerType === 'consumer' ? 'SIMPLIFIED' : 'FULL_TAX',
      ...(selfBilled
        ? {
            buyerReference: text(form.buyerReference),
            contractReference: text(form.contractReference),
          }
        : form.customerType !== 'consumer' && text(form.buyerReference)
          ? { buyerReference: text(form.buyerReference) }
          : {}),
    },
  }
}

/**
 * A saved draft back into the form, exclusive of VAT. The customer kind comes from the customer
 * record, which the draft does not carry; `internalNote` is filled separately, and only for
 * someone who may read it.
 */
export function fromDraftResponse(
  categories: TaxCategoryDto[],
  draft: DraftResponse,
  customerType: CustomerKind,
): DraftForm {
  return {
    customerType,
    customerId: draft.customerId,
    branchId: draft.branchId,
    paymentTerms: draft.details.paymentTerms?.code ?? 'NET30',
    paymentTermsLabel: draft.details.paymentTerms?.label ?? null,
    deliveryDate: draft.details.deliveryDate ?? '',
    subject: draft.details.subject ?? '',
    purchaseOrder: draft.details.purchaseOrderReference ?? '',
    customerNote: draft.details.customerVisibleNote ?? '',
    internalNote: null,
    // Read back deliberately. The draft PUT replaces the whole draft, so a reference the read
    // left out would be cleared by the next save — the server's own DTO says exactly this.
    buyerReference: draft.details.buyerReference ?? '',
    contractReference: draft.details.contractReference ?? '',
    headerDiscountType: draft.headerDiscount.type,
    headerDiscountValue: String(Number(draft.headerDiscount.value)),
    lines: draft.lines.map((line) => {
      const tax =
        categories.find((option) => option.code === line.taxCategoryCode) ??
        taxCategoryOf(categories, line.en16931Category, line.taxRate)
      return {
        id: `L${nextLine++}`,
        productId: line.productId || null,
        productCode: line.productCode || null,
        description: line.description,
        // The stored goods/service flag wins over the unit's guess when the line carries one.
        itemType:
          line.classification?.goodsOrService === 'S'
            ? 'service'
            : line.classification?.goodsOrService === 'G'
              ? 'goods'
              : itemTypeOfUnit(line.unitCode),
        hsCode: line.classification?.hsCode ?? undefined,
        // 00000000 is CL-12-OM's "not applicable", filled by the backend: nothing was chosen.
        serviceType:
          line.classification?.serviceTypeCode && line.classification.serviceTypeCode !== '00000000'
            ? line.classification.serviceTypeCode
            : undefined,
        // Three decimals as typed ("1.8" reloads as "1.800"), no thousands separators.
        unitPrice: formatAmount(parseAmount(String(line.unitPrice)), 3).replace(/,/g, ''),
        vatRate: tax?.rate ?? String(Number(line.taxRate)),
        taxCode: tax?.code ?? null,
        exemptionReason: line.exemptionReason ?? '',
        exemptionReasonCode: line.exemptionReasonCode ?? undefined,
        quantity: String(Number(line.quantity)),
        unit: line.unitCode,
        discountType: line.discountType,
        discountValue: String(Number(line.discountValue)),
        ...(line.priceRuleIds?.length ? { priceRuleId: line.priceRuleIds[0] } : {}),
      }
    }),
  }
}

/** The largest line amount the server accepts (twelve integer digits, three decimals). */
const MAX_LINE_AMOUNT = '999999999999.999'

export type FormProblem = {
  /**
   * `customer`, `branch`, or a line field: `description`, `quantity`, `unitPrice`, `discountValue`,
   * `exemptionReason`, `hsCode`, `serviceType`.
   */
  field: string
  /** Zero-based, for a line field. */
  line?: number
  key: string
}

/** A line's VAT category as the draft sends it: what BR-CO-18 groups and compares. */
export type CategoryReasonLine = {
  code: string | null
  rate: string | number
  en16931Category: string
  exemptionReasonCode?: string | null
  exemptionReason?: string | null
}

/** The message a line gets when its reason differs from another line's at the same category and rate. */
export const CATEGORY_REASON_CONFLICT = 'invoiceDraft.problem.categoryReasonConflict'

/**
 * The lines (by index) whose reason differs from an earlier line at the same VAT category code and
 * rate: a different exemption reason code, or a different written reason. A document has one VAT
 * breakdown per category and rate (BR-CO-18), carrying one reason, so the server refuses the pair
 * at preview or issue (`TAX_CATEGORY_REASON_CONFLICT`, `TAX_CATEGORY_METADATA_CONFLICT`). Shared by
 * every composer that checks its lines before saving (INCOME.md V.6).
 */
export function categoryReasonConflicts(lines: readonly CategoryReasonLine[]): number[] {
  const trimmed = (value: string | null | undefined) => (value ?? '').trim()
  const first = new Map<string, CategoryReasonLine>()
  const conflicts: number[] = []
  lines.forEach((line, index) => {
    const key = `${line.code ?? ''}|${Number(line.rate)}`
    const seen = first.get(key)
    if (!seen) {
      first.set(key, line)
      return
    }
    if (
      seen.en16931Category !== line.en16931Category ||
      trimmed(seen.exemptionReasonCode) !== trimmed(line.exemptionReasonCode) ||
      trimmed(seen.exemptionReason) !== trimmed(line.exemptionReason)
    )
      conflicts.push(index)
  })
  return conflicts
}

/** What stops a save before it is sent. The server re-checks everything; this only saves a round trip. */
export function problemsBeforeSave(categories: TaxCategoryDto[], form: DraftForm): FormProblem[] {
  const problems: FormProblem[] = []
  if (!form.customerId) problems.push({ field: 'customer', key: 'invoiceDraft.problem.customer' })
  if (!form.branchId) problems.push({ field: 'branch', key: 'invoiceDraft.problem.branch' })
  form.lines.forEach((line, index) => {
    if (line.description.trim() === '')
      problems.push({ field: 'description', line: index, key: 'invoiceDraft.problem.description' })
    if (parseAmount(line.quantity) <= 0n)
      problems.push({ field: 'quantity', line: index, key: 'invoiceDraft.problem.quantity' })
    if (line.unitPrice.trim() === '' || parseAmount(line.unitPrice) < 0n) {
      problems.push({ field: 'unitPrice', line: index, key: 'invoiceDraft.problem.unitPrice' })
    }
    // The server refuses a line past twelve integer digits (LINE_AMOUNT_TOO_LARGE).
    if (
      parseAmount(line.quantity) * parseAmount(line.unitPrice) >
      parseAmount(MAX_LINE_AMOUNT) * parseAmount('1')
    ) {
      problems.push({ field: 'unitPrice', line: index, key: 'invoiceDraft.problem.lineAmount' })
    }
    const category = taxOptionOf(categories, line).en16931Category
    // A zero-rated or exempt line needs its reason code; the other categories still need text.
    const reasonMissing = CODED_REASON.has(category)
      ? !line.exemptionReasonCode
      : reasonRequired(category) && line.exemptionReason.trim() === ''
    if (reasonMissing) {
      problems.push({
        field: 'exemptionReason',
        line: index,
        key: 'invoiceDraft.problem.exemptionReason',
      })
    }
  })
  // One reason per VAT category and rate (BR-CO-18), compared as `toDraftRequest` sends it: a
  // code on a zero-rated or exempt line, text on the other no-VAT categories. A line already
  // missing its reason is told that first.
  const sent = form.lines.map((line) => {
    const tax = taxOptionOf(categories, line)
    const coded = CODED_REASON.has(tax.en16931Category)
    return {
      code: tax.code,
      rate: tax.rate,
      en16931Category: tax.en16931Category,
      exemptionReasonCode: coded ? line.exemptionReasonCode || null : null,
      exemptionReason:
        NEEDS_EXEMPTION_REASON.has(tax.en16931Category) && !coded ? line.exemptionReason : null,
    }
  })
  for (const index of categoryReasonConflicts(sent)) {
    if (problems.some((problem) => problem.line === index && problem.field === 'exemptionReason'))
      continue
    problems.push({ field: 'exemptionReason', line: index, key: CATEGORY_REASON_CONFLICT })
  }
  return problems
}

/**
 * What stops an issue, over and above a save: on a full tax invoice (business or government
 * customer) every goods line names its product's HS code (IBR-079-OM). A service line needs no
 * service type: IBR-155-OM asks for one on an export of services only. A consumer's simplified
 * invoice skips the HS code too. The server will refuse the same at `POST /issue` once it
 * validates it; checking here points at the line first.
 */
export function problemsBeforeIssue(form: DraftForm): FormProblem[] {
  if (form.customerType === 'consumer') return []
  const problems: FormProblem[] = []
  form.lines.forEach((line, index) => {
    if (line.itemType === 'goods' && !line.hsCode) {
      problems.push({ field: 'hsCode', line: index, key: 'invoiceDraft.problem.hsCode' })
    }
  })
  return problems
}

const LINE_FIELD = /^draft\.lines\[(\d+)\]\.([a-zA-Z]+)/

/**
 * The server's field errors (`draft.lines[1].unitPrice`) put on the line and field they name. A
 * field the form has no place for comes back under `other`, so nothing the server said is lost.
 */
export function placeFieldErrors(errors: readonly ProblemFieldError[]): {
  lines: Record<number, Record<string, string>>
  other: string[]
} {
  const lines: Record<number, Record<string, string>> = {}
  const other: string[] = []
  for (const error of errors) {
    const match = LINE_FIELD.exec(error.field)
    if (match) {
      const index = Number(match[1])
      const field = match[2] === 'productId' || match[2] === 'productCode' ? 'product' : match[2]
      lines[index] = { ...lines[index], [field]: error.message }
    } else {
      other.push(`${error.field.replace(/^draft\./, '')}: ${error.message}`)
    }
  }
  return { lines, other }
}
