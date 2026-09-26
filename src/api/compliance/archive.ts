import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * The compliance archive (E-07): what Fawtir holds for every document that went out or came in,
 * how long it must be kept, and where each artefact is served.
 *
 * `ComplianceDocumentsController`, `invoice.read`, read-only. Its JSON is snake_case, unlike the
 * rest of the API, so the names here are the ones on the wire.
 */

export type ArchiveDirection = 'ISSUED' | 'RECEIVED'

/** `{available, href}`: an artefact can exist with nothing serving it (an AS4 delivery notification). */
export type ArchiveArtefact = {
  available: boolean
  href: string | null
  /** The file's size, for the design's "18 KB". Not answered yet: backend ask 3.4. */
  byte_size?: number | null
  /** Whether the stored fingerprint still matches the bytes ("Verified"). Backend ask 3.5. */
  verified?: boolean | null
}

export type ArchiveArtefacts = {
  xml: ArchiveArtefact
  tdd: ArchiveArtefact
  pdf: ArchiveArtefact
  qr: ArchiveArtefact
  mls: ArchiveArtefact
  mls_count: number
  delivery_notification: ArchiveArtefact
}

export type ArchiveRetention = {
  retention_class: string
  retain_until: string | null
  under_retention: boolean
  legal_hold: { held: boolean; reason: string | null; set_by: string | null; set_at: string | null }
  /** Held or still within its retention: nothing may be removed. */
  frozen: boolean
}

export type ArchiveItemDto = {
  invoice_uuid: string
  direction: ArchiveDirection
  document_kind: string
  invoice_number: string | null
  /** `scheme:value` of the other party. */
  counterparty: string | null
  occurred_at: string
  tax_year: number
  b2c: boolean
  tdd: { status: string | null; ack: string }
  artefacts: ArchiveArtefacts
  retention: ArchiveRetention
  links: { self: string; activity: string }
  /** The other party's name, where `counterparty` is only an identifier. Backend ask 3.2. */
  counterparty_name?: string | null
  /** The document's payable total, in `currency`. Backend ask 3.3. */
  total_amount?: number | null
  currency?: string | null
  /** The document a credit or debit note is against ("AND-INV-3382"). Backend ask 3.3. */
  against_number?: string | null
  /** The fingerprint of the signed XML and when it was last checked. Backend ask 3.5. */
  integrity?: ArchiveIntegrity | null
  /** When the network delivered it, and whether its signature verified. Backend ask 3.9. */
  delivered_at?: string | null
  signature_valid?: boolean | null
  /** Records it belongs to: the customer or supplier, an order, a delivery note. Backend ask 3.10. */
  related?: ArchiveRelation[] | null
  /** Free tags on the record. Backend ask 3.11. */
  tags?: string[] | null
  /** Who opened, downloaded or shared it. Backend ask 3.12. */
  access_log?: ArchiveAccessEntry[] | null
}

export type ArchiveIntegrity = {
  /** Lower-case hex SHA-256 of the signed XML. */
  sha256: string
  taken_at: string
  last_checked_at: string | null
  matches: boolean | null
}

export type ArchiveRelation = {
  kind: 'CUSTOMER' | 'SUPPLIER' | 'ORDER' | 'DELIVERY_NOTE' | 'INVOICE'
  id: string
  label: string
  note: string | null
}

export type ArchiveAccessEntry = {
  actor_name: string | null
  action: 'OPENED' | 'DOWNLOADED' | 'SHARED_LINK_OPENED' | 'FILED'
  artefact: string | null
  at: string
  channel: string | null
}

/** The four figures over the list. Not answered yet: backend ask 3.1. */
export type ArchiveSummary = {
  documents: number
  invoices_and_bills: number
  bytes_used: number
  quota_bytes: number | null
  integrity: { all_passing: boolean; last_sweep_at: string | null } | null
  legal_hold: { count: number; reason: string | null }
}

/** How many documents each tab holds. Backend ask 3.1. */
export type ArchiveTotals = { all: number; issued: number; received: number; legal_hold: number }

/** Look-ahead paging: the server answers one more row than asked for. There is no total. */
export type ArchiveListDto = {
  items: ArchiveItemDto[]
  page: number
  page_size: number
  has_more: boolean
  summary?: ArchiveSummary | null
  totals?: ArchiveTotals | null
}

export type ArchiveFilters = {
  direction?: ArchiveDirection | ''
  documentKind?: string
  invoiceNumber?: string
  taxYear?: string
  tddStatus?: string
  from?: string
  to?: string
}

export const ARCHIVE_PAGE_SIZE = 20

export function archiveListPath(
  filters: ArchiveFilters,
  page: number,
  pageSize = ARCHIVE_PAGE_SIZE,
) {
  return withQuery('/v1/compliance/documents', {
    direction: filters.direction || undefined,
    document_kind: filters.documentKind || undefined,
    invoice_number: filters.invoiceNumber?.trim() || undefined,
    tax_year: filters.taxYear || undefined,
    tdd_status: filters.tddStatus || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page,
    page_size: pageSize,
  })
}

export function loadArchiveList(path: string): Promise<ArchiveListDto> {
  return apiRequest<ArchiveListDto>(path)
}

export function archiveItemPath(invoiceUuid: string) {
  return `/v1/compliance/documents/${encodeURIComponent(invoiceUuid)}`
}

export function loadArchiveItem(invoiceUuid: string): Promise<ArchiveItemDto> {
  return apiRequest<ArchiveItemDto>(archiveItemPath(invoiceUuid))
}

/**
 * An artefact's own bytes. The archive gives the href the server serves it at, under `/api/v1`;
 * the client already carries the `/api` base, so only the rest of the path is passed on.
 */
export function downloadArtefact(href: string): Promise<ApiDownload> {
  return apiDownload(href.replace(/^\/api/, ''))
}
