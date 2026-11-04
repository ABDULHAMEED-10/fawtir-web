import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosSaleRequest, PosTillDto } from '../api/pos/pos'
import {
  flushBeforeShiftEnd,
  flushBeforeSignOut,
  flushQueue,
  queuedFor,
  noteQueueSender,
  resetPosQueue,
  submitSale,
  type QueuedSale,
} from './posQueue'
import { memoryVault, setPosVault } from './posVault'

// NOT RUN (batch 42, static only). OFF-4: one bounded send of the waiting sales before a close or a
// sign-out, through the existing single sender (OFFSEC41 §6.3; owner batch 42 prompt, OFF-4).

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
} as unknown as PosTillDto
const OTHER_TILL = {
  id: 'till-2',
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T02-INV', year: 2026, nextValue: 7 } },
} as unknown as PosTillDto

const WALK_IN: PosSaleRequest = {
  tillId: 'till-1',
  soldAt: '2026-10-28T10:00:00Z',
  queuedOffline: false,
  invoiceNumber: null,
  customer: { kind: 'WALK_IN' },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CASH', amount: 5.649 }],
  tip: null,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const refusal = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'https://api.fawtir.om/problems/x', status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })

let online = false
let reply: (key: string, body: PosSaleRequest) => Response | Promise<Response>
let posts: { key: string; body: PosSaleRequest }[]

const filed = (key: string, body: PosSaleRequest) =>
  json({ saleId: key, invoiceNumber: body.invoiceNumber, warnings: [] }, 201)

