import { ApiError } from '../api'
import type {
  BillDetailDto,
  BillHoldDto,
  BillRowDto,
} from '../api/expenditure/bills'

/**
 * A later Peppol copy of a bill already on file, held until a person decides whether it is the
 * same debt again (V493, owner decision D8: flagged for the user, never merged automatically).
 *
 * Read from `duplicateHold` when the server sends it, and otherwise from the hold's own
 * `duplicateOfBillId`, so a server before `duplicateHold` still shows the hold for what it is and
 * never offers the plain release it would refuse (BILL_HOLD_DUPLICATE_RELEASE_REFUSED).
 */
export type DuplicateState = 'suspected' | 'confirmed' | 'notDuplicate'

export type DuplicateCheck = {
  originalId: string
  /** The earlier bill's supplier number; null when the server did not send it. */
  originalNumber: string | null
  state: DuplicateState
  /** Null when the server did not say (one before `duplicateHold`): the server still decides. */
  sameDocumentUuid: boolean | null
  /** The hold that carries the decision, for who decided, when and why. */
  hold: BillHoldDto | null
}

/** The row's duplicate hold, or null for a bill not held as one. Only open holds reach a row. */
export function rowDuplicateOf(
  row: Pick<BillRowDto, 'hold' | 'duplicateHold'>,
): Pick<DuplicateCheck, 'originalId' | 'originalNumber' | 'state' | 'sameDocumentUuid'> | null {
  if (row.duplicateHold) {
    return {
      originalId: row.duplicateHold.duplicateOfBillId,
      originalNumber: row.duplicateHold.duplicateOfBillNumber,
      state: row.duplicateHold.resolution === 'CONFIRMED_DUPLICATE' ? 'confirmed' : 'suspected',
      sameDocumentUuid: row.duplicateHold.sameDocumentUuid,
    }
  }
  const original = row.hold?.duplicateOfBillId
  if (!original) return null
  return {
    originalId: original,
    originalNumber: null,
    state: row.hold?.duplicateResolution === 'CONFIRMED_DUPLICATE' ? 'confirmed' : 'suspected',
    sameDocumentUuid: null,
  }
}

/**
 * The bill's duplicate check: the open duplicate hold, or once it was decided not a duplicate,
 * the released hold that records that decision, so the result stays on the page.
 */
export function duplicateCheckOf(detail: BillDetailDto): DuplicateCheck | null {
  const open = detail.hold?.duplicateOfBillId ? detail.hold : null
  const fromRow = rowDuplicateOf(detail.bill)
  if (fromRow) {
    return { ...fromRow, hold: open ?? latestDuplicateHold(detail.holdHistory) }
  }
  const decided = latestDuplicateHold(detail.holdHistory)
  if (!decided?.duplicateOfBillId || decided.duplicateResolution !== 'NOT_DUPLICATE') return null
  return {
    originalId: decided.duplicateOfBillId,
    originalNumber: null,
    state: 'notDuplicate',
    sameDocumentUuid: null,
    hold: decided,
  }
}

/** History is newest first, as the server sends it. */
function latestDuplicateHold(history: readonly BillHoldDto[]): BillHoldDto | null {
  return history.find((hold) => Boolean(hold.duplicateOfBillId)) ?? null
}

/** Whether the bill's open hold is a duplicate hold, which only a decision releases. */
export function heldAsDuplicate(detail: Pick<BillDetailDto, 'hold' | 'bill'>): boolean {
  return Boolean(detail.hold?.duplicateOfBillId) || Boolean(detail.bill.duplicateHold)
}

export type DuplicateActions = {
  confirm: boolean
  notDuplicate: boolean
  /** "Not a duplicate" is withheld because both copies share a document UUID. */
  sameUuidBlocked: boolean
}

/**
 * What the reader may decide. Only an undecided copy is decided, and only with `invoice.approve`:
 * NOT_DUPLICATE makes the copy payable, a decision kept apart from the payment permission.
 */
export function duplicateActionsOf(check: DuplicateCheck | null, canApprove: boolean): DuplicateActions {
  if (!check || check.state !== 'suspected' || !canApprove) {
    return { confirm: false, notDuplicate: false, sameUuidBlocked: false }
  }
  const sameUuidBlocked = check.sameDocumentUuid === true
  return { confirm: true, notDuplicate: !sameUuidBlocked, sameUuidBlocked }
}

/** The refusals that belong to the note field rather than to the dialog as a whole. */
export function isNoteRefusal(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'BILL_DUPLICATE_RESOLUTION_NOTE_REQUIRED' ||
      error.code === 'BILL_DUPLICATE_RESOLUTION_NOTE_TOO_LONG')
  )
}

/**
 * The refusals after which what the page shows is stale: someone else decided, or the hold
 * changed. The page reads the bill again so the card says where it stands now.
 */
export function refusalMeansStale(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 409 || error.status === 404) &&
    !isNoteRefusal(error)
  )
}
