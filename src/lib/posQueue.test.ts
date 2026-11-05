import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, resetSharedRequests } from '../api'
import type { PosSaleRequest, PosTillDto } from '../api/pos/pos'
import {
  checkStorageAgain,
  correctQueuedSale,
  flushQueue,
  isFinalRefusal,
  numberPrefix,
  numbersBefore,
  queuedFor,
  noteQueueSender,
  noteTillServer,
  offlineBlock,
  PosStorageUnavailable,
  PosTenantZoneUnavailable,
  resetPosQueue,
  retryQueuedSale,
  stopQueueSendsForSignOut,
  storedRefusal,
  submitSale,
} from './posQueue'
import { heldSlipPhotos } from './posSlipOutbox'
import { posRefusalKey } from './posRefusals'
import { memoryVault, setPosVault, type PosVault } from './posVault'

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
} as unknown as PosTillDto

const CIVIL_ID = '98765432'

const BODY: PosSaleRequest = {
  tillId: 'till-1',
  soldAt: '2026-10-28T10:00:00Z',
  queuedOffline: false,
  invoiceNumber: null,
  customer: {
    kind: 'CONSUMER',
    consumer: {
      name: 'Salim Al Harthy',
      contact: '+968 9123 4567',
      identifierScheme: 'CID',
      identifierValue: CIVIL_ID,
    },
  },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CARD', amount: 5.649 }],
  tip: null,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const refusal = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'https://api.fawtir.om/problems/x', status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })

let online = false
let saleReply: () => Response
let calls: { url: string; init?: RequestInit }[]
let vault: PosVault

/** Everything this device holds for the till, as one string to search for the ID. */
async function everythingStored(): Promise<string> {
  const parts = [JSON.stringify({ ...window.localStorage }), JSON.stringify({ ...sessionStorage })]
  for (const store of ['pii', 'slips', 'keys'] as const) {
    for (const id of await vault.ids(store)) parts.push(JSON.stringify(await vault.get(store, id)))
  }
  return parts.join('\n')
}

beforeEach(() => {
  window.localStorage.clear()
  sessionStorage.clear()
  vault = memoryVault(true)
  setPosVault(vault)
  resetPosQueue()
  // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
  noteQueueSender('u-1')
  resetSharedRequests()
  online = false
  calls = []
  saleReply = () =>
    json(
      {
        saleId: 'sale-9',
        invoiceNumber: 'NZW-T01-INV-2026-000049',
        receipt: { qr: { status: 'PENDING' } },
        filing: { dispatchState: 'QUEUED' },
        warnings: [],
      },
      201,
    )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (!online) throw new TypeError('Failed to fetch')
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') return saleReply()
      if (url.startsWith('/api/v1/pos/slips?tillId=')) {
        return json({ fileId: 'file-1', tillId: 'till-1', contentType: 'image/jpeg' }, 201)
      }
      if (url === '/api/v1/pos/slips/read') {
        const field = (value: string | null, confidence: number) => ({ value, confidence })
        return json({
          fileId: 'file-1',
          reason: null,
          authCode: field('898498', 0.97),
          rrn: field('123456789012', 0.4),
          cardLast4: field('4421', 0.95),
          cardType: field(null, 0),
          amount: field('5.649', 0.9),
        })
      }
      if (url === '/api/v1/pos/sales/sale-9/payments/1/slip' && init?.method === 'PUT') {
        return json({ saleId: 'sale-9', position: 1, replayed: false, warnings: [] })
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  setPosVault(null)
})

describe("an offline full invoice and the buyer's ID", () => {
  it('queues the sale without the ID in plain text, and sends it with the ID', async () => {
    const result = await submitSale(TILL, BODY, 'pos-sale-key-0001')
    expect('queued' in result).toBe(true)

    // Not in the queue, nor anywhere readable: only sealed.
    expect(window.localStorage.getItem('fawtir.pos.queue')).not.toContain(CIVIL_ID)
    expect(window.localStorage.getItem('fawtir.pos.queue')).not.toContain('Salim')
    expect(await everythingStored()).not.toContain(CIVIL_ID)
    expect(await vault.ids('pii')).toEqual(['pos-sale-key-0001'])
    expect(queuedFor('till-1')[0].body.customer).toEqual({ kind: 'CONSUMER' })

    online = true
    await flushQueue('till-1')
    const sent = calls.filter((call) => call.url === '/api/v1/pos/sales')
    const body = JSON.parse(String(sent.at(-1)?.init?.body))
    expect(body.customer.consumer).toEqual(BODY.customer.consumer)
    expect(body).toMatchObject({ queuedOffline: true, invoiceNumber: 'NZW-T01-INV-2026-000049' })
  })

  it('removes the ID, its sealed copy and the key as soon as the sale is filed', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0002')
    online = true
    await flushQueue('till-1')

    expect(queuedFor('till-1')).toEqual([])
    expect(await vault.ids('pii')).toEqual([])
    expect(await vault.ids('keys')).toEqual([])
    expect(await everythingStored()).not.toContain(CIVIL_ID)
  })

  it('keeps the ID sealed when the server refuses the sale for good, and does not send it by itself', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0003')
    online = true
    saleReply = () => refusal(422, 'SIMPLIFIED_INVOICE_LIMIT')
    await flushQueue('till-1')

    const [entry] = queuedFor('till-1')
    expect(entry).toMatchObject({ refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true, sealed: true })
    expect(await vault.ids('pii')).toEqual(['pos-sale-key-0003'])
    expect(await vault.ids('keys')).toEqual(['buyer'])
    // Kept, and still only as ciphertext under a key that cannot be exported.
    const kept = await vault.get<{ data: ArrayBuffer }>('pii', 'pos-sale-key-0003')
    expect(new TextDecoder().decode(kept!.data)).not.toContain(CIVIL_ID)
    expect(await everythingStored()).not.toContain(CIVIL_ID)
    expect(window.localStorage.getItem('fawtir.pos.queue')).not.toContain('identifierValue')

    // Not sent again: the same sale can only be refused the same way.
    const before = calls.length
    await flushQueue('till-1')
    expect(calls.length).toBe(before)
  })

  const sentConsumer = () => {
    const sent = calls.filter((c) => c.url === '/api/v1/pos/sales' && c.init?.method === 'POST')
    return JSON.parse(String(sent[sent.length - 1].init?.body)).customer.consumer
  }

  it('Try again resends the sealed ID after a final refusal, and filing deletes it', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0031')
    online = true
    saleReply = () => refusal(422, 'SIMPLIFIED_INVOICE_LIMIT')
    await flushQueue('till-1')

    saleReply = () => refusal(422, 'SIMPLIFIED_INVOICE_LIMIT')
    await retryQueuedSale('till-1', 'pos-sale-key-0031')
    expect(sentConsumer().identifierValue).toBe(CIVIL_ID)
    expect(await vault.ids('pii')).toEqual(['pos-sale-key-0031'])

    saleReply = () =>
      json(
        {
          saleId: 'sale-9',
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          receipt: { qr: { status: 'PENDING' } },
          filing: { dispatchState: 'QUEUED' },
          warnings: [],
        },
        201,
      )
    await retryQueuedSale('till-1', 'pos-sale-key-0031')
    expect(sentConsumer().identifierValue).toBe(CIVIL_ID)
    expect(queuedFor('till-1')).toEqual([])
    expect(await vault.ids('pii')).toEqual([])
    expect(await vault.ids('keys')).toEqual([])
    expect(await everythingStored()).not.toContain(CIVIL_ID)
  })

  it('Correct and send again resends the sealed ID with the corrected payments', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0032')
    online = true
    saleReply = () => refusal(422, 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL')
    await flushQueue('till-1')
    expect(queuedFor('till-1')[0].final).toBe(true)
    expect(await vault.ids('pii')).toEqual(['pos-sale-key-0032'])

    saleReply = () =>
      json(
        {
          saleId: 'sale-9',
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          receipt: { qr: { status: 'PENDING' } },
          filing: { dispatchState: 'QUEUED' },
          warnings: [],
        },
        201,
      )
    await correctQueuedSale('till-1', 'pos-sale-key-0032', [{ method: 'CASH', amount: 5.649 }])
    const sent = calls.filter((c) => c.url === '/api/v1/pos/sales' && c.init?.method === 'POST')
    const body = JSON.parse(String(sent[sent.length - 1].init?.body))
    expect(body.customer.consumer.identifierValue).toBe(CIVIL_ID)
    expect(body.payments).toEqual([{ method: 'CASH', amount: 5.649 }])
    expect(await vault.ids('pii')).toEqual([])
  })

  it('keeps the sealed ID while a refusal may still pass (sign-in, server fault)', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0004')
    online = true
    saleReply = () => refusal(503, 'UNAVAILABLE')
    await flushQueue('till-1')
    expect(await vault.ids('pii')).toEqual(['pos-sale-key-0004'])
    expect(queuedFor('till-1')[0].final).toBeUndefined()
  })

  const salePosts = () =>
    calls.filter((c) => c.url === '/api/v1/pos/sales' && c.init?.method === 'POST').length

  it('does not send a full invoice whose sealed buyer cannot be opened, and holds it to try again (B38 OFF)', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0041')
    // The vault this tab reaches has lost the copy (a failed open, or its data cleared).
    setPosVault(memoryVault(true))
    online = true
    const before = salePosts()
    expect(await flushQueue('till-1')).toBe('done')

    expect(salePosts()).toBe(before)
    const [entry] = queuedFor('till-1')
    expect(entry).toMatchObject({
      refusal: 'POS_QUEUED_BUYER_UNAVAILABLE',
      sealed: true,
      attempts: 1,
    })
    expect(entry.final).toBeUndefined()
    expect(entry.notBefore).toBeDefined()
    expect(entry.buyerRemoved).toBeUndefined()

    // Resting, so not tried again at once.
    await flushQueue('till-1')
    expect(salePosts()).toBe(before)
  })

  it('Try again sends it with the buyer once the vault opens again, and filing deletes the copy (B38 OFF)', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0042')
    setPosVault(memoryVault(true))
    online = true
    await flushQueue('till-1')
    expect(queuedFor('till-1')[0].refusal).toBe('POS_QUEUED_BUYER_UNAVAILABLE')

    setPosVault(vault)
    await retryQueuedSale('till-1', 'pos-sale-key-0042')
    expect(sentConsumer().identifierValue).toBe(CIVIL_ID)
    expect(queuedFor('till-1')).toEqual([])
    expect(await vault.ids('pii')).toEqual([])
  })

  it('in strict number order, a later queued sale waits behind the held one (B38 OFF)', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0043')
    await submitSale(TILL, { ...BODY, customer: { kind: 'WALK_IN' } }, 'pos-sale-key-0044')
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual([
      'pos-sale-key-0043',
      'pos-sale-key-0044',
    ])
    setPosVault(memoryVault(true))
    online = true
    const before = salePosts()
    expect(await flushQueue('till-1')).toBe('done')
    expect(salePosts()).toBe(before)
    expect(queuedFor('till-1')).toHaveLength(2)
  })

  it('without a sealing vault, keeps the buyer in the entry, and removes it on a final refusal', async () => {
    setPosVault(memoryVault(false))
    await submitSale(TILL, BODY, 'pos-sale-key-0005')
    expect(window.localStorage.getItem('fawtir.pos.queue')).toContain(CIVIL_ID)
    online = true
    saleReply = () => refusal(400, 'VALIDATION_FAILED')
    await flushQueue('till-1')
    expect(window.localStorage.getItem('fawtir.pos.queue')).not.toContain(CIVIL_ID)
  })
})

