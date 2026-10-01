import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'
import type { BillRowDto } from './bills'
import { supplierPath } from './suppliers'

/**
 * One supplier's record beyond its profile (`SupplierController`): the overview header, the bills,
 * payments, purchases, documents, contacts and statement exports, and the purchase orders raised to
 * them. All `supplier.read` unless a function says otherwise.
 */

export type PayablesBucketDto = { amount: number; bills: number; nextDue: string | null }

/** `SupplierOverview`. A held bill counts only in `onHold`; "due soon" is within 7 days. */
export type SupplierOverviewDto = {
  /**
   * `bills` counts every document (the Bills tab). `openBills` counts the bills still owed, in any
   * currency: the same rule as the list row's `youOwe.openBills`. Typed optional because a server
   * older than the field leaves it out.
   */
  tabs: { bills: number; payments: number; orders: number; documents: number; openBills?: number }
  /** Of the bills backed by an order, how many agreed with it. `summary` is English and not shown. */
  match: { agreed: number; orderBacked: number; summary: string | null }
  usualLeadTimeDays: number | null
  payables: {
    currencyCode: string
    notDue: PayablesBucketDto
    dueSoon: PayablesBucketDto
    late: PayablesBucketDto
    onHold: PayablesBucketDto
    everLate: boolean
    total: number
  }
}

export function supplierOverviewPath(id: string) {
  return `${supplierPath(id)}/overview`
}

export function loadSupplierOverview(id: string): Promise<SupplierOverviewDto> {
  return apiRequest<SupplierOverviewDto>(supplierOverviewPath(id))
}

/**
 * @param open `true` asks for the open bills only: bills (not credit notes) that still owe
 *        something and were not rejected, held ones included. Left out, every document is listed.
 */
export function supplierBillsPath(id: string, page: number, pageSize: number, open = false) {
  return withQuery(`${supplierPath(id)}/bills`, {
    open: open ? true : undefined,
    page,
    page_size: pageSize,
  })
}

/** Newest issue date first. No total unless open bills were asked for: `hasMore` is a full page. */
export async function loadSupplierBills(path: string): Promise<Page<BillRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<BillRowDto>>(path))
}

/** `BillPayment`. A row names its bill by id only. */
export type SupplierPaymentDto = {
  id: string
  billId: string
  entryType: 'PAYMENT' | 'REVERSAL'
  reversalOfPaymentId: string | null
  amount: number
  currency: string
  methodCode: string | null
  paymentReference: string | null
  paymentDate: string | null
  occurredAt: string
}

export function supplierPaymentsPath(id: string, page: number, pageSize: number) {
  return withQuery(`${supplierPath(id)}/payments`, { page, page_size: pageSize })
}

export async function loadSupplierPayments(path: string): Promise<Page<SupplierPaymentDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<SupplierPaymentDto>>(path))
}

export type SupplierPurchaseDto = {
  description: string
  unit: string | null
  currencyCode: string
  totalQuantity: number
  totalAmount: number
  billCount: number
}

export function supplierPurchasesPath(id: string, months = 12) {
  return withQuery(`${supplierPath(id)}/purchases`, { months })
}

export function loadSupplierPurchases(path: string): Promise<SupplierPurchaseDto[]> {
  return apiRequest<SupplierPurchaseDto[]>(path)
}

export type DocumentKind = 'AGREEMENT' | 'CERTIFICATE' | 'PRICE_LIST' | 'CORRESPONDENCE' | 'OTHER'
export type DocumentStanding = 'CURRENT' | 'SUPERSEDED' | 'ON_FILE'

export type SupplierDocumentDto = {
  document: {
    id: string
    title: string
    kind: DocumentKind
    series: string | null
    version: number | null
    documentDate: string | null
    provenance: 'UPLOADED' | 'SIGNED' | 'EMAILED' | 'RECEIVED' | null
    note: string | null
    contentType: string
    byteSize: number
    uploadedAt: string
    retentionClass: string | null
    /** An administrator's freeze (decision 17): the paper stays whatever its retention date says. */
    legalHold: { held: boolean; reason: string | null; setBy: string | null; setAt: string | null }
    /** VAT Law Art. 70: the paper cannot be removed on or before this day. */
    retainUntil: string | null
  }
  standing: DocumentStanding
}

