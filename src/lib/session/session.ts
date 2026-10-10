import { createContext, useContext } from 'react'
import { hasPermission, type Entitlements } from '../identity/entitlements'

/**
 * Whether the customer app insists on a signed-in session.
 *
 * Always on in a production build. `VITE_REQUIRE_SESSION=false` is honoured only by a development
 * build (`npm run dev`, vitest, `NODE_ENV=development vite build`), where it lets the mock screens be
 * looked at without signing in.
 *
 * It used to default OFF in production and be switched on by setting the variable. The deployed
 * build never set it, so www.fawtir.om rendered every screen outside the guard: no session was
 * loaded and the sidebar showed a demo user ("Hafidh Saif / Owner / Your company") to whoever was
 * actually signed in (TEST, 7 October 2026). The backend still authorised every request; the shell
 * simply never asked who was there. Failing toward the guard means a missing or mistyped
 * deployment variable can no longer recreate that.
 */
export const REQUIRE_SESSION: boolean = requireSession(
  import.meta.env.DEV,
  import.meta.env.VITE_REQUIRE_SESSION,
)

export function requireSession(developmentBuild: boolean, configured: string | undefined): boolean {
  return !(developmentBuild && configured === 'false')
}

/**
 * Who is signed in to the customer app, as `/v1/me/entitlements` described them. `null` while that
 * answer is still loading, and in a development build run with the guard switched off.
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
