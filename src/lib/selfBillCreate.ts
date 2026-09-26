import type { DraftRequest, DraftResponse, ReferenceDto } from '../api/invoices/drafts'
import type { AgreementDto } from '../api/selfBilling/agreements'
import type { CustomerDto } from '../api/customers/customers'
import type { ReferenceDataDto, TaxCategoryDto } from '../api/reference/referenceData'
import type { LineItem } from '../components/invoice'
import { itemTypeOfUnit, unitsFor } from './invoiceDraft'
import { formatAmount, parseAmount, toExclusivePrice } from './invoiceMath'
import { plusDays } from './invoiceIssue'
import { blockerOf, canIssueUnder, type Blocker } from './selfBillingAgreements'

/**
 * The dedicated "New self-billed invoice" screen (Figma 154:161180): its form, the suppliers it
 * offers, and the two directions between the form and a self-billed draft (I-12).
 *
 * The buyer raises the document on the supplier's behalf, so the money flows *out*. The wire shape
 * is the ordinary `InvoiceDraftRequest`, created on `/self-billed-invoice-drafts` and edited on the
 * shared draft routes; `customerId` names the **seller**. What the frame draws and the draft cannot
 * carry stays on the page behind a `TODO(backend)` (see docs/backend-guides/INCOME.md
 * §7).
 */

export type SelfBillKind = 'agreed' | 'statutory'

/**
 * TODO(backend): the draft has no "kind". A statutory self-bill (import or reverse charge) is drawn
 * as the design draws it, but the server still refuses to issue without an agreement in force.
 */
export const SELF_BILL_KINDS: { id: SelfBillKind; titleKey: string; hintKey: string }[] = [
  { id: 'agreed', titleKey: 'newSelfBill.kinds.agreed', hintKey: 'newSelfBill.kinds.agreedHint' },
  {
    id: 'statutory',
    titleKey: 'newSelfBill.kinds.statutory',
    hintKey: 'newSelfBill.kinds.statutoryHint',
  },
]

export type LineKind = 'goods' | 'service'

export type ComposerLine = LineItem & {
  kind: LineKind
  /** The Oman 12-digit HS code of a goods line (IBR-079-OM), from `lib/codeLists/hs`. */
  hsCode?: string
  /** The CL-12-OM service type of a service line (IBR-155-OM), from `lib/codeLists/serviceTypes`. */
  serviceType?: string
}

export function blankComposerLine(id: string, vatRate = '5'): ComposerLine {
  return {
    id,
    kind: 'goods',
    description: '',
    unitPrice: '0.000',
    vatRate,
    quantity: '1',
    unit: 'EA',
    discountType: 'PERCENTAGE',
    discountValue: '0',
  }
}

/** Three decimals, never below zero, and 0 when nothing readable was typed. */
export function normalisePrice(raw: string): string {
  const value = parseAmount(raw)
  return formatAmount(value < 0n ? 0n : value, 3).replace(/,/g, '')
}

export type SelfBillForm = {
  kind: SelfBillKind
  /** The seller: `customerId` on the wire. */
  customerId: string | null
  /** The agreement the chosen seller is covered by: the contract reference (IBT-012). Locked. */
  agreementReference: string | null
  /** The design's "Self-bill number": the tenant's own reference as buyer (IBT-010). */
  number: string
  issueDate: string
  /** "when goods were received": the draft's `deliveryDate` (IBT-072). */
  supplyDate: string
  paymentTerms: string
  paymentDue: string
  branchId: string | null
  currency: string
  /** The document's tax category; every line takes its rate (the composer rules). */
  taxCategory: string
  subject: string
  poReference: string
  /** TODO(backend): no draft field for the payment section or the two switches. */
  paymentMethod: string
  paymentReference: string
  recordPayment: boolean
  deliverByEmail: boolean
  noteSupplier: string
  /** Null when this person may not read the note; it is then left out of the save. */
  noteInternal: string | null
  lines: ComposerLine[]
}

export const FALLBACK_TAX_CATEGORIES: TaxCategoryDto[] = [
  { code: 'S5', en16931Category: 'S', rate: '5', exemptionReasonRequired: false, active: true },
  { code: 'Z0', en16931Category: 'Z', rate: '0', exemptionReasonRequired: false, active: true },
  { code: 'E0', en16931Category: 'E', rate: '0', exemptionReasonRequired: true, active: true },
  { code: 'AE0', en16931Category: 'AE', rate: '0', exemptionReasonRequired: true, active: true },
]

