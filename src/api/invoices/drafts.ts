import { apiRequest } from '../client'
import { withQuery } from '../query'
import type { InvoiceDetailDto } from './detail'

/**
 * Invoice drafts (`InvoiceAuthoringController`) and the branch list the draft names.
 *
 * A draft stores no figures: `totals` is null until issue, and the server prices a draft only
 * through `preview`, which reads what was last saved. Issue and due dates are not draft fields;
 * they are sent at issue.
 */
export const INVOICE_DRAFTS_PATH = '/v1/invoice-drafts'
export const BRANCHES_PATH = '/v1/branches'

export type DiscountDto = { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number }
export type ReferenceDto = { code: string; label: string }

export type DraftLineRequest = {
  lineNumber: number
  productId: string
  productCode: string
  description: string
  unitCode: string
  quantity: number
  /** Always exclusive of VAT: the engine refuses INCLUSIVE until its discount ordering is approved. */
  unitPrice: number
  discount: DiscountDto
  taxCategory: {
    code: string
    en16931Category: string
    rate: number
    exemptionReason: string | null
  }
}

/** `InvoiceDraftRequest`. Unknown fields are refused, so this carries only what the API reads. */
export type DraftRequest = {
  customerId: string
  branchId: string
  currency: string
  vatMode: 'EXCLUSIVE'
  lines: DraftLineRequest[]
  headerDiscount: DiscountDto
  details: {
    deliveryDate: string | null
    subject: string | null
    purchaseOrderReference: string | null
    customerVisibleNote: string | null
    /** Left out, the server keeps the stored note; an empty string clears it. */
    internalNote?: string
    paymentTerms: ReferenceDto | null
    transactionType: 'FULL_TAX' | 'SIMPLIFIED'
    /** BTOM-032, a credit or debit note's reason: CAN, VAT, VAL, QTY or OTH. Invoices send none. */
    correctionReasonCode?: string | null
  }
}

/** `InvoiceResponse` for a draft, the members the composer reads. */
export type DraftResponse = {
  id: string
  version: number
  authoringState: 'DRAFT' | 'ISSUED' | 'CANCELLED' | 'DISCARDED'
  customerId: string
  branchId: string
  currency: string
  invoiceNumber: string | null
  details: {
    deliveryDate: string | null
    subject: string | null
    purchaseOrderReference: string | null
    customerVisibleNote: string | null
    paymentTerms: ReferenceDto | null
    transactionType: 'FULL_TAX' | 'SIMPLIFIED'
    correctionReasonCode?: string | null
  }
  type?:
    'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SELF_BILLED_INVOICE' | 'SELF_BILLED_CREDIT_NOTE'
  correctionOfInvoiceId?: string | null
  headerDiscount: DiscountDto
  lines: {
    lineNumber: number
    productId: string
    productCode: string
    description: string
    unitCode: string
    quantity: number
    unitPrice: number
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
    discountValue: number
    taxCategoryCode: string
    en16931Category: string
    taxRate: number
    exemptionReason: string | null
    /**
     * TODO(backend): the line's classification (PINT_OM_LINE_CLASSIFICATION.md §7.3). Read when
     * present so a stored value comes back onto the composer; the request does not carry them yet.
     */
    hsCode?: string | null
    serviceType?: string | null
  }[]
}

/** `InvoicePreviewResponse`: amounts at the currency's three decimals, rounded HALF_UP. */
export type DraftPreview = {
  currency: string
  lines: {
    lineNumber: number
    grossAmount: number
    lineDiscount: number
    allocatedHeaderDiscount: number
    taxableAmount: number
    vatAmount: number
    lineNetAmount: number
  }[]
  totals: {
    subtotal: number
    itemLevelDiscount: number
    headerDiscount: number
    totalDiscount: number
    taxableAmount: number
    vatAmount: number
    totalAmount: number
  }
}

export type BranchDto = {
  id: string
  code: string
  name: string
  type: string
  city: string | null
}

const draftPath = (id: string) => `${INVOICE_DRAFTS_PATH}/${encodeURIComponent(id)}`

export function createDraft(idempotencyKey: string, draft: DraftRequest): Promise<DraftResponse> {
  return apiRequest<DraftResponse>(INVOICE_DRAFTS_PATH, {
    method: 'POST',
    body: { type: 'INVOICE', draft },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export type NoteKind = 'CREDIT_NOTE' | 'DEBIT_NOTE'

/**
 * A credit or debit note draft against an issued invoice (`creditnote.create` / `debitnote.create`).
 * The body is the ordinary draft content: the server copies nothing from the invoice.
 */
export function createNote(
  kind: NoteKind,
  invoiceId: string,
  idempotencyKey: string,
  draft: DraftRequest,
): Promise<DraftResponse> {
  const route = kind === 'CREDIT_NOTE' ? 'credit-notes' : 'debit-notes'
  return apiRequest<DraftResponse>(
    `/v1/authored-invoices/${encodeURIComponent(invoiceId)}/${route}`,
    {
      method: 'POST',
      body: draft,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export function loadDraft(id: string): Promise<DraftResponse> {
  return apiRequest<DraftResponse>(draftPath(id))
}

export function saveDraft(
  id: string,
  expectedVersion: number,
  draft: DraftRequest,
): Promise<DraftResponse> {
  return apiRequest<DraftResponse>(draftPath(id), {
    method: 'PUT',
    body: { expectedVersion, draft },
  })
}

/** A lifecycle step to DISCARDED, not a physical delete; the audit trail keeps it. */
export function discardDraft(id: string, expectedVersion: number): Promise<DraftResponse> {
  return apiRequest<DraftResponse>(
    withQuery(draftPath(id), { expected_version: expectedVersion }),
    {
      method: 'DELETE',
    },
  )
}

export function previewDraft(id: string): Promise<DraftPreview> {
  return apiRequest<DraftPreview>(`${draftPath(id)}/preview`, { method: 'POST' })
}

/** Only for someone with `invoice.internal-note.read`; the draft read never carries the note. */
export function loadInternalNote(id: string): Promise<{ internalNote: string | null }> {
  return apiRequest<{ internalNote: string | null }>(
    `/v1/authored-invoices/${encodeURIComponent(id)}/internal-note`,
  )
}

export function loadBranches(): Promise<BranchDto[]> {
  return apiRequest<BranchDto[]>(BRANCHES_PATH)
}

/** A fresh key per attempt: the server refuses a reused key with a different body. */
export function newIdempotencyKey(): string {
  return `draft-${crypto.randomUUID()}`
}

export type IssueDraftRequest = {
  /** The draft's `version` as last read or saved. */
  expectedVersion: number
  /** The Muscat day it is issued on: not in the future, and in the current calendar year. */
  issueDate: string
  /** On or after the issue date. The server does not derive it from the terms; the client does. */
  dueDate: string
}

/**
 * Numbers, prices and freezes a draft. It sends nothing: the issued invoice's `deliveryState` stays
 * `NOT_SUBMITTED`. The key is the confirmation's, so a second click, or a retry after a lost
 * response, issues once.
 */
export function issueDraft(
  id: string,
  idempotencyKey: string,
  request: IssueDraftRequest,
): Promise<InvoiceDetailDto> {
  return apiRequest<InvoiceDetailDto>(`${draftPath(id)}/issue`, {
    method: 'POST',
    body: request,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
