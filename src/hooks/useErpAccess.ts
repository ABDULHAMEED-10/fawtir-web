import { useEffect, useState } from 'react'
import { loadEntitlements, peekEntitlements, type Entitlements } from '../lib/identity/entitlements'
import { erpConnectionAccess, type ErpConnectionAccess } from '../lib/erp/connectionPolicy'

/**
 * The four ERP connection permissions for the signed-in user.
 *
 * Reads the same session-cached entitlements the console shell uses, so moving between ERP screens
 * asks once. `ready` is false until the answer arrives, and `access` is all-false until then:
 * {@link erpConnectionAccess} fails closed, so a screen never draws a control it has not yet
 * confirmed the user holds. That matters more than the loading flicker it costs — a button drawn
 * optimistically and clicked in the same instant produces a 403 for something we should not have
 * offered.
 *
 * A failure to load is not surfaced as an error here on purpose. The screens this feeds already
 * render their own data failures, and a permission snapshot that could not be fetched simply means
 * nothing is offered — which is the correct fallback, because the backend is what authorises
 * anyway. A `401` is handled by `useApiRead` on the data request, which navigates to sign-in.
 */
export function useErpAccess(): { access: ErpConnectionAccess; ready: boolean } {
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

  return { access: erpConnectionAccess(entitlements), ready }
}