export const FALLBACK_TERMS = ['NET0', 'NET15', 'NET30', 'NET60'] as const
export const FALLBACK_PAYMENT_METHODS = ['30', '10', '20', '48', '68'] as const

/** The document category, from the platform's list when it has answered, else the seeded four. */
export function taxCategoryOf(reference: ReferenceDataDto | null, code: string): TaxCategoryDto {
  const rows = reference?.taxCategories?.length ? reference.taxCategories : FALLBACK_TAX_CATEGORIES
  return rows.find((row) => row.code === code) ?? rows[0]
}

export function taxCategoryCodes(reference: ReferenceDataDto | null): string[] {
  const rows = reference?.taxCategories?.length ? reference.taxCategories : FALLBACK_TAX_CATEGORIES
  return rows.filter((row) => row.active).map((row) => row.code)
}

export function paymentTermCodes(reference: ReferenceDataDto | null): string[] {
  const rows = reference?.paymentTerms?.filter((row) => row.active) ?? []
  return rows.length > 0 ? rows.map((row) => row.code) : [...FALLBACK_TERMS]
}

export function paymentMethodCodes(reference: ReferenceDataDto | null): string[] {
  const rows = reference?.paymentMethods?.filter((row) => row.active) ?? []
  return rows.length > 0 ? rows.map((row) => row.code) : [...FALLBACK_PAYMENT_METHODS]
}

export function blankSelfBillForm(today: string, branchId: string | null = null): SelfBillForm {
  return {
    kind: 'agreed',
    customerId: null,
    agreementReference: null,
    number: '',
    issueDate: today,
    supplyDate: today,
    paymentTerms: 'NET30',
    // Net 30 from today, as the design opens; the page re-derives it when the terms change.
    paymentDue: plusDays(today, 30),
    branchId,
    currency: 'OMR',
    taxCategory: 'S5',
    subject: '',
    poReference: '',
    paymentMethod: '30',
    paymentReference: '',
    recordPayment: false,
    deliverByEmail: false,
    noteSupplier: '',
    noteInternal: '',
    lines: [blankComposerLine('1')],
  }
}

/* ------------------------------------------------------------ suppliers */

/** A seller the page can bill for: a customer, joined to the agreement on file for it. */
export type SupplierOption = {
  id: string
  name: string
  vat: string | null
  participant: string | null
  onPeppol: boolean
  agreement: AgreementDto | null
  /** Null when issuing would be allowed; otherwise the obstacle the server would name. */
  blocker: Blocker | 'missing' | null
}

/**
 * Every business or government customer, with its agreement when one exists. Usable sellers come
 * first so the picker opens on the ones an invoice can actually be issued to.
 */