describe('a slip scanned offline (Abdul, 27 Oct 2026)', () => {
  const photo = () => ({
    position: 1,
    blob: new Blob(['jpeg bytes'], { type: 'image/jpeg' }),
    name: 'slip.jpg',
  })

  it('waits with the queued sale, then is uploaded, read and attached once the sale is filed', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0101', [photo()])
    expect(await heldSlipPhotos('pos-sale-key-0101')).toHaveLength(1)
    expect(calls.some((call) => call.url.startsWith('/api/v1/pos/slips'))).toBe(false)

    online = true
    calls = []
    await flushQueue('till-1')
    await vi.waitFor(async () => {
      expect(await heldSlipPhotos('pos-sale-key-0101')).toEqual([])
    })

    const urls = calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`)
    const sale = urls.indexOf('POST /api/v1/pos/sales')
    const upload = urls.indexOf('POST /api/v1/pos/slips?tillId=till-1')
    const attach = urls.indexOf('PUT /api/v1/pos/sales/sale-9/payments/1/slip')
    expect(sale).toBeGreaterThanOrEqual(0)
    expect(upload).toBeGreaterThan(sale)
    expect(attach).toBeGreaterThan(upload)
    // Read then, and only what was read with confidence goes with the photo.
    const body = JSON.parse(String(calls.find((c) => c.init?.method === 'PUT')?.init?.body))
    expect(body).toEqual({
      slipFileId: 'file-1',
      slipFields: { authCode: '898498', cardLast4: '4421', amount: 5.649 },
    })
    expect(window.localStorage.getItem('fawtir.pos.slipsDue')).toBeNull()
  })

  it('keeps the photo (and its uploaded file) when attaching fails, and attaches it later', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0102', [photo()])
    online = true
    let attachDown = true
    const base = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/payments/1/slip') && attachDown) {
        calls.push({ url: String(input), init })
        return new Response('', { status: 503 })
      }
      return base(input, init)
    })
    await flushQueue('till-1')
    await vi.waitFor(async () => {
      const [held] = await heldSlipPhotos('pos-sale-key-0102')
      expect(held?.fileId).toBe('file-1')
    })

    attachDown = false
    await flushQueue('till-1')
    await vi.waitFor(async () => {
      expect(await heldSlipPhotos('pos-sale-key-0102')).toEqual([])
    })
    expect(calls.filter((c) => c.url.startsWith('/api/v1/pos/slips?'))).toHaveLength(1)
  })

  it('attaches straight away when the sale itself went through online', async () => {
    online = true
    const result = await submitSale(TILL, BODY, 'pos-sale-key-0103', [photo()])
    expect('sale' in result).toBe(true)
    await vi.waitFor(async () => {
      expect(await heldSlipPhotos('pos-sale-key-0103')).toEqual([])
    })
    expect(calls.some((c) => c.url === '/api/v1/pos/sales/sale-9/payments/1/slip')).toBe(true)
  })

  it('removes the photo when the slip can never be attached', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0104', [photo()])
    online = true
    const base = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).endsWith('/payments/1/slip')
        ? refusal(400, 'POS_SLIP_NOT_CARD')
        : base(input, init),
    )
    await flushQueue('till-1')
    await vi.waitFor(async () => {
      expect(await heldSlipPhotos('pos-sale-key-0104')).toEqual([])
    })
  })

  it('a sale refused for good keeps its photo, which is attached once Try again files it', async () => {
    const photo = { position: 1, blob: new Blob(['slip']), name: 'slip.jpg' }
    await submitSale(TILL, BODY, 'pos-sale-key-0033', [photo])
    online = true
    const filed = saleReply
    saleReply = () => refusal(422, 'SIMPLIFIED_INVOICE_LIMIT')
    await flushQueue('till-1')
    expect(await heldSlipPhotos('pos-sale-key-0033')).toHaveLength(1)

    saleReply = filed
    await retryQueuedSale('till-1', 'pos-sale-key-0033')
    await vi.waitFor(async () => {
      expect(calls.some((c) => c.url === '/api/v1/pos/sales/sale-9/payments/1/slip')).toBe(true)
      expect(await heldSlipPhotos('pos-sale-key-0033')).toHaveLength(0)
    })
  })

  it('does not keep a photo over the upload limit', async () => {
    const big = { ...photo(), blob: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]) }
    await submitSale(TILL, BODY, 'pos-sale-key-0105', [big])
    expect(await heldSlipPhotos('pos-sale-key-0105')).toEqual([])
  })
})

describe('a refused sale never stops the till (E2E 30 Oct 2026, H-1)', () => {
  const RO = () =>
    new Response(
      JSON.stringify({
        type: 'https://api.fawtir.om/problems/subscription-restricted',
        status: 409,
        code: 'SUBSCRIPTION_SUSPENDED',
        action: 'CREATE_DRAFTS',
      }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
    )
  const WALK_IN: PosSaleRequest = { ...BODY, customer: { kind: 'WALK_IN' } }
  const NEW_TILL = { ...TILL, openNumbers: true } as PosTillDto

  /** A server with the real numbering rule: exactly the next number, or the declared skips. */
  function fakeServer() {
    const state = {
      next: 49,
      readOnly: false,
      refuseKeys: new Set<string>(),
      refused: new Set<string>(),
      filed: new Map<string, string>(),
      posts: [] as { key: string; body: PosSaleRequest }[],
      canSkip: false,
      strictMinute: false,
    }
    saleReply = () => {
      const call = calls[calls.length - 1]
      const body = JSON.parse(String(call.init?.body)) as PosSaleRequest
      const key = new Headers(call.init?.headers).get('Idempotency-Key') ?? ''
      state.posts.push({ key, body })
      const filed = state.filed.get(key)
      if (filed) return json({ saleId: key, invoiceNumber: filed, replayed: true })
      if (state.refuseKeys.has(key)) {
        if (body.invoiceNumber) state.refused.add(body.invoiceNumber)
        return refusal(422, 'SIMPLIFIED_INVOICE_LIMIT')
      }
      if (state.readOnly && !(state.canSkip && body.queuedOffline)) return RO()
      const claimed = body.invoiceNumber
      const fmt = (v: number) => `NZW-T01-INV-2026-${String(v).padStart(6, '0')}`
      // The real server goes past a number it has refused when a sale brings no number of its own.
      while (!claimed && state.canSkip && state.refused.has(fmt(state.next))) state.next++
      const value = claimed ? Number(claimed.slice(-6)) : state.next
      if (value > state.next) {
        const declared = new Set(body.skippedNumbers ?? [])
        for (let at = state.next; at < value; at++) {
          if (!state.canSkip || !declared.has(fmt(at))) {
            return new Response(
              JSON.stringify({
                type: 'https://api.fawtir.om/problems/pos-till-number-gap',
                status: 409,
                code: 'POS_TILL_NUMBER_GAP',
                expectedNumber: fmt(state.next),
              }),
              { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
            )
          }
        }
      }
      if (value < state.next && !(state.canSkip && body.queuedOffline)) {
        return refusal(409, 'POS_TILL_NUMBER_REPEATED')
      }
      state.next = Math.max(state.next, value + 1)
      state.filed.set(key, fmt(value))
      return json({ saleId: key, invoiceNumber: fmt(value), warnings: [] }, 201)
    }
    return state
  }

  it('the read-only scenario on the current server: refused, not lost, and filed once restored', async () => {
    const server = fakeServer()
    server.readOnly = true
    // Offline: sold, numbered, on the customer's receipt.
    const first = await submitSale(TILL, WALK_IN, 'pos-sale-key-ro-1')
    expect('queued' in first && first.queued.number).toBe('NZW-T01-INV-2026-000049')

    // Back online while read-only: the old till marked it final and stopped for good.
    online = true
    await flushQueue('till-1')
    const [held] = queuedFor('till-1')
    expect(held.refusal).toBe('SUBSCRIPTION_SUSPENDED')
    expect(held.final).toBeUndefined()

    // A sale rung up online now is told the truth, before any receipt exists.
    await expect(submitSale(TILL, WALK_IN, 'pos-sale-key-ro-2')).rejects.toMatchObject({
      status: 409,
      problemType: 'subscription-restricted',
    })
    expect(queuedFor('till-1')).toHaveLength(1)

    // Paid: the next minute's run files it, under the key it was made with.
    server.readOnly = false
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])
    expect(server.filed.get('pos-sale-key-ro-1')).toBe('NZW-T01-INV-2026-000049')
    expect(
      server.posts.every((post) => post.key !== 'pos-sale-key-ro-1' || post.body.queuedOffline),
    ).toBe(true)

    // And the till sells online again, on the following number.
    const next = await submitSale(TILL, WALK_IN, 'pos-sale-key-ro-3')
    expect('sale' in next && next.sale.invoiceNumber).toBe('NZW-T01-INV-2026-000050')
  })

  it('the read-only scenario on a server that files it: it goes at once, and a replay files nothing', async () => {
    const server = fakeServer()
    server.readOnly = true
    server.canSkip = true
    await submitSale(NEW_TILL, WALK_IN, 'pos-sale-key-ro-4')
    online = true
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])
    expect(server.filed.size).toBe(1)
    // An online sale while read-only is still refused: the flag is only set when the till was offline.
    await expect(submitSale(NEW_TILL, WALK_IN, 'pos-sale-key-ro-5')).rejects.toMatchObject({
      status: 409,
    })
    expect(server.posts[server.posts.length - 1].body.queuedOffline).toBe(false)
  })

  it('under a minute old (425) the sale only waits: no problem shown, and it goes on the next try', async () => {
    fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-ro-6')
    online = true
    const reply = saleReply
    saleReply = () =>
      new Response(
        JSON.stringify({ status: 425, code: 'POS_QUEUED_SALE_TOO_EARLY', retryAfterSeconds: 30 }),
        { status: 425, headers: { 'Content-Type': 'application/problem+json' } },
      )
    await flushQueue('till-1')
    expect(queuedFor('till-1')[0]).toMatchObject({ refusal: null })
    expect(queuedFor('till-1')[0].final).toBeUndefined()
    saleReply = reply
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])
  })

  it('a replay filed under another number is told on the next sale, once, naming both numbers', async () => {
    fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-differs-1')
    online = true
    const reply = saleReply
    saleReply = () =>
      json({
        saleId: 'sale-1',
        invoiceNumber: 'NZW-T01-INV-2026-000048',
        replayed: true,
        warnings: [{ code: 'POS_PRINTED_NUMBER_DIFFERS', line: null, message: 'not shown' }],
      })
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])

    saleReply = reply
    const next = await submitSale(TILL, WALK_IN, 'pos-sale-key-differs-2')
    expect('sale' in next && next.sale.warnings).toEqual([
      {
        code: 'POS_PRINTED_NUMBER_DIFFERS',
        line: null,
        printed: 'NZW-T01-INV-2026-000049',
        filed: 'NZW-T01-INV-2026-000048',
      },
    ])
    const after = await submitSale(TILL, WALK_IN, 'pos-sale-key-differs-3')
    expect('sale' in after && after.sale.warnings).toEqual([])
  })

  it('a queued sale filed with no such warning leaves nothing for the next sale', async () => {
    fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-same-1')
    online = true
    await flushQueue('till-1')
    const next = await submitSale(TILL, WALK_IN, 'pos-sale-key-same-2')
    expect('sale' in next && next.sale.warnings).toEqual([])
  })

  it('an entry the old version gave up on comes back to life after a reload', async () => {
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        {
          key: 'pos-sale-key-stuck',
          tillId: 'till-1',
          number: 'NZW-T01-INV-2026-000049',
          body: { ...WALK_IN, queuedOffline: true, invoiceNumber: 'NZW-T01-INV-2026-000049' },
          refusal: 'SUBSCRIPTION_SUSPENDED',
          final: true,
        },
        {
          key: 'pos-sale-key-limit',
          tillId: 'till-1',
          number: 'NZW-T01-INV-2026-000050',
          body: { ...WALK_IN, queuedOffline: true, invoiceNumber: 'NZW-T01-INV-2026-000050' },
          refusal: 'SIMPLIFIED_INVOICE_LIMIT',
          final: true,
        },
      ]),
    )
    vi.resetModules()
    const fresh = await import('./posQueue')
    const entries = fresh.queuedFor('till-1')
    expect(entries[0].final).toBeUndefined()
    expect(entries[1].final).toBe(true)
  })

  it.each([
    ['another person is noted at the till', () => noteQueueSender('u-2')],
    ['the person signs out', () => stopQueueSendsForSignOut()],
  ])(
    'a run stops before its next sale when %s mid-send; the sale on the wire is filed, the rest wait (PRV43-OFF L-1)',
    async (_, change) => {
      const server = fakeServer()
      const reply = saleReply
      saleReply = () => {
        const answer = reply()
        if (server.posts.length === 1) change()
        return answer
      }
      await submitSale(TILL, WALK_IN, 'pos-sale-key-first')
      await submitSale(TILL, WALK_IN, 'pos-sale-key-second')
      online = true

      expect(await flushQueue('till-1')).toBe('done')

      expect(server.posts.map((post) => post.key)).toEqual(['pos-sale-key-first'])
      expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-second'])

      // Its maker, back at the till, sends it.
      saleReply = reply
      noteQueueSender('u-1')
      await flushQueue('till-1')
      expect(server.posts.map((post) => post.key)).toEqual([
        'pos-sale-key-first',
        'pos-sale-key-second',
      ])
      expect(queuedFor('till-1')).toEqual([])
    },
  )

  it('on the current server later sales keep selling behind a final refusal, in order, and say why', async () => {
    const server = fakeServer()
    server.refuseKeys.add('pos-sale-key-bad')
    await submitSale(TILL, WALK_IN, 'pos-sale-key-bad')
    await submitSale(TILL, WALK_IN, 'pos-sale-key-next')
    online = true
    await flushQueue('till-1')
    const [bad, next] = queuedFor('till-1')
    expect(bad).toMatchObject({ refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true })
    expect(next.refusal).toBeNull()
    // The number after it would be refused as a gap, so it is not even tried.
    expect(server.posts.some((post) => post.key === 'pos-sale-key-next')).toBe(false)

    const sold = await submitSale(TILL, WALK_IN, 'pos-sale-key-third')
    expect(sold).toMatchObject({ behind: true, queued: { number: 'NZW-T01-INV-2026-000051' } })
    // Never an online sale, which would take number 49 from the customer holding it.
    expect(server.posts.some((post) => post.key === 'pos-sale-key-third')).toBe(false)
    expect(server.next).toBe(49)
  })

  // Q-27 (owner P0-3): inverted. Even against a server that would skip (the #831 backend, which the
  // fake models with `canSkip`) and a till saying `openNumbers: true`, this build keeps strict order.
  it('a till saying openNumbers still keeps strict order: nothing goes past a stuck one, nothing names it', async () => {
    const server = fakeServer()
    server.canSkip = true
    server.refuseKeys.add('pos-sale-key-bad2')
    await submitSale(NEW_TILL, WALK_IN, 'pos-sale-key-bad2')
    await submitSale(NEW_TILL, WALK_IN, 'pos-sale-key-next2')
    online = true
    // As the screen does: QueueSender tells the queue about the till.
    noteTillServer(NEW_TILL)
    await flushQueue('till-1')

    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual([
      'pos-sale-key-bad2',
      'pos-sale-key-next2',
    ])
    expect(server.posts.some((post) => post.key === 'pos-sale-key-next2')).toBe(false)
    expect(server.posts.every((post) => post.body.skippedNumbers === undefined)).toBe(true)

    // A new sale is not sold online past the stuck one (NF-1): it is numbered and waits behind.
    const sold = await submitSale(NEW_TILL, WALK_IN, 'pos-sale-key-third2')
    expect(sold).toMatchObject({ behind: true, queued: { number: 'NZW-T01-INV-2026-000051' } })
    expect(server.posts.some((post) => post.key === 'pos-sale-key-third2')).toBe(false)
    expect(server.next).toBe(49)
    expect(calls.some((call) => call.url.includes('/pos/open-numbers'))).toBe(false)

    // Final: not sent again by itself.
    const tries = server.posts.filter((post) => post.key === 'pos-sale-key-bad2').length
    await flushQueue('till-1')
    expect(server.posts.filter((post) => post.key === 'pos-sale-key-bad2').length).toBe(tries)

    // A person fixes the cause and presses Try again: the same key, filed once, then the rest in order.
    server.refuseKeys.delete('pos-sale-key-bad2')
    await retryQueuedSale('till-1', 'pos-sale-key-bad2')
    expect(queuedFor('till-1')).toEqual([])
    expect(server.filed.get('pos-sale-key-bad2')).toBe('NZW-T01-INV-2026-000049')
    expect(server.filed.get('pos-sale-key-next2')).toBe('NZW-T01-INV-2026-000050')
    expect(server.filed.get('pos-sale-key-third2')).toBe('NZW-T01-INV-2026-000051')
    await retryQueuedSale('till-1', 'pos-sale-key-bad2')
    expect([...server.filed.values()].filter((v) => v.endsWith('000049'))).toHaveLength(1)
  })

  it('a sale the server took but whose answer was lost is answered as the same sale, not paid twice', async () => {
    const server = fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-lost')
    server.filed.set('pos-sale-key-lost', 'NZW-T01-INV-2026-000049')
    server.next = 50
    online = true
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])
    expect(server.filed.size).toBe(1)
    expect(server.next).toBe(50)
  })

  it('a person tries a refused sale again and the answer is lost: the old refusal goes, filed next try', async () => {
    fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-lost2')
    online = true
    const reply = saleReply
    saleReply = () => refusal(422, 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL')
    await flushQueue('till-1')
    expect(queuedFor('till-1')[0]).toMatchObject({
      refusal: 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL',
      final: true,
    })

    // The server has filed it; the connection drops before its answer comes back.
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await retryQueuedSale('till-1', 'pos-sale-key-lost2')).toBe('offline')
    const [waiting] = queuedFor('till-1')
    expect(waiting).toMatchObject({ refusal: null, refusalType: null, refusalValues: {} })
    expect(waiting.final).toBeUndefined()

    // The same key: the next try is answered as the same sale.
    saleReply = reply
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])
  })

  it('an unreviewed refusal is never given up on: shown, tried again later and later, and not final', async () => {
    fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-new')
    online = true
    const reply = saleReply
    saleReply = () => refusal(409, 'SOME_CODE_NOBODY_REVIEWED')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await flushQueue('till-1')
      const [first] = queuedFor('till-1')
      expect(first).toMatchObject({ refusal: 'SOME_CODE_NOBODY_REVIEWED', attempts: 1 })
      expect(first.final).toBeUndefined()
      const sent = () => calls.filter((call) => call.init?.method === 'POST').length
      const before = sent()
      await flushQueue('till-1')
      expect(sent()).toBe(before)

      vi.advanceTimersByTime(61_000)
      await flushQueue('till-1')
      expect(sent()).toBe(before + 1)
      const gap = Date.parse(queuedFor('till-1')[0].notBefore!) - Date.now()
      expect(gap).toBeGreaterThan(61_000)

      // A person need not wait for the gap, and when the cause clears it files.
      saleReply = reply
      await retryQueuedSale('till-1', 'pos-sale-key-new')
      expect(queuedFor('till-1')).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a full invoice held for an HS code (PENDING_VALIDATION) stays unissued, and goes on the same key and number', async () => {
    fakeServer()
    await submitSale(TILL, BODY, 'pos-sale-key-hs')
    online = true
    const reply = saleReply
    saleReply = () =>
      new Response(
        JSON.stringify({
          type: 'https://api.fawtir.om/problems/x',
          status: 422,
          code: 'POS_QUEUED_SALE_HS_CODE_REQUIRED',
          lines: [1, 3],
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          state: 'PENDING_VALIDATION',
        }),
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    await flushQueue('till-1')
    const [held] = queuedFor('till-1')
    expect(held).toMatchObject({
      refusal: 'POS_QUEUED_SALE_HS_CODE_REQUIRED',
      number: 'NZW-T01-INV-2026-000049',
      refusalValues: { lines: '1, 3' },
    })
    // Cleared only by a person adding the code, so it is never given up on and never final.
    expect(held.final).toBeUndefined()
    expect(
      isFinalRefusal(
        new ApiError({ status: 422, problemType: null, code: 'POS_QUEUED_SALE_HS_CODE_REQUIRED' }),
      ),
    ).toBe(false)

    saleReply = reply
    await retryQueuedSale('till-1', 'pos-sale-key-hs')
    const posts = calls.filter((call) => call.init?.method === 'POST')
    const last = posts.at(-1)!
    expect(new Headers(last.init?.headers).get('Idempotency-Key')).toBe('pos-sale-key-hs')
    expect(JSON.parse(String(last.init?.body)).invoiceNumber).toBe('NZW-T01-INV-2026-000049')
    expect(queuedFor('till-1')).toEqual([])
  })

  // NOT RUN (static only). Backend 8f04050ab (HS Slice B): a full invoice with a line that states
  // neither goods nor services is held before issue. The server does not fill it on the resend and
  // this device must not choose it, so the sale stays queued, on its number and unchanged.
  it('a full invoice held for an undeclared line stays queued, numbered as printed and unchanged', async () => {
    fakeServer()
    await submitSale(TILL, BODY, 'pos-sale-key-gs')
    online = true
    saleReply = () =>
      new Response(
        JSON.stringify({
          type: 'https://api.fawtir.om/problems/x',
          status: 422,
          code: 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
          lines: [2],
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          state: 'PENDING_VALIDATION',
        }),
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    await flushQueue('till-1')
    const [held] = queuedFor('till-1')
    expect(held).toMatchObject({
      refusal: 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
      number: 'NZW-T01-INV-2026-000049',
      refusalValues: { lines: '2' },
    })
    expect(held.final).toBeUndefined()
    expect(held.attempts).toBe(1)
    expect(
      isFinalRefusal(
        new ApiError({
          status: 422,
          problemType: null,
          code: 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
        }),
      ),
    ).toBe(false)

    await retryQueuedSale('till-1', 'pos-sale-key-gs')
    const posts = calls.filter((call) => call.init?.method === 'POST')
    const last = posts.at(-1)!
    expect(new Headers(last.init?.headers).get('Idempotency-Key')).toBe('pos-sale-key-gs')
    // Nothing on this device picked goods or services for the lines.
    expect(JSON.parse(String(last.init?.body)).draft.lines).toEqual(held.body.draft.lines)
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  // Backend a2c9fcf0c (FIN-M3-CURRENCY-MIX Phase 2a): the implicit shift open carries the float over
  // through expectedCash, which refuses 409 while the earlier shift's cash is in mixed or unrecorded
  // currencies. A person clears that (counting the float, a new shift, a manager), so a queued sale
  // refused there must stay on its printed number and body, retryable, never given up on (FIN-2a-3).
  it.each(['POS_SHIFT_CURRENCY_MIXED', 'POS_SHIFT_CURRENCY_UNRECORDED'])(
    'a queued sale refused %s at the float carry stays queued, numbered as printed and unchanged, and Try again sends it',
    async (code) => {
      fakeServer()
      await submitSale(TILL, BODY, 'pos-sale-key-cur')
      const [queued] = queuedFor('till-1')
      online = true
      const reply = saleReply
      saleReply = () =>
        new Response(
          JSON.stringify({
            type: `https://api.fawtir.om/problems/${code.toLowerCase().replace(/_/g, '-')}`,
            status: 409,
            code,
            currencies: ['OMR', 'USD'],
            unrecordedMovements: 2,
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        )
      await flushQueue('till-1')
      const [held] = queuedFor('till-1')
      expect(held).toMatchObject({
        key: 'pos-sale-key-cur',
        refusal: code,
        number: queued.number,
        attempts: 1,
      })
      expect(held.number).toBe('NZW-T01-INV-2026-000049')
      expect(held.final).toBeUndefined()
      expect(held.body).toEqual(queued.body)
      expect(isFinalRefusal(new ApiError({ status: 409, problemType: null, code }))).toBe(false)

      saleReply = reply
      await retryQueuedSale('till-1', 'pos-sale-key-cur')
      const last = calls.filter((call) => call.init?.method === 'POST').at(-1)!
      expect(new Headers(last.init?.headers).get('Idempotency-Key')).toBe('pos-sale-key-cur')
      expect(JSON.parse(String(last.init?.body)).invoiceNumber).toBe('NZW-T01-INV-2026-000049')
      expect(queuedFor('till-1')).toEqual([])
    },
  )

  it('on the current server an unreviewed refusal holds later numbers only as far as number order forces', async () => {
    const server = fakeServer()
    await submitSale(TILL, WALK_IN, 'pos-sale-key-u1')
    await submitSale(TILL, WALK_IN, 'pos-sale-key-u2')
    online = true
    const reply = saleReply
    saleReply = () => refusal(409, 'SOME_CODE_NOBODY_REVIEWED')
    await flushQueue('till-1')
    saleReply = reply
    expect(server.posts.some((post) => post.key === 'pos-sale-key-u2')).toBe(false)
    expect(await submitSale(TILL, WALK_IN, 'pos-sale-key-u3')).toMatchObject({ behind: true })
    expect(queuedFor('till-1')).toHaveLength(3)
  })

  it('sorts refusals: read-only and a gap can clear, an invalid sale cannot', () => {
    expect(
      isFinalRefusal(
        new ApiError({
          status: 409,
          problemType: 'subscription-restricted',
          code: 'SUBSCRIPTION_SUSPENDED',
        }),
      ),
    ).toBe(false)
    expect(
      isFinalRefusal(
        new ApiError({
          status: 409,
          problemType: 'pos-till-number-gap',
          code: 'POS_TILL_NUMBER_GAP',
        }),
      ),
    ).toBe(false)
    expect(
      isFinalRefusal(new ApiError({ status: 409, problemType: 'quota-exceeded', code: null })),
    ).toBe(false)
    expect(
      isFinalRefusal(new ApiError({ status: 409, problemType: null, code: 'PERIOD_CLOSED' })),
    ).toBe(false)
    expect(
      isFinalRefusal(
        new ApiError({ status: 422, problemType: null, code: 'POS_PRICE_NOT_CATALOGUE' }),
      ),
    ).toBe(false)
    expect(
      isFinalRefusal(
        new ApiError({ status: 425, problemType: null, code: 'POS_QUEUED_SALE_TOO_EARLY' }),
      ),
    ).toBe(false)
    expect(isFinalRefusal(new ApiError({ status: 500, problemType: null }))).toBe(false)
    expect(
      isFinalRefusal(new ApiError({ status: 409, problemType: null, code: 'SOME_NEW_CODE' })),
    ).toBe(false)
    expect(isFinalRefusal(new ApiError({ status: 404, problemType: null }))).toBe(false)
    expect(
      isFinalRefusal(
        new ApiError({ status: 422, problemType: null, code: 'SIMPLIFIED_INVOICE_LIMIT' }),
      ),
    ).toBe(true)
    expect(
      isFinalRefusal(
        new ApiError({ status: 409, problemType: null, code: 'POS_TILL_NUMBER_REPEATED' }),
      ),
    ).toBe(true)
  })

  it('names exactly the numbers between the expected one and the sale', () => {
    expect(numbersBefore('NZW-T01-INV-2026-000051', 'NZW-T01-INV-2026-000049')).toEqual([
      'NZW-T01-INV-2026-000049',
      'NZW-T01-INV-2026-000050',
    ])
    expect(numbersBefore('NZW-T01-INV-2026-000049', 'NZW-T01-INV-2026-000049')).toEqual([])
  })
})

