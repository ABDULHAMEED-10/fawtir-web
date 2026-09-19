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
export type ArchiveArtefact = { available: boolean; href: string | null }

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
}

/** Look-ahead paging: the server answers one more row than asked for. There is no total. */
export type ArchiveListDto = {
  items: ArchiveItemDto[]
  page: number
  page_size: number
  has_more: boolean
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

export function archiveListPath(filters: ArchiveFilters, page: number, pageSize = ARCHIVE_PAGE_SIZE) {
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
