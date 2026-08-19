/**
 * Field rules for the onboarding and customer forms.
 *
 * Every rule returns an i18n key rather than a sentence, so the same check reads correctly in
 * English and Arabic. `undefined` means the value passed.
 *
 * The formats here are Oman-specific and worth stating once:
 *  - Mobile numbers are 8 digits and start with 7 or 9; landlines start with 2. The +968 prefix
 *    is supplied by the field, so it is never part of the value.
 *  - A VAT identification number is `OM` followed by 10 digits.
 *  - Commercial registration numbers are 7 digits.
 *  - Postal codes are 3 digits.
 *  - The Peppol scheme id for Omani VAT numbers is 0248.
 */

export type FieldError = string | undefined

const DIGITS_ONLY = /^\d+$/

export function required(value: string): FieldError {
  return value.trim() ? undefined : 'validation.required'
}

export function email(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  // Deliberately permissive: one @, a dot-bearing domain, no spaces. Anything stricter
  // rejects addresses that are actually deliverable.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? undefined : 'validation.email'
}

/** Oman national number, without the +968 prefix. */
export function omanPhone(value: string): FieldError {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'validation.required'
  if (digits.length !== 8) return 'validation.phoneLength'
  return /^[279]/.test(digits) ? undefined : 'validation.phonePrefix'
}

export function vatin(value: string): FieldError {
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return 'validation.required'
  return /^OM\d{10}$/.test(trimmed) ? undefined : 'validation.vatin'
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

/** Mirrors the strength meter: 8+ characters, with a letter and a digit. */
export function password(value: string): FieldError {
  if (!value) return 'validation.required'
  if (value.length < 8) return 'validation.passwordShort'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'validation.passwordWeak'
  return undefined
}

export function confirmPassword(value: string, against: string): FieldError {
  if (!value) return 'validation.required'
  return value === against ? undefined : 'validation.passwordMismatch'
}

/** Peppol participant id built from a VAT number, e.g. `0248:OM1100112233`. */
export function peppolIdFor(vat: string): string {
  const trimmed = vat.trim().toUpperCase()
  return trimmed ? `0248:${trimmed}` : ''
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
