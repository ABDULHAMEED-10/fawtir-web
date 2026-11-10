import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosPrintedQr, PosSaleRequest, PosTillDto } from '../api/pos/pos'
import { offlinePrintedQr } from './posOfflineQr'
import {
  correctQueuedSale,
  flushQueue,
  noteQueueSender,
  queuedFor,
  resetPosQueue,
  submitSale,
} from './posQueue'
import { memoryVault, setPosVault } from './posVault'
import { posRefusalKey } from './posRefusals'

// The builder is replaced so the build after the number is claimed can be made to fail: past a
// passing dry run that is otherwise unreachable (owner directive 2026-11-06 item C).
vi.mock('./posOfflineQr', () => ({ offlinePrintedQr: vi.fn() }))

const QR: PosPrintedQr = { payload: 'AQMxLjE=', sellerUuid: 'uuid-1', profileVersion: 'a'.repeat(64) }
const NUMBER = 'NZW-T01-INV-2026-000049'
const PRINTED = { taxable: 2.2, vat: 0.11, total: 2.31 }

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
} as unknown as PosTillDto

const BODY: PosSaleRequest = {
  tillId: 'till-1',
  soldAt: '2026-10-28T10:00:00Z',
  queuedOffline: false,
  invoiceNumber: null,
  customer: { kind: 'WALK_IN' },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CASH', amount: 2.31, tendered: 5 }],
  tip: null,
}

let online: boolean
let sent: string[]
/** The server's answer to a sale; a NetworkError when it throws. */
let answer: (() => Response) | null

