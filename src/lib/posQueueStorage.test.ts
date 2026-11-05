import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosSaleRequest, PosTillDto } from '../api/pos/pos'
import {
  checkStorageAgain,
  flushQueue,
  markQueuedSaleSetAside,
  nextTillNumber,
  noteQueueSender,
  offlineBlock,
  opensNumbers,
  PosStorageUnavailable,
  queuedFor,
  resetPosQueue,
  submitSale,
  useStorageFailure,
} from './posQueue'
import { memoryVault, setPosVault } from './posVault'

/*
 * POS-MEMQ (DES43 rev 4.3.4 R-MEMQ, A8-G2, Gate A W-MEMQ S1-S7): a sale is numbered offline only
 * when both the counter and the queue entry read back from storage. Storage is made to fail through
 * Storage.prototype, the way private browsing, a full disk or a browser that drops writes would.
 */

const QUEUE = 'fawtir.pos.queue'
const COUNTER = 'fawtir.pos.next.till-1.NZW-T01-INV-2026'
const LEGACY = 'fawtir.pos.next.till-1'
const PROBE = 'fawtir.pos.storageProbe'

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
} as unknown as PosTillDto

const WALK_IN: PosSaleRequest = {
  tillId: 'till-1',
  soldAt: '2026-10-28T10:00:00Z',
  queuedOffline: false,
  invoiceNumber: null,
  customer: { kind: 'WALK_IN' },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CARD', amount: 5.649 }],
  tip: null,
}

const numbered = (value: number) => `NZW-T01-INV-2026-${String(value).padStart(6, '0')}`

const stored = (value: number, key = `pos-sale-key-st-${value}`) => ({
  key,
  tillId: 'till-1',
  number: numbered(value),
  body: { ...WALK_IN, queuedOffline: true, invoiceNumber: numbered(value) },
  refusal: null,
  madeBy: { userId: 'u-1', name: 'Maryam' },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const realSet = Storage.prototype.setItem
const realGet = Storage.prototype.getItem
const realRemove = Storage.prototype.removeItem
/** Another tab of the till: writes the key without going through this tab's spies. */
const otherTabWrites = (key: string, text: string) => realSet.call(window.localStorage, key, text)

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')
const security = () => new DOMException('The operation is insecure.', 'SecurityError')

function failWrites(match: (key: string) => boolean, error: () => Error) {
  return vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (this: Storage, key: string, value: string) {
      if (match(key)) throw error()
      realSet.call(this, key, value)
    })
}

function dropWrites(match: (key: string) => boolean) {
  return vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (this: Storage, key: string, value: string) {
      if (!match(key)) realSet.call(this, key, value)
    })
}

function failReads(match: (key: string) => boolean, error: () => Error) {
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (match(key)) throw error()
    return realGet.call(this, key)
  })
}

async function refusedOffline(key: string): Promise<PosStorageUnavailable> {
  const error = await submitSale(TILL, WALK_IN, key).then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(PosStorageUnavailable)
  return error as PosStorageUnavailable
}

async function queuedOffline(key: string): Promise<string> {
  const result = await submitSale(TILL, WALK_IN, key)
  if (!('queued' in result)) throw new Error('expected the sale to be queued')
  return result.queued.number
}

const storedQueue = () => JSON.parse(realGet.call(window.localStorage, QUEUE) ?? '[]') as { key: string }[]

const filedBody = (invoiceNumber: string) => ({
  saleId: 'sale-9',
  invoiceNumber,
  receipt: { qr: { status: 'PENDING' } },
  filing: { dispatchState: 'QUEUED' },
  warnings: [],
})
const filedAs = (value: number) => json(filedBody(numbered(value)), 201)

let online = false
let saleReply: () => Response
let calls: { url: string; init?: RequestInit }[]

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  sessionStorage.clear()
  setPosVault(memoryVault(true))
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  online = false
  calls = []
  saleReply = () => filedAs(49)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (!online) throw new TypeError('Failed to fetch')
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') return saleReply()
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setPosVault(null)
})

