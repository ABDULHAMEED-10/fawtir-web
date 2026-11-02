import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bodyForSigning,
  canonicalNumber,
  canonicalSale,
  offlineSaleMessage,
  UnsignableSale,
} from './canonical'

// NOT RUN (batch 39, static only). The vectors are the backend's
// core/src/test/resources/pos/offline-sale-v1-vectors.json at cf145c092, copied byte for byte
// (sha256 48260447…5583f27); the server's own test reads the same file, so a pass on both sides is
// what proves the two canonicalisers agree. Read as text and parsed here, not imported, so no bundler
// transform touches the numbers or strings.
type Vector = {
  name: string
  body: Record<string, unknown>
  expected?: string
  unsignable?: 'SOLD_AT_PRECISION' | 'PAYLOAD_INVALID'
  holdsCardNumber?: boolean
}

const VECTORS = (
  JSON.parse(
    readFileSync(join(process.cwd(), 'src/lib/posSigning/offline-sale-v1-vectors.json'), 'utf8'),
  ) as { version: string; vectors: Vector[] }
).vectors

function canonical(body: Record<string, unknown>): string {
  return canonicalSale(bodyForSigning(body))
}

function unsignableReason(body: Record<string, unknown>): string | null {
  try {
    canonical(body)
    return null
  } catch (refused) {
    return refused instanceof UnsignableSale ? refused.reason : 'NOT_UNSIGNABLE'
  }
}

const utf8 = (text: string) => Array.from(new TextEncoder().encode(text))

describe('offline sale canonical form against the shared golden vectors', () => {
  it('has every vector the backend ships', () => {
    expect(VECTORS.length).toBe(15)
  })

  for (const vector of VECTORS) {
    if (vector.expected !== undefined) {
      it(`reproduces byte for byte: ${vector.name}`, () => {
        expect(utf8(canonical(vector.body))).toEqual(utf8(vector.expected!))
      })
    } else {
      it(`refuses to sign: ${vector.name}`, () => {
        expect(unsignableReason(vector.body)).toBe(vector.unsignable)
      })
    }
  }
})

describe('canonical numbers', () => {
  it('writes what BigDecimal.stripTrailingZeros().toPlainString() writes', () => {
    expect(canonicalNumber(0)).toBe('0')
    expect(canonicalNumber(-0)).toBe('0')
    expect(canonicalNumber(1.1)).toBe('1.1')
    expect(canonicalNumber(1.5e-7)).toBe('0.00000015')
    expect(canonicalNumber(1e21)).toBe('1000000000000000000000')
    expect(canonicalNumber(-2.31)).toBe('-2.31')
    expect(canonicalNumber(100)).toBe('100')
  })

  it('cannot sign a number JSON cannot carry', () => {
    expect(() => canonicalNumber(Number.NaN)).toThrow(UnsignableSale)
    expect(() => canonicalNumber(Number.POSITIVE_INFINITY)).toThrow(UnsignableSale)
  })
})

describe('normalising before signing', () => {
  const base = VECTORS[0].body

  it('lowercases identifiers but leaves free text that looks like one as typed', () => {
    const upper = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
    const body = bodyForSigning({ ...base, tillId: upper, invoiceNumber: upper }) as Record<
      string,
      unknown
    >
    expect(body.tillId).toBe(upper.toLowerCase())
    expect(body.invoiceNumber).toBe(upper)
  })

  it('keeps a repeated transaction subtype once, as the server set does', () => {
    const draft = base.draft as Record<string, unknown>
    const body = bodyForSigning({
      ...base,
      draft: { ...draft, details: { transactionSubtypes: ['EXPORT', 'DEEMED_SUPPLY', 'EXPORT'] } },
    }) as { draft: { details: { transactionSubtypes: string[] } } }
    expect(body.draft.details.transactionSubtypes).toEqual(['DEEMED_SUPPLY', 'EXPORT'])
  })

  it('does not change the body it was given', () => {
    const body = { ...base, tillId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' }
    bodyForSigning(body)
    expect(body.tillId).toBe('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA')
  })
})

describe('the signed message', () => {
  it('is the prefix, then the envelope members in code-unit order', () => {
    const text = new TextDecoder().decode(
      offlineSaleMessage(
        {
          tenantId: '55555555-5555-5555-5555-555555555555',
          deviceId: '66666666-6666-6666-6666-666666666666',
          keyId: '44444444-4444-4444-4444-444444444444',
          cashierUserId: '77777777-7777-7777-7777-777777777777',
          shiftId: '88888888-8888-8888-8888-888888888888',
          idempotencyKey: 'key-1',
        },
        '{"a":"1"}',
      ),
    )
    expect(text).toBe(
      'fawtir-pos-offline-sale/v1\n' +
        '{"cashierUserId":"77777777-7777-7777-7777-777777777777",' +
        '"deviceId":"66666666-6666-6666-6666-666666666666",' +
        '"idempotencyKey":"key-1",' +
        '"keyId":"44444444-4444-4444-4444-444444444444",' +
        '"sale":{"a":"1"},' +
        '"shiftId":"88888888-8888-8888-8888-888888888888",' +
        '"tenantId":"55555555-5555-5555-5555-555555555555",' +
        '"v":"1"}',
    )
  })
})
