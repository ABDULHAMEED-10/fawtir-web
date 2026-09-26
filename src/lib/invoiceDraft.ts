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
  quantity: string
  unit: string
  discountType: DiscountType
  discountValue: string
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
   * IBT-010 and IBT-012 — the tenant's OWN references as buyer. Self-billed documents only; on
   * every other document the buyer is the customer and the server refuses these outright
   * (`BUYER_REFERENCES_NOT_SELF_BILLED`), so they are sent only when `selfBilled` is set.
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
    { code: 'O0', en16931Category: 'O', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'AE0', en16931Category: 'AE', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'G0', en16931Category: 'G', rate: '0', exemptionReasonRequired: true, active: true },
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

/** Categories the server prices only with a reason (`TaxCategoryInput`, `EXEMPTION_REASON_REQUIRED`). */
export const NEEDS_EXEMPTION_REASON = new Set(['E', 'AE', 'G', 'O'])

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
  'BX',
  'CT',
  'PK',
  'BG',
  'BO',
  'CA',
  'DZN',
  'SET',
  'PR',
  'RO',
  'ZZ',
] as const
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
      // every line. A services line is not sent yet: the CL-12-OM service types the composer
      // offers are a placeholder list the backend would refuse, so it stays unclassified until
      // the official list is served (docs/backend-guides/INCOME.md §C7).
      const classification =
        line.itemType === 'goods' && line.hsCode
          ? { goodsOrService: 'G' as const, hsCode: line.hsCode }
          : undefined
      return {
        lineNumber: index + 1,
        ...(line.productId ? { productId: line.productId, productCode: line.productCode ?? '' } : {}),
        description: line.description.trim(),
        unitCode: line.unit,
        quantity: number(line.quantity),
        unitPrice: number(
          exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', tax.rate),
        ),
        discount: { type: line.discountType, value: number(line.discountValue) },
        taxCategory: {
          code: tax.code,
          en16931Category: tax.en16931Category,
          rate: Number(tax.rate),
          exemptionReason: NEEDS_EXEMPTION_REASON.has(tax.en16931Category)
            ? text(line.exemptionReason)
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
        itemType: itemTypeOfUnit(line.unitCode),
        hsCode: line.classification?.hsCode ?? undefined,
        serviceType: line.classification?.serviceTypeCode ?? undefined,
        // Three decimals as typed ("1.8" reloads as "1.800"), no thousands separators.
        unitPrice: formatAmount(parseAmount(String(line.unitPrice)), 3).replace(/,/g, ''),
        vatRate: tax?.rate ?? String(Number(line.taxRate)),
        taxCode: tax?.code ?? null,
        exemptionReason: line.exemptionReason ?? '',
        quantity: String(Number(line.quantity)),
        unit: line.unitCode,
        discountType: line.discountType,
        discountValue: String(Number(line.discountValue)),
      }
    }),
  }
}

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
    if (
      NEEDS_EXEMPTION_REASON.has(taxOptionOf(categories, line).en16931Category) &&
      line.exemptionReason.trim() === ''
    ) {
      problems.push({
        field: 'exemptionReason',
        line: index,
        key: 'invoiceDraft.problem.exemptionReason',
      })
    }
  })
  return problems
}

/**
 * What stops an issue, over and above a save: on a full tax invoice (business or government
 * customer) every goods line names its product's HS code (IBR-079-OM) and every service line its
 * service type (IBR-155-OM). A consumer's simplified invoice skips both. The server will refuse
 * the same at `POST /issue` once it validates them; checking here points at the line first.
 */
export function problemsBeforeIssue(form: DraftForm): FormProblem[] {
  if (form.customerType === 'consumer') return []
  const problems: FormProblem[] = []
  form.lines.forEach((line, index) => {
    if (line.itemType === 'goods' && !line.hsCode) {
      problems.push({ field: 'hsCode', line: index, key: 'invoiceDraft.problem.hsCode' })
    }
    if (line.itemType === 'service' && !line.serviceType) {
      problems.push({ field: 'serviceType', line: index, key: 'invoiceDraft.problem.serviceType' })
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
