import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosSaleRequest, PosTillDto } from '../api/pos/pos'
import { fakeLocks, installLocks, type FakeLocks } from '../test/fakeLocks'
import {
  flushQueue,
  noteQueueSender,
  opensNumbers,
  queuedFor,
  resetPosQueue,
  submitSale,
} from './posQueue'
import {
  acquireTillLock,
  beginNumbering,
  checkTillLockAgain,
  ensureTillLock,
  LOCK_WAIT_MS,
  PosTillLockUnavailable,
  tillLockState,
  useTillLock,
} from './posTillLock'
import { memoryVault, setPosVault } from './posVault'

/*
 * POS-TABLOCK (DES43 Q-25 option (iv), FR-2): one tab per till numbers offline sales on this
 * device. `navigator.locks` is a fake here; "another tab" is a second request on the same fake
 * manager, which is what another tab of the same origin shares in a browser.
 */

const QUEUE = 'fawtir.pos.queue'
const COUNTER = 'fawtir.pos.next.till-1.NZW-T01-INV-2026'
const LOCK = 'fawtir.pos.till.till-1'

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const filed = (value: number) =>
  json(
    {
      saleId: 'sale-9',
      invoiceNumber: numbered(value),
      receipt: { qr: { status: 'PENDING' } },
      filing: { dispatchState: 'QUEUED' },
      warnings: [],
    },
    201,
  )

let locks: FakeLocks
let online = false
let posts: string[]
let saleReply: () => Response | Promise<Response>

/** Another tab of this origin takes the till's lock and keeps it until `letGo` runs. */
function otherTabHolds(): { granted: boolean; letGo: () => void } {
  const other = { granted: false, letGo: () => {} }
  void locks.request(LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) => {
    if (!lock) return undefined
    other.granted = true
    return new Promise<void>((done) => {
      other.letGo = done
    })
  })
  return other
}