describe('the refusal an entry keeps (review W5-SHARED)', () => {
  const phrase = (status: number, reason: string) =>
    new Response(JSON.stringify({ timestamp: '2026-11-05T08:00:00Z', status, error: reason, path: '/x' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  it('keeps HTTP_500 for a 5xx whose only "code" is the reason phrase, and a real code as it is', () => {
    const gateway = new ApiError({ status: 500, problemType: null, code: 'Internal Server Error' })
    expect(storedRefusal(gateway)).toBe('HTTP_500')
    const coded = new ApiError({ status: 503, problemType: null, code: 'BILL_PAYMENT_ON_HOLD' })
    expect(storedRefusal(coded)).toBe('BILL_PAYMENT_ON_HOLD')
    expect(storedRefusal(new ApiError({ status: 502, problemType: null }))).toBe('HTTP_502')
  })

  it('a phrase-bearing 5xx only waits, and a phrase-bearing refusal is kept as HTTP_<status>', async () => {
    await submitSale(TILL, { ...BODY, customer: { kind: 'WALK_IN' } }, 'pos-sale-key-phrase')
    online = true
    // A 5xx never reaches the stored refusal: the verdict (unchanged) is 'wait'.
    saleReply = () => phrase(500, 'Internal Server Error')
    await flushQueue('till-1')
    expect(queuedFor('till-1')[0].refusal ?? null).toBeNull()
    saleReply = () => phrase(409, 'Conflict')
    await flushQueue('till-1')
    expect(queuedFor('till-1')[0].refusal).toBe('HTTP_409')
  })
})

describe('offline numbers across a new year (B36 OFF-1)', () => {
  const NEW_YEAR_TILL = {
    ...TILL,
    series: { INVOICE: { series: 'NZW-T01-INV', year: 2027, nextValue: 1 } },
  } as unknown as PosTillDto
  // 1 Jan 2027 00:30 in Muscat (UTC+4), while UTC still reads 31 Dec 2026.
  const JUST_AFTER_MIDNIGHT = '2026-12-31T20:30:00Z'
  const LAST_MINUTE = '2026-12-31T19:59:00Z'

  it('prints no number for a new-year sale on a till last read in the old year, and keeps nothing', async () => {
    await expect(
      submitSale(TILL, { ...BODY, soldAt: JUST_AFTER_MIDNIGHT }, 'pos-sale-key-ny01'),
    ).rejects.toBeInstanceOf(NetworkError)
    expect(queuedFor('till-1')).toEqual([])
  })

  it("still numbers the old year's last minute on the old year's series", async () => {
    const result = await submitSale(TILL, { ...BODY, soldAt: LAST_MINUTE }, 'pos-sale-key-ny02')
    expect('queued' in result && result.queued.number).toBe('NZW-T01-INV-2026-000049')
  })

  it("starts the new year at the server's value: the old year's counter and queue do not carry over", async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-ny03')
    await submitSale(TILL, BODY, 'pos-sale-key-ny04')
    expect(queuedFor('till-1').map((entry) => entry.number)).toEqual([
      'NZW-T01-INV-2026-000049',
      'NZW-T01-INV-2026-000050',
    ])

    const first = await submitSale(
      NEW_YEAR_TILL,
      { ...BODY, soldAt: '2027-01-01T08:00:00Z' },
      'pos-sale-key-ny05',
    )
    const second = await submitSale(
      NEW_YEAR_TILL,
      { ...BODY, soldAt: '2027-01-01T08:05:00Z' },
      'pos-sale-key-ny06',
    )
    expect('queued' in first && first.queued.number).toBe('NZW-T01-INV-2027-000001')
    expect('queued' in second && second.queued.number).toBe('NZW-T01-INV-2027-000002')
  })

  it('adopts a counter kept before it was per year once, into the year in use, and drops it', async () => {
    window.localStorage.setItem('fawtir.pos.next.till-1', '60')
    const first = await submitSale(TILL, BODY, 'pos-sale-key-ny07')
    expect('queued' in first && first.queued.number).toBe('NZW-T01-INV-2026-000060')
    expect(window.localStorage.getItem('fawtir.pos.next.till-1')).toBeNull()
    expect(window.localStorage.getItem('fawtir.pos.next.till-1.NZW-T01-INV-2026')).toBe('61')

    const second = await submitSale(TILL, BODY, 'pos-sale-key-ny08')
    expect('queued' in second && second.queued.number).toBe('NZW-T01-INV-2026-000061')
  })

  it('reads the series and year a number runs in', () => {
    expect(numberPrefix('NZW-T01-INV-2026-000123')).toBe('NZW-T01-INV-2026')
    expect(numberPrefix('not a till number')).toBeNull()
  })
})

describe('offline numbering in the tenant zone (B37 OFF-6)', () => {
  // UTC+14. 2026-12-31T10:30Z is 1 Jan 2027 00:30 there and 31 Dec 14:30 in Muscat.
  const KIRITIMATI = 'Pacific/Kiritimati'
  const THERE_NEW_YEAR = '2026-12-31T10:30:00Z'
  const tillIn = (year: number, nextValue: number, timeZone?: string) =>
    ({
      ...TILL,
      series: { INVOICE: { series: 'NZW-T01-INV', year, nextValue, timeZone } },
    }) as unknown as PosTillDto

  it("numbers a sale in the year of the server's zone, not Muscat's", async () => {
    const result = await submitSale(
      tillIn(2027, 1, KIRITIMATI),
      { ...BODY, soldAt: THERE_NEW_YEAR },
      'pos-sale-key-tz01',
    )
    expect('queued' in result && result.queued.number).toBe('NZW-T01-INV-2027-000001')
  })

  it("prints nothing when the till was read before the zone's new year and the sale is after it", async () => {
    await expect(
      submitSale(tillIn(2026, 49, KIRITIMATI), { ...BODY, soldAt: THERE_NEW_YEAR }, 'pos-sale-key-tz02'),
    ).rejects.toBeInstanceOf(NetworkError)
    expect(queuedFor('till-1')).toEqual([])
  })

  it('keeps Asia/Muscat for a server that does not name its zone', async () => {
    const result = await submitSale(
      tillIn(2026, 49),
      { ...BODY, soldAt: THERE_NEW_YEAR },
      'pos-sale-key-tz03',
    )
    expect('queued' in result && result.queued.number).toBe('NZW-T01-INV-2026-000049')
  })

  const salePosts = () =>
    calls.filter((call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST')

  // Owner decision XT2-ZONE-UNREADABLE (2026-11-05 item 4, Option A): fail closed with its own refusal.
  it('prints nothing for a zone this browser cannot read', async () => {
    await expect(
      submitSale(tillIn(2026, 49, 'Not/AZone'), BODY, 'pos-sale-key-tz04'),
    ).rejects.toBeInstanceOf(PosTenantZoneUnavailable)
    expect(queuedFor('till-1')).toEqual([])
    expect(salePosts()).toEqual([])
  })

  // Agent 10 test gap 2 on 346d0d06c: the refused sale sends nothing, its waiting sales included.
  it('a zone-refused sale flushes nothing that waits; Try again and the flush still send them in order', async () => {
    const walkIn: PosSaleRequest = { ...BODY, customer: { kind: 'WALK_IN' } }
    const valid = tillIn(2026, 49, 'Asia/Muscat')
    await submitSale(valid, walkIn, 'pos-sale-key-tzq1')
    await submitSale(valid, walkIn, 'pos-sale-key-tzq2')
    expect(queuedFor('till-1').map((entry) => entry.number)).toEqual([
      'NZW-T01-INV-2026-000049',
      'NZW-T01-INV-2026-000050',
    ])
    online = true
    // Each answer files the number it was sent.
    saleReply = () => {
      const sent = JSON.parse(String(calls[calls.length - 1].init?.body)) as PosSaleRequest
      return json({ saleId: `s-${sent.invoiceNumber}`, invoiceNumber: sent.invoiceNumber, warnings: [] }, 201)
    }
    const posted = () =>
      salePosts().map((call) => new Headers(call.init?.headers).get('Idempotency-Key'))
    const offlineTries = posted()

    await expect(
      submitSale(tillIn(2026, 49, 'Not/AZone'), walkIn, 'pos-sale-key-tzq3'),
    ).rejects.toBeInstanceOf(PosTenantZoneUnavailable)
    // No POST for any key: neither the refused sale nor the two waiting before it.
    expect(posted()).toEqual(offlineTries)
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-tzq1', 'pos-sale-key-tzq2'])
    expect(offlineBlock('till-1', 'online')).toBeNull()

    await retryQueuedSale('till-1', 'pos-sale-key-tzq1')
    expect(posted().slice(offlineTries.length)[0]).toBe('pos-sale-key-tzq1')
    await flushQueue('till-1')
    expect(posted().slice(offlineTries.length)).toEqual(['pos-sale-key-tzq1', 'pos-sale-key-tzq2'])
    expect(queuedFor('till-1')).toEqual([])
  })

  it('a zone failure is not a storage failure: no block, no Check again loop, and it sells once the zone is valid', async () => {
    const unreadable = tillIn(2026, 49, 'Not/AZone')
    online = true
    const first = await submitSale(unreadable, BODY, 'pos-sale-key-tz05').then(
      () => null,
      (thrown: unknown) => thrown,
    )
    expect(first).toBeInstanceOf(PosTenantZoneUnavailable)
    expect(first).not.toBeInstanceOf(PosStorageUnavailable)
    expect(posRefusalKey(first)).toBe('pos.refusal.tenantZoneUnavailable')
    expect(posRefusalKey(new PosStorageUnavailable('denied'))).toBe('pos.refusal.storageUnavailable')
    // No till-wide storage block was set, so Check again has nothing to lift or set again.
    expect(offlineBlock('till-1')).toBeNull()
    expect(offlineBlock('till-1', 'online')).toBeNull()
    expect(checkStorageAgain()).toBeNull()
    expect(offlineBlock('till-1', 'online')).toBeNull()
    // Asked again with the same till, it is refused the same way: nothing was stored to flip.
    await expect(submitSale(unreadable, BODY, 'pos-sale-key-tz05')).rejects.toBeInstanceOf(
      PosTenantZoneUnavailable,
    )
    expect(salePosts()).toEqual([])
    expect(queuedFor('till-1')).toEqual([])

    // The till read again with a zone this browser verifies: the sale goes.
    saleReply = () =>
      json({ saleId: 's-tz', invoiceNumber: 'NZW-T01-INV-2026-000049', warnings: [] }, 201)
    const sold = await submitSale(tillIn(2026, 49, 'Asia/Muscat'), BODY, 'pos-sale-key-tz05')
    expect('sale' in sold).toBe(true)
    expect(salePosts()).toHaveLength(1)
  })
})

describe('a queue shared by two tabs of the till (B37 OFF-4)', () => {
  const otherTabEntry = {
    key: 'pos-sale-key-other-tab',
    tillId: 'till-1',
    number: 'NZW-T01-INV-2026-000050',
    body: { ...BODY, customer: { kind: 'WALK_IN' }, queuedOffline: true, invoiceNumber: 'NZW-T01-INV-2026-000050' },
    refusal: null,
  }

  it('never writes over a sale another tab queued', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-tab-1')
    const stored = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([...stored, otherTabEntry]))

    const mine = await submitSale(TILL, BODY, 'pos-sale-key-tab-2')

    expect('queued' in mine && mine.queued.number).toBe('NZW-T01-INV-2026-000051')
    const keys = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]').map(
      (entry: { key: string }) => entry.key,
    )
    expect(keys).toEqual(['pos-sale-key-tab-1', 'pos-sale-key-other-tab', 'pos-sale-key-tab-2'])
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(keys)
  })

  it('sees a sale the other tab has since sent as gone', async () => {
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([otherTabEntry]))
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-other-tab'])
    window.localStorage.setItem('fawtir.pos.queue', '[]')
    window.dispatchEvent(new StorageEvent('storage', { key: 'fawtir.pos.queue' }))
    expect(queuedFor('till-1')).toEqual([])
  })

  it('does not take unreadable text for an empty queue', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-tab-3')
    window.localStorage.setItem('fawtir.pos.queue', '{not json')
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-tab-3'])
  })
})

