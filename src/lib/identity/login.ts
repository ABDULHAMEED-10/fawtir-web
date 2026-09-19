import { ApiError, apiRequest } from '../../api'
import { required, type FieldError } from '../validation'
import { forgetEntitlements, isPlatformOperator, loadEntitlements } from './entitlements'
import { commonFailureMessage, type FormMessage } from './errors'

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
export async function landingRoute(): Promise<string> {
  try {
    const entitlements = await loadEntitlements()
    return isPlatformOperator(entitlements) ? CONSOLE_ROUTE : SIGNED_IN_ROUTE
  } catch {
    return SIGNED_IN_ROUTE
  }
}

/**
 * `RecordLoginRequest` bounds. The username stays at 255 rather than signup's 64 because accounts
 * created before the username policy hold email-shaped usernames and must keep signing in.
 */
export const USERNAME_MAX_LENGTH = 255
export const PASSWORD_MAX_LENGTH = 128

/**
 * The only second factor this screen offers. Every company policy must allow EMAIL_OTP or SMS_OTP
 * (`TenantIdentityPolicyService`), and the login response does not say which factor a user has,
 * so the email code is the one factor that works for everyone without asking.
 */
export const LOGIN_FACTOR = 'EMAIL_OTP'

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
}

/** The second-factor handle, alive until `expiresAt` (client clock). */
export type LoginChallenge = { token: string; expiresAt: number }

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
    return { kind: 'code', challenge: { token, expiresAt: receivedAt + expiresIn * 1000 } }
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
    body: { challengeToken: challenge.token, factor: LOGIN_FACTOR, code, portalCookie: true },
    signal,
    credentials: 'same-origin',
  })
  // A new session may belong to someone other than whoever this tab last described.
  forgetEntitlements()
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
