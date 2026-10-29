import { ApiError, apiRequest } from '../../api'
import { required, type FieldError } from '../validation'
import { forgetEntitlements, isPlatformOperator, loadEntitlements } from './entitlements'
import { commonFailureMessage, type FormMessage } from './errors'
import { safeReturnPath } from './returnTo'

export const LOGIN_PATH = '/v1/auth/login'
export const LOGIN_CODE_PATH = '/v1/auth/mfa/otp/request'
export const LOGIN_VERIFY_PATH = '/v1/auth/mfa/verify'
export const LOGIN_ROUTE = '/login'
export const LOGIN_CODE_ROUTE = '/login/mfa'
/** Where a tenant user lands after signing in. */
export const SIGNED_IN_ROUTE = '/dashboard'
/** Where a Fawtir operator lands: the console, not a tenant's dashboard. */
export const CONSOLE_ROUTE = '/console'

/**
 * The home a signed-in principal belongs on. The backend does not say, but the entitlements do:
 * a `platform.*` permission marks a Fawtir operator (`isPlatformOperator`), and the console is
 * theirs. When the entitlements cannot be read the tenant dashboard is the safe landing — its own
 * shell asks again and sends the user to sign in if the session is not there.
 */
export async function landingRoute(next: string | null = null): Promise<string> {
  // A sign-in started from inside the app goes back there (Switch user on the till goes back to
  // the till), but only to a path of this app; an operator always lands on the console.
  const back = safeReturnPath(next)
  try {
    const entitlements = await loadEntitlements()
    return isPlatformOperator(entitlements) ? CONSOLE_ROUTE : (back ?? SIGNED_IN_ROUTE)
  } catch {
    return back ?? SIGNED_IN_ROUTE
  }
}

/**
 * `RecordLoginRequest` bounds. The username stays at 255 rather than signup's 64 because accounts
 * created before the username policy hold email-shaped usernames and must keep signing in.
 */
export const USERNAME_MAX_LENGTH = 255
export const PASSWORD_MAX_LENGTH = 128

/**
 * The factor to use when the server names none. Every company policy must allow EMAIL_OTP or
 * SMS_OTP (`TenantIdentityPolicyService`), so the email code is the one that works for everyone
 * — which is what makes it the right fallback and the wrong default.
 *
 * It is no longer assumed. Where policy fixes a factor the server says so on the login response
 * and signs the same decision into the challenge, and this screen renders that decision.
 * Presenting EMAIL_OTP against a challenge minted for an authenticator is refused by the
 * backend, so a client that ignored the decision would simply fail.
 */
export const LOGIN_FACTOR = 'EMAIL_OTP'

/** The authenticator factor, required for the FAWTIR operations realm. */
export const LOGIN_FACTOR_TOTP = 'TOTP'

/** How far the login has got, as the server sees it. */
export type MfaState = 'VERIFICATION_REQUIRED' | 'ENROLLMENT_REQUIRED'

/** Enrolling an authenticator the server has just demanded, before any session exists. */
export const TOTP_ENROLL_PATH = '/v1/auth/mfa/totp/enroll'
export const TOTP_CONFIRM_PATH = '/v1/auth/mfa/totp/confirm'

/**
 * Client-side only: `/auth/mfa/otp/request` has no server cooldown, just per-IP rate limits. A
 * minute keeps a user from replacing the code that is about to arrive with one that has not.
 */
export const LOGIN_CODE_RESEND_DELAY_MS = 60_000

export type LoginFormValues = { username: string; password: string }
export type LoginField = keyof LoginFormValues
export type LoginFieldErrors = Partial<Record<LoginField, FieldError>>

export const INITIAL_LOGIN_VALUES: LoginFormValues = { username: '', password: '' }
export const LOGIN_FIELD_ORDER: readonly LoginField[] = ['username', 'password']

export type LoginRequest = { username: string; password: string; portalCookie: true }

/** `LoginResponse` in portal-cookie mode: the server strips bearer tokens from the body. */
export type LoginResponse = {
  mfaRequired: boolean
  mfaChallengeToken?: string | null
  mfaChallengeExpiresIn?: number
  /** Absent wherever policy fixes no factor, which is every customer login. */
  mfaState?: MfaState | null
  mfaRequiredFactor?: string | null
}

/**
 * The second-factor handle, alive until `expiresAt` (client clock).
 *
 * `factor` and `state` are the server's decision, carried so the screen can render it. They are
 * a copy: the authoritative one is signed into `token`, and that is what the backend reads. A
 * tampered copy changes what this screen draws and nothing the server will accept.
 */
export type LoginChallenge = {
  token: string
  expiresAt: number
  factor: string
  state: MfaState | null
}

export type LoginOutcome = { kind: 'code'; challenge: LoginChallenge } | { kind: 'signedIn' }

/**
 * Presence and the server's length bounds only. The username's shape is deliberately not checked:
 * the backend accepts legacy usernames signup would refuse, and a format error would tell a
 * guesser their guess was malformed rather than merely wrong.
 */
export function validateLoginForm(values: LoginFormValues): LoginFieldErrors {
  const username = values.username.trim()
  return {
    username:
      required(username) ??
      (username.length > USERNAME_MAX_LENGTH ? 'validation.tooLong' : undefined),
    password:
      required(values.password) ??
      (values.password.length > PASSWORD_MAX_LENGTH ? 'validation.tooLong' : undefined),
  }
}

/**
 * Whitelisted. No tenant code: the backend derives the tenant from the username and discards the
 * field. `portalCookie` keeps any session in HttpOnly cookies, so no token is ever readable here.
 * The password is sent exactly as typed — trimming it would change the credential.
 */
