import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from './errors'
import type { SignupVerificationState } from './signup'

export const VERIFY_PATH = '/v1/auth/signup/verify'
export const RESEND_PATH = '/v1/auth/signup/resend'
export const VERIFICATION_CODE_LENGTH = 6

/**
 * `SelfServiceSignupService.EMAIL_CODE_TTL` and `EMAIL_CODE_RESEND_DELAY`. Used only after a
 * resend: `/signup/resend` answers `202` with no body, so it carries no new expiry or cooldown
 * to read. The first code's timing always comes from the signup response instead.
 */
export const EMAIL_CODE_TTL_MS = 10 * 60_000
export const EMAIL_CODE_RESEND_DELAY_MS = 60_000

/** `SignupEmailVerificationResponse`. */
export type SignupEmailVerificationResponse = {
  onboardingToken: string
  onboardingTokenExpiresAt: string
}

export function isSignupVerificationState(value: unknown): value is SignupVerificationState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    state.from === 'signup' &&
    typeof state.tenantCode === 'string' &&
    typeof state.email === 'string' &&
    typeof state.emailVerificationExpiresAt === 'string' &&
    typeof state.resendAvailableAt === 'string'
  )
}

export function verifySignupEmail(
  verification: SignupVerificationState,
  code: string,
  signal?: AbortSignal,
): Promise<SignupEmailVerificationResponse> {
  return apiRequest<SignupEmailVerificationResponse>(VERIFY_PATH, {
    method: 'POST',
    body: { tenantCode: verification.tenantCode, email: verification.email, code },
    signal,
    credentials: 'omit',
  })
}

/**
 * Always `202`, even when nothing was sent — during the cooldown, or for a registration that is
 * already verified — so the endpoint cannot be used to probe registrations. A success here means
 * "accepted", not "a code is on its way".
 */
export function resendSignupCode(
  verification: SignupVerificationState,
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(RESEND_PATH, {
    method: 'POST',
    body: { tenantCode: verification.tenantCode, email: verification.email },
    signal,
    credentials: 'omit',
  })
}

/**
 * `/signup/verify` answers a wrong code, an expired code, a registration past its attempt limit
 * and an unknown registration with the same `401`, deliberately. The one distinction the client
 * can make honestly is from the expiry the server already gave it.
 */
export function describeVerificationFailure(error: unknown, codeExpired: boolean): FormMessage {
  if (error instanceof ApiError && error.status === 401) {
    return { key: codeExpired ? 'verifyCode.expired' : 'verifyCode.invalid' }
  }
  return commonFailureMessage(error)
}

/** `m:ss`, the format the design uses for the resend countdown. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