beforeEach(() => {
  window.localStorage.clear()
  setPosVault(memoryVault(true))
  resetPosQueue()
  // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
  noteQueueSender('u-1')
  resetSharedRequests()
  online = false
  posts = []
  reply = filed
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!online) throw new TypeError('Failed to fetch')
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        const key = new Headers(init.headers).get('Idempotency-Key') ?? ''
        const body = JSON.parse(String(init.body)) as PosSaleRequest
        posts.push({ key, body })
        return reply(key, body)
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setPosVault(null)
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

/** Two sales queued while offline, numbered 49 and 50. */
async function twoQueued(till = TILL): Promise<QueuedSale[]> {
  await submitSale(till, { ...WALK_IN, tillId: till.id }, `${till.id}-key-a`)
  await submitSale(till, { ...WALK_IN, tillId: till.id }, `${till.id}-key-b`)
  const queued = queuedFor(till.id)
  expect(queued).toHaveLength(2)
  return queued
}

describe('flushBeforeShiftEnd (OFF-4)', () => {
  it('with nothing waiting it sends nothing and says done', async () => {
    online = true
    expect(await flushBeforeShiftEnd('till-1')).toEqual({ outcome: 'done', left: [] })
    expect(posts).toEqual([])
  })

  it('sends every waiting sale once, oldest first, each under the key it was queued with', async () => {
    const queued = await twoQueued()
    online = true
    const result = await flushBeforeShiftEnd('till-1')
    expect(result).toEqual({ outcome: 'done', left: [] })
    expect(posts.map((post) => post.key)).toEqual(['till-1-key-a', 'till-1-key-b'])
    expect(posts.map((post) => post.body.invoiceNumber)).toEqual(
      queued.map((entry) => entry.number),
    )
    expect(posts.every((post) => post.body.queuedOffline)).toBe(true)
  })

  it('sends the body exactly as it was queued: nothing re-signed, re-numbered or re-attributed', async () => {
    const [first] = await twoQueued()
    online = true
    await flushBeforeShiftEnd('till-1')
    expect(posts[0].body).toEqual(first.body)
  })

  it('without an answer it keeps every entry exactly as it was, and says offline', async () => {
    const queued = await twoQueued()
    // The browser thinks it is online, but nothing answers.
    const result = await flushBeforeShiftEnd('till-1')
    expect(result.outcome).toBe('offline')
    expect(result.left).toEqual(queued)
    expect(queuedFor('till-1')).toEqual(queued)
  })

  it('when the browser says it is offline it tries nothing and keeps the queue', async () => {
    const queued = await twoQueued()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    online = true
    const result = await flushBeforeShiftEnd('till-1')
    expect(result).toEqual({ outcome: 'offline', left: queued })
    expect(posts).toEqual([])
  })

  it('a refused sale stays, with its refusal, and later ones still wait in order behind it', async () => {
    await twoQueued()
    online = true
    reply = (key, body) =>
      key === 'till-1-key-a' ? refusal(422, 'SIMPLIFIED_INVOICE_LIMIT') : filed(key, body)
    const result = await flushBeforeShiftEnd('till-1')
    // Strict number order (the till never said openNumbers): the second waits behind the first.
    expect(result.left.map((entry) => entry.key)).toEqual(['till-1-key-a', 'till-1-key-b'])
    expect(result.left[0]).toMatchObject({ refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true })
    expect(posts.map((post) => post.key)).toEqual(['till-1-key-a'])
  })

  it('does not force through a sale refused for good: it is not sent again by the pre-close send', async () => {
    await twoQueued()
    online = true
    reply = () => refusal(422, 'SIMPLIFIED_INVOICE_LIMIT')
    await flushQueue('till-1')
    const before = posts.length
    await flushBeforeShiftEnd('till-1')
    expect(posts.length).toBe(before)
    expect(queuedFor('till-1')).toHaveLength(2)
  })

  it('while another run is sending it waits for that run and sends nothing twice', async () => {
    await twoQueued()
    online = true
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    reply = async (key, body) => {
      await gate
      return filed(key, body)
    }
    const running = flushQueue('till-1')
    const before = flushBeforeShiftEnd('till-1')
    release()
    expect(await running).toBe('done')
    expect(await before).toEqual({ outcome: 'done', left: [] })
    expect(posts.map((post) => post.key)).toEqual(['till-1-key-a', 'till-1-key-b'])
  })

  it('is bounded: a send that never answers gives up waiting, and the entry stays queued', async () => {
    await twoQueued()
    online = true
    reply = () => new Promise<Response>(() => {})
    const result = await flushBeforeShiftEnd('till-1', { timeoutMs: 20 })
    expect(result.outcome).toBe('timeout')
    expect(result.left.map((entry) => entry.key)).toEqual(['till-1-key-a', 'till-1-key-b'])
  })

  it('a second press while the first is still sending starts no second sender', async () => {
    await twoQueued()
    online = true
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    reply = async (key, body) => {
      await gate
      return filed(key, body)
    }
    const first = flushBeforeShiftEnd('till-1')
    const second = flushBeforeShiftEnd('till-1')
    release()
    await Promise.all([first, second])
    expect(posts.map((post) => post.key)).toEqual(['till-1-key-a', 'till-1-key-b'])
    expect(queuedFor('till-1')).toEqual([])
  })
})

describe('flushBeforeSignOut (OFF-4, PRV42W-1)', () => {
  it("sends only the signed-in person's own till, never another till's queue, and counts the whole device", async () => {
    await twoQueued(TILL)
    const other = await twoQueued(OTHER_TILL)
    online = true
    expect(await flushBeforeSignOut('till-1')).toEqual({ left: 2 })
    // A LEGACY sale is filed under its sender: till 2's sales must not go as this person's.
    expect(posts.map((post) => post.key)).toEqual(['till-1-key-a', 'till-1-key-b'])
    expect(queuedFor('till-2')).toEqual(other)
  })

  it('with no till of their own it sends nothing at all and only counts', async () => {
    await twoQueued(TILL)
    await twoQueued(OTHER_TILL)
    online = true
    expect(await flushBeforeSignOut(null)).toEqual({ left: 4 })
    expect(posts).toEqual([])
  })

  it('offline, it returns with the count left, and the queue is untouched', async () => {
    const queued = await twoQueued()
    expect(await flushBeforeSignOut('till-1')).toEqual({ left: 2 })
    expect(queuedFor('till-1')).toEqual(queued)
  })

  it('never waits past its bound', async () => {
    await twoQueued(TILL)
    online = true
    reply = () => new Promise<Response>(() => {})
    const started = Date.now()
    expect(await flushBeforeSignOut('till-1', { timeoutMs: 30 })).toEqual({ left: 2 })
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