describe('POS-MEMQ: an offline sale is numbered only once storage keeps it', () => {
  it('ST-1 a full queue gives no receipt, rolls the counter back, blocks offline sales, and still sells online', async () => {
    failWrites((key) => key === QUEUE, quota)

    const refused = await refusedOffline('pos-sale-key-st1-a')

    expect(refused.reason).toBe('quota')
    expect(realGet.call(window.localStorage, COUNTER)).toBeNull()
    expect(storedQueue()).toEqual([])
    expect(queuedFor('till-1')).toEqual([])
    expect(offlineBlock('till-1')).toBe('quota')

    // Storage works again, but nothing has proved it: offline numbering stays off for this tab.
    vi.restoreAllMocks()
    expect((await refusedOffline('pos-sale-key-st1-b')).reason).toBe('quota')
    expect(realGet.call(window.localStorage, COUNTER)).toBeNull()

    online = true
    const sold = await submitSale(TILL, WALK_IN, 'pos-sale-key-st1-c')
    expect('sale' in sold).toBe(true)
    expect(realGet.call(window.localStorage, COUNTER)).toBe('50')
    expect(offlineBlock('till-1')).toBe('quota')
  })

  it('ST-2 storage that refuses to be read (SecurityError) gives no number and no receipt', async () => {
    failReads((key) => key.startsWith('fawtir.pos.'), security)

    expect(nextTillNumber(TILL, WALK_IN.soldAt)).toBeNull()
    const refused = await refusedOffline('pos-sale-key-st2')

    expect(refused.reason).toBe('denied')
    expect(offlineBlock('till-1')).toBe('denied')
    vi.restoreAllMocks()
    expect(realGet.call(window.localStorage, COUNTER)).toBeNull()
    expect(storedQueue()).toEqual([])
  })

  it('ST-3a a queue write the browser accepts but does not keep is a mismatch: no receipt, counter rolled back', async () => {
    dropWrites((key) => key === QUEUE)

    const refused = await refusedOffline('pos-sale-key-st3a')

    expect(refused.reason).toBe('mismatch')
    expect(realGet.call(window.localStorage, COUNTER)).toBeNull()
    expect(storedQueue()).toEqual([])
    expect(queuedFor('till-1')).toEqual([])
    expect(offlineBlock('till-1')).toBe('mismatch')
  })

  it('ST-3b a counter write that does not land stops the sale before anything is queued', async () => {
    dropWrites((key) => key === COUNTER)

    const refused = await refusedOffline('pos-sale-key-st3b')

    expect(refused.reason).toBe('mismatch')
    expect(realGet.call(window.localStorage, COUNTER)).toBeNull()
    expect(storedQueue()).toEqual([])
  })

  it('ST-4 a rollback that cannot be confirmed burns the number until an online sale files it', async () => {
    failWrites((key) => key === QUEUE, quota)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === COUNTER) throw security()
      realRemove.call(this, key)
    })

    expect((await refusedOffline('pos-sale-key-st4-a')).reason).toBe('quota')
    // The number stays taken: never printed, never reused, never released.
    expect(realGet.call(window.localStorage, COUNTER)).toBe('50')

    vi.restoreAllMocks()
    expect(checkStorageAgain()).toBeNull()
    expect(offlineBlock('till-1')).toBe('burnt')
    expect(offlineBlock('till-2')).toBeNull()
    expect((await refusedOffline('pos-sale-key-st4-b')).reason).toBe('burnt')
    expect(realGet.call(window.localStorage, COUNTER)).toBe('50')

    online = true
    saleReply = () => filedAs(48)
    await submitSale(TILL, WALK_IN, 'pos-sale-key-st4-c')
    expect(offlineBlock('till-1')).toBe('burnt')

    saleReply = () => filedAs(49)
    await submitSale(TILL, WALK_IN, 'pos-sale-key-st4-d')
    expect(offlineBlock('till-1')).toBeNull()

    online = false
    expect(await queuedOffline('pos-sale-key-st4-e')).toBe(numbered(50))
  })

  it('ST-5 queued sales survive a reload, and a failed save never leaves a sale only in memory', async () => {
    expect(await queuedOffline('pos-sale-key-st5-a')).toBe(numbered(49))
    expect(await queuedOffline('pos-sale-key-st5-b')).toBe(numbered(50))

    failWrites((key) => key === QUEUE, quota)
    await refusedOffline('pos-sale-key-st5-c')
    vi.restoreAllMocks()

    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual([
      'pos-sale-key-st5-a',
      'pos-sale-key-st5-b',
    ])
    expect(storedQueue().map((entry) => entry.key)).toEqual([
      'pos-sale-key-st5-a',
      'pos-sale-key-st5-b',
    ])

    vi.resetModules()
    const fresh = await import('./posQueue')
    expect(fresh.queuedFor('till-1').map((entry) => entry.number)).toEqual([
      numbered(49),
      numbered(50),
    ])
    expect(fresh.nextTillNumber(TILL, WALK_IN.soldAt)).toBe(numbered(51))
    expect(fresh.offlineBlock('till-1')).toBeNull()
  })

  it("ST-6 a save on top of another tab's write is rebuilt from storage: its sale stays, the one it filed stays gone", async () => {
    otherTabWrites(QUEUE, JSON.stringify([stored(49), stored(50)]))
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual([
      'pos-sale-key-st-49',
      'pos-sale-key-st-50',
    ])

    // Between this tab's read and its write, the other tab files and removes 50 and queues 51.
    let armed = true
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      const text = realGet.call(this, key)
      if (key === QUEUE && armed) {
        armed = false
        otherTabWrites(QUEUE, JSON.stringify([stored(49), stored(51)]))
      }
      return text
    })

    markQueuedSaleSetAside('pos-sale-key-st-49')
    vi.restoreAllMocks()

    const after = storedQueue() as { key: string; setAside?: boolean }[]
    expect(after.map((entry) => entry.key)).toEqual(['pos-sale-key-st-49', 'pos-sale-key-st-51'])
    expect(after[0].setAside).toBe(true)
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual([
      'pos-sale-key-st-49',
      'pos-sale-key-st-51',
    ])
    expect(offlineBlock('till-1')).toBeNull()
  })

  it('ST-6b storage that changes under every attempt is never written over, and offline numbering stops', async () => {
    otherTabWrites(QUEUE, JSON.stringify([stored(49)]))
    queuedFor('till-1')
    let round = 0
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      const text = realGet.call(this, key)
      round += 1
      if (key === QUEUE) otherTabWrites(QUEUE, JSON.stringify([stored(49), stored(60 + round)]))
      return text
    })
    const writes = vi.spyOn(Storage.prototype, 'setItem')

    markQueuedSaleSetAside('pos-sale-key-st-49')
    const lastOther = realGet.call(window.localStorage, QUEUE)
    const ourQueueWrites = writes.mock.calls.filter(([key]) => key === QUEUE)
    vi.restoreAllMocks()

    expect(ourQueueWrites).toEqual([])
    expect(realGet.call(window.localStorage, QUEUE)).toBe(lastOther)
    expect(offlineBlock('till-1')).toBe('unreadable')
  })

  it('ST-7 a counter that cannot be read gives no number; a stray legacy value is ignored', async () => {
    otherTabWrites(COUNTER, 'not json')

    expect(nextTillNumber(TILL, WALK_IN.soldAt)).toBeNull()
    expect((await refusedOffline('pos-sale-key-st7')).reason).toBe('unreadable')
    expect(realGet.call(window.localStorage, COUNTER)).toBe('not json')
    expect(storedQueue()).toEqual([])

    realRemove.call(window.localStorage, COUNTER)
    otherTabWrites(COUNTER, '"50"')
    expect(nextTillNumber(TILL, WALK_IN.soldAt)).toBeNull()

    realRemove.call(window.localStorage, COUNTER)
    otherTabWrites(LEGACY, 'garbage')
    expect(nextTillNumber(TILL, WALK_IN.soldAt)).toBe(numbered(49))
  })

  it('ST-8 a filed sale whose number cannot be noted stays queued, and is replayed and filed once', async () => {
    expect(await queuedOffline('pos-sale-key-st8')).toBe(numbered(49))

    const filed = new Set<string>()
    const posts: string[] = []
    saleReply = () => {
      const call = calls[calls.length - 1]
      const key = new Headers(call.init?.headers).get('Idempotency-Key') ?? ''
      posts.push(key)
      const replayed = filed.has(key)
      filed.add(key)
      return json({ ...filedBody(numbered(49)), replayed }, replayed ? 200 : 201)
    }
    online = true

    failReads((key) => key === COUNTER, security)
    await flushQueue('till-1')
    vi.restoreAllMocks()

    expect(posts).toEqual(['pos-sale-key-st8'])
    expect(storedQueue().map((entry) => entry.key)).toEqual(['pos-sale-key-st8'])
    expect(offlineBlock('till-1')).toBe('denied')

    await flushQueue('till-1')

    expect(posts).toEqual(['pos-sale-key-st8', 'pos-sale-key-st8'])
    expect(filed.size).toBe(1)
    expect(storedQueue()).toEqual([])
    expect(realGet.call(window.localStorage, COUNTER)).toBe('50')
  })

  it('ST-9 only a probe that reads back and a queue that saves again lift the block', async () => {
    const { result } = renderHook(() => useStorageFailure('till-1'))
    expect(result.current).toBeNull()

    failWrites((key) => key === QUEUE, quota)
    await act(async () => {
      await refusedOffline('pos-sale-key-st9-a')
    })
    expect(result.current).toBe('quota')

    vi.restoreAllMocks()
    failWrites(() => true, quota)
    act(() => {
      expect(checkStorageAgain()).toBe('quota')
    })
    expect(result.current).toBe('quota')

    vi.restoreAllMocks()
    failWrites((key) => key === QUEUE, quota)
    act(() => {
      expect(checkStorageAgain()).toBe('quota')
    })
    expect(result.current).toBe('quota')

    vi.restoreAllMocks()
    act(() => {
      expect(checkStorageAgain()).toBeNull()
    })
    expect(result.current).toBeNull()
    expect(realGet.call(window.localStorage, PROBE)).toBeNull()
    // The refused sale's number was rolled back and never printed, so it is the next one again.
    expect(await queuedOffline('pos-sale-key-st9-b')).toBe(numbered(49))
  })

  it('ST-10 another tab writing between this write and its read-back does not block, when the entry landed (IMPL2-M1)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      realSet.call(this, key, value)
      // The other tab queues its own sale on top of what this tab just wrote.
      if (key === QUEUE) otherTabWrites(QUEUE, JSON.stringify([...JSON.parse(value), stored(60)]))
    })

    expect(await queuedOffline('pos-sale-key-st10')).toBe(numbered(49))
    vi.restoreAllMocks()

    expect(offlineBlock('till-1')).toBeNull()
    expect(storedQueue().map((entry) => entry.key)).toEqual(['pos-sale-key-st10', 'pos-sale-key-st-60'])
    expect(realGet.call(window.localStorage, COUNTER)).toBe('50')
  })

  it("ST-10b a read-back without this write's entry still blocks and gives no receipt (IMPL2-M1)", async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      realSet.call(this, key, value)
      if (key === QUEUE) otherTabWrites(QUEUE, JSON.stringify([stored(60)]))
    })

    expect((await refusedOffline('pos-sale-key-st10b')).reason).toBe('mismatch')
    vi.restoreAllMocks()

    expect(offlineBlock('till-1')).toBe('mismatch')
    expect(storedQueue().map((entry) => entry.key)).toEqual(['pos-sale-key-st-60'])
    expect(realGet.call(window.localStorage, COUNTER)).toBeNull()
  })

  it('ST-10c a store wiped right after a removal that kept a sale is not taken for the removal landing (W2-M1)', async () => {
    expect(await queuedOffline('pos-sale-key-st10c-1')).toBe(numbered(49))
    expect(await queuedOffline('pos-sale-key-st10c-2')).toBe(numbered(50))
    expect(offlineBlock('till-1')).toBeNull()

    let next = 49
    saleReply = () => filedAs(next++)
    online = true
    let wiped = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      realSet.call(this, key, value)
      // The first sale's removal keeps the second; the store is cleared before it is read back.
      if (key === QUEUE && !wiped && (JSON.parse(value) as unknown[]).length === 1) {
        wiped = true
        realRemove.call(this, QUEUE)
      }
    })

    await flushQueue('till-1')
    vi.restoreAllMocks()

    expect(wiped).toBe(true)
    expect(offlineBlock('till-1')).toBe('mismatch')
  })

  it('keeps strict number order (Q-27): opensNumbers stays false', () => {
    expect(opensNumbers()).toBe(false)
  })
})
