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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch')
      if (String(input) === '/api/v1/pos/sales' && init?.method === 'POST') {
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
    // Kept and filed with its number; the mark is this device's and never goes on the wire.
    online = true
    await flushQueue('till-1')
    expect(sent.map((body) => JSON.parse(body).invoiceNumber)).toEqual([NUMBER, 'NZW-T01-INV-2026-000050'])
    expect(sent[0]).not.toContain('receiptWithheld')
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

  it('an online sale neither dry-runs nor builds a QR', async () => {
    online = true
    const result = await submitSale(TILL, BODY, 'pos-sale-key-iss-8', [], PRINTED)
    expect('sale' in result).toBe(true)
    expect(offlinePrintedQr).not.toHaveBeenCalled()
  })
})