describe("a queued sale's warnings reach the next sale (B37 OFF-8)", () => {
  it('says every warning of the background send, naming the filed sale', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-warn-1')
    online = true
    const reply = saleReply
    saleReply = () =>
      json(
        {
          saleId: 'sale-1',
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          warnings: [
            { code: 'STOCK_BELOW_ZERO', line: 2, message: 'not shown' },
            { code: 'POS_DISCOUNT_ABOVE_LIMIT_ACCEPTED', line: null, message: 'not shown' },
            { code: 'FILED_PAST_RESTRICTION', line: null, message: 'not shown' },
          ],
        },
        201,
      )
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])

    saleReply = reply
    const next = await submitSale(TILL, BODY, 'pos-sale-key-warn-2')
    expect('sale' in next && next.sale.warnings).toEqual([
      { code: 'STOCK_BELOW_ZERO', line: 2, filed: 'NZW-T01-INV-2026-000049' },
      { code: 'POS_DISCOUNT_ABOVE_LIMIT_ACCEPTED', line: null, filed: 'NZW-T01-INV-2026-000049' },
      { code: 'FILED_PAST_RESTRICTION', line: null, filed: 'NZW-T01-INV-2026-000049' },
    ])
    const after = await submitSale(TILL, BODY, 'pos-sale-key-warn-3')
    expect('sale' in after && after.sale.warnings).toEqual([])
  })
})

