/**
 * A buyer's "Phone or email" on the till, as the server files it. A sale's consumer contact is
 * kept on the customer record as `contact.mobilePhone`, which must be E.164 (`+96892345678`); a
 * cashier types the Omani number as it is said, eight digits, often with spaces. So the till puts
 * the +968 in front itself, and says which field is wrong before the sale goes anywhere, instead
 * of the general failure (E2E 29 Oct 2026, F-2).
 */

export type TillContact =
  { ok: true; value: string | null } | { ok: false; reason: 'phone' | 'email' }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const E164 = /^\+[1-9][0-9]{6,14}$/

export function tillContact(text: string): TillContact {
  const value = text.trim()
  if (!value) return { ok: true, value: null }
  if (value.includes('@')) {
    return value.length <= 254 && EMAIL.test(value)
      ? { ok: true, value: value.toLowerCase() }
      : { ok: false, reason: 'email' }
  }
  const digits = value.replace(/[\s().-]/g, '')
  // An Omani number as it is said: eight digits.
  if (/^[0-9]{8}$/.test(digits)) return { ok: true, value: `+968${digits}` }
  // The country code typed without the plus, or with the international 00.
  if (/^968[0-9]{8}$/.test(digits)) return { ok: true, value: `+${digits}` }
  const plus = digits.startsWith('00') ? `+${digits.slice(2)}` : digits
  return E164.test(plus) ? { ok: true, value: plus } : { ok: false, reason: 'phone' }
}
