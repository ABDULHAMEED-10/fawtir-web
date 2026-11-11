import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bodyForSigning,
  canonicalNumber,
  canonicalSale,
  offlineSaleMessage,
  UnsignableSale,
  type EnvelopeFacts,
} from './canonical'

// NOT RUN (batch 39, static only). The vectors are the backend's
// core/src/test/resources/pos/offline-sale-v1-vectors.json at fix/b39-off cf49f0447, copied byte
// for byte (sha256 0c230b02…6cdaa71e); the server's own test reads the same file, so a pass on both
// sides is what proves the two canonicalisers agree. Read as text and parsed here, not imported, so
// no bundler transform touches the numbers or strings.
type Vector = {
  name: string
  /** `both`: the web reproduces `expected`. `server-only`: normalisation only the server does. */
  side: 'both' | 'server-only'
  body: Record<string, unknown>
  expected?: string
  unsignable?: 'SOLD_AT_PRECISION' | 'PAYLOAD_INVALID'
  holdsCardNumber?: boolean
  /** Hex of the signed bytes: the prefix and the envelope built from `envelope` and `expected`. */
  message?: string
  /** Standard base64 DER of a throwaway P-256 key whose private half was discarded. */
  publicKeySpki?: string
  /** Base64url P1363. */
  signature?: string
}

type VectorFile = {
  version: string
  envelope: EnvelopeFacts
  vectors: Vector[]
  duplicateKey: {
    raw: string
    publicKeySpki: string
    firstValueMessage: string
    firstValueSignature: string
    lastValueMessage: string
    lastValueSignature: string
  }
}

const FILE = JSON.parse(
  readFileSync(join(process.cwd(), 'src/lib/posSigning/offline-sale-v1-vectors.json'), 'utf8'),
) as VectorFile
const VECTORS = FILE.vectors

const utf8 = (text: string) => Array.from(new TextEncoder().encode(text))
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function verifies(spki: string, signature: string, message: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'spki',
    fromBase64(spki),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    fromBase64(signature),
    message as Uint8Array<ArrayBuffer>,
  )
}

function unsignableReason(body: Record<string, unknown>): string | null {
  try {
    canonicalSale(bodyForSigning(body))
    return null
  } catch (refused) {
    return refused instanceof UnsignableSale ? refused.reason : 'NOT_UNSIGNABLE'
  }
}

// SEC-R B39-SR-2: the web is held only to `side: "both"`. A `server-only` vector names
// normalisation the generic canonicaliser does not do, so the web's bytes for that body must differ
// from the server's: such a body would fail SIGNATURE, and the web never sends it in that form
// (`bodyForSigning` puts it in the server's form first).
const BOTH = VECTORS.filter((vector) => vector.side === 'both')
const SERVER_ONLY = VECTORS.filter((vector) => vector.side === 'server-only')

describe('offline sale canonical form against the shared golden vectors', () => {
  it('has every vector tagged, both kinds present', () => {
    expect(VECTORS.every((vector) => vector.side === 'both' || vector.side === 'server-only')).toBe(
      true,
    )
    expect(BOTH.length).toBeGreaterThan(0)
    expect(SERVER_ONLY.length).toBeGreaterThan(0)
  })

  for (const vector of BOTH) {
    if (vector.expected === undefined) {
      it(`refuses to sign: ${vector.name}`, () => {
        expect(unsignableReason(vector.body)).toBe(vector.unsignable)
      })
      continue
    }
    it(`reproduces byte for byte: ${vector.name}`, () => {
      expect(utf8(canonicalSale(vector.body))).toEqual(utf8(vector.expected!))
      // The normalising step the till runs before signing changes nothing on a body already in form.
      expect(utf8(canonicalSale(bodyForSigning(vector.body)))).toEqual(utf8(vector.expected!))
    })
    if (vector.message !== undefined) {
      it(`builds the signed bytes: ${vector.name}`, () => {
        expect(hex(offlineSaleMessage(FILE.envelope, canonicalSale(vector.body)))).toBe(vector.message)
      })
    }
    if (vector.signature !== undefined && vector.publicKeySpki !== undefined) {
      it(`verifies the shared signature with Web Crypto: ${vector.name}`, async () => {
        const message = offlineSaleMessage(FILE.envelope, canonicalSale(vector.body))
        expect(await verifies(vector.publicKeySpki!, vector.signature!, message)).toBe(true)
      })
    }
  }

  for (const vector of SERVER_ONLY.filter((v) => v.expected !== undefined)) {
    it(`does not reproduce the server's normalisation by itself: ${vector.name}`, () => {
      expect(canonicalSale(vector.body)).not.toBe(vector.expected)
    })
  }

  it('signs a repeated member as the server binds it: the last value', async () => {
    const dup = FILE.duplicateKey
    const message = offlineSaleMessage(
      FILE.envelope,
      canonicalSale(JSON.parse(dup.raw) as Record<string, unknown>),
    )
    expect(hex(message)).toBe(dup.lastValueMessage)
    expect(await verifies(dup.publicKeySpki, dup.lastValueSignature, message)).toBe(true)
    expect(await verifies(dup.publicKeySpki, dup.firstValueSignature, message)).toBe(false)
  })
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
