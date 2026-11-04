import { apiDownload, apiRequest } from '../client'
import { ApiError } from '../errors'

/**
 * Bill intake (`BillIntakeController`): a supplier's file is stored first, then a person confirms
 * the bill's fields into a payable. A Peppol/UBL XML file is parsed exactly; a PDF or photo is read
 * by the document reader while the upload waits (EXPENDITURE.md rows 1.6 and 1.10), and says how
 * sure it was in `extracted.reading`. Reading off, failed or over the limit: nothing is filled in.
 */
export const BILL_INTAKE_PATH = '/v1/bills/intake'

/** `BillIntake.MAXIMUM_BYTES`, and the server's multipart limit. */
export const INTAKE_MAX_BYTES = 10 * 1024 * 1024

/**
 * What today's gateway lets through (`FAWTIR_GATEWAY_MAX_REQUEST_BYTES`). The screens promise this
 * size and shrink photos above it; nothing is refused here, so a server that takes more still
 * gets more. TODO: set to INTAKE_MAX_BYTES once backend #818 is deployed.
 */
export const INTAKE_LIVE_MAX_BYTES = 1024 * 1024
/** The same, for the words on the screens. */
export const INTAKE_LIVE_MAX_MB = INTAKE_LIVE_MAX_BYTES / (1024 * 1024)

export type IntakeSourceDto = 'UPLOADED' | 'SCANNED'

/** 380 a bill, 381 a supplier's credit note, 383 a supplier's debit note (`ConfirmRequest`). */
export type IntakeDocumentTypeDto = '380' | '381' | '383'
export type ExtractionStatusDto = 'NONE' | 'EXTRACTED' | 'FAILED'

/**
 * `BillDocumentReading.outcome`. `READING_UNAVAILABLE` is the shared reader's own answer; the
 * intake gives `reading: null` instead today, and it is kept here so either reads as "not read".
 */
export type ReadingOutcomeDto =
  | 'READ'
  | 'READ_FAILED'
  | 'DAILY_LIMIT_REACHED'
  | 'PLAN_FEATURE_NOT_INCLUDED'
  | 'READING_UNAVAILABLE'

/**
 * `BillDocumentReading`: what the reader said beside the values of a PDF, JPEG or PNG. Null for
 * UBL XML, while reading is off, and from a server older than the reader. A person's correction
 * (PUT) keeps it, with `workedOut` emptied.
 */
export type BillReadingDto = {
  outcome: ReadingOutcomeDto
  /** The PDF's own page count, 1 for a photo; null for a PDF that cannot be opened. */
  pageCount: number | null
  /** 0 to 1 per field, keyed as `confidence`; `lines` is the lowest line's score. */
  scores: Record<string, number>
  /** A receipt's guessed `EXPENSE_CATEGORIES` value; null for a bill or when none fits. */
  category: string | null
  categoryConfidence: number
  /** The VAT rate printed for the whole document, as a percentage. */
  vatRate: number | null
  /** Fields worked out rather than read: `vat` from the total and the rate (row 1.10). */
  workedOut: string[]
}

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
    /**
     * TODO(backend): EXPENDITURE.md M.1. The line's VAT category (S5, Z0, E0, O0), so exempt and
     * zero-rated lines (both 0%) come back apart. Absent today: the rate decides.
     */
    taxCategoryCode?: string | null
    amount: number | null
    confident: boolean
  }[]
  confidence: Record<string, boolean>
  /** Absent from a server older than the reader, which reads as null. */
  reading?: BillReadingDto | null
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
  /** A note saved on the intake earlier; confirm sends it again, it is not carried over. */
  note?: string | null
}

/**
 * `invoice.payment.manage`. PDF, JPEG, PNG or UBL XML, at most 10 MiB. With reading on, the call
 * waits for the malware scan and the read, which can pass a minute. Just above the gateway's 120 s
 * for this route and below nginx's 130 s, so the browser does not give up while the server may
 * still answer. `read: 'none'` is for a bill typed by hand with the file attached: the file is
 * stored and no read is spent on it. A server older than the option ignores it and reads as before.
 */