// NOT RUN (batch 43, static only). Owner Round 13, L-2: the maker goes to the server only as an
// untrusted claim, and only where it can neither break a proof nor be refused as an unknown field.
describe('the maker sent as an untrusted claim (Round 13 L-2)', () => {
  const WALK_IN: PosSaleRequest = { ...BODY, customer: { kind: 'WALK_IN' } }
  const queued = (value: number, extra: Partial<PosSaleRequest> = {}) => {
    const number = `NZW-T01-INV-2026-${String(value).padStart(6, '0')}`
    return {
      key: `pos-sale-key-claim-${value}`,
      tillId: 'till-1',
      number,
      body: { ...WALK_IN, queuedOffline: true, invoiceNumber: number, ...extra },
      refusal: null,
      madeBy: { userId: 'u-1', name: 'Maryam' },
    }
  }
  const sentBodies = () =>
    calls
      .filter((call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST')
      .map((call) => JSON.parse(String(call.init?.body)) as PosSaleRequest)

  it('names the maker on an unsigned sale to a server that takes it, never on a signed one', async () => {
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        queued(49, { offlineProof: { keyId: 'k-1', signature: 'A'.repeat(86) } }),
        queued(50),
      ]),
    )
    noteTillServer({ id: 'till-1', openNumbers: false, takesMakerClaim: true })
    online = true

    await flushQueue('till-1')

    const [signed, unsigned] = sentBodies()
    expect(signed.invoiceNumber).toBe('NZW-T01-INV-2026-000049')
    expect(signed).not.toHaveProperty('claimedMakerUnverified')
    expect(unsigned.invoiceNumber).toBe('NZW-T01-INV-2026-000050')
    expect(unsigned.claimedMakerUnverified).toBe('u-1')
  })

  it('sends nothing of the kind to a server that has not said it takes it', async () => {
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([queued(49)]))
    noteTillServer({ id: 'till-1', openNumbers: false })
    online = true

    await flushQueue('till-1')

    expect(sentBodies()).toHaveLength(1)
    expect(sentBodies()[0]).not.toHaveProperty('claimedMakerUnverified')
  })

  it('names nobody for an entry whose maker was never kept', async () => {
    const entry: Partial<ReturnType<typeof queued>> = queued(49)
    delete entry.madeBy
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([entry]))
    noteTillServer({ id: 'till-1', openNumbers: false, takesMakerClaim: true })
    online = true

    await retryQueuedSale('till-1', 'pos-sale-key-claim-49', 'u-1')

    expect(sentBodies()).toHaveLength(1)
    expect(sentBodies()[0]).not.toHaveProperty('claimedMakerUnverified')
  })

  const sentKeys = () =>
    calls
      .filter((call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST')
      .map((call) => new Headers(call.init?.headers).get('Idempotency-Key'))

  it('an older server refusing the unknown claim gets the same sale once more without it, and no claim after (PRV43-OFF2 N-6)', async () => {
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([queued(49), queued(50)]))
    noteTillServer({ id: 'till-1', openNumbers: false, takesMakerClaim: true })
    online = true
    let replies = 0
    saleReply = () => {
      replies += 1
      if (replies === 1) {
        return new Response(
          JSON.stringify({ type: 'https://api.fawtir.om/problems/malformed-request', status: 400 }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }
      return json(
        {
          saleId: `sale-${replies}`,
          invoiceNumber: 'n',
          receipt: { qr: { status: 'PENDING' } },
          filing: { dispatchState: 'QUEUED' },
          warnings: [],
        },
        201,
      )
    }

    expect(await flushQueue('till-1')).toBe('done')

    const [refused, resent, next] = sentBodies()
    expect(refused.claimedMakerUnverified).toBe('u-1')
    expect(resent).not.toHaveProperty('claimedMakerUnverified')
    const { claimedMakerUnverified: _claim, ...unclaimed } = refused
    void _claim
    expect(resent).toEqual(unclaimed)
    expect(sentKeys().slice(0, 2)).toEqual(['pos-sale-key-claim-49', 'pos-sale-key-claim-49'])
    expect(next).not.toHaveProperty('claimedMakerUnverified')
    expect(sentBodies()).toHaveLength(3)
    expect(queuedFor('till-1')).toEqual([])
  })

  it('a malformed-request refusal of a body with no claim is not resent', async () => {
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([queued(49)]))
    noteTillServer({ id: 'till-1', openNumbers: false })
    online = true
    saleReply = () =>
      new Response(
        JSON.stringify({ type: 'https://api.fawtir.om/problems/malformed-request', status: 400 }),
        { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
      )

    await flushQueue('till-1')

    expect(sentBodies()).toHaveLength(1)
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  // PRV43-OFF3 L-5: only the malformed-request refusal is the older server's answer to the claim; any
  // other 400 is about the sale itself, and resending it without the claim would change nothing.
  it('a body carrying the claim refused 400 as anything but malformed-request is not resent', async () => {
    window.localStorage.setItem('fawtir.pos.queue', JSON.stringify([queued(49)]))
    noteTillServer({ id: 'till-1', openNumbers: false, takesMakerClaim: true })
    online = true
    saleReply = () =>
      new Response(
        JSON.stringify({ type: 'https://api.fawtir.om/problems/validation-failed', status: 400 }),
        { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
      )

    await flushQueue('till-1')

    expect(sentBodies()).toHaveLength(1)
    expect(sentBodies()[0].claimedMakerUnverified).toBe('u-1')
    expect(queuedFor('till-1')).toHaveLength(1)
  })
})

// NOT RUN (batch 43, static only). PRV43-OFF2 N-7 asked that the number-gap retry, a second POST, be
// held to the sender check. Under Q-27 (owner P0-3) that retry never happens at all: a gap refusal
// on a till saying `openNumbers` is one POST, kept as a held refusal, with nothing skipped.
describe('the number-gap refusal on a till that says openNumbers (Q-27)', () => {
  it('sends no skip retry, signed out or not; the entry stays, held on the gap', async () => {
    const number = 'NZW-T01-INV-2026-000050'
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        {
          key: 'pos-sale-key-gap-50',
          tillId: 'till-1',
          number,
          body: {
            ...BODY,
            customer: { kind: 'WALK_IN' },
            queuedOffline: true,
            invoiceNumber: number,
          },
          refusal: null,
          madeBy: { userId: 'u-1', name: 'Maryam' },
        },
      ]),
    )
    noteTillServer({ id: 'till-1', openNumbers: true })
    online = true
    saleReply = () => {
      stopQueueSendsForSignOut()
      return new Response(
        JSON.stringify({
          type: 'https://api.fawtir.om/problems/pos-till-number-gap',
          status: 409,
          code: 'POS_TILL_NUMBER_GAP',
          expectedNumber: 'NZW-T01-INV-2026-000049',
        }),
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }

    expect(await flushQueue('till-1')).toMatchObject({ verdict: 'held' })

    const posts = calls.filter(
      (call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST',
    )
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0].init?.body))).not.toHaveProperty('skippedNumbers')
    expect(queuedFor('till-1')).toHaveLength(1)
    const [waiting] = queuedFor('till-1')
    expect(waiting.key).toBe('pos-sale-key-gap-50')
    expect(waiting.refusal).toBe('POS_TILL_NUMBER_GAP')
    expect(waiting.final).toBeUndefined()
  })

  // T-GAP: a forged gap answer naming any expected number moves nothing either.
  it('a gap refusal naming a far-back expected number still sends once and skips nothing', async () => {
    const number = 'NZW-T01-INV-2026-000060'
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        {
          key: 'pos-sale-key-gap-60',
          tillId: 'till-1',
          number,
          body: { ...BODY, customer: { kind: 'WALK_IN' }, queuedOffline: true, invoiceNumber: number },
          refusal: null,
          madeBy: { userId: 'u-1', name: 'Maryam' },
        },
      ]),
    )
    noteTillServer({ id: 'till-1', openNumbers: true, takesMakerClaim: false })
    online = true
    saleReply = () =>
      new Response(
        JSON.stringify({
          type: 'https://api.fawtir.om/problems/pos-till-number-gap',
          status: 409,
          code: 'POS_TILL_NUMBER_GAP',
          expectedNumber: 'NZW-T01-INV-2026-000001',
        }),
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      )

    await flushQueue('till-1')

    const posts = calls.filter(
      (call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST',
    )
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0].init?.body))).not.toHaveProperty('skippedNumbers')
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['pos-sale-key-gap-60'])
  })
})

