/**
 * The onboarding token, kept for the life of the tab.
 *
 * Stored rather than held in memory because it is the registrant's only credential after email
 * verification: the six-digit code is single-use (`/signup/verify` refuses an already verified
 * registration), login stays disabled until review, and no endpoint re-issues a token. A reload
 * that dropped it would leave the account unfinishable. `sessionStorage` rather than
 * `localStorage` so it dies with the tab, matching its two-hour server lifetime.
 *
 * Only the token, its expiry and whether this tab submitted live here — never `tenantCode`, the
 * email code, the password, or any answer. The server holds the answers; this is the key to them.
 */

const STORAGE_KEY = 'fawtir.signup.onboarding.v1'

export type OnboardingSession = {
  onboardingToken: string
  onboardingTokenExpiresAt: string
  /** Set after final submission, so the closed pages route to the waiting screen. */
  submitted?: boolean
}

function isSession(value: unknown): value is OnboardingSession {
  if (typeof value !== 'object' || value === null) return false
  const { onboardingToken, onboardingTokenExpiresAt } = value as Record<string, unknown>
  return typeof onboardingToken === 'string' && typeof onboardingTokenExpiresAt === 'string'
}

function readStored(): OnboardingSession | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isLive(session: OnboardingSession, now: number): boolean {
  const expiresAt = Date.parse(session.onboardingTokenExpiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now
}

// Storage access throws in some privacy modes; the flow then behaves as if nothing was stored.
export function saveOnboardingSession(session: OnboardingSession): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        onboardingToken: session.onboardingToken,
        onboardingTokenExpiresAt: session.onboardingTokenExpiresAt,
        submitted: session.submitted === true,
      }),
    )
  } catch {
    /* see above */
  }
}

/** The live session, or `null` when absent, malformed, or past its expiry. */
export function readOnboardingSession(now: number = Date.now()): OnboardingSession | null {
  const stored = readStored()
  return stored && isLive(stored, now) ? stored : null
}

/**
 * True when this tab held a session that has since expired. Kept distinct from "never signed up"
 * because the answers differ: the backend guide forbids telling a registrant whose token lapsed to
 * sign up again — their registration exists, and its decision arrives by email.
 */
export function hasEndedOnboardingSession(now: number = Date.now()): boolean {
  const stored = readStored()
  return stored !== null && !isLive(stored, now)
}

export function markOnboardingSubmitted(submitted: boolean): void {
  const stored = readStored()
  if (stored) saveOnboardingSession({ ...stored, submitted })
}

/**
 * For a token the server has refused (`401`): expires it in place rather than deleting it, so the
 * tab still knows a registration exists and shows the support message instead of sending the
 * registrant back to signup.
 */
export function endOnboardingSession(now: number = Date.now()): void {
  const stored = readStored()
  if (stored) saveOnboardingSession({ ...stored, onboardingTokenExpiresAt: new Date(now - 1).toISOString() })
}
