import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeQr,
  qrAmounts,
  qrIssueMoment,
  QR_UUID_NAMESPACE,
  sellerUuid,
  uuidV5,
  type QrFields,
} from './posQr'

// The shared cross-language fixture (PRV43-RC5-IMPL2 review §4, T-W1). The backend keeps the same
// bytes and pins the same hash, so a change on either side fails both. .gitattributes keeps it LF
// in the working tree; the CRLF fold is only a guard for a checkout made before that.
const FIXTURE = readFileSync(join(process.cwd(), 'src/lib/qr-vectors.v1.json'), 'utf8').replace(/\r\n/g, '\n')
const FIXTURE_SHA256 = '02c3d32332354ad0b15378c13aa2cdfa94909bb7baa1d8e8d3ba09279667901b'

interface PayloadRow {
  id: string
  fields: QrFields
  sellerUuid?: string
  payload?: string
  refused?: string
}
interface AmountRow {
  id: string
  taxable: string
  vat: string
  minorUnits: number | null
  side?: 'web'
  totalWithVat?: string
  vatTotal?: string
  refused?: boolean
}
interface MomentRow {
  id: string
  soldAt: string
  zone: string
  side?: 'web'
  issueDate?: string
  issueTime?: string
  refused?: boolean
}
const vectors = JSON.parse(FIXTURE) as {
  uuidNamespace: string
  payloads: PayloadRow[]
  negative: { id: string; uuidName: string[]; sellerUuid: string; currentLayout: string }[]
  amounts: AmountRow[]
  moments: MomentRow[]
}

/** Reads a TLV payload back, to show what each tag carries. */
function tags(payload: string): string[] {
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
  const values: string[] = []
  for (let at = 0; at < bytes.length; at += 2 + bytes[at + 1]) {
    expect(bytes[at]).toBe(values.length + 1)
    values.push(new TextDecoder().decode(bytes.subarray(at + 2, at + 2 + bytes[at + 1])))
  }
  return values
}

const row = (id: string) => vectors.payloads.find((each) => each.id.startsWith(id))!

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the shared QR fixture (T-X7 integrity, T-W1)', () => {
  it('is the pinned file, under the SA namespace', () => {
    expect(createHash('sha256').update(FIXTURE).digest('hex')).toBe(FIXTURE_SHA256)
    expect(vectors.uuidNamespace).toBe(QR_UUID_NAMESPACE)
    expect(FIXTURE).not.toMatch(/[^\n\x20-\x7e]/)
  })

  it('marks as web-only only refusals of input the backend never receives (WB6-4)', () => {
    const webOnly = [...vectors.amounts, ...vectors.moments].filter((row) => row.side === 'web')
    expect(webOnly.length).toBeGreaterThanOrEqual(6)
    expect(webOnly.every((row) => row.refused === true)).toBe(true)
    expect(vectors.payloads.some((row) => 'side' in row)).toBe(false)
  })
})

describe('the QR payload and Seller UUID (T-X1, T-X2, T-X5)', () => {
  it.each(vectors.payloads.map((each) => [each.id, each] as const))('%s', async (_id, vector) => {
    const qr = await encodeQr(vector.fields)
    if (vector.refused) {
      expect(qr).toBeNull()
      return
    }
    expect(qr).toEqual({ payload: vector.payload, sellerUuid: vector.sellerUuid })
    expect(await sellerUuid(vector.fields)).toBe(vector.sellerUuid)
  })

  it('pins the published App D values as literals, not only through the fixture', async () => {
    expect((await encodeQr(row('T-X1 SA App D.1 a.ii').fields))?.sellerUuid).toBe(
      '454cb7ea-f1f7-5b69-9e0b-756f002efa52',
    )
    expect(await encodeQr(row('T-X1 SA App D.1 b.ii').fields)).toEqual({
      sellerUuid: '9724a780-2360-502a-b6a2-201bf0f068c6',
      payload:
        'AQMxLjECAjAyAwpJTlZPSUNFLTAxBAjYqNin2KbYuQUMT00xMjM0NTY3ODkyBgoyMDI2LTA1LTEzBwgxODozMDowMAgIMTAzMi4yMTAJJDk3MjRhNzgwLTIzNjAtNTAyYS1iNmEyLTIwMWJmMGYwNjhjNg==',
    })
  })

  it('lays out ten tags with the invoice number at 3, and nine for profit margin', async () => {
    const full = tags((await encodeQr(row('T-X1 SA App D.1 a.ii').fields))!.payload)
    expect(full).toEqual([
      '1.1',
      '01',
      'INVOICE-01',
      'بائع',
      'OM1234567891',
      '2026-05-13',
      '18:31:00',
      '302.340',
      '14.520',
      '454cb7ea-f1f7-5b69-9e0b-756f002efa52',
    ])
    expect(new TextEncoder().encode(full[3])).toHaveLength(8)
    const margin = tags((await encodeQr(row('T-X1 SA App D.1 b.ii').fields))!.payload)
    expect(margin).toHaveLength(9)
    expect(margin[8]).toBe('9724a780-2360-502a-b6a2-201bf0f068c6')
  })

  it('upper-cases only the UUID name: the QR carries the name as written, untrimmed', async () => {
    const sharp = row('T-X5 uppercase')
    expect(tags((await encodeQr(sharp.fields))!.payload)[3]).toBe('Straße Café')
    const spaced = row('T-X5 a name with surrounding spaces')
    expect(tags((await encodeQr(spaced.fields))!.payload)[3]).toBe('  Al Naseem  ')
    expect(sharp.sellerUuid).not.toBe((await encodeQr({ ...sharp.fields, sellerName: 'Strasse Cafe' }))!.sellerUuid)
  })

  it('the v1.0.1 layout yields 16bd390c, and the current layout does not', async () => {
    for (const negative of vectors.negative) {
      expect(await uuidV5(negative.uuidName.join('|').toUpperCase())).toBe(negative.sellerUuid)
      expect((await encodeQr(row(negative.currentLayout).fields))!.sellerUuid).not.toBe(negative.sellerUuid)
    }
  })

  it('counts the 700-character limit on the padded Base64', () => {
    expect(row('T-X5 a 700-character').payload).toHaveLength(700)
  })
})

