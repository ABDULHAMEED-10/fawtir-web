import { apiRequest } from '../../api'
import type { SignupEmailVerificationResponse } from './verification'

export const RESUME_ROUTE = '/signup/resume'
export const RESUME_PATH = '/v1/auth/signup/resume'
export const RESUME_VERIFY_PATH = '/v1/auth/signup/resume/verify'

/**
 * Always `202` with no body, whatever the email (Phase A contract §6), so it cannot be used to
 * learn whether a registration exists. A success means "accepted", never "a code was sent".
 */
export function requestSignupResume(email: string, signal?: AbortSignal): Promise<void> {
  return apiRequest<void>(RESUME_PATH, {
    method: 'POST',
    body: { email: email.trim() },
    signal,
    credentials: 'omit',
  })
}

/**
 * Exchanges the emailed code for a fresh onboarding token (contract §7). Any failure is the same
 * generic `401` as signup verify; the previous token stops working once this succeeds.
 */
export function verifySignupResume(
  email: string,
  code: string,
  signal?: AbortSignal,
): Promise<SignupEmailVerificationResponse> {
  return apiRequest<SignupEmailVerificationResponse>(RESUME_VERIFY_PATH, {
    method: 'POST',
    body: { email: email.trim(), code },
    signal,
    credentials: 'omit',
  })
}