beforeEach(() => {
  window.localStorage.clear()
  sessionStorage.clear()
  setPosVault(memoryVault(true))
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  vi.mocked(offlinePrintedQr).mockReset()
  online = false
  sent = []
  answer = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch')
      if (String(input) === '/api/v1/pos/sales' && init?.method === 'POST') {
        sent.push(String(init.body))
        if (answer) return answer()
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

describe('issuing an offline consumer receipt (owner directive 2026-11-06)', () => {
  it('dry-runs the QR with the number it would claim, then builds it with the number it claimed', async () => {
    vi.mocked(offlinePrintedQr).mockResolvedValue(QR)
    const result = await submitSale(TILL, BODY, 'pos-sale-key-iss-1', [], PRINTED)
    expect('queued' in result && result.queued.number).toBe(NUMBER)
    expect('receiptWithheld' in result).toBe(false)
    const numbers = vi.mocked(offlinePrintedQr).mock.calls.map(([, sale]) => sale.invoiceNumber)
    expect(numbers).toEqual([NUMBER, NUMBER])
    expect(queuedFor('till-1')[0].body.printedQr).toEqual(QR)
    expect(queuedFor('till-1')[0].receiptWithheld).toBeUndefined()
    // QW4R-3: the mark goes on the wire only when true; a printed receipt sends no member at all.
    expect('receiptWithheld' in queuedFor('till-1')[0].body).toBe(false)
  })

  it('a dry run that fails claims no number: the next sale takes it', async () => {
    vi.mocked(offlinePrintedQr).mockResolvedValueOnce(null)
    await expect(submitSale(TILL, BODY, 'pos-sale-key-iss-2', [], PRINTED)).rejects.toMatchObject({
      name: 'PosOfflineQrUnavailable',
    })
    expect(vi.mocked(offlinePrintedQr)).toHaveBeenCalledTimes(1)
    expect(queuedFor('till-1')).toEqual([])
    vi.mocked(offlinePrintedQr).mockResolvedValue(QR)
    const next = await submitSale(TILL, BODY, 'pos-sale-key-iss-3', [], PRINTED)
    expect('queued' in next && next.queued.number).toBe(NUMBER)
  })

  it('a build that fails after the number is claimed keeps the number, prints nothing and marks the sale', async () => {
    vi.mocked(offlinePrintedQr).mockResolvedValueOnce(QR).mockResolvedValueOnce(null)
    const result = await submitSale(TILL, BODY, 'pos-sale-key-iss-4', [], PRINTED)
    // The caller is told no receipt may be printed; the number is never discarded.
    expect(result).toMatchObject({ queued: { number: NUMBER }, receiptWithheld: true })
    const [entry] = queuedFor('till-1')
    expect(entry.number).toBe(NUMBER)
    expect(entry.receiptWithheld).toBe(true)
    expect(entry.body.printedQr).toBeUndefined()
    // The next sale takes the number after it.
    vi.mocked(offlinePrintedQr).mockResolvedValue(QR)
    const next = await submitSale(TILL, BODY, 'pos-sale-key-iss-5', [], PRINTED)
    expect('queued' in next && next.queued.number).toBe('NZW-T01-INV-2026-000050')
    // Kept and filed with its number. QW4R-3 (backend f598aa39b): the mark is in the body the till
    // queued, so it is signed with it, and every send of the entry carries it unchanged.
    expect(entry.body.receiptWithheld).toBe(true)
    online = true
    answer = () => new Response('', { status: 503 })
    await flushQueue('till-1')
    answer = null
    await flushQueue('till-1')
    const bodies = sent.map((body) => JSON.parse(body) as PosSaleRequest)
    const ours = bodies.filter((body) => body.invoiceNumber === NUMBER)
    expect(ours.length).toBeGreaterThanOrEqual(2)
    for (const body of ours) expect(body.receiptWithheld).toBe(true)
    expect(bodies.find((body) => body.invoiceNumber === 'NZW-T01-INV-2026-000050')).not.toHaveProperty(
      'receiptWithheld',
    )
  })

  it('a correction and its resend carry the printed QR as it was built, never a new one', async () => {
    vi.mocked(offlinePrintedQr).mockResolvedValue(QR)
    await submitSale(TILL, BODY, 'pos-sale-key-iss-6', [], PRINTED)
    const calls = vi.mocked(offlinePrintedQr).mock.calls.length
    online = true
    await correctQueuedSale('till-1', 'pos-sale-key-iss-6', [{ method: 'CARD', amount: 2.31 }])
    expect(vi.mocked(offlinePrintedQr).mock.calls.length).toBe(calls)
    expect(JSON.parse(sent.at(-1)!).printedQr).toEqual(QR)
  })

  it('a company sale neither dry-runs nor builds a QR', async () => {
    const company = { ...BODY, customer: { kind: 'GOVERNMENT' as const, customerId: 'g-1' } }
    const result = await submitSale(TILL, company, 'pos-sale-key-iss-7', [], PRINTED)
    expect('queued' in result && result.queued.number).toBe(NUMBER)
    expect(offlinePrintedQr).not.toHaveBeenCalled()
    expect(queuedFor('till-1')[0].receiptWithheld).toBeUndefined()
  })

  // QW4R-1: the request went out, the connection dropped, and the fallback cannot make the QR. The
  // server may have filed the sale, so the refusal says so (as XW-2), and the same key retries it.
  it('an online sale whose request went out is refused as sent, not as "nothing was numbered"', async () => {
    online = true
    answer = () => {
      throw new TypeError('Failed to fetch')
    }
    vi.mocked(offlinePrintedQr).mockResolvedValue(null)
    const refused = await submitSale(TILL, BODY, 'pos-sale-key-iss-9', [], PRINTED).catch((error: unknown) => error)
    expect(refused).toMatchObject({ name: 'PosOfflineQrUnavailable', requested: true, behind: false })
    expect(posRefusalKey(refused)).toBe('pos.refusal.offlineQrUnavailableAfterSend')
    expect(sent).toHaveLength(1)
    expect(queuedFor('till-1')).toEqual([])
    answer = null
    const again = await submitSale(TILL, BODY, 'pos-sale-key-iss-9', [], PRINTED)
    expect('sale' in again).toBe(true)
    expect(sent).toEqual([sent[0], sent[0]])
  })

  // With a queue waiting and no connection the sale goes straight to the queue: its own request
  // never left, so "nothing was numbered or printed" is the whole truth. (With an empty queue the
  // till tries the server first, so an offline till takes the sent wording above, as XW-2 does.)
  it('a sale queued behind waiting sales while offline is refused as never sent', async () => {
    const company = { ...BODY, customer: { kind: 'BUSINESS' as const, customerId: 'c-1' } }
    await submitSale(TILL, company, 'pos-sale-key-iss-10a', [], PRINTED)
    vi.mocked(offlinePrintedQr).mockResolvedValue(null)
    const refused = await submitSale(TILL, BODY, 'pos-sale-key-iss-10', [], PRINTED).catch((error: unknown) => error)
    expect(refused).toMatchObject({ name: 'PosOfflineQrUnavailable', requested: false, behind: false })
    expect(posRefusalKey(refused)).toBe('pos.refusal.offlineQrUnavailable')
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-iss-10a'])
  })

  // QW4R-8: online, but behind an unfiled sale; "reconnect" would be the wrong advice.
  it('a sale that has to queue behind an unfiled one, online, is refused with the waiting wording', async () => {
    const company = { ...BODY, customer: { kind: 'BUSINESS' as const, customerId: 'c-1' } }
    await submitSale(TILL, company, 'pos-sale-key-iss-11', [], PRINTED)
    online = true
    answer = () =>
      new Response(
        JSON.stringify({ type: 'https://api.fawtir.om/problems/x', status: 422, code: 'SIMPLIFIED_INVOICE_LIMIT' }),
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    vi.mocked(offlinePrintedQr).mockResolvedValue(null)
    const refused = await submitSale(TILL, BODY, 'pos-sale-key-iss-12', [], PRINTED).catch((error: unknown) => error)
    expect(refused).toMatchObject({ name: 'PosOfflineQrUnavailable', requested: false, behind: true })
    expect(posRefusalKey(refused)).toBe('pos.refusal.offlineQrUnavailableBehind')
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-iss-11'])
  })

  // QW4R-4: something notes a number while the dry run awaits; the number is read again and the QR
  // proved with the new one, so the number claimed is the one the QR was proved with.
  it('a number noted during the dry run is read again and the QR proved with it', async () => {
    vi.mocked(offlinePrintedQr).mockImplementationOnce(async () => {
      window.localStorage.setItem('fawtir.pos.next.till-1.NZW-T01-INV-2026', '52')
      return QR
    })
    vi.mocked(offlinePrintedQr).mockResolvedValue(QR)
    const result = await submitSale(TILL, BODY, 'pos-sale-key-iss-13', [], PRINTED)
    const numbers = vi.mocked(offlinePrintedQr).mock.calls.map(([, sale]) => sale.invoiceNumber)
    expect(numbers).toEqual([NUMBER, 'NZW-T01-INV-2026-000052', 'NZW-T01-INV-2026-000052'])
    expect('queued' in result && result.queued.number).toBe('NZW-T01-INV-2026-000052')
  })

  it('an online sale neither dry-runs nor builds a QR', async () => {
    online = true
    const result = await submitSale(TILL, BODY, 'pos-sale-key-iss-8', [], PRINTED)
    expect('sale' in result).toBe(true)
    expect(offlinePrintedQr).not.toHaveBeenCalled()
  })
})
