import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosPrintedTotals, PosQrProfile, PosSaleRequest, PosTillDto } from '../api/pos/pos'
import { offlinePrintedQr } from './posOfflineQr'
import { encodeQr, sellerUuid } from './posQr'
import {
  correctQueuedSale,
  flushQueue,
  noteQueueSender,
  queuedFor,
  resetPosQueue,
  submitSale,
} from './posQueue'
import { memoryVault, setPosVault } from './posVault'

/** QR-W3 (QR E-1): the offline receipt QR built from the till's qrProfile and sent as printedQr. */

const VECTORS = JSON.parse(
  readFileSync(join(process.cwd(), 'src/lib/qr-vectors.v1.json'), 'utf8'),
) as { amounts: { id: string; taxable: string; vat: string; minorUnits: number; totalWithVat?: string; vatTotal?: string }[] }
// The fixture row whose tag 8 differs from the printed total: 10.005 + 0.505 is 10.01 + 0.51.
const AMOUNTS = VECTORS.amounts.find((row) => row.id.startsWith('T-X3 ibr-co-15'))!

const PROFILE: PosQrProfile = {
  qrVersion: '1.1',
  invoiceType: '01',
  sellerName: 'Al Noor Trading LLC',
  sellerVatin: 'OM1100012345',
  issueDateZone: 'Asia/Muscat',
  issueTimeZone: 'Asia/Muscat',
  amountScale: 3,
  profileVersion: 'a'.repeat(64),
}

const PRINTED: PosPrintedTotals = { taxable: 10.005, vat: 0.505, total: 10.51 }
const NUMBER = 'NZW-T01-INV-2026-000049'
// 20:30 UTC is 00:30 the next day in Muscat: tags 6 and 7 both move.
const SOLD_AT = '2026-10-28T20:30:00Z'

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
} as unknown as PosTillDto

const BODY: PosSaleRequest = {
  tillId: 'till-1',
  soldAt: SOLD_AT,
  queuedOffline: false,
  invoiceNumber: null,
  customer: { kind: 'WALK_IN' },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CASH', amount: 10.51, tendered: 11 }],
  tip: null,
}

/** Reads a TLV payload back into its tag values. */
function tags(payload: string): string[] {
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
  const values: string[] = []
  for (let at = 0; at < bytes.length; at += 2 + bytes[at + 1]) {
    values.push(new TextDecoder().decode(bytes.subarray(at + 2, at + 2 + bytes[at + 1])))
  }
  return values
}

const sale = (overrides: Partial<PosSaleRequest> = {}) => ({
  invoiceNumber: NUMBER,
  soldAt: SOLD_AT,
  customer: { kind: 'WALK_IN' as const },
  ...overrides,
})

describe('the offline QR from the profile', () => {
  it('carries exactly the claimed number, the profile seller, Muscat date and time and the server totals', async () => {
    const qr = await offlinePrintedQr(PROFILE, sale(), PRINTED)
    expect(qr).not.toBeNull()
    expect(tags(qr!.payload)).toEqual([
      '1.1',
      '01',
      NUMBER,
      'Al Noor Trading LLC',
      'OM1100012345',
      '2026-10-29',
      '00:30:00',
      AMOUNTS.totalWithVat,
      AMOUNTS.vatTotal,
      qr!.sellerUuid,
    ])
    // Tag 8 is the server's 10.520, not the 10.510 the receipt prints (review R-1).
    expect(AMOUNTS.totalWithVat).toBe('10.520')
    const fields = {
      qrVersion: '1.1',
      invoiceType: '01' as const,
      invoiceNumber: NUMBER,
      sellerName: 'Al Noor Trading LLC',
      sellerVatin: 'OM1100012345',
      issueDate: '2026-10-29',
      issueTime: '00:30:00',
      totalWithVat: AMOUNTS.totalWithVat!,
      vatTotal: AMOUNTS.vatTotal!,
    }
    expect(qr).toEqual({
      payload: (await encodeQr(fields))!.payload,
      sellerUuid: (await sellerUuid(fields))!,
      profileVersion: PROFILE.profileVersion,
    })
  })

  it('a named consumer gets one too', async () => {
    expect(await offlinePrintedQr(PROFILE, sale({ customer: { kind: 'CONSUMER' } }), PRINTED)).not.toBeNull()
  })

  it.each([
    ['no profile', null, sale(), PRINTED],
    ['a business buyer', PROFILE, sale({ customer: { kind: 'BUSINESS' } }), PRINTED],
    ['a government buyer', PROFILE, sale({ customer: { kind: 'GOVERNMENT' } }), PRINTED],
    ['profit margin', { ...PROFILE, invoiceType: '02' }, sale(), PRINTED],
    ['a non-Muscat date zone', { ...PROFILE, issueDateZone: 'Asia/Dubai' }, sale(), PRINTED],
    ['a non-Muscat time zone', { ...PROFILE, issueTimeZone: 'Europe/London' }, sale(), PRINTED],
    ['an unknown scale', { ...PROFILE, amountScale: 7 }, sale(), PRINTED],
    ['a total off the scale', PROFILE, sale(), { ...PRINTED, vat: 0.5051 }],
    ['no printed totals', PROFILE, sale(), undefined],
    ['no number', PROFILE, sale({ invoiceNumber: null }), PRINTED],
    ['a malformed profile version', { ...PROFILE, profileVersion: 'v1' }, sale(), PRINTED],
    ['a seller name over 255 bytes', { ...PROFILE, sellerName: 'x'.repeat(256) }, sale(), PRINTED],
    ['a blank seller VATIN', { ...PROFILE, sellerVatin: ' ' }, sale(), PRINTED],
  ] as [string, PosQrProfile | null, ReturnType<typeof sale>, PosPrintedTotals | undefined][])(
    'gives no QR for %s',
    async (_why, profile, which, printed) => {
      expect(await offlinePrintedQr(profile, which, printed)).toBeNull()
    },
  )
})

