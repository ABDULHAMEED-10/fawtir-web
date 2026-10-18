import { ApiError } from '../api'
import { resetFawtirConnection } from './fawtirConnection'

/** The server's refusal of any new bill, payment or order once the company has left Fawtir (LV-6). */
export const DISCONNECTED_FROM_FAWTIR = 'disconnected-from-fawtir'

let refused = false
const listeners = new Set<() => void>()

/**
 * Remembers, for this session, that the server refused a payment because the company has left
 * Fawtir, and says whether `error` was that refusal. A role that may pay but cannot read the
 * danger zone's view (`admin.settings.manage`) has no other way to know: no read open to it
 * carries the company's connection. Once seen, every way to pay is held back on every screen, as
 * it is for a role that can read the view.
 */
export function noteLeftFawtirRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.problemType !== DISCONNECTED_FROM_FAWTIR) return false
  if (!refused) {
    refused = true
    listeners.forEach((listener) => listener())
  }
  return true
}

export function refusedAsLeftFawtir(): boolean {
  return refused
}

export function subscribeLeftFawtirRefusal(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For tests only. Also forgets the last `fawtirConnection` Settings › Billing answered with. */
export function resetLeftFawtirRefusal() {
  refused = false
  listeners.forEach((listener) => listener())
  resetFawtirConnection()
}