export function uploadIntake(
  file: File,
  source: IntakeSourceDto,
  options: { read?: 'none' } = {},
): Promise<IntakeDto> {
  const form = new FormData()
  form.append('file', file)
  const read = options.read ? `&read=${options.read}` : ''
  return apiRequest<IntakeDto>(`${BILL_INTAKE_PATH}?source=${source}${read}`, {
    method: 'POST',
    body: form,
    timeoutMs: 125_000,
  })
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
  lines: {
    description: string
    quantity: number
    /** UN/ECE Rec 20 code chosen on the row, or null (EXPENDITURE.md 7.11). */
    unit: string | null
    unitPrice: number
    vatRate: number
    /** TODO(backend): EXPENDITURE.md M.1. S5, Z0, E0 or O0; the rate alone cannot tell E0 from Z0. */
    taxCategoryCode?: string | null
    lineNet: number
  }[]
  purchaseOrderId: string | null
  goodsReceiptId: null
  purchaseOrderReference: null
  category: string | null
  /**
   * UNCL4461: `10` cash, `48` card. Petty cash is cash (`10`) with `pettyCash: true`; the server
   * then writes its fixed reference, "Petty cash", on the payment.
   */
  paidOnTheSpot: {
    methodCode: '10' | '48'
    paymentReference: null
    paidOn: string | null
    pettyCash?: true
  } | null
  /**
   * Always null (owner approval, batch 43 round 18, "Frontend Option 1"): the legacy single field
   * takes no reason, so the override is sent as `notDuplicateOfIds` with `overrideReason` only.
   * Still sent, as null, because the confirm body has always carried it.
   */
  notDuplicateOf: null
  /**
   * Every bill the refusals listed that the person says is a different bill, at most 20, sent with
   * `overrideReason`. Only after a refusal that carried `duplicates`: a server before the list
   * refuses a body with a field it does not know (fail-on-unknown-properties).
   */
  notDuplicateOfIds?: string[]
  /** Why they are different bills, trimmed, at most 280 characters; required with the list. */
  overrideReason?: string
  /**
   * TODO(backend): EXPENDITURE.md M.2. A receipt's VAT category when it has no lines (S5, Z0,
   * E0): 0% and Exempt both carry a zero rate and are otherwise sent the same.
   */
  taxCategoryCode?: string | null
  /** Free text kept on the bill, at most 500 characters. Sent only when something was typed. */
  note?: string
  /**
   * A credit or debit note's reason in the person's words (beside BTOM-032), at most 500
   * characters. Refused on a 380. Sent only by a note's upload, and only when typed.
   */
  reasonDetail?: string
  /**
   * The bill on file a credit or debit note corrects (IBT-025/026 are copied from it). On a
   * credit note (381) the server also takes the credit off that bill in the same request: the
   * largest amount that fits, any excess stays as credit, and a refusal refuses the confirm.
   */
  relatedBillId?: string
  /**
   * A credit note's "Hold it as credit": true keeps `relatedBillId` as the note's reference but
   * applies nothing (`creditApplied` null), so the whole note waits as unused credit. Absent
   * means false, which applies as above. Refused on a 380 or a 383
   * (`BILL_INTAKE_HOLD_AS_CREDIT_NOT_ALLOWED`), so it is sent only on a 381.
   */
  holdAsCredit?: boolean
}

/** `ConfirmedBillResponse`. */
export type ConfirmedBillDto = {
  id: string
  supplierBillNumber: string | null
  totalIncludingVat: number
  currencyCode: string | null
  /**
   * The credit this confirm took off the chosen bill (a credit note with `relatedBillId`), or null
   * when nothing was applied: no bill, a debit note, or a bill that already owed nothing. Absent
   * from an older server, which does not say.
   */
  creditApplied?: { billId: string; amount: number } | null
  /**
   * Whether the server holds the bill now, read from its hold store (owner approval, batch 43
   * round 25, W-1). Absent from an older server, which does not say: absent is unknown, never
   * "not held".
   */
  held?: boolean
}