export function supplierDocumentsPath(id: string) {
  return `${supplierPath(id)}/documents`
}

export function loadSupplierDocuments(id: string): Promise<SupplierDocumentDto[]> {
  return apiRequest<SupplierDocumentDto[]>(supplierDocumentsPath(id))
}

export type NewSupplierDocument = {
  file: File
  title: string
  kind: DocumentKind
  series: string
  documentDate: string
  note: string
}

/** `supplier.manage`; at most 10 MiB. A later document in the same series supersedes the earlier one. */
export function uploadSupplierDocument(
  id: string,
  document: NewSupplierDocument,
): Promise<unknown> {
  const form = new FormData()
  form.append('file', document.file)
  form.append('title', document.title.trim())
  form.append('kind', document.kind)
  if (document.series.trim()) form.append('series', document.series.trim())
  if (document.documentDate) form.append('documentDate', document.documentDate)
  if (document.note.trim()) form.append('note', document.note.trim())
  return apiRequest<unknown>(supplierDocumentsPath(id), { method: 'POST', body: form })
}

export function downloadSupplierDocument(id: string, documentId: string): Promise<ApiDownload> {
  return apiDownload(`${supplierDocumentsPath(id)}/${encodeURIComponent(documentId)}/content`)
}

/** `supplier.manage`. Refused under a legal hold or inside the retention period. */
export async function retireSupplierDocument(id: string, documentId: string): Promise<void> {
  await apiRequest<unknown>(`${supplierDocumentsPath(id)}/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  })
}

export type ContactPurpose = 'MAIN' | 'BILLING' | 'DELIVERY' | 'OTHER'

export type SupplierContactDto = {
  id: string
  fullName: string
  roleTitle: string | null
  purpose: ContactPurpose
  email: string | null
  telephone: string | null
  mobilePhone: string | null
  notes: string | null
  version: number
}

export type ContactRequestDto = Omit<SupplierContactDto, 'id' | 'version'> & { version?: number }

export function supplierContactsPath(id: string) {
  return `${supplierPath(id)}/contacts`
}

export function loadSupplierContacts(id: string): Promise<SupplierContactDto[]> {
  return apiRequest<SupplierContactDto[]>(supplierContactsPath(id))
}

/** `supplier.manage`. Only one MAIN: promote with {@link makeMainContact}, not by saving a second MAIN. */
export function addSupplierContact(
  id: string,
  contact: ContactRequestDto,
): Promise<SupplierContactDto> {
  return apiRequest<SupplierContactDto>(supplierContactsPath(id), { method: 'POST', body: contact })
}

export function updateSupplierContact(
  id: string,
  contactId: string,
  contact: ContactRequestDto,
): Promise<SupplierContactDto> {
  return apiRequest<SupplierContactDto>(
    `${supplierContactsPath(id)}/${encodeURIComponent(contactId)}`,
    { method: 'PUT', body: contact },
  )
}

/** `supplier.manage`. The main contact cannot go while others remain (400). */
export async function removeSupplierContact(id: string, contactId: string): Promise<void> {
  await apiRequest<unknown>(`${supplierContactsPath(id)}/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
  })
}

/** One transaction: the old main takes this contact's purpose. Answers the contacts after the swap. */
export function makeMainContact(
  id: string,
  contactId: string,
  version: number,
): Promise<SupplierContactDto[]> {
  return apiRequest<SupplierContactDto[]>(
    `${supplierContactsPath(id)}/${encodeURIComponent(contactId)}/make-main`,
    {
      method: 'POST',
      body: { version },
    },
  )
}

export type StatementFormat = 'pdf' | 'xlsx' | 'csv'

