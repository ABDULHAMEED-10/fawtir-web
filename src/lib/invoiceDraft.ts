import type { DraftRequest, DraftResponse } from '../api/invoices/drafts'
import type { ProblemFieldError } from '../api/errors'
import type { ReferenceDataDto, TaxCategoryDto } from '../api/reference/referenceData'
import { parseAmount, toExclusivePrice, type DiscountType } from './invoiceMath'
import { taxCategoryOf } from './productLine'

/**
 * The invoice composer's form, and the two directions between it and a saved draft.
 *
 * The form holds prices in the entry mode the person chose; a draft always holds them exclusive of
 * VAT, because the server's engine refuses INCLUSIVE (decision INV-PD-019 option A: inclusive is an
 * entry mode, not a pricing mode).
 */

export type CustomerKind = 'business' | 'consumer' | 'government'

export type DraftLine = {
  /** Local key only; the server numbers lines 1..n in their order. */
  id: string
  productId: string | null
  productCode: string | null
  description: string
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

/** Categories the server prices only with a reason (`TaxCategoryInput`, `EXEMPTION_REASON_REQUIRED`). */
export const NEEDS_EXEMPTION_REASON = new Set(['E', 'AE', 'G', 'O'])

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
    unitPrice: '',
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
 */
export function toDraftRequest(
  reference: ReferenceDataDto | null,
  form: DraftForm,
  exclVat: boolean,
  selfBilled = false,
  termLabel: (code: string) => string = (code) => code,
): DraftRequest {
  const terms = (reference?.paymentTerms ?? []).find((option) => option.code === form.paymentTerms)
  return {
    customerId: form.customerId ?? '',
    branchId: form.branchId ?? '',
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    lines: form.lines.map((line, index) => {
      const tax = taxOptionOf(reference?.taxCategories ?? [], line)
      return {
        lineNumber: index + 1,
        productId: line.productId ?? '',
        productCode: line.productCode ?? '',
        description: line.description,
        unitCode: line.unit,
        quantity: number(line.quantity),
        unitPrice: number(exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', tax.rate)),
        discount: { type: line.discountType, value: number(line.discountValue) },
        taxCategory: {
          code: tax.code,
          en16931Category: tax.en16931Category,
          rate: Number(tax.rate),
          exemptionReason: NEEDS_EXEMPTION_REASON.has(tax.en16931Category) ? text(line.exemptionReason) : null,
        },
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
      // beside the code rather than resolving it later.
      paymentTerms: terms ? { code: terms.code, label: termLabel(terms.code) } : null,
      transactionType: form.customerType === 'consumer' ? 'SIMPLIFIED' : 'FULL_TAX',
      ...(selfBilled
        ? { buyerReference: text(form.buyerReference), contractReference: text(form.contractReference) }
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
        productId: line.productId,
        productCode: line.productCode,
        description: line.description,
        // Number() drops the scale-10 zeros ("1.8000000000" → 1.8) without rounding anything.
        unitPrice: String(Number(line.unitPrice)),
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
  /** `customer`, `branch`, or a line field: `product`, `quantity`, `unitPrice`, `discountValue`, `exemptionReason`. */
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
    if (!line.productId) problems.push({ field: 'product', line: index, key: 'invoiceDraft.problem.product' })
    if (parseAmount(line.quantity) <= 0n) problems.push({ field: 'quantity', line: index, key: 'invoiceDraft.problem.quantity' })
    if (line.unitPrice.trim() === '' || parseAmount(line.unitPrice) < 0n) {
      problems.push({ field: 'unitPrice', line: index, key: 'invoiceDraft.problem.unitPrice' })
    }
    if (
      NEEDS_EXEMPTION_REASON.has(taxOptionOf(categories, line).en16931Category) &&
      line.exemptionReason.trim() === ''
    ) {
      problems.push({ field: 'exemptionReason', line: index, key: 'invoiceDraft.problem.exemptionReason' })
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
