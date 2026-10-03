import { apiRequest } from '../client'

/**
 * The Extraction Bridge: a signed-in user uploads one document their ERP produced, in the ERP's
 * own shape, and the tenant's mapping turns it into an invoice.
 *
 * `POST /v1/invoices/bridge` takes the ordinary submission body with `source` required. There is
 * no file part: a JSON document rides as an object and an XML document as a string, exactly as on
 * `POST /v1/invoices`. The route needs `invoice.submit`, refuses API keys, and accepts standard
 * invoices only.
 */
export const BRIDGE_UPLOAD_PATH = '/v1/invoices/bridge'

/** The two source formats a mapping profile is kept for. */
export type BridgeFormat = 'JSON' | 'XML'

/**
 * The request, field by field. Built only by {@link buildBridgeRequest}, so nothing the form holds
 * for itself (the file, its name, the checkbox state) can reach the wire.
 *
 * `document` is an object for `JSON` and the markup itself, as a string, for `XML`. The server
 * refuses the other pairing by name.
 */
export type BridgeUploadRequest = {
  format: BridgeFormat
  document: Record<string, unknown> | string
  supplement: {
    /** `HH:mm:ss`. */
    issue_time: string
    /** BTOM-001, `^[X1]{20}$`. */
    transaction_type: string
  }
  source: {
    external_document_id: string
    /** Absent rather than empty: the server keys deduplication on it. */
    external_version?: string
  }
}

/**
 * `ACCEPTED`: this upload produced the invoice. `DUPLICATE`: an earlier upload of the same identity
 * and content already did, and nothing was submitted this time.
 */
export type BridgeDisposition = 'ACCEPTED' | 'DUPLICATE'

/**
 * The submission receipt, reduced to what the screen reads. The rest of the body (transport and
 * tax-report state at the moment of acceptance) is left out: it changes as soon as the invoice
 * moves, and the compliance ledger is where it is shown as it stands.
 */
export type BridgeUploadResponseDto = {
  id: string
  invoice_uuid: string | null
  source?: {
    external_document_id: string
    external_version?: string
    disposition: BridgeDisposition
  }
}

/**
 * One key per upload the user means to make. A retry of the same request after a timeout or a
 * dropped connection must reuse it, so the server can tell a repeat from a new upload.
 */
export function newBridgeUploadKey(): string {
  return `bridge-upload-${crypto.randomUUID()}`
}

export function uploadThroughBridge(
  request: BridgeUploadRequest,
  idempotencyKey: string,
): Promise<BridgeUploadResponseDto> {
  return apiRequest<BridgeUploadResponseDto>(BRIDGE_UPLOAD_PATH, {
    method: 'POST',
    body: request,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** The one place a request is assembled, so the field list is decided once. */
export function buildBridgeRequest(input: {
  format: BridgeFormat
  document: Record<string, unknown> | string
  issueTime: string
  transactionType: string
  externalDocumentId: string
  externalVersion: string
}): BridgeUploadRequest {
  const version = input.externalVersion.trim()
  return {
    format: input.format,
    document: input.document,
    supplement: {
      issue_time: input.issueTime.length === 5 ? `${input.issueTime}:00` : input.issueTime,
      transaction_type: input.transactionType,
    },
    source: {
      external_document_id: input.externalDocumentId.trim(),
      ...(version === '' ? {} : { external_version: version }),
    },
  }
}
