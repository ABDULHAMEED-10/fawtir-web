import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../api'
import type { PosSaleRequest, PosTillDto } from '../api/pos/pos'
import {
  flushQueue,
  noteQueueSender,
  PosOfflineSellingOff,
  PosSaleOutcomeUnknown,
  queuedFor,
  resetPosQueue,
  saleOutcomeUncertain,
  sellsOffline,
  submitSale,
} from './posQueue'
import { posRefusalKey } from './posRefusals'
import { memoryVault, setPosVault } from './posVault'

vi.mock('./posOfflineQr', () => ({
  offlinePrintedQr: async () => ({
    payload: 'AQ==',
    sellerUuid: 'stand-in',
    profileVersion: '0'.repeat(64),
  }),
}))

/**
 * RC5 sells online only (agreed 8 Nov 2026): with no answer from the server the till numbers,
 * keeps and prints nothing, and a sale already queued on the device is still sent.
 */

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
  payments: [{ method: 'CASH', amount: 1.5 }],
  tip: null,
} as unknown as PosSaleRequest

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let online = false
let serverFault = false
let posts: string[]
const onlineOnly = globalThis as { __fawtirOnlineOnly?: boolean }

beforeEach(() => {
  window.localStorage.clear()
  sessionStorage.clear()
  setPosVault(memoryVault(true))
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  online = false
  serverFault = false
  posts = []
  delete onlineOnly.__fawtirOnlineOnly
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        posts.push(String(init.body))
        if (!online) throw new TypeError('Failed to fetch')
        if (serverFault) return new Response('Bad gateway', { status: 502 })
        const sent = JSON.parse(String(init.body)) as { invoiceNumber: string | null }
        return json(
          {
            saleId: `sale-${posts.length}`,
            invoiceNumber: sent.invoiceNumber ?? 'NZW-T01-INV-2026-000100',
            receipt: { qr: { status: 'PENDING' } },
            filing: { dispatchState: 'QUEUED' },
            warnings: [],
          },
          201,
        )
      }
      if (!online) throw new TypeError('Failed to fetch')
      return json({})
    }),
  )
})

afterEach(() => {
  delete onlineOnly.__fawtirOnlineOnly
  vi.unstubAllGlobals()
})

describe('the till as RC5 ships it: online only', () => {
  it('is off whenever the build is not the test runner switching it on', () => {
    onlineOnly.__fawtirOnlineOnly = true
    expect(sellsOffline()).toBe(false)
  })

  it('a sale with no answer is held as sent under its key, with nothing numbered or kept', async () => {
    onlineOnly.__fawtirOnlineOnly = true
    const sold = submitSale(TILL, BODY, 'key-online-only-1')
    await expect(sold).rejects.toBeInstanceOf(PosSaleOutcomeUnknown)
    const error = await sold.catch((e: unknown) => e)
    expect(saleOutcomeUncertain(error)).toBe(true)
    expect(queuedFor('till-1')).toEqual([])
    expect(JSON.parse(posts[0])).toMatchObject({ queuedOffline: false, invoiceNumber: null })
  })

  it('says the connection dropped when no answer came at all', async () => {
    onlineOnly.__fawtirOnlineOnly = true
    const error = await submitSale(TILL, BODY, 'key-cause-net').catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'PosSaleOutcomeUnknown', noAnswer: 'network' })
    expect(posRefusalKey(error)).toBe('pos.refusal.outcomeUnknownNetwork')
  })

  it("says Fawtir's server did not answer on an uncoded server fault", async () => {
    onlineOnly.__fawtirOnlineOnly = true
    online = true
    serverFault = true
    const error = await submitSale(TILL, BODY, 'key-cause-server').catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'PosSaleOutcomeUnknown', noAnswer: 'server' })
    expect(posRefusalKey(error)).toBe('pos.refusal.outcomeUnknownServer')
  })

  it('a sale behind waiting sales, still offline, is refused before anything is numbered', async () => {
    // Queued before the switch, as an older build would have left it on the device.
    await submitSale(TILL, BODY, 'key-older-1')
    expect(queuedFor('till-1')).toHaveLength(1)
    onlineOnly.__fawtirOnlineOnly = true
    const sold = submitSale(TILL, BODY, 'key-online-only-2')
    await expect(sold).rejects.toBeInstanceOf(PosOfflineSellingOff)
    const error = await sold.catch((e: unknown) => e)
    expect(saleOutcomeUncertain(error)).toBe(false)
    expect(posRefusalKey(error)).toBe('pos.refusal.offlineSellingOff')
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual(['key-older-1'])
  })

  it('a sale already queued on the device is still sent, under its printed number', async () => {
    await submitSale(TILL, BODY, 'key-older-2')
    const [kept] = queuedFor('till-1')
    onlineOnly.__fawtirOnlineOnly = true
    online = true
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])
    const sent = posts.map((body) => JSON.parse(body) as { invoiceNumber: string | null })
    expect(sent.at(-1)?.invoiceNumber).toBe(kept.number)
  })

  it('online, a sale goes as an ordinary online sale', async () => {
    onlineOnly.__fawtirOnlineOnly = true
    online = true
    const result = await submitSale(TILL, BODY, 'key-online-only-3')
    expect('sale' in result).toBe(true)
    expect(queuedFor('till-1')).toEqual([])
  })
})
