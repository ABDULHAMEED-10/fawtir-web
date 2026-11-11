/**
 * The canonical form of a queued till sale, as the offline signature covers it (BINDING-DESIGN
 * §4.3, SEC-R C1). The server builds the same bytes from the request it bound
 * (`OfflineSaleCanonicalJson`); the shared golden vectors (`offline-sale-v1-vectors.json`, copied
 * verbatim from the backend) are the arbiter, so a change here starts with a change there.
 *
 * Generic on purpose: the web canonicalises the exact object it sends, with no list of field types.
 * That is what lets an older till sign a body the newer server knows more fields of (C1): absent and
 * `null` give the same bytes, and every number is written as a decimal string, so the server need not
 * tell an integer from a decimal either. No JCS library: one hand-written writer, as on the server.
 */

/** Why a sale cannot be signed; the same names the server holds the sale with. */
export type UnsignableReason = 'SOLD_AT_PRECISION' | 'PAYLOAD_INVALID'

export class UnsignableSale extends Error {
  // A declared field, not a constructor parameter property: the app builds under
  // `erasableSyntaxOnly`, which refuses parameter properties (TS1294).
  readonly reason: UnsignableReason

  constructor(reason: UnsignableReason) {
    super(reason)
    this.reason = reason
    this.name = 'UnsignableSale'
  }
}

/** Transport members, the signature itself, and the slip read after the sale (§4.2). Closed list. */
const EXCLUDED_TOP = new Set(['queuedOffline', 'offlineProof'])
const EXCLUDED_PAYMENT = new Set(['slipFileId', 'slipFields'])

/**
 * A JavaScript number as the server's `BigDecimal.stripTrailingZeros().toPlainString()` writes it,
 * zero as "0". String operations on `String(n)` only: arithmetic would change the digits.
 */
export function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new UnsignableSale('PAYLOAD_INVALID')
  const text = String(value)
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(text)
  if (!match) throw new UnsignableSale('PAYLOAD_INVALID')
  const [, sign, whole, fraction = '', exponentText] = match
  const exponent = exponentText ? Number(exponentText) : 0
  const digits = whole + fraction
  // Where the decimal point falls in `digits` once the exponent is applied.
  const point = whole.length + exponent
  let integerPart: string
  let fractionPart: string
  if (point <= 0) {
    integerPart = '0'
    fractionPart = '0'.repeat(-point) + digits
  } else if (point >= digits.length) {
    integerPart = digits + '0'.repeat(point - digits.length)
    fractionPart = ''
  } else {
    integerPart = digits.slice(0, point)
    fractionPart = digits.slice(point)
  }
  integerPart = integerPart.replace(/^0+(?=\d)/, '')
  fractionPart = fractionPart.replace(/0+$/, '')
  const plain = fractionPart ? `${integerPart}.${fractionPart}` : integerPart
  if (/^0(\.0*)?$/.test(plain)) return '0'
  return sign + plain
}

/**
 * RFC 8785 §3.2.2.2 string escaping, as ECMAScript `JSON.stringify` does it: only `"`, `\` and the
 * C0 controls are escaped, with lowercase hex; everything else, U+2028/U+2029 included, is raw. No
 * normalisation. A lone surrogate has no UTF-8 form, so the sale cannot be signed (it is queued
 * unsigned and held for review, never refused at the till).
 */
export function canonicalString(value: string): string {
  let out = '"'
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new UnsignableSale('PAYLOAD_INVALID')
      out += value[i] + value[i + 1]
      i++
      continue
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new UnsignableSale('PAYLOAD_INVALID')
    if (unit === 0x22) out += '\\"'
    else if (unit === 0x5c) out += '\\\\'
    else if (unit === 0x08) out += '\\b'
    else if (unit === 0x09) out += '\\t'
    else if (unit === 0x0a) out += '\\n'
    else if (unit === 0x0c) out += '\\f'
    else if (unit === 0x0d) out += '\\r'
    else if (unit < 0x20) out += '\\u' + unit.toString(16).padStart(4, '0')
    else out += value[i]
  }
  return out + '"'
}

/** RFC 8785 member order: UTF-16 code units, which is JavaScript's default string comparison. */
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return canonicalString(value)
  if (typeof value === 'number') return canonicalString(canonicalNumber(value))
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    // An array position cannot be left out, so a null element stays null.
    return '[' + value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',') + ']'
  }
  if (typeof value === 'object') {
    const members = Object.keys(value as Record<string, unknown>)
      .filter((name) => {
        const member = (value as Record<string, unknown>)[name]
        return member !== null && member !== undefined
      })
      .sort(byCodeUnits)
      .map((name) => canonicalString(name) + ':' + canonicalJson((value as Record<string, unknown>)[name]))
    return '{' + members.join(',') + '}'
  }
  // A function, symbol or bigint is not JSON: nothing the server could bind, so nothing to sign.
  throw new UnsignableSale('PAYLOAD_INVALID')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A fourth fraction digit that is zero still names a whole millisecond, which the server signs.
