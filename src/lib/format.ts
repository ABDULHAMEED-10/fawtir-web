/**
 * How the customer app writes amounts, dates and counts that came from the API. One place, so a
 * figure reads the same on the list, the detail and the statement.
 *
 * Digits stay Latin in Arabic too, as in the invoice PDFs and statements (decision D15 of the
 * integration plan). That is why the Arabic locale asks for the `latn` numbering system rather
 * than taking Intl's Arabic-Indic default.
 */

/** Amounts arrive as JSON numbers (BigDecimal on the server) already scaled to the currency. */
export type Amount = number | string

/**
 * Minor units per ISO 4217. Intl knows these too, but asking it would tie every figure to the
 * runtime's currency data. OMR, and the other Gulf currencies with three decimals, are what the
 * books are kept in.
 */
const MINOR_UNITS: Record<string, number> = { OMR: 3, BHD: 3, KWD: 3, JOD: 3, IQD: 3, LYD: 3, TND: 3 }

export function minorUnitsOf(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2
}

function numberLocale(language: string): string {
  return language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-US'
}

function dateLocale(language: string): string {
  return language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB'
}

/**
 * `1234.5` in OMR as `1,234.500`. It carries no currency sign: screens put the drawn rial
 * (`Rial`/`OmAmount`) or a code beside it, as they already do. A value that is not a number comes
 * back as it was instead of as `NaN`.
 */
export function formatAmount(amount: Amount, currency = 'OMR', language = 'en'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(value)) return String(amount)
  const digits = minorUnitsOf(currency)
  return new Intl.NumberFormat(numberLocale(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatCount(value: number, language = 'en'): string {
  return new Intl.NumberFormat(numberLocale(language)).format(value)
}

/**
 * A business date (`YYYY-MM-DD`: issue, due or payment dates) as `18 Jul 2026`. Read as a calendar
 * day, in UTC, so no time zone can move it to the day before.
 */
export function formatDate(isoDate: string, language = 'en'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/**
 * The time zone the business runs in. The backend decides "today" and every due date in
 * Asia/Muscat, so an instant is shown there too, not in the browser's zone: someone reading in
 * another country still sees the date the ledger holds.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Muscat'

/** A server instant (ISO-8601 UTC) as a day. */
export function formatInstantDay(iso: string, language = 'en'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date)
}

/** A server instant as a day and time, for a record where the order of events matters. */
export function formatInstant(iso: string, language = 'en'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date)
}

/** Two letters for an avatar tile, from the first two words of a name. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()
}
