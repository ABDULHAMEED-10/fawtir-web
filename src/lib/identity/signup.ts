import { ApiError, apiRequest } from '../../api'
import {
  confirmPassword,
  email,
  fullName,
  omanPhone,
  password,
  toOmanE164,
  username,
  type FieldError,
} from '../validation'
import {
  commonFailureMessage,
  mapServerFieldErrors,
  type FormMessage,
  type ServerFieldMap,
} from './errors'

export const SIGNUP_PATH = '/v1/auth/signup'

/** `SelfServiceSignupService.SUPPORTED_LANGUAGES`. */
export type LanguageCode = 'en' | 'ar'

/**
 * `SignupRequest` on the backend. Exhaustive by necessity: the backend refuses unknown JSON
 * properties as a malformed body, so a stray `confirmPassword` or `tenantCode` fails the
 * whole signup rather than being ignored.
 */
export type SignupRequest = {
  fullName: string
  username: string
  email: string
  phone: string
  password: string
  languageCode: LanguageCode
  termsAccepted: boolean
  privacyAccepted: boolean
}

/** `SignupResponse`, answered with 201. */
export type SignupResponse = {
  tenantCode: string
  username: string
  email: string
  languageCode: LanguageCode
  emailVerificationRequired: boolean
  emailVerificationExpiresAt: string
  resendAvailableAt: string
}

export type SignupFormValues = {
  fullName: string
  username: string
  email: string
  phone: string
  password: string
  confirmPassword: string
  consent: boolean
}

export type SignupField = keyof SignupFormValues

export type SignupFieldErrors = Partial<Record<SignupField, FieldError>>

/**
 * What `/verify-code` needs to check the emailed code. `/signup/verify` and `/signup/resend`
 * identify the registration by `(tenantCode, email)`, so the server-issued `tenantCode` has to
 * reach that screen — through router state only, never web storage, and never shown: login is
 * username-only, so the user has no use for it.
 */
export type SignupVerificationState = {
  from: 'signup'
  tenantCode: string
  email: string
  emailVerificationExpiresAt: string
  resendAvailableAt: string
}

export const INITIAL_SIGNUP_VALUES: SignupFormValues = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  consent: false,
}

export function validateSignupForm(values: SignupFormValues): SignupFieldErrors {
  return {
    fullName: fullName(values.fullName),
    username: username(values.username),
    email: email(values.email),
    phone: omanPhone(values.phone),
    password: password(values.password),
    confirmPassword: confirmPassword(values.confirmPassword, values.password),
    consent: values.consent ? undefined : 'validation.agreeRequired',
  }
}

/** Top-to-bottom as the form draws them, so focus lands on the first problem the user sees. */
export const SIGNUP_FIELD_ORDER: readonly SignupField[] = [
  'fullName',
  'username',
  'email',
  'phone',
  'password',
  'confirmPassword',
  'consent',
]

export function toLanguageCode(language: string): LanguageCode {
  return language.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

/**
 * Copies across only the fields the backend accepts. Built field by field rather than by
 * spreading the form values, so a UI-only field cannot reach the wire by being added to the form.
 *
 * Text is trimmed because Bean Validation checks the raw value: a pasted leading space would
 * fail the username pattern and the email check before the server ever normalises it. The
 * password is sent exactly as typed, since spaces in it are significant.
 */
export function buildSignupRequest(values: SignupFormValues, language: string): SignupRequest {
  return {
    fullName: values.fullName.trim(),
    username: values.username.trim(),
    email: values.email.trim(),
    phone: toOmanE164(values.phone),
    password: values.password,
    languageCode: toLanguageCode(language),
    // One checkbox whose label names both documents; each is recorded against its own version.
    termsAccepted: values.consent,
    privacyAccepted: values.consent,
  }
}

export function submitSignup(request: SignupRequest, signal?: AbortSignal): Promise<SignupResponse> {
  // Pre-authentication: there is no session to send, and a portal session left by another
  // tab has no business riding along on an anonymous account creation.
  return apiRequest<SignupResponse>(SIGNUP_PATH, {
    method: 'POST',
    body: request,
    signal,
    credentials: 'omit',
  })
}

export function toVerificationState(response: SignupResponse): SignupVerificationState {
  return {
    from: 'signup',
    tenantCode: response.tenantCode,
    email: response.email,
    emailVerificationExpiresAt: response.emailVerificationExpiresAt,
    resendAvailableAt: response.resendAvailableAt,
  }
}

export type SignupFailure = {
  fieldErrors: SignupFieldErrors
  formError: FormMessage | null
}

/** `languageCode` is absent because no form field owns it; it surfaces at form level. */
const SERVER_FIELD_ERRORS: ServerFieldMap<SignupField> = new Map([
  ['fullName', { field: 'fullName', key: 'validation.fullNameInvalid' }],
  ['username', { field: 'username', key: 'validation.usernameInvalid' }],
  ['email', { field: 'email', key: 'validation.email' }],
  ['phone', { field: 'phone', key: 'validation.phoneLength' }],
  ['password', { field: 'password', key: 'validation.passwordLength' }],
  ['termsAccepted', { field: 'consent', key: 'validation.agreeRequired' }],
  ['privacyAccepted', { field: 'consent', key: 'validation.agreeRequired' }],
])

export function describeSignupFailure(error: unknown): SignupFailure {
  if (error instanceof ApiError) {
    // A taken username is the only conflict signup reports. A registered *email* answers 201
    // like a fresh signup on purpose (backend review finding M3), so it never reaches here.
    if (error.status === 409 && error.problemType === 'resource-conflict') {
      return { fieldErrors: { username: 'validation.usernameTaken' }, formError: null }
    }
    if (error.problemType === 'validation-failed' && error.fieldErrors.length > 0) {
      const { fieldErrors, unattributed } = mapServerFieldErrors(error, SERVER_FIELD_ERRORS)
      return { fieldErrors, formError: unattributed ? commonFailureMessage(error) : null }
    }
  }
  return { fieldErrors: {}, formError: commonFailureMessage(error) }
}
