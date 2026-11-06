import { resolvePosSaleKey, type PosSaleDto } from '../api/pos/pos'
import { keyMayBeQueued } from './posQueue'
import { settleHeldKey, type UncertainSale } from './posSale'

/**
 * RESEND-AUTH (owner decision 5, backend 98c0066cb): a held sale whose details this device could not
 * keep is decided by the server, never by the cashier. Only a server answer releases the hold:
 * offline, an error, a 404 or an answer this build does not know all leave it locked. `released` is
 * false when the hold had already gone by the time the answer came (RW6-4): nothing is shown then.
 */
export type HeldCheck =
  | { outcome: 'recorded'; sale: PosSaleDto; released: boolean }
  | { outcome: 'notRecorded'; released: boolean }
  | { outcome: 'inProgress'; retryAfterSeconds: number }
  | { outcome: 'queued' }
  | { outcome: 'failed'; error: unknown }

/** The server's own Retry-After for IN_PROGRESS (backend 98c0066cb), when the header is not readable. */
const IN_PROGRESS_RETRY_SECONDS = 2

export async function checkHeldWithServer(
  held: Pick<UncertainSale, 'tillId' | 'key'>,
): Promise<HeldCheck> {
  // RA-1: NOT_RECORDED would close a key the queue still has to file its printed sale under.
  if (keyMayBeQueued(held.key)) return { outcome: 'queued' }
  let answer
  try {
    // RA-3: the till the hold was made on, as its lock entry names it, not the till now open.
    answer = await resolvePosSaleKey(held.tillId, held.key)
  } catch (error) {
    return { outcome: 'failed', error }
  }
  if (answer.status === 'RECORDED' && answer.sale) {
    return { outcome: 'recorded', sale: answer.sale, released: settleHeldKey(held.key) }
  }
  if (answer.status === 'NOT_RECORDED') {
    return { outcome: 'notRecorded', released: settleHeldKey(held.key) }
  }
  if (answer.status === 'IN_PROGRESS') {
    return {
      outcome: 'inProgress',
      retryAfterSeconds: answer.retryAfterSeconds ?? IN_PROGRESS_RETRY_SECONDS,
    }
  }
  return { outcome: 'failed', error: null }
}
