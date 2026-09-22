import { apiRequest } from '../client'
import { ApiError } from '../errors'

/**
 * Bill intake (`BillIntakeController`): a supplier's file is stored first, then a person confirms
 * the bill's fields into a payable. There is no OCR: a PDF or photo comes back with nothing read,
 * and only a Peppol/UBL XML file fills its fields in (`extractionStatus: EXTRACTED`).
 */
export const BILL_INTAKE_PATH = '/v1/bills/intake'

/** `BillIntake.MAXIMUM_BYTES`, and the server's multipart limit. */
export const INTAKE_MAX_BYTES = 10 * 1024 * 1024

export type IntakeSourceDto = 'UPLOADED' | 'SCANNED'

/** 380 a bill, 381 a supplier's credit note, 383 a supplier's debit note (`ConfirmRequest`). */
export type IntakeDocumentTypeDto = '380' | '381' | '383'
export type ExtractionStatusDto = 'NONE' | 'EXTRACTED' | 'FAILED'

/** `ExtractedBillFields`. Every value is advice; confirm takes the person's fields. */
export type ExtractedFieldsDto = {
  supplierName: string | null
  supplierVatNumber: string | null
  billNumber: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string | null
  net: number | null
  vat: number | null
  total: number | null
  lines: {
    description: string | null
    quantity: number | null
    unitPrice: number | null
    vatRate: number | null
    amount: number | null
    confident: boolean
  }[]
  confidence: Record<string, boolean>
}

/** `IntakeResponse`. */
export type IntakeDto = {
  id: string
  source: IntakeSourceDto
  filename: string | null
  contentType: string
  byteSize: number
  sha256: string
  documentTypeCode: string | null
  extractionStatus: ExtractionStatusDto
  extracted: ExtractedFieldsDto
  confirmedBillId: string | null
  workflowState: string | null
  uploadedAt: string
}

/** `invoice.payment.manage`. PDF, JPEG, PNG or UBL XML, at most 10 MiB. */
export function uploadIntake(file: File, source: IntakeSourceDto): Promise<IntakeDto> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<IntakeDto>(`${BILL_INTAKE_PATH}?source=${source}`, { method: 'POST', body: form, timeoutMs: 60_000 })
}

/** Removes an intake nobody confirmed, so an abandoned upload leaves no row behind. */
export async function discardIntake(id: string): Promise<void> {
  await apiRequest<unknown>(`${BILL_INTAKE_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** `ConfirmRequest`. */
export type ConfirmIntakeDto = {
  supplierId: string | null
  supplierName: string | null
  /**
   * What kind of document the person is confirming. `ConfirmRequest` accepts `380|381|383`:
   * a bill, a supplier's credit note, or a supplier's debit note. The same intake endpoint
   * takes all three — the type is what decides which way the money points, so it is a field
   * the caller states rather than one the file is trusted to declare.
   */
  documentTypeCode: IntakeDocumentTypeDto
  billNumber: string | null
  issueDate: string
  dueDate: string | null
  currency: string
  vat: number | null
  total: number
  lines: { description: string; quantity: number; unit: null; unitPrice: number; vatRate: number; lineNet: number }[]
  purchaseOrderId: string | null
  goodsReceiptId: null
  purchaseOrderReference: null
  category: string | null
  /** UNCL4461: `10` cash, `48` card. */
  paidOnTheSpot: { methodCode: '10' | '48'; paymentReference: null; paidOn: string | null } | null
  /** The bill a possible-duplicate refusal named, which the person says is a different bill. */
  notDuplicateOf: string | null
}

/** `ConfirmedBillResponse`. */
export type ConfirmedBillDto = {
  id: string
  supplierBillNumber: string | null
  totalIncludingVat: number
  currencyCode: string | null
}

export function confirmIntake(id: string, body: ConfirmIntakeDto): Promise<ConfirmedBillDto> {
  return apiRequest<ConfirmedBillDto>(`${BILL_INTAKE_PATH}/${encodeURIComponent(id)}/confirm`, { method: 'POST', body })
}

/** `PossibleDuplicateBill`: the bill on file with the same supplier, type and number. */
export type PossibleDuplicateDto = {
  billId: string
  supplierBillNumber: string
  issueDate: string | null
  total: number | null
  currencyCode: string | null
  source: 'PEPPOL' | 'UPLOADED' | 'SCANNED'
}

/** The bill a 409 `BILL_INTAKE_POSSIBLE_DUPLICATE` named, or null for any other failure. */
export function possibleDuplicateOf(error: unknown): PossibleDuplicateDto | null {
  if (!(error instanceof ApiError) || error.code !== 'BILL_INTAKE_POSSIBLE_DUPLICATE') return null
  const found = error.problem.duplicateOf
  if (typeof found !== 'object' || found === null) return null
  const bill = found as Record<string, unknown>
  return typeof bill.billId === 'string' ? (bill as unknown as PossibleDuplicateDto) : null
}