// NOT RUN (RC5 W-Q27, static only). Owner P0-3 / Q-27 hard-disable and the NF7R device marker
// (DES43 rev 4.3.4 §5.6 option (b); A8-G1, A8-G6). Appendix N: N-R2e, N-R2g, N-R2h, N-R2i.
describe('Q-27: open-number skipping is off whatever the till or the device says', () => {
  const WALK_IN: PosSaleRequest = { ...BODY, customer: { kind: 'WALK_IN' } }
  const PROOF = { keyId: 'k-1', signature: 'A'.repeat(86) }
  const PRINTED = { taxable: 5, vat: 0.25, total: 5.25 }
  const stored = (value: number, extra: Record<string, unknown> = {}, body: object = {}) => {
    const number = `NZW-T01-INV-2026-${String(value).padStart(6, '0')}`
    return {
      key: `pos-sale-key-q27-${value}`,
      tillId: 'till-1',
      number,
      body: { ...WALK_IN, queuedOffline: true, invoiceNumber: number, ...body },
      refusal: null,
      madeBy: { userId: 'u-1', name: 'Maryam' },
      ...extra,
    }
  }
  const sales = () =>
    calls.filter((call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST')
  const sentBody = (index: number) =>
    JSON.parse(String(sales()[index].init?.body)) as PosSaleRequest & Record<string, unknown>
  const sentKey = (index: number) => new Headers(sales()[index].init?.headers).get('Idempotency-Key')
  const skipping = { ...TILL, openNumbers: true } as PosTillDto

  it('a legacy set-aside head blocks strict order; Try again sends it once, signed, and leaves only the device marker', async () => {
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        stored(
          49,
          { refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true, setAside: true },
          { offlineProof: PROOF, printed: PRINTED },
        ),
        // A8-2: a refusal that is not on the FINAL list comes back to life on load.
        stored(50, { refusal: 'PERIOD_CLOSED', final: true }),
        stored(51),
      ]),
    )
    noteTillServer({ id: 'till-1', openNumbers: true, takesMakerClaim: false })
    online = true

    expect(queuedFor('till-1')[1].final).toBeUndefined()

    await flushQueue('till-1')
    expect(sales()).toHaveLength(0)

    const sold = await submitSale(skipping, WALK_IN, 'pos-sale-key-q27-new')
    expect(sold).toMatchObject({ behind: true, queued: { number: 'NZW-T01-INV-2026-000052' } })
    expect(sales()).toHaveLength(0)

    saleReply = () => refusal(409, 'POS_TILL_NUMBER_REPEATED')
    await retryQueuedSale('till-1', 'pos-sale-key-q27-49', 'u-1')

    expect(sales()).toHaveLength(1)
    expect(sentKey(0)).toBe('pos-sale-key-q27-49')
    const body = sentBody(0)
    expect(body.offlineProof).toEqual(PROOF)
    expect(body.printed).toEqual(PRINTED)
    expect(body.invoiceNumber).toBe('NZW-T01-INV-2026-000049')
    expect(body).not.toHaveProperty('setAside')
    expect(body).not.toHaveProperty('setAsideSeen')
    expect(body).not.toHaveProperty('skippedNumbers')

    const entries = queuedFor('till-1')
    expect(entries.map((entry) => entry.key)).toEqual([
      'pos-sale-key-q27-49',
      'pos-sale-key-q27-50',
      'pos-sale-key-q27-51',
      'pos-sale-key-q27-new',
    ])
    expect(entries[0]).toMatchObject({
      refusal: 'POS_TILL_NUMBER_REPEATED',
      final: true,
      setAsideSeen: true,
    })
    expect(entries[0].setAside).toBeUndefined()
  })

  it('Try again on a set-aside entry behind a blocker sends nothing, keeps order, and leaves the marker', async () => {
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        stored(49, { refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true }),
        stored(50, { refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true, setAside: true }),
      ]),
    )
    online = true

    await retryQueuedSale('till-1', 'pos-sale-key-q27-50', 'u-1')
    expect(sales()).toHaveLength(0)
    const [, second] = queuedFor('till-1')
    expect(second.setAside).toBeUndefined()
    expect(second.setAsideSeen).toBe(true)

    await flushQueue('till-1')
    expect(sales()).toHaveLength(0)
    expect(queuedFor('till-1')).toHaveLength(2)
  })

  it('a correction of a set-aside entry goes unsigned with the new payments and keeps the marker', async () => {
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        stored(
          49,
          { refusal: 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL', final: true, setAside: true },
          { offlineProof: PROOF, printed: PRINTED },
        ),
      ]),
    )
    online = true
    saleReply = () => refusal(422, 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL')

    await correctQueuedSale('till-1', 'pos-sale-key-q27-49', [{ method: 'CARD', amount: 6 }], 'u-1')

    expect(sales()).toHaveLength(1)
    const body = sentBody(0)
    expect(body).not.toHaveProperty('offlineProof')
    expect(body).not.toHaveProperty('printed')
    expect(body).not.toHaveProperty('setAsideSeen')
    expect(body.payments).toEqual([{ method: 'CARD', amount: 6 }])
    const [entry] = queuedFor('till-1')
    expect(entry.setAside).toBeUndefined()
    expect(entry.setAsideSeen).toBe(true)
  })

  // N-R2e, N-R2g, N-R2i. The till's cached copy (`fawtir.pos.offline.<tenant>.<user>.tills.<branch>`)
  // is this same DTO after a JSON round trip; the cache read itself is covered in the browser (N-R2-BR).
  it.each([
    ['openNumbers: true', { openNumbers: true }],
    ['openNumbers as text', { openNumbers: 'true' }],
    ['the legacy skipsStuckNumbers', { skipsStuckNumbers: true }],
    ['both flags (#831 shapes)', { openNumbers: true, skipsStuckNumbers: true }],
  ])('a till carrying %s, as cached on the device, still keeps strict order', async (_name, flags) => {
    const cached = JSON.parse(JSON.stringify({ ...TILL, ...flags })) as PosTillDto
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([stored(49, { refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true })]),
    )
    noteTillServer(cached)
    online = true

    const sold = await submitSale(cached, WALK_IN, 'pos-sale-key-q27-cached')

    expect(sold).toMatchObject({ behind: true, queued: { number: 'NZW-T01-INV-2026-000050' } })
    expect(sales()).toHaveLength(0)
    expect(calls.some((call) => call.url.includes('/pos/open-numbers'))).toBe(false)
  })
})
