import type { DraftRequest, DraftResponse, ReferenceDto } from '../api/invoices/drafts'
import type { AgreementDto } from '../api/selfBilling/agreements'
import type { CustomerDto } from '../api/customers/customers'
import type { ReferenceDataDto, TaxCategoryDto } from '../api/reference/referenceData'
import type { LineItem } from '../components/invoice'
import {
  CODED_REASON,
  NEEDS_EXEMPTION_REASON,
  reasonRequired,
  itemTypeOfUnit,
  omanTaxCategories,
  unitsFor,
} from './invoiceDraft'
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
  /** The Oman 12-digit HS code of a goods line (IBR-079-OM), chosen from the published list, searched on the server. */
  hsCode?: string
  /** The CL-12-OM service type of a service line (IBR-155-OM), from `lib/codeLists/serviceTypes`. */
  serviceType?: string
  /** The line's own tax category; unset, it takes the form's default (`SelfBillForm.taxCategory`). */
  taxCode?: string
  /** IBT-121 on a zero-rated (VATZR-OM-nn) or exempt (VATEX-OM-nn) line. */
  exemptionReasonCode?: string
  /** The written reason of a reverse-charge, export or out-of-scope line (no code list). */
  exemptionReason?: string
}

/** The category a line is charged at: its own, else the form's default. */
export function lineTaxCode(line: ComposerLine, defaultCode: string): string {
  return line.taxCode || defaultCode
}

/**
 * A line's no-VAT reason. A line with its own category keeps its own reason; a line still on the
 * default reads the form's (drafts saved before the category moved onto the line).
 */
function lineReason(
  line: ComposerLine,
  form: { exemptionReasonCode: string; exemptionReason: string },
) {
  return line.taxCode
    ? { code: line.exemptionReasonCode ?? '', text: line.exemptionReason ?? '' }
    : {
        code: line.exemptionReasonCode || form.exemptionReasonCode,
        text: line.exemptionReason || form.exemptionReason,
      }
}

