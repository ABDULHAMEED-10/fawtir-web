/**
 * A change (a payment, an issue, a save) answered 401 because the session had ended. Reads already
 * went to sign-in (`useApiRead`), but a change only showed "Something went wrong" with no way back
 * in (DA-16, local E2E 2026-10-29). The client reports it here, and the signed-in shells send the
 * reader to sign in as a read does (`useSessionExpiryRedirect`). Kept free of imports so the
 * client can use it without a cycle through the entitlements module.
 */
export const SESSION_EXPIRED_EVENT = 'fawtir:session-expired'

export function reportSessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

/**
 * Whether a refusal means the session is gone. `authentication-failed` is a credential or a code
 * being refused (sign-in, MFA, a step-up), where the reader is still on the form that asked.
 */
export function endsSession(status: number, problemType: string | null): boolean {
  return status === 401 && problemType !== 'authentication-failed'
}
