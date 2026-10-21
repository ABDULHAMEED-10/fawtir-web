/**
 * Field rules for the onboarding and customer forms.
 *
 * Every rule returns an i18n key rather than a sentence, so the same check reads correctly in
 * English and Arabic. `undefined` means the value passed.
 *
 * Rules that mirror a backend rule (username, full name, password) exist only to answer without a
 * round trip; the backend stays authoritative and re-checks every one of them.
 *
 * The formats here are Oman-specific and worth stating once:
 *  - Numbers are 8 digits. Landlines start 22 to 26 (the fixed-number blocks by region); mobiles
 *    start 71 to 79 or 90 to 99. The +968 prefix is supplied by the field, so it is never part of
 *    the value.
 *  - A VAT identification number is `OM`, a registrant class of `11` or `12`, then 8 digits.
 *  - Commercial registration numbers are 7 digits.
 *  - Postal codes are 3 digits.
 *  - The Peppol scheme id for Omani VAT numbers is 0248.
 */

export type FieldError = string | undefined

const DIGITS_ONLY = /^\d+$/

export function required(value: string): FieldError {
  return value.trim() ? undefined : 'validation.required'
}

/** Every backend request record bounds email at 255 (`@Size(max = 255)`). */
const EMAIL_MAX_LENGTH = 255

export function email(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  if (trimmed.length > EMAIL_MAX_LENGTH) return 'validation.email'
  // Deliberately permissive: one @, a dot-bearing domain, no spaces. Anything stricter
  // rejects addresses that are actually deliverable.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? undefined : 'validation.email'
}

/**
 * The backend's username pattern (`SignupRequest.username`, migration V174), character for
 * character. ASCII-only is not a style choice: the server hashes the lower-cased username in
 * both SQL and Java, which case-fold differently outside ASCII.
 */
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/

export function username(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  return USERNAME_PATTERN.test(trimmed) ? undefined : 'validation.usernameInvalid'
}

const FULL_NAME_MIN_LENGTH = 2
const FULL_NAME_MAX_LENGTH = 200

/**
 * `SelfServiceSignupService.requireValidFullName`. Unicode-aware on purpose — `\p{Nd}` and
 * `\p{L}` are Java's `Character.isDigit` and `isLetter`, so Arabic names pass and Arabic-Indic
 * digits are refused exactly as the server refuses them.
 */
export function fullName(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  if (trimmed.length < FULL_NAME_MIN_LENGTH || trimmed.length > FULL_NAME_MAX_LENGTH) {
    return 'validation.fullNameLength'
  }
  if (/\p{Nd}/u.test(trimmed)) return 'validation.fullNameDigits'
  if (/\p{Cc}/u.test(trimmed) || !/\p{L}/u.test(trimmed)) return 'validation.fullNameInvalid'
  return undefined
}

/**
 * The ranges in use: fixed lines 22 to 26 (22 non-geographic, 23 Dhofar and Al Wusta, 24 Muscat,
 * 25 A'Dakhliyah, Al Sharqiya and A'Dhahira, 26 Al Batinah and Musandam) and mobiles 71 to 79 and
 * 90 to 99. Kept to whole blocks so a new operator range inside them is not refused (owner, 1 Oct
 * 2026); to be confirmed against the TRA numbering plan.
 */
const OMAN_PHONE_PREFIX = /^(2[2-6]|7[1-9]|9\d)/

/** Oman national number, without the +968 prefix. */
export function omanPhone(value: string): FieldError {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'validation.required'
  if (digits.length !== 8) return 'validation.phoneLength'
  return OMAN_PHONE_PREFIX.test(digits) ? undefined : 'validation.phonePrefix'
}

/** The `+968XXXXXXXX` form the server stores. Only meaningful once {@link omanPhone} passes. */
export function toOmanE164(value: string): string {
  return `+968${value.replace(/\D/g, '')}`
}

/**
 * The backend's `OmaniVatin` grammar, which is also the `ck_customer_vatin_oman` constraint
 * (migration V075 narrowed V073's `OM` + 10 digits to the registrant class). Both sides move
 * together: the backend notes the narrowing is pending an OTA answer (tracker 5.12), and a
 * reversal there must be mirrored here.
 */
const VATIN_PATTERN = /^OM(?:11|12)\d{8}$/

export function vatin(value: string): FieldError {
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return 'validation.required'
  return VATIN_PATTERN.test(trimmed) ? undefined : 'validation.vatin'
}

export function crNumber(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  return DIGITS_ONLY.test(trimmed) && trimmed.length === 7 ? undefined : 'validation.crNumber'
}

export function postalCode(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return DIGITS_ONLY.test(trimmed) && trimmed.length === 3 ? undefined : 'validation.postalCode'
}