export function supplierOptions(
  customers: CustomerDto[],
  agreements: AgreementDto[],
  today: string,
): SupplierOption[] {
  // One live agreement per seller; withdrawn ones stay in the list, so prefer the live one.
  const byCustomer = new Map<string, AgreementDto>()
  for (const agreement of agreements) {
    const current = byCustomer.get(agreement.customerId)
    if (!current || (current.status === 'WITHDRAWN' && agreement.status !== 'WITHDRAWN')) {
      byCustomer.set(agreement.customerId, agreement)
    }
  }
  const options = customers
    .filter((customer) => customer.type !== 'CONSUMER')
    .map((customer): SupplierOption => {
      const agreement = byCustomer.get(customer.id) ?? null
      const participant = customer.profile?.details?.peppolParticipantId
      return {
        id: customer.id,
        name: customer.displayName,
        vat: customer.profile?.details?.vatRegistrationNumber ?? null,
        participant:
          agreement?.verifiedParticipant ??
          (participant ? `${participant.scheme}:${participant.value}` : null),
        onPeppol: customer.peppolDelivery === 'ACTIVE',
        agreement,
        blocker: agreement ? blockerOf(agreement, today) : 'missing',
      }
    })
  const rank = (option: SupplierOption) =>
    option.agreement && canIssueUnder(option.agreement, today) ? 0 : option.agreement ? 1 : 2
  return options.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/* -------------------------------------------------------------- request */

const text = (value: string) => (value.trim() === '' ? null : value.trim())
const number = (value: string) => Number((value || '0').replace(/,/g, ''))

/**
 * The form as `InvoiceDraftRequest`. Unknown members are refused by the server, so the payment
 * section, the switches, the line kind and the HS code / service type stay on the page.
 */
export function toSelfBilledDraftRequest(
  form: SelfBillForm,
  exclVat: boolean,
  reference: ReferenceDataDto | null,
  termLabel: (code: string) => string = (code) => code,
): DraftRequest {
  const tax = taxCategoryOf(reference, form.taxCategory)
  const terms: ReferenceDto | null = form.paymentTerms
    ? { code: form.paymentTerms, label: termLabel(form.paymentTerms) }
    : null
  return {
    customerId: form.customerId ?? '',
    branchId: form.branchId ?? '',
    currency: form.currency,
    vatMode: 'EXCLUSIVE',
    lines: form.lines.map((line, index) => ({
      lineNumber: index + 1,
      // Free text: the composer rules name no catalogue product.
      productId: '',
      productCode: '',
      description: line.description.trim(),
      unitCode: line.unit,
      quantity: number(line.quantity),
      unitPrice: number(
        exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', tax.rate),
      ),
      discount: { type: line.discountType, value: number(line.discountValue) },
      // TODO(backend): `itemType`, `hsCode` and `serviceType` have no draft field yet
      // (docs/backend-guides/INCOME.md §C7.3); a self-billed invoice is always B2B, so every line
      // is classified on the page and the codes wait for the request to carry them.
      taxCategory: {
        code: tax.code,
        en16931Category: tax.en16931Category,
        rate: Number(tax.rate),
        exemptionReason: null,
      },
    })),
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    details: {
      deliveryDate: form.supplyDate || null,
      subject: text(form.subject),
      purchaseOrderReference: text(form.poReference),
      customerVisibleNote: text(form.noteSupplier),
      ...(form.noteInternal === null ? {} : { internalNote: form.noteInternal }),
      paymentTerms: terms,
      transactionType: 'FULL_TAX',
      // IBT-010 and IBT-012, which only a self-billed document may carry: the design's self-bill
      // number is the tenant's own reference as buyer, and the locked agreement field is the
      // contract the document falls under.
      buyerReference: text(form.number),
      contractReference: form.agreementReference,
    },
  }
}

/** A saved draft back onto the form, exclusive of VAT. */
export function fromSelfBilledDraft(draft: DraftResponse, today: string): SelfBillForm {
  const blank = blankSelfBillForm(today, draft.branchId)
  const lines: ComposerLine[] = draft.lines.map((line, index) => ({
    id: String(index + 1),
    kind: itemTypeOfUnit(line.unitCode),
    description: line.description,
    unitPrice: normalisePrice(String(line.unitPrice)),
    vatRate: String(line.taxRate),
    quantity: String(line.quantity),
    unit: line.unitCode,
    discountType: line.discountType,
    discountValue: String(line.discountValue),
    hsCode: line.classification?.hsCode ?? undefined,
    serviceType: line.classification?.serviceTypeCode ?? undefined,
  }))
  return {
    ...blank,
    customerId: draft.customerId,
    agreementReference: draft.details.contractReference ?? null,
    number: draft.details.buyerReference ?? '',
    supplyDate: draft.details.deliveryDate ?? blank.supplyDate,
    paymentTerms: draft.details.paymentTerms?.code ?? blank.paymentTerms,
    currency: draft.currency,
    taxCategory: draft.lines[0]?.taxCategoryCode ?? blank.taxCategory,
    subject: draft.details.subject ?? '',
    poReference: draft.details.purchaseOrderReference ?? '',
    noteSupplier: draft.details.customerVisibleNote ?? '',
    lines: lines.length > 0 ? lines : blank.lines,
  }
}

/** Ordered as the page reads: the first problem is what the notice names. */
export type SelfBillProblem = 'supplier' | 'branch' | 'lines'

export function problemsBeforeSave(form: SelfBillForm): SelfBillProblem[] {
  const problems: SelfBillProblem[] = []
  if (!form.customerId) problems.push('supplier')
  if (!form.branchId) problems.push('branch')
  const usable = form.lines.filter(
    (line) => line.description.trim() !== '' && number(line.quantity) > 0,
  )
  if (usable.length === 0) problems.push('lines')
  return problems
}

/** The first unit of the kind, so a flipped toggle never leaves a service on "Kilogram". */
export function defaultUnitFor(kind: LineKind): string {
  return unitsFor(kind)[0]
}