export function blankComposerLine(id: string, vatRate = '5', taxCode?: string): ComposerLine {
  return {
    id,
    ...(taxCode ? { taxCode } : {}),
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
  /**
   * The header's "Default tax category": new lines take it, and changing it moves only the lines
   * still on the old default. Each line may carry its own (handbook 3.2, invoice-form rules).
   */
  taxCategory: string
  /** Read back from drafts saved before the reason moved onto the line; new lines carry their own. */
  exemptionReasonCode: string
  exemptionReason: string
  subject: string
  poReference: string
  /** UNCL4461 code, sent as `details.paymentMethod` (IBT-081) with the label the reader saw. */
  paymentMethod: string
  /** TODO(backend): no draft field for the payment reference or the two switches. */
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
  { code: 'O0', en16931Category: 'O', rate: '0', exemptionReasonRequired: true, active: true },
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
  return omanTaxCategories(rows).map((row) => row.code)
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
    exemptionReasonCode: '',
    exemptionReason: '',
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
 * reference and the two switches stay on the page; the payment method goes as the invoice
 * composer sends it.
 */
export function toSelfBilledDraftRequest(
  form: SelfBillForm,
  exclVat: boolean,
  reference: ReferenceDataDto | null,
  termLabel: (code: string) => string = (code) => code,
  methodLabel: (code: string) => string = (code) => code,
): DraftRequest {
  const terms: ReferenceDto | null = form.paymentTerms
    ? { code: form.paymentTerms, label: termLabel(form.paymentTerms) }
    : null
  return {
    customerId: form.customerId ?? '',
    branchId: form.branchId ?? '',
    currency: form.currency,
    vatMode: 'EXCLUSIVE',
    lines: form.lines.map((line, index) => {
      const tax = taxCategoryOf(reference, lineTaxCode(line, form.taxCategory))
      const reason = lineReason(line, form)
      return {
        // Free text: the composer rules name no catalogue product, so both product members are
        // left out, as the invoice composer leaves them out of a free-text line.
        lineNumber: index + 1,
        description: line.description.trim(),
        unitCode: line.unit,
        quantity: number(line.quantity),
        unitPrice: number(
          exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', tax.rate),
        ),
        discount: { type: line.discountType, value: number(line.discountValue) },
        // A self-billed invoice is never simplified (IBR-149-OM), so every line is classified: a
        // goods line by its HS code, a services line as services. The industrial classification is
        // never sent; the backend copies the company's onto the line. A service type is passed on
        // only when it is an official eight-digit code.
        ...(line.kind === 'goods' && line.hsCode
          ? { classification: { goodsOrService: 'G' as const, hsCode: line.hsCode } }
          : line.kind === 'service'
            ? {
                classification: {
                  goodsOrService: 'S' as const,
                  ...(line.serviceType && /^\d{8}$/.test(line.serviceType)
                    ? { serviceTypeCode: line.serviceType }
                    : {}),
                },
              }
            : {}),
        taxCategory: {
          code: tax.code,
          en16931Category: tax.en16931Category,
          rate: Number(tax.rate),
          exemptionReason:
            NEEDS_EXEMPTION_REASON.has(tax.en16931Category) &&
            !CODED_REASON.has(tax.en16931Category)
              ? text(reason.text)
              : null,
          exemptionReasonCode: CODED_REASON.has(tax.en16931Category) ? reason.code || null : null,
        },
      }
    }),
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    details: {
      deliveryDate: form.supplyDate || null,
      subject: text(form.subject),
      purchaseOrderReference: text(form.poReference),
      customerVisibleNote: text(form.noteSupplier),
      ...(form.noteInternal === null ? {} : { internalNote: form.noteInternal }),
      paymentTerms: terms,
      // A snapshot of what the reader saw, stored beside the code like the terms.
      paymentMethod: form.paymentMethod
        ? { code: form.paymentMethod, label: methodLabel(form.paymentMethod) }
        : null,
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
    // The stored goods/service flag wins over the unit's guess when the line carries one.
    kind:
      line.classification?.goodsOrService === 'S'
        ? 'service'
        : line.classification?.goodsOrService === 'G'
          ? 'goods'
          : itemTypeOfUnit(line.unitCode),
    description: line.description,
    unitPrice: normalisePrice(String(line.unitPrice)),
    vatRate: String(line.taxRate),
    quantity: String(line.quantity),
    unit: line.unitCode,
    discountType: line.discountType,
    discountValue: String(line.discountValue),
    taxCode: line.taxCategoryCode,
    exemptionReasonCode: line.exemptionReasonCode ?? '',
    exemptionReason: line.exemptionReason ?? '',
    hsCode: line.classification?.hsCode ?? undefined,
    // 00000000 is CL-12-OM's "not applicable", filled by the backend: nothing was chosen.
    serviceType:
      line.classification?.serviceTypeCode && line.classification.serviceTypeCode !== '00000000'
        ? line.classification.serviceTypeCode
        : undefined,
  }))
  return {
    ...blank,
    customerId: draft.customerId,
    agreementReference: draft.details.contractReference ?? null,
    number: draft.details.buyerReference ?? '',
    supplyDate: draft.details.deliveryDate ?? blank.supplyDate,
    paymentTerms: draft.details.paymentTerms?.code ?? blank.paymentTerms,
    paymentMethod: draft.details.paymentMethod?.code ?? blank.paymentMethod,
    currency: draft.currency,
    taxCategory: draft.lines[0]?.taxCategoryCode ?? blank.taxCategory,
    exemptionReasonCode: draft.lines[0]?.exemptionReasonCode ?? '',
    exemptionReason: draft.lines[0]?.exemptionReason ?? '',
    subject: draft.details.subject ?? '',
    poReference: draft.details.purchaseOrderReference ?? '',
    noteSupplier: draft.details.customerVisibleNote ?? '',
    lines: lines.length > 0 ? lines : blank.lines,
  }
}

/** Ordered as the page reads: the first problem is what the notice names. */
export type SelfBillProblem = 'supplier' | 'branch' | 'lines' | 'reason'

export function problemsBeforeSave(
  form: SelfBillForm,
  reference: ReferenceDataDto | null = null,
): SelfBillProblem[] {
  const problems: SelfBillProblem[] = []
  if (!form.customerId) problems.push('supplier')
  if (!form.branchId) problems.push('branch')
  const usable = form.lines.filter(
    (line) => line.description.trim() !== '' && number(line.quantity) > 0,
  )
  if (usable.length === 0) problems.push('lines')
  const categories = form.lines.map(
    (line) => taxCategoryOf(reference, lineTaxCode(line, form.taxCategory)).en16931Category,
  )
  const reasonMissing = form.lines.some((line, index) => {
    const category = categories[index]
    const reason = lineReason(line, form)
    return CODED_REASON.has(category)
      ? !reason.code
      : reasonRequired(category) && reason.text.trim() === ''
  })
  // PINT-OM has no EN 16931 BR-O-11 counterpart: an out-of-scope line may sit beside taxed ones.
  if (reasonMissing) problems.push('reason')
  return problems
}

/** The first unit of the kind, so a flipped toggle never leaves a service on "Kilogram". */
export function defaultUnitFor(kind: LineKind): string {
  return unitsFor(kind)[0]
}
