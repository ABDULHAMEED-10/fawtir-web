import { useEffect, useState } from 'react'
import { sharedRequest } from '../api'
import { SUBSCRIPTION_PATH, loadSubscription, type SubscriptionStatusDto } from '../api/settings/subscription'
import { hasPermission } from './identity/entitlements'
import { REQUIRE_SESSION, useSession } from './session/session'

/**
 * Whether the subscription is read-only now, and why (business rules ST-1, ST-2, TR-3, CA-3).
 *
 * The server decides: `GET /settings/subscription` names the restriction it applies in
 * `restriction`, and only while `restrictionsEnforced` is true. With the switch off nothing is
 * refused, so nothing is hidden and no read-only line is shown, whatever `access` says. The
 * screen never works a restriction out from the dates.
 *
 * What a read-only subscription stops is the server's `RestrictedAction`: issuing a new document,
 * adding people, creating or rotating API keys, and ERP work that creates capability or contacts
 * the ERP. Reading, downloading, exporting, paying, drafting, sending a document already issued and
 * every Tax Authority reply never stop, so nothing else is hidden.
 */
export type RestrictedAction = 'ISSUE_DOCUMENTS' | 'ADD_PEOPLE' | 'CREATE_API_KEY' | 'ERP'

/** Which sentence the read-only line says. */
export type ReadOnlyReason =
  /** Unpaid after the grace days. */
  | 'suspended'
  /** The free trial ended and nothing has been paid (TR-3). */
  | 'trialEnded'
  /** Cancelled, and the paid time it kept has ended (CA-3). */
  | 'cancelled'
  /** Approved, but no payment has been confirmed yet (SU-3). */
  | 'notStarted'
  /** Enterprise whose terms Fawtir has not set yet: there is nothing to pay (SU-5). */
  | 'enterpriseTerms'
  /** A code a later server adds. */
  | 'generic'

/** Reading the subscription needs this; paying needs `tenant.plan.manage`. */
export const SUBSCRIPTION_READ_PERMISSION = 'tenant.plan.read'
export const SUBSCRIPTION_PAY_PERMISSION = 'tenant.plan.manage'

/** Where Pay goes: the bills, which also prepares a renewal after a cancellation. */
export const PAY_ROUTE = '/settings/bills'

export function readOnlyReason(status: SubscriptionStatusDto): ReadOnlyReason | null {
  if (!status.restrictionsEnforced || !status.restriction) return null
  switch (status.restriction) {
    case 'SUBSCRIPTION_SUSPENDED':
      // The server's SUSPENDED also covers a trial that ended unpaid; the wording tells them apart
      // from what was covered, the state itself is still the server's.
      return status.paidThrough === null && status.trialEndsOn !== null ? 'trialEnded' : 'suspended'
    case 'SUBSCRIPTION_CANCELLED':
      return 'cancelled'
    case 'SUBSCRIPTION_NOT_STARTED':
      return status.enterprise?.termsSet === false ? 'enterpriseTerms' : 'notStarted'
    default:
      return 'generic'
  }
}

/** Whether the read-only line offers Pay at all: Enterprise terms are agreed, not paid online. */
export function readOnlyOffersPay(reason: ReadOnlyReason): boolean {
  return reason !== 'enterpriseTerms'
}

/**
 * The last answer per company, kept for the session so moving between pages (each mounts its own
 * shell) does not flash the actions in and out. Re-asked when older than this.
 */
const FRESH_FOR_MS = 30_000
const settled = new Map<string, { status: SubscriptionStatusDto; at: number }>()
/** The company the screens last asked about, so a refusal's wording reads that company's answer. */
let currentKey: string | null = null

/** Forgets every remembered answer. For tests, and for a session that changes hands. */
export function forgetSubscriptionStanding(): void {
  settled.clear()
  currentKey = null
}

/**
 * Why the current company's subscription is read-only, from the answer the screens already hold,
 * or `null` when none is held (still loading, no permission to read it, or nothing restricted).
 * For wording a refusal outside React: never reads anything itself.
 */
export function rememberedReadOnlyReason(): ReadOnlyReason | null {
  const known = currentKey === null ? undefined : settled.get(currentKey)
  return known ? readOnlyReason(known.status) : null
}

/**
 * The subscription as the signed-in user may read it, or `null` while it loads, when they may not
 * read it, or when it could not be read. A failure is silent on purpose: the server refuses a
 * restricted action anyway (with the `subscription-restricted` message), so showing everything is
 * the safe fallback, and this read must never take a screen down.
 */
export function useSubscriptionStanding(): SubscriptionStatusDto | null {
  const session = useSession()
  // Without a session the guard is off (a development build) or the session is still loading.
  const readable = session ? hasPermission(session, SUBSCRIPTION_READ_PERMISSION) : !REQUIRE_SESSION
  const key = readable ? (session?.tenantId ?? 'unguarded') : null
  const [, setVersion] = useState(0)

  useEffect(() => {
    currentKey = key
    if (key === null) return
    const known = settled.get(key)
    if (known && Date.now() - known.at < FRESH_FOR_MS) return
    let active = true
    sharedRequest(`${SUBSCRIPTION_PATH}#standing`, loadSubscription).then(
      (status) => {
        settled.set(key, { status, at: Date.now() })
        if (active) setVersion((n) => n + 1)
      },
      () => {
        // Kept as it was: see above.
      },
    )
    return () => {
      active = false
    }
  }, [key])

  return key === null ? null : (settled.get(key)?.status ?? null)
}

/** Why the subscription is read-only now, or `null` when nothing is restricted (or unknown). */
export function useReadOnlyReason(): ReadOnlyReason | null {
  const status = useSubscriptionStanding()
  return status ? readOnlyReason(status) : null
}

/**
 * Whether to offer an action the server refuses while the subscription is read-only. Display only,
 * like `useCan`: every request is still decided by the server. Every restriction stops all four
 * actions, so the action names what is asked rather than changing the answer.
 */
export function useSubscriptionAllows(action: RestrictedAction): boolean {
  void action
  return useReadOnlyReason() === null
}
