import { apiRequest } from '../client'
import { withQuery } from '../query'
import type { InvoiceDetailDto } from './detail'
import type { InvoiceLineZeroRatingWarning } from '../catalog/zeroRating'

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

/** `ItemClassificationRequest`: goods and a 12-digit HS code, or services and a CL-12-OM code. */
export type LineClassificationDto = {
  goodsOrService?: 'G' | 'S' | null
  industrialClassificationCode?: string | null
  hsCode?: string | null
  serviceTypeCode?: string | null
}

export type DraftLineRequest = {
  lineNumber: number
  /** Both absent on a free-text line; a line that cites a catalogue product states both. */
  productId?: string
  productCode?: string
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
    /** IBT-121: `VATZR-OM-nn` for a zero-rated line, `VATEX-OM-nn` for an exempt one. */
    exemptionReasonCode?: string | null
  }
  classification?: LineClassificationDto
  /**
   * Credit notes only (V473): whether the returned item goes back into stock when the note is
   * issued. Sent only on a credit-note line citing a counted product; any value on another type,
   * false included, is refused `BACK_ON_SHELF_ONLY_ON_CREDIT_NOTES`.
   */
  backOnShelf?: boolean
  /**
   * Backend #834 (V510, DA-1 Option B): on a credit note's line, the corrected invoice's line it
   * credits, so the server caps the credit per original line. Refused 400 `ORIGINAL_LINE_NOT_FOUND`
   * for a number the invoice lacks and `ORIGINAL_LINE_ONLY_ON_CORRECTIONS` on an invoice. A server
   * before #834 refuses the whole body as malformed (it refuses unknown fields), so it goes only to
   * a server that answers it (`readsLineLinks`).
   */
  originalLineNumber?: number
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
    /** UNCL4461 code with the label the reader saw (IBT-081); stored with the draft. */
    paymentMethod?: ReferenceDto | null
    transactionType: 'FULL_TAX' | 'SIMPLIFIED'
    /**
     * BTOM-001 positions 4-15. Sent only by a note whose original is SPECIAL_ZONE (position 14):
     * the server refuses a note that does not match its original with
     * CORRECTION_SPECIAL_ZONE_MISMATCH (503a8093b). Left out otherwise, so every other request
     * stays as it was.
     */
    transactionSubtypes?: string[]
    /** BTOM-032, a credit or debit note's reason: CAN, VAT, VAL, QTY or OTH. Invoices send none. */
    correctionReasonCode?: string | null
    /**
     * The composer's reason behind the code (`returnedGoods`, `freightOmitted`, …), so two reasons
     * sharing a code stay apart (INCOME.md 4.9). Never in the UBL; absent before the API kept it.
     */
    correctionReasonDetail?: string | null
    /**
     * IBT-010 and IBT-012. On a self-billed document, the TENANT's own references as buyer. On an
     * ordinary invoice the server accepts IBT-010 as the invoice's own buyer reference, applied
     * over the customer's default at issue (certification tenants still refuse it), and refuses
     * IBT-012 with `BUYER_REFERENCES_NOT_SELF_BILLED` rather than storing and dropping it.
     */
    buyerReference?: string | null
    contractReference?: string | null
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
    paymentMethod?: ReferenceDto | null
    transactionType: 'FULL_TAX' | 'SIMPLIFIED'
    correctionReasonCode?: string | null
    /**
     * The composer's reason behind the code (`returnedGoods`, `freightOmitted`, …), so two reasons
     * sharing a code stay apart (INCOME.md 4.9). Never in the UBL; absent before the API kept it.
     */
    correctionReasonDetail?: string | null
    /** Null on every document but a self-billed one. Read back so an edit can send them again. */
    buyerReference?: string | null
    contractReference?: string | null
  }
  type?:
    'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SELF_BILLED_INVOICE' | 'SELF_BILLED_CREDIT_NOTE'
  correctionOfInvoiceId?: string | null
  headerDiscount: DiscountDto
  lines: {
    lineNumber: number
    productId: string | null
    productCode: string | null
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
    exemptionReasonCode?: string | null
    /** `null` when the line states no classification. */
    classification?: LineClassificationDto | null
    /** A credit note's "Back on the shelf?" answer; null when not answered and on other types. */
    backOnShelf?: boolean | null
    /**
     * Backend #808 (INCOME.md P.23): the line's product's `keepCount`, read from the catalogue now.
     * Null when the line names no product or it is not found; absent from an older server.
     */
    keepCount?: boolean | null
    /** Backend #834: the corrected invoice's line this note line names. */
    originalLineNumber?: number | null
  }[]
  /** Zero-rating warnings per line (INCOME.md Z.11, Z.13): never blocking; absent before the API. */
  warnings?: InvoiceLineZeroRatingWarning[] | null
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
  /** Zero-rating warnings per line, judged on the draft's date (Z.10, Z.11). Never blocking. */
  warnings?: InvoiceLineZeroRatingWarning[] | null
}

export type BranchDto = {
  id: string
  code: string
  name: string
  /**
   * `type` and `city` come only to a reader with `branch.read`: the lookup the stock, till and
   * catalogue readers get without it is `{id, code, name, nameAr}` (backend C3 65fc3ad41, owner
   * B-5 decision 4), so nothing may rely on them being there.
   */
  type?: string
  city?: string | null
  /** The Arabic name, when the server sends it; `useBranchName` falls back to the overview's. */
  nameAr?: string | null
}

const draftPath = (id: string) => `${INVOICE_DRAFTS_PATH}/${encodeURIComponent(id)}`

export function createDraft(idempotencyKey: string, draft: DraftRequest): Promise<DraftResponse> {
  return apiRequest<DraftResponse>(INVOICE_DRAFTS_PATH, {
    method: 'POST',
    body: { type: 'INVOICE', draft },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/**
 * A self-billed invoice draft (389), on its own route and its own permission
 * (`selfbilling.create`).
 *
 * The body is the ordinary draft content — the server takes the same `InvoiceDraftRequest` — but
 * it is NOT wrapped in `{type, draft}` the way `/invoice-drafts` is, and the type comes from the
 * route rather than the body. Editing afterwards goes through the shared draft routes: there is
 * one draft store, and a second edit path would eventually disagree with the first.
 */
export function createSelfBilledDraft(
  idempotencyKey: string,
  draft: DraftRequest,
): Promise<DraftResponse> {
  return apiRequest<DraftResponse>('/v1/self-billed-invoice-drafts', {
    method: 'POST',
    body: draft,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export type NoteKind = 'CREDIT_NOTE' | 'DEBIT_NOTE'

/** The note routes under an issued document: the two sales notes and the self-billed credit note. */
export type NoteRouteKind = NoteKind | 'SELF_BILLED_CREDIT_NOTE'

const NOTE_ROUTE: Record<NoteRouteKind, string> = {
  CREDIT_NOTE: 'credit-notes',
  DEBIT_NOTE: 'debit-notes',
  SELF_BILLED_CREDIT_NOTE: 'self-billed-credit-notes',
}

/**
 * A note draft against an issued document: a credit or debit note on an invoice
 * (`creditnote.create` / `debitnote.create`), or a self-billed credit note (IBT-003 261) on an
 * issued self-billed invoice (`selfbilling.create`; the server refuses any other predecessor with
 * `CORRECTED_INVOICE_NOT_ISSUED`). The body is the ordinary draft content: the server copies
 * nothing from the invoice.
 */
export function createNote(
  kind: NoteRouteKind,
  invoiceId: string,
  idempotencyKey: string,
  draft: DraftRequest,
): Promise<DraftResponse> {
  const route = NOTE_ROUTE[kind]
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