const SUB_MILLISECOND = /\.\d{3}\d*[1-9]/

function normaliseSoldAt(soldAt: unknown): unknown {
  if (typeof soldAt !== 'string') return soldAt
  // The server keeps the instant it bound; finer than a millisecond it cannot be written in the
  // signed form, so the web does not pretend it can.
  if (SUB_MILLISECOND.test(soldAt)) throw new UnsignableSale('SOLD_AT_PRECISION')
  const at = new Date(soldAt)
  if (Number.isNaN(at.getTime())) throw new UnsignableSale('PAYLOAD_INVALID')
  return at.toISOString()
}

/**
 * Only members named like an identifier (`…Id`, or an element of `…Ids`) are lowercased: the server
 * writes a bound `UUID` lowercase but a `String` exactly as sent, so lowercasing a description that
 * happens to look like a UUID would sign bytes the server never writes.
 */
function isIdMember(key: string | null): boolean {
  return key !== null && (key.endsWith('Id') || key.endsWith('Ids'))
}

/**
 * The server binds `transactionSubtypes` as a `Set`, the only set in the sale request at cf145c092:
 * a repeated member is kept once and the members are signed in order. The web sends the same.
 */
const SET_MEMBERS = new Set(['transactionSubtypes'])

function normalised(value: unknown, key: string | null): unknown {
  if (typeof value === 'string') return isIdMember(key) && UUID.test(value) ? value.toLowerCase() : value
  if (Array.isArray(value)) {
    const items = value.map((item) => normalised(item, key))
    return key !== null && SET_MEMBERS.has(key) && items.every((item) => typeof item === 'string')
      ? [...new Set(items as string[])].sort(byCodeUnits)
      : items
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [name, member] of Object.entries(value as Record<string, unknown>)) {
      out[name] = normalised(member, name)
    }
    return out
  }
  return value
}

/**
 * The body in the forms the server writes (§4.3): identifiers lowercase, `soldAt` as UTC with three
 * fraction digits, `transactionSubtypes` sorted. The web sends this body, not the one it was given,
 * so what it signs and what it sends are the same object.
 */
export function bodyForSigning<T extends object>(body: T): T {
  const out = normalised(body, null) as Record<string, unknown>
  if ('soldAt' in out) out.soldAt = normaliseSoldAt(out.soldAt)
  return out as T
}

/** The canonical `sale`: the body as sent, exclusions removed. */
export function canonicalSale(body: object): string {
  const top: Record<string, unknown> = {}
  for (const [name, member] of Object.entries(body as Record<string, unknown>)) {
    if (EXCLUDED_TOP.has(name)) continue
    top[name] =
      name === 'payments' && Array.isArray(member)
        ? member.map((payment) => {
            if (payment === null || typeof payment !== 'object') return payment
            const kept: Record<string, unknown> = {}
            for (const [field, part] of Object.entries(payment as Record<string, unknown>)) {
              if (!EXCLUDED_PAYMENT.has(field)) kept[field] = part
            }
            return kept
          })
        : member
  }
  return canonicalJson(top)
}

export const MESSAGE_PREFIX = 'fawtir-pos-offline-sale/v1\n'
export const ENVELOPE_VERSION = '1'

export type EnvelopeFacts = {
  tenantId: string
  deviceId: string
  keyId: string
  cashierUserId: string
  shiftId: string
  idempotencyKey: string
}

/**
 * The bytes signed: the prefix, then the envelope in RFC 8785 order. The server writes the same
 * envelope from its key row (`OfflineSaleEnvelope`), so a device naming another tenant, cashier,
 * shift or device fails the signature rather than being believed.
 */
export function offlineSaleMessage(
  facts: EnvelopeFacts,
  canonicalSaleJson: string,
): Uint8Array<ArrayBuffer> {
  const member = (name: string, value: string) => canonicalString(name) + ':' + canonicalString(value)
  const text =
    MESSAGE_PREFIX +
    '{' +
    [
      member('cashierUserId', facts.cashierUserId.toLowerCase()),
      member('deviceId', facts.deviceId.toLowerCase()),
      member('idempotencyKey', facts.idempotencyKey),
      member('keyId', facts.keyId.toLowerCase()),
      canonicalString('sale') + ':' + canonicalSaleJson,
      member('shiftId', facts.shiftId.toLowerCase()),
      member('tenantId', facts.tenantId.toLowerCase()),
      member('v', ENVELOPE_VERSION),
    ].join(',') +
    '}'
  return new TextEncoder().encode(text)
}
