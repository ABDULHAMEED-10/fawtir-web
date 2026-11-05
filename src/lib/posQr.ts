/**
 * The Oman B2C receipt QR (SA v1.0.3 §4.2 Tables 5/6, App. D), computed on the till for a sale
 * sold offline, so the receipt can carry it before the server has filed the sale (owner decision
 * 2026-11-05, QR-W1). Pure functions only: wiring into the queue and the receipt is QR-W3.
 *
 * It is a second encoder of a certified output, so it reproduces the server byte for byte rather
 * than the spec's prose: PintOmQrPayloadFactory (formatting), PintOmSellerUuid (BTOM-004),
 * QrTlvEncoder (TLV, limits, Base64) and AuthoredInvoiceCanonicalMapper (amounts). The shared
 * fixture qr-vectors.v1.json pins both sides (PRV43-RC5-IMPL2 review §4, T-X1..X6).
 *
 * Every function answers null for "no QR", never throws: the receipt then says the QR is to follow,
 * which is today's approved state (INCOME.md P.28). A QR must never stop a sale.
 */

/** SA v1.0.3 §10.2.3 and App. D.1; public by design. */
export const QR_UUID_NAMESPACE = 'e0bc4ac8-b025-46e5-a76d-0c893fc3027e'

/** One byte of length per value (QrTlvEncoder.MAX_VALUE_BYTES). */
export const QR_MAX_VALUE_BYTES = 255
/** QrTlvEncoder.MAX_BASE64_LENGTH. Padded Base64 is a multiple of 4, so 700 is followed by 704. */
export const QR_MAX_BASE64_LENGTH = 700

/** '01' full or simplified (ten tags), '02' profit margin (nine tags, no VAT total). */
export type QrInvoiceType = '01' | '02'

export interface QrFields {
  qrVersion: string
  invoiceType: QrInvoiceType
  invoiceNumber: string
  sellerName: string
  sellerVatin: string
  issueDate: string
  issueTime: string
  totalWithVat: string
  /** Tag 9 on '01'; must be null on '02'. */
  vatTotal: string | null
}

export interface PosQr {
  payload: string
  sellerUuid: string
}

/**
 * The only zone a QR is computed in. The server reads IBT-168 at Asia/Muscat and IBT-002 in the
 * tenant zone; for any other tenant zone the pair can disagree across midnight, and E-2 makes the
 * server refuse such a zone (T-X6). Refusing here too is the narrower, closed choice.
 */
export const QR_ZONE = 'Asia/Muscat'

const utf8 = new TextEncoder()

function subtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** RFC 9562 §5.5 under the SA namespace, as InvoiceUuidV5 computes it. */
export async function uuidV5(name: string): Promise<string | null> {
  const engine = subtle()
  if (!engine) return null
  try {
    const space = new Uint8Array(QR_UUID_NAMESPACE.replace(/-/g, '').match(/../g)!.map((pair) => parseInt(pair, 16)))
    const text = utf8.encode(name)
    const input = new Uint8Array(space.length + text.length)
    input.set(space)
    input.set(text, space.length)
    const digest = new Uint8Array(await engine.digest('SHA-1', input)).slice(0, 16)
    digest[6] = (digest[6] & 0x0f) | 0x50
    digest[8] = (digest[8] & 0x3f) | 0x80
    const x = hex(digest)
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
  } catch {
    return null
  }
}

/**
 * Java's String.isBlank, which the factory uses to refuse a value (it never trims a kept one): every
 * code point is Character.isWhitespace. That is not JS trim(): Java counts U+001C..U+001F and does
 * not count the no-break spaces U+00A0, U+2007, U+202F (review WB6-6).
 */
const JAVA_WHITESPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x205f, 0x3000,
])
const blank = (value: unknown) =>
  typeof value !== 'string' || [...value].every((char) => JAVA_WHITESPACE.has(char.codePointAt(0)!))

function fieldsInOrder(fields: QrFields): string[] | null {
  const { qrVersion, invoiceType, invoiceNumber, sellerName, sellerVatin, issueDate, issueTime } = fields
  const values = [qrVersion, invoiceType, invoiceNumber, sellerName, sellerVatin, issueDate, issueTime]
  values.push(fields.totalWithVat)
  if (invoiceType === '01') {
    if (fields.vatTotal === null) return null
    values.push(fields.vatTotal)
  } else if (invoiceType !== '02' || fields.vatTotal !== null) {
    return null
  }
  return values.some(blank) ? null : values
}

/**
 * BTOM-004: the tag values joined by "|" and upper-cased, as PintOmSellerUuid does with
 * toUpperCase(Locale.ROOT). Only the name is upper-cased; the QR carries the values as they are.
 * The fixture pins the cases where the two languages could differ (ß, accented Latin).
 */
export async function sellerUuid(fields: QrFields): Promise<string | null> {
  try {
    const values = fieldsInOrder(fields)
    return values ? await uuidV5(values.join('|').toUpperCase()) : null
  } catch {
    return null
  }
}