/** Let the fake manager settle a callback that has ended. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

async function refused(key: string): Promise<PosTillLockUnavailable> {
  const error = await submitSale(TILL, WALK_IN, key).then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(PosTillLockUnavailable)
  return error as PosTillLockUnavailable
}

beforeEach(() => {
  window.localStorage.clear()
  sessionStorage.clear()
  setPosVault(memoryVault(true))
  locks = fakeLocks()
  installLocks(locks)
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  online = false
  posts = []
  saleReply = () => filed(49)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!online) throw new TypeError('Failed to fetch')
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        posts.push(new Headers(init.headers).get('Idempotency-Key') ?? '')
        return saleReply()
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setPosVault(null)
})

describe('POS-TABLOCK: one tab per till numbers offline sales on this device', () => {
  it('the tab holding the lock numbers and queues an offline sale', async () => {
    acquireTillLock('till-1')
    expect(tillLockState('till-1')).toBe('held')
    expect(locks.held.has(LOCK)).toBe(true)

    const result = await submitSale(TILL, WALK_IN, 'pos-sale-key-lock-1')

    expect('queued' in result && result.queued.number).toBe(numbered(49))
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-lock-1'])
  })

  it('a second tab gets no lock: no number, no queue write, no receipt, and no online sale either (XT-2, D.8 (vii))', async () => {
    const other = otherTabHolds()
    expect(other.granted).toBe(true)
    acquireTillLock('till-1')
    expect(tillLockState('till-1')).toBe('otherTab')
    const writes = vi.spyOn(Storage.prototype, 'setItem')

    const error = await refused('pos-sale-key-lock-2a')

    expect(error.reason).toBe('otherTab')
    expect(writes.mock.calls.filter(([key]) => key === QUEUE || key === COUNTER)).toEqual([])
    expect(window.localStorage.getItem(COUNTER)).toBeNull()
    expect(window.localStorage.getItem(QUEUE)).toBe('[]')

    // Owner OA:2673: the online sale is refused too, before any request is sent.
    online = true
    expect((await refused('pos-sale-key-lock-2b')).reason).toBe('otherTab')
    expect(posts).toEqual([])
    expect(tillLockState('till-1')).toBe('otherTab')
  })

  it('without navigator.locks an online sale is refused too, with nothing sent (OQ-XT2-LOCKSTATES)', async () => {
    installLocks(undefined)
    online = true
    expect((await refused('pos-sale-key-lock-2c')).reason).toBe('unsupported')
    expect(posts).toEqual([])
  })

  it('a lock taken away after the grant refuses an online sale too', async () => {
    let stolen = false
    installLocks({
      request: async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) => {
        if (stolen) return callback(null)
        stolen = true
        void callback({ name: LOCK, mode: 'exclusive' } as Lock)
        throw new DOMException('The lock was stolen.', 'AbortError')
      },
      query: async () => ({ held: [], pending: [] }),
    } as unknown as LockManager)
    acquireTillLock('till-1')
    await settled()
    online = true
    expect((await refused('pos-sale-key-lock-2d')).reason).toBe('otherTab')
    expect(posts).toEqual([])
  })

  it('in one tab an offline sale rung while an online one is being filed waits for it, and never takes its number (D.8 (v))', async () => {
    acquireTillLock('till-1')
    let file: () => void = () => {}
    const filedLater = new Promise<void>((done) => {
      file = done
    })
    online = true
    saleReply = () => filedLater.then(() => filed(49))
    const first = submitSale(TILL, WALK_IN, 'pos-sale-key-lock-v1')
    await settled()
    expect(posts).toEqual(['pos-sale-key-lock-v1'])

    // The connection drops: the second sale would number offline from the cached nextValue, 49.
    online = false
    const second = submitSale(TILL, WALK_IN, 'pos-sale-key-lock-v2')
    await settled()
    expect(queuedFor('till-1')).toEqual([])
    expect(window.localStorage.getItem(COUNTER)).toBeNull()

    file()
    const sold = await first
    expect('sale' in sold && sold.sale.invoiceNumber).toBe(numbered(49))
    const kept = await second
    expect('queued' in kept && kept.queued.number).toBe(numbered(50))
  })

  it('a handover asked for while an online sale is being filed waits until it is filed (D.8 (vi))', async () => {
    const release = acquireTillLock('till-1')
    let file: () => void = () => {}
    const filedLater = new Promise<void>((done) => {
      file = done
    })
    online = true
    saleReply = () => filedLater.then(() => filed(49))
    const sale = submitSale(TILL, WALK_IN, 'pos-sale-key-lock-vi')
    await settled()
    expect(posts).toEqual(['pos-sale-key-lock-vi'])

    release()
    await settled()
    expect(locks.held.has(LOCK)).toBe(true)
    expect(otherTabHolds().granted).toBe(false)

    file()
    expect('sale' in (await sale)).toBe(true)
    await settled()
    expect(locks.held.has(LOCK)).toBe(false)
    expect(otherTabHolds().granted).toBe(true)
  })

  it('a tab without the lock still checks again, and gets the lock once the other lets go (D.8 (vii))', async () => {
    const other = otherTabHolds()
    acquireTillLock('till-1')
    expect(await checkTillLockAgain('till-1')).toBe('otherTab')
    other.letGo()
    await settled()
    expect(await checkTillLockAgain('till-1')).toBe('held')
    online = true
    expect('sale' in (await submitSale(TILL, WALK_IN, 'pos-sale-key-lock-vii'))).toBe(true)
  })

  it('without navigator.locks offline sales are refused', async () => {
    installLocks(undefined)
    const writes = vi.spyOn(Storage.prototype, 'setItem')

    expect((await refused('pos-sale-key-lock-3')).reason).toBe('unsupported')
    expect(writes.mock.calls.filter(([key]) => key === QUEUE || key === COUNTER)).toEqual([])
    expect(tillLockState('till-1')).toBe('unsupported')
  })

  it.each([
    ['throws', () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }],
    ['is rejected', () => Promise.reject(new DOMException('The operation is insecure.', 'SecurityError'))],
  ])('a lock request that %s refuses offline sales', async (_, request) => {
    installLocks({ request, query: async () => ({ held: [], pending: [] }) } as unknown as LockManager)

    expect((await refused('pos-sale-key-lock-4')).reason).toBe('unsupported')
    expect(window.localStorage.getItem(COUNTER)).toBeNull()
  })

  it('a lock taken from this tab after it was granted stops offline numbering', async () => {
    // Granted once, then stolen; from then on the thief holds it, so every later request finds it taken.
    let stolen = false
    installLocks({
      request: async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) => {
        if (stolen) return callback(null)
        stolen = true
        void callback({ name: LOCK, mode: 'exclusive' } as Lock)
        throw new DOMException('The lock was stolen.', 'AbortError')
      },
      query: async () => ({ held: [], pending: [] }),
    } as unknown as LockManager)
    acquireTillLock('till-1')
    await settled()

    expect(tillLockState('till-1')).toBe('otherTab')
    expect((await refused('pos-sale-key-lock-5')).reason).toBe('otherTab')
  })

  it('released, the lock can be taken by another tab, and taken back once that tab lets go', async () => {
    const release = acquireTillLock('till-1')
    release()
    await settled()
    expect(locks.held.has(LOCK)).toBe(false)

    const other = otherTabHolds()
    expect(other.granted).toBe(true)
    expect(await checkTillLockAgain('till-1')).toBe('otherTab')

    other.letGo()
    await settled()
    acquireTillLock('till-1')
    expect(await checkTillLockAgain('till-1')).toBe('held')
    const result = await submitSale(TILL, WALK_IN, 'pos-sale-key-lock-6')
    expect('queued' in result).toBe(true)
  })

  it('never two holders: a release waits for the sale being numbered before another tab can take it', async () => {
    const release = acquireTillLock('till-1')
    const end = beginNumbering('till-1')
    expect(end).not.toBeNull()

    release()
    await settled()
    // This tab numbers nothing new, and the browser still has the lock for the sale in flight.
    expect(beginNumbering('till-1')).toBeNull()
    expect(locks.held.has(LOCK)).toBe(true)
    expect(otherTabHolds().granted).toBe(false)

    end?.()
    await settled()
    expect(locks.held.has(LOCK)).toBe(false)
    expect(otherTabHolds().granted).toBe(true)
  })

  it('a same-tab remount while a sale is in flight says finishing, not another tab, and takes the lock once it ends (IMPL2-T1)', async () => {
    const release = acquireTillLock('till-1')
    const end = beginNumbering('till-1')
    release()
    acquireTillLock('till-1')
    await settled()

    expect(tillLockState('till-1')).toBe('finishing')
    // Still fail closed: no offline number while the earlier sale holds the lock.
    expect((await refused('pos-sale-key-lock-t1')).reason).toBe('finishing')
    expect(window.localStorage.getItem(COUNTER)).toBeNull()

    end?.()
    await settled()
    await settled()
    expect(tillLockState('till-1')).toBe('held')
    expect(locks.held.has(LOCK)).toBe(true)
  })

  it('a tab without the lock still sends the queued sales: their numbers exist and the server files each key once', async () => {
    const number = numbered(49)
    window.localStorage.setItem(
      QUEUE,
      JSON.stringify([
        {
          key: 'pos-sale-key-lock-8',
          tillId: 'till-1',
          number,
          body: { ...WALK_IN, queuedOffline: true, invoiceNumber: number },
          refusal: null,
          madeBy: { userId: 'u-1', name: 'Maryam' },
        },
      ]),
    )
    otherTabHolds()
    acquireTillLock('till-1')
    expect(tillLockState('till-1')).toBe('otherTab')
    online = true

    await flushQueue('till-1')

    expect(posts).toEqual(['pos-sale-key-lock-8'])
    expect(queuedFor('till-1')).toEqual([])
  })

  it('useTillLock holds the lock while mounted, moves it on a till change, and lets go on unmount', async () => {
    const { result, rerender, unmount } = renderHook(({ tillId }) => useTillLock(tillId), {
      initialProps: { tillId: 'till-1' },
    })
    await act(async () => {
      await settled()
    })
    expect(result.current).toBe('held')
    expect(locks.held.has(LOCK)).toBe(true)

    rerender({ tillId: 'till-2' })
    await act(async () => {
      await settled()
    })
    expect(result.current).toBe('held')
    expect(locks.held.has(LOCK)).toBe(false)
    expect(locks.held.has('fawtir.pos.till.till-2')).toBe(true)

    unmount()
    await settled()
    expect(locks.held.size).toBe(0)
  })

  it('useTillLock reports another tab holding the till', async () => {
    otherTabHolds()
    const { result } = renderHook(() => useTillLock('till-1'))
    await act(async () => {
      await settled()
    })
    expect(result.current).toBe('otherTab')
  })

  it('a lock request that is never answered is given up after LOCK_WAIT_MS, as not held (R47-9)', async () => {
    installLocks({
      request: () => new Promise(() => {}),
      query: async () => ({ held: [], pending: [] }),
    } as unknown as LockManager)
    vi.useFakeTimers()
    try {
      const answer = ensureTillLock('till-1')
      let settled: string | null = null
      void answer.then((state) => {
        settled = state
      })
      await vi.advanceTimersByTimeAsync(LOCK_WAIT_MS - 1)
      expect(settled).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(await answer).toBe('pending')
      expect(beginNumbering('till-1')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps strict number order (Q-27): opensNumbers stays false', () => {
    expect(opensNumbers()).toBe(false)
  })
})
