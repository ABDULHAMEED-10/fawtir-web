import { useEffect, useState } from 'react'
import { loadEntitlements, peekEntitlements, type Entitlements } from '../lib/identity/entitlements'

/**
 * The signed-in user's entitlement snapshot, from the same session cache every screen reads, so
 * moving between screens asks once.
 *
 * `entitlements` is `null` until the answer arrives, and stays `null` if it could not be fetched.
 * Callers read permissions through `hasPermission` on a non-null snapshot only, so a screen never
 * draws a control it has not confirmed the user holds: a button drawn optimistically and clicked
 * in the same instant produces a 403 for something we should not have offered.
 *
 * A failure to load is not surfaced here on purpose. The screens this feeds render their own data
 * failures, and a snapshot that could not be fetched simply means nothing is offered — the right
 * fallback, because the backend is what authorises anyway. A `401` is handled by `useApiRead` on
 * the data request, which navigates to sign-in.
 */
export function useEntitlements(): { entitlements: Entitlements | null; ready: boolean } {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(peekEntitlements)
  const [ready, setReady] = useState(() => peekEntitlements() !== null)

  useEffect(() => {
    if (ready) return
    let active = true
    loadEntitlements().then(
      (loaded) => {
        if (!active) return
        setEntitlements(loaded)
        setReady(true)
      },
      () => {
        // Deliberately silent: nothing is offered, which is the safe fallback. See above.
        if (active) setReady(true)
      },
    )
    return () => {
      active = false
    }
  }, [ready])

  return { entitlements, ready }
}