describe('the QR amounts (T-X3, review R-1)', () => {
  it.each(vectors.amounts.map((each) => [each.id, each] as const))('%s', (_id, vector) => {
    const amounts = qrAmounts(vector.taxable, vector.vat, vector.minorUnits as number)
    if (vector.refused) expect(amounts).toBeNull()
    else expect(amounts).toEqual({ totalWithVat: vector.totalWithVat, vatTotal: vector.vatTotal })
  })
})

describe('the QR date and time (T-X4, T-X6)', () => {
  it.each(vectors.moments.map((each) => [each.id, each] as const))('%s', (_id, vector) => {
    const moment = qrIssueMoment(vector.soldAt, vector.zone)
    if (vector.refused) expect(moment).toBeNull()
    else expect(moment).toEqual({ issueDate: vector.issueDate, issueTime: vector.issueTime })
  })
})

describe('no QR rather than a wrong one, and never a throw', () => {
  const FULL = () => ({ ...row('T-X2 repo PintOmSellerUuidTest full').fields })

  it('without Web Crypto (a non-secure page) there is no QR', async () => {
    vi.stubGlobal('crypto', {})
    expect(await encodeQr(FULL())).toBeNull()
    expect(await uuidV5('x')).toBeNull()
  })

  it('a digest that fails gives no QR', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: () => Promise.reject(new Error('refused')) } })
    expect(await encodeQr(FULL())).toBeNull()
  })

  it.each([
    ['a blank invoice number', { invoiceNumber: '  ' }],
    ['a missing seller name', { sellerName: undefined as unknown as string }],
    ['a blank VATIN', { sellerVatin: '' }],
    ['a full invoice without its VAT total', { vatTotal: null }],
    ['profit margin with a VAT total', { invoiceType: '02' as const }],
    ['an invoice type the SA does not define', { invoiceType: '03' as unknown as '01' }],
  ])('%s gives no QR', async (_label, change) => {
    expect(await encodeQr({ ...FULL(), ...change })).toBeNull()
    expect(await sellerUuid({ ...FULL(), ...change })).toBeNull()
  })

  it('garbage in gives null out, not an exception', async () => {
    await expect(encodeQr(null as unknown as QrFields)).resolves.toBeNull()
    expect(qrAmounts(undefined as unknown as string, '1', 3)).toBeNull()
    expect(qrAmounts('1', '1', 2.5)).toBeNull()
    expect(qrIssueMoment(undefined as unknown as string, 'Asia/Muscat')).toBeNull()
    expect(qrIssueMoment('2026-13-45T99:00:00Z', 'Asia/Muscat')).toBeNull()
  })

  it('the parts compose into the vector they came from', async () => {
    const moment = qrIssueMoment('2026-11-05T19:30:00Z', 'Asia/Muscat')!
    const amounts = qrAmounts('1.010', '0.051', 3)!
    const qr = await encodeQr({ ...FULL(), ...moment, ...amounts })
    expect(tags(qr!.payload).slice(5, 9)).toEqual(['2026-11-05', '23:30:00', '1.060', '0.051'])
  })
})