export function confirmIntake(id: string, body: ConfirmIntakeDto): Promise<ConfirmedBillDto> {
  return apiRequest<ConfirmedBillDto>(`${BILL_INTAKE_PATH}/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    body,
  })
}

/** 16–128 characters of `[A-Za-z0-9._:-]`, as the API requires of an `Idempotency-Key`. */
export function newBillKey(): string {
  return `bill-${crypto.randomUUID()}`
}

/**
 * A bill typed in with no file behind it (`POST /bills`, `invoice.payment.manage`): the confirm
 * body, and no intake. There is no intake to stop a second bill, so the request carries an
 * `Idempotency-Key`, as a bill payment does: the same key with the same body is the same bill,
 * recorded once however often it is sent. The refusals are confirm's, less the two about the
 * intake itself.
 */
export function recordBillWithoutFile(
  idempotencyKey: string,
  body: ConfirmIntakeDto,
): Promise<ConfirmedBillDto> {
  return apiRequest<ConfirmedBillDto>('/v1/bills', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** `PossibleDuplicateBill`: the bill on file with the same supplier, type and number. */
export type PossibleDuplicateDto = {
  billId: string
  supplierBillNumber: string
  issueDate: string | null
  total: number | null
  currencyCode: string | null
  /** Any bill can be the one on file: the server's check does not look at where it came from. */
  source: 'PEPPOL' | 'UPLOADED' | 'SCANNED' | 'RECURRING' | 'SELF_BILLED'
}

/** The bill a 409 `BILL_INTAKE_POSSIBLE_DUPLICATE` named, or null for any other failure. */
export function possibleDuplicateOf(error: unknown): PossibleDuplicateDto | null {
  if (!(error instanceof ApiError) || error.code !== 'BILL_INTAKE_POSSIBLE_DUPLICATE') return null
  const found = error.problem.duplicateOf
  if (typeof found !== 'object' || found === null) return null
  const bill = found as Record<string, unknown>
  return typeof bill.billId === 'string' ? (bill as unknown as PossibleDuplicateDto) : null
}

const isDuplicateDto = (value: unknown): value is PossibleDuplicateDto =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).billId === 'string'

/**
 * Every bill a 409 `BILL_INTAKE_POSSIBLE_DUPLICATE` named, or null for any other failure.
 * `listed` says the refusal carried `duplicates` (oldest first, at most five per answer), which
 * only a server that takes `notDuplicateOfIds` sends; an older one names `duplicateOf` alone.
 *
 * `heldForReview` is the server's `heldForReviewIfListed` (batch 43 round 19): listing the matches
 * records the bill held for an approver. Only a literal `true` counts, so a server that does not
 * send it never has a refusal presented as a submission.
 */
export function possibleDuplicates(
  error: unknown,
): { matches: PossibleDuplicateDto[]; listed: boolean; heldForReview: boolean } | null {
  const single = possibleDuplicateOf(error)
  if (!single) return null
  const problem = (error as ApiError).problem
  const heldForReview = problem.heldForReviewIfListed === true
  const duplicates = problem.duplicates
  if (!Array.isArray(duplicates)) return { matches: [single], listed: false, heldForReview }
  const matches = duplicates.filter(isDuplicateDto)
  return { matches: matches.length > 0 ? matches : [single], listed: true, heldForReview }
}

/** `IntakePage`. `status=UNCONFIRMED` (the server's default) lists what was uploaded or scanned and never confirmed. */
export type IntakePageDto = { items: IntakeDto[]; page: number; pageSize: number; count: number }

/**
 * `source` narrows the list on the server to uploads or to receipts, so a page of twenty is twenty
 * of that kind. A server that does not know the parameter answers every kind; the caller still
 * checks each row's own `source`.
 */
export function unconfirmedIntakesPath(
  page = 0,
  pageSize = 20,
  source: IntakeSourceDto | null = null,
): string {
  const narrowed = source ? `&source=${source}` : ''
  return `${BILL_INTAKE_PATH}?status=UNCONFIRMED${narrowed}&page=${page}&page_size=${pageSize}`
}

export function loadIntakes(path: string): Promise<IntakePageDto> {
  return apiRequest<IntakePageDto>(path)
}

export function intakePath(id: string): string {
  return `${BILL_INTAKE_PATH}/${encodeURIComponent(id)}`
}

export function loadIntake(id: string): Promise<IntakeDto> {
  return apiRequest<IntakeDto>(intakePath(id))
}

/**
 * The stored bytes as a File, so an upload resumed later previews exactly as the one the person
 * just picked. The server names the file in Content-Disposition; the record's own name is the
 * fallback.
 */
export async function loadIntakeFile(intake: IntakeDto): Promise<File> {
  const download = await apiDownload(`${intakePath(intake.id)}/file`)
  return new File([download.blob], download.filename ?? intake.filename ?? 'bill', {
    type: download.blob.type || intake.contentType,
  })
}

/** `FieldsRequest`: a person's corrections. No confidence is sent — a typed field is confident by definition. */
export type IntakeCorrectionsDto = {
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
    /** TODO(backend): EXPENDITURE.md M.1. Kept with the saved line so a resumed bill keeps it. */
    taxCategoryCode?: string | null
    amount: number | null
  }[]
}

/** `UpdateRequest`. */
export type UpdateIntakeDto = {
  extracted: IntakeCorrectionsDto | null
  documentTypeCode: IntakeDocumentTypeDto | null
}

/**
 * `invoice.payment.manage`. Saves what the person has typed so far on the intake — the bytes are
 * untouched — so the bill can be finished later. Refused once the intake is confirmed
 * (`BILL_INTAKE_ALREADY_CONFIRMED`).
 */
export function updateIntake(id: string, body: UpdateIntakeDto): Promise<IntakeDto> {
  return apiRequest<IntakeDto>(intakePath(id), { method: 'PUT', body })
}
