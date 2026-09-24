import type { DraftRequest, DraftResponse } from '../api/invoices/drafts'
import type { ProblemFieldError } from '../api/errors'
import { TAX_CATEGORIES } from './catalogues'
import { parseAmount, toExclusivePrice, type DiscountType } from './invoiceMath'
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
  /** ISIC division (BTOM-033) for a business or government invoice; empty for a consumer's. */
  classification: string
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
}

/** Categories the server prices only with a reason (`TaxCategoryInput`, `EXEMPTION_REASON_REQUIRED`). */
export const NEEDS_EXEMPTION_REASON = new Set(['E', 'AE', 'G', 'O'])

/* ------------------------------------------------------------------ units */

/** UN/ECE Recommendation 20 codes, split by what a line is; labels are `createInvoice.units.<code>`. */
export const GOODS_UNITS = ['EA', 'H87', 'KGM', 'LTR', 'BX', 'MTR', 'PK', 'BG'] as const
export const SERVICE_UNITS = ['HUR', 'DAY', 'MON', 'E48', 'C62'] as const

export function unitsFor(type: ItemType): readonly string[] {
  return type === 'service' ? SERVICE_UNITS : GOODS_UNITS
}

/** A saved line's kind, read back from its unit: a draft stores no goods/service flag yet. */
export function itemTypeOfUnit(unitCode: string): ItemType {
  return (SERVICE_UNITS as readonly string[]).includes(unitCode) ? 'service' : 'goods'
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

/* ---------------------------------------------------------------- form */

let nextLine = 1
export function blankDraftLine(taxCode = 'S5'): DraftLine {
  const tax = TAX_CATEGORIES.find((option) => option.code === taxCode) ?? TAX_CATEGORIES[0]
  return {
    id: `L${nextLine++}`,
    productId: null,
    productCode: null,
    description: '',
    itemType: 'goods',
    classification: '',
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

export function blankDraftForm(): DraftForm {
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
    lines: [blankDraftLine()],
  }
}

export function taxOptionOf(line: Pick<DraftLine, 'taxCode' | 'vatRate'>) {
  return (
    TAX_CATEGORIES.find((option) => option.code === line.taxCode) ??
    TAX_CATEGORIES.find((option) => option.rate === line.vatRate) ??
    TAX_CATEGORIES[0]
  )
}

const text = (value: string) => (value.trim() === '' ? null : value.trim())
const number = (value: string) => Number((value || '0').replace(/,/g, ''))

export function toDraftRequest(form: DraftForm, exclVat: boolean): DraftRequest {
  const terms = paymentTermOf(form.paymentTerms)
  return {
    customerId: form.customerId ?? '',
    branchId: form.branchId ?? '',
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    lines: form.lines.map((line, index) => {
      const tax = taxOptionOf(line)
      // TODO(backend): `itemType` (goods/service) and `classification` (ISIC) have no draft field;
      // `InvoiceDraftRequest` refuses unknown members, so they stay on the client until it has them.
      return {
        lineNumber: index + 1,
        productId: line.productId ?? '',
        productCode: line.productCode ?? '',
        description: line.description.trim(),
        unitCode: line.unit,
        quantity: number(line.quantity),
        unitPrice: number(
          exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', tax.rate),
        ),
        discount: { type: line.discountType, value: number(line.discountValue) },
        taxCategory: {
          code: tax.code,
          en16931Category: tax.categoryId,
          rate: Number(tax.rate),
          exemptionReason: NEEDS_EXEMPTION_REASON.has(tax.categoryId)
            ? text(line.exemptionReason)
            : null,
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
      paymentTerms: terms
        ? { code: terms.code, label: terms.label }
        : form.paymentTerms
          ? { code: form.paymentTerms, label: form.paymentTermsLabel ?? form.paymentTerms }
          : null,
      transactionType: form.customerType === 'consumer' ? 'SIMPLIFIED' : 'FULL_TAX',
    },
  }
}

/**
 * A saved draft back into the form, exclusive of VAT. The customer kind comes from the customer
 * record, which the draft does not carry; `internalNote` is filled separately, and only for
 * someone who may read it.
 */
export function fromDraftResponse(draft: DraftResponse, customerType: CustomerKind): DraftForm {
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
    headerDiscountType: draft.headerDiscount.type,
    headerDiscountValue: String(Number(draft.headerDiscount.value)),
    lines: draft.lines.map((line) => {
      const tax =
        TAX_CATEGORIES.find((option) => option.code === line.taxCategoryCode) ??
        taxCategoryOf(line.en16931Category, line.taxRate)
      return {
        id: `L${nextLine++}`,
        productId: line.productId || null,
        productCode: line.productCode || null,
        description: line.description,
        itemType: itemTypeOfUnit(line.unitCode),
        classification: '',
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
  /** `customer`, `branch`, or a line field: `description`, `quantity`, `unitPrice`, `discountValue`, `exemptionReason`. */
  field: string
  /** Zero-based, for a line field. */
  line?: number
  key: string
}

/** What stops a save before it is sent. The server re-checks everything; this only saves a round trip. */
export function problemsBeforeSave(form: DraftForm): FormProblem[] {
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
      NEEDS_EXEMPTION_REASON.has(taxOptionOf(line).categoryId) &&
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