describe('the queued sale it rides on', () => {
  let online: boolean
  let sent: string[]

  beforeEach(() => {
    window.localStorage.clear()
    sessionStorage.clear()
    setPosVault(memoryVault(true))
    resetPosQueue()
    noteQueueSender('u-1')
    resetSharedRequests()
    online = false
    sent = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (!online) throw new TypeError('Failed to fetch')
        if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
          sent.push(String(init.body))
          return new Response(
            JSON.stringify({
              saleId: 'sale-9',
              invoiceNumber: NUMBER,
              receipt: { qr: { status: 'PENDING' } },
              filing: { dispatchState: 'QUEUED' },
              warnings: [],
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('', { status: 404 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setPosVault(null)
  })

  async function queueAndSend(till: PosTillDto, body: PosSaleRequest, key: string): Promise<string> {
    const result = await submitSale(till, body, key, [], PRINTED)
    expect('queued' in result).toBe(true)
    online = true
    await flushQueue('till-1')
    online = false
    return sent.at(-1)!
  }

  // The bytes a queued sale sent before E-1: the sale, marked queued, with its claimed number.
  const BEFORE_E1 = JSON.stringify({ ...BODY, queuedOffline: true, invoiceNumber: NUMBER })

  it('without a profile the request is the one sent before E-1, byte for byte', async () => {
    expect(await queueAndSend(TILL, BODY, 'pos-sale-key-qr-01')).toBe(BEFORE_E1)
  })

  it('a profile the server did not state (null) is the same as none', async () => {
    expect(await queueAndSend({ ...TILL, qrProfile: null }, BODY, 'pos-sale-key-qr-01')).toBe(BEFORE_E1)
  })

  it('with a profile, a walk-in sale keeps its number, time and totals and sends the QR it printed', async () => {
    const result = await submitSale({ ...TILL, qrProfile: PROFILE }, BODY, 'pos-sale-key-qr-02', [], PRINTED)
    expect('queued' in result && result.queued.number).toBe(NUMBER)
    const [entry] = queuedFor('till-1')
    const expected = await offlinePrintedQr(PROFILE, sale(), PRINTED)
    expect(entry.body.printedQr).toEqual(expected)
    expect(entry.body).toMatchObject({ invoiceNumber: NUMBER, soldAt: SOLD_AT })
    online = true
    await flushQueue('till-1')
    const body = JSON.parse(sent.at(-1)!)
    expect(body.printedQr).toEqual(expected)
    expect(body).toMatchObject({ queuedOffline: true, invoiceNumber: NUMBER, soldAt: SOLD_AT })
  })

  // Review QW3R-4: a correction changes only the payments, so the QR the customer holds still
  // matches the server's tags 8 and 9 and stays with the sale for the server to compare.
  it('a corrected queued sale keeps the QR it printed, and sends it', async () => {
    await submitSale({ ...TILL, qrProfile: PROFILE }, BODY, 'pos-sale-key-qr-06', [], PRINTED)
    const printed = queuedFor('till-1')[0].body.printedQr
    expect(printed).toBeTruthy()
    await correctQueuedSale('till-1', 'pos-sale-key-qr-06', [{ method: 'CARD', amount: 10.51 }])
    const [entry] = queuedFor('till-1')
    expect(entry.body.payments).toEqual([{ method: 'CARD', amount: 10.51 }])
    expect(entry.body.printedQr).toEqual(printed)
    online = true
    await flushQueue('till-1')
    expect(JSON.parse(sent.at(-1)!).printedQr).toEqual(printed)
  })

  it('a company sale gets none, profile or not', async () => {
    const company = { ...BODY, customer: { kind: 'BUSINESS' as const, customerId: 'c-1' } }
    const body = JSON.parse(await queueAndSend({ ...TILL, qrProfile: PROFILE }, company, 'pos-sale-key-qr-03'))
    expect(body.printedQr).toBeUndefined()
  })

  it('an online sale never carries printedQr', async () => {
    online = true
    const result = await submitSale({ ...TILL, qrProfile: PROFILE }, BODY, 'pos-sale-key-qr-04', [], PRINTED)
    expect('sale' in result).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toContain('printedQr')
  })

  it('a QR that cannot be built leaves the sale queued as before, with no printedQr', async () => {
    const result = await submitSale(
      { ...TILL, qrProfile: { ...PROFILE, sellerName: 'x'.repeat(256) } },
      BODY,
      'pos-sale-key-qr-05',
      [],
      PRINTED,
    )
    expect('queued' in result && result.queued.number).toBe(NUMBER)
    expect(queuedFor('till-1')[0].body.printedQr).toBeUndefined()
  })
})