/** The receipt QR: TLV of tags 1..9 (or 1..8) and the Seller UUID, in padded standard Base64. */
export async function encodeQr(fields: QrFields): Promise<PosQr | null> {
  try {
    const values = fieldsInOrder(fields)
    if (!values) return null
    const uuid = await sellerUuid(fields)
    if (!uuid) return null
    const encoded = [...values, uuid].map((value) => utf8.encode(value))
    if (encoded.some((bytes) => bytes.length > QR_MAX_VALUE_BYTES)) return null
    const tlv = new Uint8Array(encoded.reduce((size, bytes) => size + 2 + bytes.length, 0))
    let at = 0
    encoded.forEach((bytes, index) => {
      tlv[at] = index + 1
      tlv[at + 1] = bytes.length
      tlv.set(bytes, at + 2)
      at += 2 + bytes.length
    })
    let binary = ''
    tlv.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    const payload = btoa(binary)
    return payload.length > QR_MAX_BASE64_LENGTH ? null : { payload, sellerUuid: uuid }
  } catch {
    return null
  }
}

const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/

interface Decimal {
  units: bigint
  scale: number
}

function parse(text: string): Decimal | null {
  const match = typeof text === 'string' ? DECIMAL.exec(text) : null
  if (!match) return null
  const fraction = match[2] ?? ''
  return { units: BigInt(match[1] + fraction), scale: fraction.length }
}

function plain({ units, scale }: Decimal): string {
  if (scale === 0) return units.toString()
  const digits = units.toString().padStart(scale + 1, '0')
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

/** BigDecimal.setScale(2, HALF_UP) of a non-negative value. */
function halfUp2({ units, scale }: Decimal): Decimal {
  if (scale <= 2) return { units: units * 10n ** BigInt(2 - scale), scale: 2 }
  const divisor = 10n ** BigInt(scale - 2)
  const quotient = units / divisor
  return { units: units % divisor >= (divisor + 1n) / 2n ? quotient + 1n : quotient, scale: 2 }
}

/** PintOmQrPayloadFactory.formatted: padded to the minor units, never truncated. */
function formatted(value: Decimal, minorUnits: number): string {
  return value.scale >= minorUnits
    ? plain(value)
    : plain({ units: value.units * 10n ** BigInt(minorUnits - value.scale), scale: minorUnits })
}

/**
 * Tags 8 and 9 of an '01' QR from the server's projected document totals (review R-1), not the
 * printed totals:
 * - tag 8 = HALF_UP2(taxable) + HALF_UP2(vat), as AuthoredInvoiceCanonicalMapper builds IBT-112
 *   under ibr-co-15 (:878-881), padded to the currency's minor units;
 * - tag 9 = the projected VAT at the currency scale, unrounded (:193-194, :820-832).
 * So net 1.010 at 5% gives tag 9 0.051 and tag 8 1.060 while the receipt prints 1.061, and tag 9
 * can differ from the filed IBT-110 (R-2, an open owner and OTA question this keeps as it is today).
 *
 * minorUnits is the tax currency's, supplied by the caller: nothing here assumes OMR. A value the
 * server would not produce (negative, non-plain, an unknown scale) gives no QR.
 */
export function qrAmounts(
  taxable: string,
  vat: string,
  minorUnits: number,
): { totalWithVat: string; vatTotal: string } | null {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4) return null
  const net = parse(taxable)
  const tax = parse(vat)
  if (!net || !tax) return null
  const total = { units: halfUp2(net).units + halfUp2(tax).units, scale: 2 }
  return { totalWithVat: formatted(total, minorUnits), vatTotal: formatted(tax, minorUnits) }
}

const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/

/**
 * Tags 6 and 7 from one soldAt instant, at Asia/Muscat. The time is truncated to whole seconds,
 * never rounded (java.time's HH:mm:ss drops the fraction: 23:59:59.999 stays 23:59:59), and
 * h23, so midnight is 00:00:00, never 24:00:00.
 */
export function qrIssueMoment(soldAt: string, zone: string): { issueDate: string; issueTime: string } | null {
  if (zone !== QR_ZONE || typeof soldAt !== 'string') return null
  const match = INSTANT.exec(soldAt)
  if (!match) return null
  // Date keeps milliseconds only; cutting the rest off first keeps "truncate, never round".
  const instant = Date.parse(`${match[1]}.${(match[2] ?? '').slice(0, 3).padEnd(3, '0')}${match[3]}`)
  if (Number.isNaN(instant)) return null
  // Date.parse rolls an impossible value over (2026-02-30 becomes 2 March, 24:00:00 the next day);
  // read back at the stated offset, the instant must give exactly the fields that were sent
  // (review WB6-5). Java's parse refuses them too.
  const sign = match[4] === '-' ? -1 : 1
  const offsetMinutes = match[3] === 'Z' ? 0 : sign * (Number(match[5]) * 60 + Number(match[6]))
  if (Math.abs(offsetMinutes) > 18 * 60) return null
  if (new Date(instant + offsetMinutes * 60_000).toISOString().slice(0, 19) !== match[1]) return null
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant))
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((each) => each.type === type)?.value ?? ''
    const issueDate = `${part('year')}-${part('month')}-${part('day')}`
    const issueTime = `${part('hour')}:${part('minute')}:${part('second')}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return null
    if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(issueTime)) return null
    return { issueDate, issueTime }
  } catch {
    return null
  }
}