export function buildLoginRequest(values: LoginFormValues): LoginRequest {
  return { username: values.username.trim(), password: values.password, portalCookie: true }
}

/**
 * The expiry is taken from the relative `mfaChallengeExpiresIn`, not the absolute
 * `mfaChallengeExpiresAt`, so a skewed client clock cannot make a live challenge look dead.
 */
export function toLoginOutcome(
  response: LoginResponse | undefined,
  receivedAt: number,
): LoginOutcome {
  if (response?.mfaRequired === false) return { kind: 'signedIn' }
  const token = response?.mfaChallengeToken
  const expiresIn = response?.mfaChallengeExpiresIn
  if (
    response?.mfaRequired &&
    typeof token === 'string' &&
    token &&
    typeof expiresIn === 'number' &&
    expiresIn > 0
  ) {
    return {
      kind: 'code',
      challenge: {
        token,
        expiresAt: receivedAt + expiresIn * 1000,
        // Only a factor the server named is honoured. An unrecognised one falls back to the
        // email code rather than rendering a screen for something this build cannot drive.
        factor: response.mfaRequiredFactor === LOGIN_FACTOR_TOTP ? LOGIN_FACTOR_TOTP : LOGIN_FACTOR,
        state:
          response.mfaState === 'ENROLLMENT_REQUIRED' || response.mfaState === 'VERIFICATION_REQUIRED'
            ? response.mfaState
            : null,
      },
    }
  }
  throw new Error('Unrecognised login response')
}

export async function submitLogin(
  values: LoginFormValues,
  signal?: AbortSignal,
): Promise<LoginOutcome> {
  const response = await apiRequest<LoginResponse | undefined>(LOGIN_PATH, {
    method: 'POST',
    body: buildLoginRequest(values),
    signal,
    credentials: 'same-origin',
  })
  const outcome = toLoginOutcome(response, Date.now())
  if (outcome.kind === 'signedIn') forgetEntitlements()
  return outcome
}

/**
 * `202` with no body. Each request replaces the code stored for the challenge, so a second
 * request silently invalidates the first email's code.
 */
export function requestLoginCode(challenge: LoginChallenge, signal?: AbortSignal): Promise<void> {
  return apiRequest<void>(LOGIN_CODE_PATH, {
    method: 'POST',
    body: { challengeToken: challenge.token, factor: LOGIN_FACTOR },
    signal,
    credentials: 'omit',
  })
}

/**
 * Establishes the session: the server answers with HttpOnly cookies and a body without tokens,
 * so there is nothing in the response to keep.
 */
export async function verifyLoginCode(
  challenge: LoginChallenge,
  code: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest<LoginResponse | undefined>(LOGIN_VERIFY_PATH, {
    method: 'POST',
    // The factor the server named, not a constant. Sending EMAIL_OTP against an authenticator
    // challenge is refused by the backend, so this is what makes the screen work rather than
    // what makes it safe.
    body: { challengeToken: challenge.token, factor: challenge.factor, code, portalCookie: true },
    signal,
    credentials: 'same-origin',
  })
  // A new session may belong to someone other than whoever this tab last described.
  forgetEntitlements()
}

/** What the server staged for an authenticator to be set up from. */
export type TotpEnrollment = {
  secret: string
  otpauthUri: string
  enrollmentChallenge: string
}

/**
 * Begins enrolment during a login that demands it.
 *
 * The challenge is the credential: the caller proved a password to obtain it, and the backend
 * refuses any challenge that does not say enrolment is owed. Nothing is persisted here — the
 * secret lives in component state for the life of the screen and is gone on reload, which is
 * why a reload restarts enrolment rather than resuming it.
 */
export async function beginTotpEnrollment(
  challenge: LoginChallenge,
  signal?: AbortSignal,
): Promise<TotpEnrollment> {
  return apiRequest<TotpEnrollment>(TOTP_ENROLL_PATH, {
    method: 'POST',
    body: { challengeToken: challenge.token },
    signal,
    credentials: 'same-origin',
  })
}

/** What confirming enrolment returns. Recovery codes are shown once and never stored. */
export type TotpConfirmation = { enabled: boolean; backupCodes?: string[] | null }

/**
 * Confirms enrolment with the first code from the authenticator.
 *
 * Deliberately does not sign the user in: the original challenge still has to be completed
 * through {@link verifyLoginCode}, so enrolling is not a shortcut past the second factor.
 */
export async function confirmTotpEnrollment(
  challenge: LoginChallenge,
  enrollmentChallenge: string,
  code: string,
  signal?: AbortSignal,
): Promise<TotpConfirmation> {
  return apiRequest<TotpConfirmation>(TOTP_CONFIRM_PATH, {
    method: 'POST',
    body: { challengeToken: challenge.token, code, enrollmentChallenge },
    signal,
    credentials: 'same-origin',
  })
}

/**
 * One answer for a wrong password, an unknown username, a locked or disabled account and a
 * registration still under review. The backend returns the same `401` for all of them so the form
 * cannot be used to learn which accounts exist, and the message must not undo that.
 */
export function describeLoginFailure(error: unknown): FormMessage {
  if (error instanceof ApiError && error.status === 401) return { key: 'login.failed' }
  return commonFailureMessage(error)
}

/**
 * A `401` from either code endpoint means the challenge is gone — expired, revoked, or spent: the
 * backend consumes it on every verification attempt, right or wrong — so only a fresh sign-in can
 * continue.
 */
export function isChallengeSpent(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** Router state Login reads to explain why the code step sent the user back. */
export type SignInAgainState = { signInAgain: true }

export function isSignInAgainState(value: unknown): value is SignInAgainState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).signInAgain === true
  )
}