export function downloadSupplierStatement(
  id: string,
  format: StatementFormat,
  from: string,
  to: string,
): Promise<ApiDownload> {
  return apiDownload(withQuery(`${supplierPath(id)}/statement.${format}`, { from, to }))
}

export type StatementEntryKind = 'BILL' | 'CREDIT_NOTE' | 'PAYMENT' | 'REVERSAL'

/** `SupplierStatement.Issuer`: the tenant's registered company; any part may be missing. */
export type StatementIssuerDto = {
  legalName: string | null
  legalNameAr: string | null
  vatNumber: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressLine3: string | null
  city: string | null
  postalCode: string | null
  countrySubdivision: string | null
  country: string | null
}

/**
 * `SupplierStatement`. Entry amounts are positive and the kind gives the direction (a bill and a
 * reversal add, a credit note and a payment take away); `closing` is `opening` plus the entries.
 * Rejected bills are not on it. `ageing` is what is open today, whatever the period.
 */
export type SupplierStatementDto = {
  supplierId: string
  currencyCode: string
  from: string
  to: string
  opening: number
  bills: number
  credits: number
  payments: number
  closing: number
  entries: {
    date: string
    kind: StatementEntryKind
    documentId: string
    reference: string | null
    amount: number
    runningBalance: number
    /**
     * The design's line under the reference ("Against PO-0021 · matched in full", "Bank transfer ·
     * ref BM-4471-0916 · settled MR-INV-8712"). Not answered yet: backend ask 7.13.
     */
    detail?: string | null
    /** What is still owed on a bill entry, so an open bill can be shaded. Backend ask 7.13. */
    outstanding?: number | null
  }[]
  ageing: { NOT_DUE: number; DUE_WITHIN_30: number; LATE_30: number; LATE_60_PLUS: number }
  /** Bills and next due date behind each ageing figure (the design's "1 bill · due 28 Aug"). Backend ask 7.14. */
  ageingDetail?: Partial<
    Record<StatementAgeingBucket, { bills: number; nextDue: string | null }>
  > | null
  /** Whether any bill of theirs was ever paid late (the design's "Never been late with them"). Backend ask 7.14. */
  everLate?: boolean | null
  /** Credit notes on the statement not yet applied to a bill (the footer's "1 credit note still unused"). Backend ask 7.15. */
  unusedCredits?: number | null
  issuer: StatementIssuerDto | null
}

export type StatementAgeingBucket = 'NOT_DUE' | 'DUE_WITHIN_30' | 'LATE_30' | 'LATE_60_PLUS'

export function supplierStatementPath(id: string, from: string, to: string) {
  return withQuery(`${supplierPath(id)}/statement`, { from, to })
}

export function loadSupplierStatement(path: string): Promise<SupplierStatementDto> {
  return apiRequest<SupplierStatementDto>(path)
}

/**
 * `supplier.manage`. Mails the statement's PDF to an address already on the supplier's record; the
 * server refuses any other, a switched-off supplier, and a deployment without e-mail delivery.
 */
export function emailSupplierStatement(
  id: string,
  from: string,
  to: string,
  recipient: string,
): Promise<{ recipient: string }> {
  return apiRequest<{ recipient: string }>(
    withQuery(`${supplierPath(id)}/statement/email`, { from, to }),
    {
      method: 'POST',
      body: { recipient },
    },
  )
}

export type PurchaseOrderRowDto = {
  id: string
  number: string | null
  state:
    | 'DRAFT'
    | 'AWAITING_APPROVAL'
    | 'APPROVED'
    | 'SENT'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CLOSED'
    | 'CANCELLED'
  orderDate: string | null
  wantedBy: string | null
  currency: string
  totalGross: number | null
}

/** `purchase-order.read`. */
export function supplierOrdersPath(id: string, page: number, pageSize: number) {
  return withQuery('/v1/purchase-orders', { supplierId: id, page, page_size: pageSize })
}

export async function loadSupplierOrders(path: string): Promise<Page<PurchaseOrderRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<PurchaseOrderRowDto>>(path))
}
