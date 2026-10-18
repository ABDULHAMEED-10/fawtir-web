/**
 * The last `fawtirConnection.leftFawtir` Settings › Billing answered with (Business Rules LV-6):
 * `unknown` before any answer this session, `absent` from a server that does not send it, otherwise
 * whether the company has left Fawtir. Every read of the billing overview records it, so a screen
 * that already read the page does not read it a second time to know whether paying is held back.
 */
export type FawtirConnectionSeen = 'unknown' | 'absent' | boolean

let seen: FawtirConnectionSeen = 'unknown'
const listeners = new Set<() => void>()

export function noteFawtirConnection(connection: { leftFawtir?: unknown } | null | undefined) {
  const next: FawtirConnectionSeen =
    connection && typeof connection.leftFawtir === 'boolean' ? connection.leftFawtir : 'absent'
  if (next === seen) return
  seen = next
  listeners.forEach((listener) => listener())
}

export function fawtirConnectionSeen(): FawtirConnectionSeen {
  return seen
}

export function subscribeFawtirConnection(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For tests only. */
export function resetFawtirConnection() {
  seen = 'unknown'
  listeners.forEach((listener) => listener())
}