/** `PasswordPolicyService`: 8 to 128 since Phase A (contract §10; it was 12). */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/**
 * The backend `PasswordPolicyService` rules, which signup, password reset and operator
 * invitations share. The strength meter counts the same criteria, so a full meter and a passing
 * password coincide.
 *
 * Its common-password list is deliberately not mirrored: shipping it would put the list in the
 * bundle, and the server still refuses a listed password when it is submitted.
 */
export function passwordCriteria(value: string) {
  return {
    length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    upperAndLower: /[A-Z]/.test(value) && /[a-z]/.test(value),
    digit: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  }
}

export function password(value: string): FieldError {
  if (!value) return 'validation.required'
  const criteria = passwordCriteria(value)
  if (!criteria.length) return 'validation.passwordLength'
  if (!criteria.upperAndLower || !criteria.digit || !criteria.symbol) {
    return 'validation.passwordComposition'
  }
  return undefined
}

export function confirmPassword(value: string, against: string): FieldError {
  if (!value) return 'validation.required'
  return value === against ? undefined : 'validation.passwordMismatch'
}

/**
 * A Peppol participant id as typed: a four-digit scheme, a colon and an identifier, in any case
 * (`0248:OM1100112233`, `0248:om1199999001`, `0242:000006-TESTBED.3001`, `9922:OPTBCNTRLP1007`).
 * Any scheme is accepted, test ones included; whether the id exists is the SMP's and the
 * server's call, not this form's (owner, 11 Oct 2026).
 */
export const PEPPOL_PARTICIPANT_SHAPE = /^\d{4}:\S+$/

export function peppolParticipant(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  return PEPPOL_PARTICIPANT_SHAPE.test(trimmed) ? undefined : 'supplierForm.error.peppolShape'
}

/** Peppol participant id built from a VAT number, e.g. `0248:OM1100112233`. */
export function peppolIdFor(vat: string): string {
  const trimmed = vat.trim().toUpperCase()
  return trimmed ? `0248:${trimmed}` : ''
}

/**
 * Every customer VAT number is Omani (`OM` + 10 digits, {@link vatin}), so the customer forms draw
 * `OM` as a fixed prefix and the person types only the digits (owner, 21 Oct 2026). The form value
 * keeps the whole number (`OM1100000000`), so the request, the validation and the server are
 * unchanged.
 */
export const OMAN_VAT_PREFIX = 'OM'

/** The digits a customer form shows after its fixed `OM`: `OM1100000000` → `1100000000`. */
export function omanVatDigits(vat: string): string {
  return vat.trim().toUpperCase().replace(/^OM/, '')
}

/**
 * The whole VAT number from what was typed after the fixed `OM`. A pasted `OM1100000000` keeps
 * working, and anything that is not a digit is dropped.
 *
 * TODO(go-live): cap the digits at 10 (`.slice(0, 10)` here and `maxLength={10}` on the fields)
 * once the OTA's VAT format is final; until then the length is left to {@link vatin}.
 */
export function omanVatFromDigits(typed: string): string {
  const digits = typed.trim().toUpperCase().replace(/^OM/, '').replace(/\D/g, '')
  return digits ? `${OMAN_VAT_PREFIX}${digits}` : ''
}

/** True when no rule produced an error. */
export function isClean(errors: Record<string, FieldError>): boolean {
  return Object.values(errors).every((error) => !error)
}

/* ---------------------------------------------------------------- card fields */

/** `4111111111111111` → `4111 1111 1111 1111`, capped at 19 digits. */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 19)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Luhn check — catches transposed and mistyped digits before the gateway does. */
export function cardNumber(value: string): FieldError {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'validation.required'
  if (digits.length < 13) return 'validation.cardShort'
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0 ? undefined : 'validation.cardInvalid'
}

/** `1226` → `12/26`. */
export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

/**
 * `MM/YY`, a real month, and not already past.
 *
 * `now` is injectable so the check is testable and so a caller can validate against the
 * server's clock rather than the browser's.
 */
export function expiry(value: string, now = new Date()): FieldError {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'validation.required'
  if (digits.length !== 4) return 'validation.expiryFormat'
  const month = Number(digits.slice(0, 2))
  const year = 2000 + Number(digits.slice(2))
  if (month < 1 || month > 12) return 'validation.expiryMonth'
  // A card is valid through the last day of its stated month.
  const endOfMonth = new Date(year, month, 1)
  return endOfMonth > now ? undefined : 'validation.expiryPast'
}

export function cvc(value: string): FieldError {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'validation.required'
  return digits.length === 3 || digits.length === 4 ? undefined : 'validation.cvc'
}
