import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, resetSharedRequests } from '../api'
import type { PosPrintedQr, PosSaleRequest, PosTillDto } from '../api/pos/pos'
import { offlinePrintedQr } from './posOfflineQr'
import {
  PosSaleOutcomeUnknown,
  queuedFor,
  noteQueueSender,
  resetPosQueue,
  saleOutcomeUncertain,
  submitSale,
} from './posQueue'
import { memoryVault, setPosVault } from './posVault'
import { posRefusalKey } from './posRefusals'

// Stage B E-01: only a NetworkError used to reach the same-key path. An uncoded gateway fault is
// as unknown an outcome as a dropped connection, and a coded refusal is definite.

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

const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', status, code, detail: code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })

/** What the server answers to POST /pos/sales. */
let answer: (init: RequestInit) => Promise<Response>
let sent: { key: string; body: string }[]

beforeEach(() => {
  window.localStorage.clear()
  sessionStorage.clear()
  setPosVault(memoryVault(true))
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  vi.mocked(offlinePrintedQr).mockReset()
  vi.mocked(offlinePrintedQr).mockResolvedValue(QR)
  sent = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/v1/pos/sales' && init?.method === 'POST') {
        sent.push({ key: (init.headers as Record<string, string>)['Idempotency-Key'], body: String(init.body) })
        return answer(init)
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setPosVault(null)
})

describe('an online sale whose outcome is unknown (E-01)', () => {
  it.each([502, 503, 504])('an uncoded %i is kept under the same key, as a dropped connection is', async (status) => {
    answer = async () => new Response('<html>Bad gateway</html>', { status, headers: { 'Content-Type': 'text/html' } })
    const result = await submitSale(TILL, BODY, 'pos-sale-key-e01-a', [], PRINTED)
    expect('queued' in result && result.queued.number).toBe(NUMBER)
    const [entry] = queuedFor('till-1')
    expect(entry.key).toBe('pos-sale-key-e01-a')
    expect(sent.map((request) => request.key)).toEqual(['pos-sale-key-e01-a'])
  })

  it('an uncoded 503 the till cannot keep is refused as sent, with the after-send wording', async () => {
    answer = async () => new Response('', { status: 503 })
    vi.mocked(offlinePrintedQr).mockResolvedValue(null)
    const refused = await submitSale(TILL, BODY, 'pos-sale-key-e01-b', [], PRINTED).catch((error) => error)
    expect(saleOutcomeUncertain(refused)).toBe(true)
    expect(posRefusalKey(refused)).toBe('pos.refusal.offlineQrUnavailableAfterSend')
    expect(queuedFor('till-1')).toEqual([])
  })

  it('an uncoded 502 on a till with no number to give is an unknown outcome, never "could not reach Fawtir"', async () => {
    answer = async () => new Response('', { status: 502 })
    const unnumbered = { ...TILL, series: {} } as unknown as PosTillDto
    const refused = await submitSale(unnumbered, BODY, 'pos-sale-key-e01-c', [], PRINTED).catch((error) => error)
    expect(refused).toBeInstanceOf(PosSaleOutcomeUnknown)
    expect(saleOutcomeUncertain(refused)).toBe(true)
    expect(posRefusalKey(refused)).toBe('pos.refusal.outcomeUnknown')
  })

  it('a request that times out is kept under the same key', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    answer = (init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    const pending = submitSale(TILL, BODY, 'pos-sale-key-e01-d', [], PRINTED)
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(30_000)
    const result = await pending
    expect('queued' in result && result.queued.key).toBe('pos-sale-key-e01-d')
  })

  it.each([
    [422, 'POS_SALE_QR_UNAVAILABLE_FOR_BUYER'],
    [409, 'POS_TILL_NOT_OPEN'],
    [503, 'POS_PAID_OUT_TIMED_OUT'],
  ])('a coded %i (%s) is a definite refusal: nothing is kept and the sale is not held', async (status, code) => {
    answer = async () => problem(status, code)
    const refused = await submitSale(TILL, BODY, 'pos-sale-key-e01-e', [], PRINTED).catch((error) => error)
    expect(refused).toBeInstanceOf(ApiError)
    expect(saleOutcomeUncertain(refused)).toBe(false)
    expect(queuedFor('till-1')).toEqual([])
    expect(offlinePrintedQr).not.toHaveBeenCalled()
  })
})
