import { createContext, useContext } from 'react'
import { hasPermission, type Entitlements } from '../identity/entitlements'

/**
 * Whether the customer app insists on a signed-in session.
 *
 * On in development, off in a production build unless `VITE_REQUIRE_SESSION=true`. It defaults
 * off because the deployed build was a prototype whose `/api` was rewritten to `index.html` and
 * so never reached a backend, leaving a guard with nothing to show but the sign-in page. That
 * rewrite is fixed, so the reason has expired: set the variable once the deployed build is meant
 * to require a session.
 */
export const REQUIRE_SESSION: boolean =
  import.meta.env.VITE_REQUIRE_SESSION === undefined
    ? import.meta.env.DEV
    : import.meta.env.VITE_REQUIRE_SESSION === 'true'

/**
 * Who is signed in to the customer app, as `/v1/me/entitlements` described them. `null` when
 * there is no session because the guard is off (the prototype build).
 */
export const SessionContext = createContext<Entitlements | null>(null)

export function useSession(): Entitlements | null {
  return useContext(SessionContext)
}

/**
 * Whether to offer an action or a screen. Display only: the backend authorises every request, and
 * a 403 is still rendered as "no access". Without a session (the guard is off) everything is
 * offered, as the prototype always has.
 */
export function can(session: Entitlements | null, permission: string | readonly string[] | undefined): boolean {
  if (!session || permission === undefined) return true
  const required = typeof permission === 'string' ? [permission] : permission
  return required.every((code) => hasPermission(session, code))
}

export function useCan(permission: string | readonly string[] | undefined): boolean {
  return can(useSession(), permission)
}
