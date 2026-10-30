import { useEffect, useState } from 'react'
import { matchPosConsumer, type PosConsumerMatch } from '../api/pos/pos'
import { tillContact } from './posContact'

/**
 * "Matches customer on file": the customer a full invoice to the buyer typed at the till would be
 * filed against (the server's own matching rule, `POST /pos/customers/match`), when it is stored
 * under another name, so a mistyped ID is caught before the invoice is filed. Never blocks the
 * sale: an older server without the lookup, a refusal or no connection all show nothing.
 */

/** Shortest ID worth looking up: below it the cashier is still typing. */
export const MATCH_MIN_ID = 4
/** Pause after the last keystroke before the lookup goes. */
export const MATCH_DEBOUNCE_MS = 500

export type BuyerTyped = { name: string; scheme: string; value: string; contact: string }

/** The lookup's body, or null when there is nothing to look up yet. */
export function matchRequest(tillId: string, buyer: BuyerTyped) {
  const name = buyer.name.trim()
  const identifierValue = buyer.value.trim()
  const contact = tillContact(buyer.contact)
  if (!name || identifierValue.length < MATCH_MIN_ID || !contact.ok) return null
  return { tillId, name, contact: contact.value, identifierScheme: buyer.scheme, identifierValue }
}

/** The match worth saying: one stored under a name other than the one typed. */
export function hintOf(found: PosConsumerMatch | null | undefined): PosConsumerMatch | null {
  return found && found.match !== 'none' && found.name && !found.sameName ? found : null
}

export function useBuyerMatch(tillId: string, buyer: BuyerTyped, enabled: boolean) {
  const [hint, setHint] = useState<PosConsumerMatch | null>(null)
  const request = enabled ? matchRequest(tillId, buyer) : null
  const key = request ? JSON.stringify(request) : ''
  useEffect(() => {
    setHint(null)
    if (!key) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      matchPosConsumer(JSON.parse(key), controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setHint(hintOf(found))
        })
        .catch(() => undefined)
    }, MATCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key])
  return hint
}
