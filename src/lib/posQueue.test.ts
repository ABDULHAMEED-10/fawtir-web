import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosSaleRequest, PosTillDto } from '../api/pos/pos'
import { flushQueue, queuedFor, resetPosQueue, submitSale } from './posQueue'
import { heldSlipPhotos } from './posSlipOutbox'
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

  it('removes the ID when the server refuses the sale for good', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0003')
    online = true
    saleReply = () => refusal(422, 'POS_TILL_NUMBER_GAP')
    await flushQueue('till-1')

    const [entry] = queuedFor('till-1')
    expect(entry).toMatchObject({ refusal: 'POS_TILL_NUMBER_GAP', final: true })
    expect(await vault.ids('pii')).toEqual([])
    expect(await everythingStored()).not.toContain(CIVIL_ID)

    // Not sent again: the same sale can only be refused the same way.
    const before = calls.length
    await flushQueue('till-1')
    expect(calls.length).toBe(before)
  })

  it('keeps the sealed ID while a refusal may still pass (sign-in, server fault)', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-0004')
    online = true
    saleReply = () => refusal(503, 'UNAVAILABLE')
    await flushQueue('till-1')
    expect(await vault.ids('pii')).toEqual(['pos-sale-key-0004'])
    expect(queuedFor('till-1')[0].final).toBeUndefined()
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

  it('does not keep a photo over the upload limit', async () => {
    const big = { ...photo(), blob: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]) }
    await submitSale(TILL, BODY, 'pos-sale-key-0105', [big])
    expect(await heldSlipPhotos('pos-sale-key-0105')).toEqual([])
  })
})
