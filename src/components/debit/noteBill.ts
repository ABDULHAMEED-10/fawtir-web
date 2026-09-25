import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  BILLS_PATH,
  billListPath,
  loadBill,
  loadBillPage,
  type BillDetailDto,
  type BillRowDto,
} from '../../api/expenditure/bills'

/**
 * The bill a supplier note is set against, as the frames need it drawn (its total, what is still
 * owed, its due date, its state).
 *
 * A credit note carries the bill's id when exactly one bill carries the credit; a debit note
 * carries only the number the supplier wrote (`relatesTo`). With an id the bill is read directly.
 * With a number it is looked up among this supplier's bills, narrowed by the server, and taken
 * only on an exact match of the number: a near match would draw the wrong bill's figures.
 *
 * TODO(backend): `relatesTo.billId` on `GET /v1/debit-notes` rows, and `credits.billId` on a
 * credit note whose bill is on file but not yet applied, would make this a single read (row 5.5
 * in EXPENDITURE_DESIGN_REALIGNMENT_BACKEND_ASKS.md).
 */
export function useNoteBill({
  billId,
  billNumber,
  supplierId,
}: {
  billId: string | null
  billNumber: string | null
  supplierId: string | null
}): { bill: BillRowDto | null; detail: BillDetailDto | null; loading: boolean } {
  const directKey = billId ? `${BILLS_PATH}/${encodeURIComponent(billId)}` : null
  const direct = useApiRead<BillDetailDto>(directKey, () => loadBill(billId!))

  const searchPath =
    !billId && billNumber
      ? billListPath({
          filter: 'ALL',
          q: billNumber,
          source: null,
          sort: 'NEWEST',
          supplierId,
          page: 0,
          pageSize: 10,
        })
      : null
  const found = useApiRead<Page<BillRowDto>>(searchPath, () => loadBillPage(searchPath!))

  // A detail answer is trusted only when it has the shape of one: the mocks some tests use
  // answer every /bills path with a list, and a list read as a detail would throw in render.
  const detail =
    direct.read.status === 'ready' &&
    direct.read.data &&
    typeof direct.read.data === 'object' &&
    'bill' in direct.read.data
      ? direct.read.data
      : null
  if (detail) return { bill: detail.bill, detail, loading: false }

  const wanted = (billNumber ?? '').trim().toLowerCase()
  const match =
    found.read.status === 'ready' && Array.isArray(found.read.data?.items)
      ? (found.read.data.items.find(
          (row) =>
            (row.supplierBillNumber ?? '').trim().toLowerCase() === wanted && row.id !== billId,
        ) ?? null)
      : null
  return {
    bill: match,
    detail: null,
    loading: direct.read.status === 'loading' || found.read.status === 'loading',
  }
}

/**
 * The note's own row in the bills table: a supplier's credit or debit note is filed as a bill
 * of type 381 / 383, so `GET /v1/bills/{id}` answers with its lines, the file it came in as and
 * its arrival trail, none of which the note endpoints carry. Taken only when the answer has a
 * detail's shape; a server that keeps notes out of BillController leaves the sections empty and
 * the page says so.
 */
export function useNoteOwnBill(noteId: string | null): BillDetailDto | null {
  const key = noteId ? `${BILLS_PATH}/${encodeURIComponent(noteId)}` : null
  const own = useApiRead<BillDetailDto>(key, () => loadBill(noteId!))
  return own.read.status === 'ready' &&
    own.read.data &&
    typeof own.read.data === 'object' &&
    'bill' in own.read.data
    ? own.read.data
    : null
}
