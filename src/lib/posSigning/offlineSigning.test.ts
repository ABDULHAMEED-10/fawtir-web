import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSharedRequests } from '../../api'
import type { PosSaleRequest, PosTillDto } from '../../api/pos/pos'
import { correctQueuedSale, queuedFor, resetPosQueue, submitSale } from '../posQueue'
import { memoryVault, setPosVault, type PosVault } from '../posVault'
import { bodyForSigning, canonicalSale, offlineSaleMessage } from './canonical'
import {
  ensureSigningKey,
  forgetSigningKeys,
  resetSigningKeyState,
  signQueuedSale,
  type StoredSigningKey,
} from './signingKey'

// NOT RUN (batch 39, static only). Real Web Crypto (Node's), a memory vault and a stubbed fetch:
// nothing leaves the process.

vi.mock('../identity/entitlements', () => ({
  peekEntitlements: () => ({ userId: USER, tenantId: TENANT }),
}))

const USER = '77777777-7777-7777-7777-777777777777'
const TENANT = '55555555-5555-5555-5555-555555555555'
const SHIFT = '88888888-8888-8888-8888-888888888888'
const TILL_ID = '11111111-1111-1111-1111-111111111111'
const KEY_ID = '44444444-4444-4444-4444-444444444444'

const TILL = {
  id: TILL_ID,
  branchId: 'b-1',
  series: { INVOICE: { series: 'NZW-T01-INV', year: new Date().getFullYear(), nextValue: 49 } },
  openShift: { shiftId: SHIFT, cashier: { userId: USER, name: 'Aisha' }, openedAt: '' },
} as unknown as PosTillDto

const BODY: PosSaleRequest = {
  tillId: TILL_ID,
  soldAt: new Date().toISOString(),
  queuedOffline: false,
  invoiceNumber: null,
  customer: { kind: 'WALK_IN' },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CASH', amount: 2.31, tendered: 5 }],
  tip: null,
}

const PRINTED = { taxable: 2.2, vat: 0.11, total: 2.31 }

type Reply = () => Response
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'https://api.fawtir.om/problems/x', status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })

let vault: PosVault
let registerReply: Reply
let registered: { publicKey: string; deviceId: string } | null
let registerCalls: number
let saleOnline: boolean
let sentSales: PosSaleRequest[]

beforeEach(() => {
  vi.stubEnv('VITE_POS_OFFLINE_SIGNING', 'on')
  window.localStorage.clear()
  vault = memoryVault(true)
  setPosVault(vault)
  resetPosQueue()
  resetSharedRequests()
  resetSigningKeyState()
  registered = null
  registerCalls = 0
  saleOnline = false
  sentSales = []
  registerReply = () =>
    json(
      {
        keyId: KEY_ID,
        shiftId: SHIFT,
        tillId: TILL_ID,
        registeredAt: new Date().toISOString(),
        validUntil: new Date(Date.now() + 3_600_000).toISOString(),
        sessionMarker: 'm'.repeat(32),
      },
      201,
    )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith(`/pos/shifts/${SHIFT}/offline-signing-keys`)) {
        registerCalls++
        registered = JSON.parse(String(init?.body))
        return registerReply()
      }
      if (url.endsWith('/pos/sales') && init?.method === 'POST') {
        if (!saleOnline) throw new TypeError('Failed to fetch')
        sentSales.push(JSON.parse(String(init.body)))
        return json({ saleId: 's', invoiceNumber: 'n', receipt: {}, filing: {}, warnings: [] }, 201)
      }
      throw new TypeError('Failed to fetch')
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function storedKey(): Promise<StoredSigningKey> {
  const id = (await vault.ids('keys')).find((name) => name.startsWith('sign:'))!
  return (await vault.get<StoredSigningKey>('keys', id))!
}

async function verifies(body: PosSaleRequest, idempotencyKey: string): Promise<boolean> {
  const spki = Uint8Array.from(atob(registered!.publicKey), (c) => c.charCodeAt(0))
  const publicKey = await crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const signature = Uint8Array.from(
    atob(body.offlineProof!.signature.replace(/-/g, '+').replace(/_/g, '/') + '=='),
    (c) => c.charCodeAt(0),
  )
  const message = offlineSaleMessage(
    {
      tenantId: TENANT,
      deviceId: registered!.deviceId,
      keyId: KEY_ID,
      cashierUserId: USER,
      shiftId: SHIFT,
      idempotencyKey,
    },
    canonicalSale(bodyForSigning(body)),
  )
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, message)
}

describe('registration (WEB-1, WEB-2)', () => {
  it('keeps a private key that cannot be exported, and sends only the 91-byte public key', async () => {
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('ready')
    const key = await storedKey()
    expect(key.privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('pkcs8', key.privateKey)).rejects.toBeDefined()
    expect(atob(registered!.publicKey)).toHaveLength(91)
    expect(registered).not.toHaveProperty('keyId')
    expect(await vault.ids('keys')).toContain(`sign:${SHIFT}:${'m'.repeat(32)}`)
  })

  it('keeps one device id across registrations', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    const first = registered!.deviceId
    await forgetSigningKeys()
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    expect(registered!.deviceId).toBe(first)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('does not register again while a valid key exists', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    expect(registerCalls).toBe(1)
  })

  it('never asks an old server again in this page after a 404', async () => {
    registerReply = () => problem(404, 'NOT_FOUND')
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('oldServer')
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('oldServer')
    expect(registerCalls).toBe(1)
  })

  it('tries again after either 409, and never switches signing off for one', async () => {
    registerReply = () => problem(409, 'POS_OFFLINE_KEY_CLOCK_SKEW')
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('clockSkew')
    registerReply = () => problem(409, 'POS_OFFLINE_KEY_NOT_YOUR_OPEN_SHIFT')
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe(
      'notYourShift',
    )
    expect(registerCalls).toBe(2)
  })

  it.each([
    [400, 'POS_OFFLINE_KEY_INVALID'],
    [403, 'POS_OFFLINE_KEY_HUMAN_ONLY'],
    [403, 'IMPERSONATION_NOT_ALLOWED'],
  ])('stops for this page after %i %s and keeps no key', async (status, code) => {
    registerReply = () => problem(status, code)
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('refused')
    expect((await vault.ids('keys')).filter((id) => id.startsWith('sign:'))).toEqual([])
  })

  it('asks again after the session that was refused has ended', async () => {
    registerReply = () => problem(403, 'IMPERSONATION_NOT_ALLOWED')
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('refused')
    await forgetSigningKeys()
    registerReply = () =>
      json(
        {
          keyId: KEY_ID,
          shiftId: SHIFT,
          tillId: TILL_ID,
          registeredAt: new Date().toISOString(),
          validUntil: new Date(Date.now() + 3_600_000).toISOString(),
          sessionMarker: 'm'.repeat(32),
        },
        201,
      )
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('ready')
    expect(registerCalls).toBe(2)
  })

  it('does nothing with the flag off', async () => {
    vi.stubEnv('VITE_POS_OFFLINE_SIGNING', '')
    expect(await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })).toBe('off')
    expect(registerCalls).toBe(0)
  })
})

describe('signing a queued sale (WEB-3, WEB-4, WEB-14)', () => {
  it('signs the body it queues, with printed totals, and the signature verifies', async () => {
    const quiet = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level),
    )
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    const result = await submitSale(TILL, BODY, 'sale-key-1', [], PRINTED)
    expect('queued' in result).toBe(true)
    const [entry] = queuedFor(TILL_ID)
    expect(entry.body.printed).toEqual(PRINTED)
    expect(entry.body.offlineProof?.keyId).toBe(KEY_ID)
    expect(entry.body.offlineProof?.signature).toMatch(/^[A-Za-z0-9_-]{86}$/)
    expect(await verifies(entry.body, 'sale-key-1')).toBe(true)
    for (const spy of quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('queues unsigned, without printed totals, when the key has expired', async () => {
    registerReply = () =>
      json(
        {
          keyId: KEY_ID,
          shiftId: SHIFT,
          tillId: TILL_ID,
          registeredAt: new Date().toISOString(),
          validUntil: new Date(Date.now() - 1000).toISOString(),
          sessionMarker: 'm'.repeat(32),
        },
        201,
      )
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    await submitSale(TILL, BODY, 'sale-key-2', [], PRINTED)
    const [entry] = queuedFor(TILL_ID)
    expect(entry.body.offlineProof).toBeUndefined()
    expect(entry.body.printed).toBeUndefined()
  })

  it('queues unsigned when the sale cannot be put in canonical form', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    const signed = await signQueuedSale(
      { ...BODY, invoiceNumber: 'x\ud800', printed: PRINTED },
      'k',
      { shiftId: SHIFT, cashierUserId: USER },
    )
    expect(signed).toBeNull()
  })

  it('does not sign for a shift that is not the signed-in cashier’s', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    const signed = await signQueuedSale({ ...BODY, printed: PRINTED }, 'k', {
      shiftId: SHIFT,
      cashierUserId: '99999999-9999-9999-9999-999999999999',
    })
    expect(signed).toBeNull()
  })

  it('a sealed buyer is signed as sent: the rebuilt body still verifies', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    const named: PosSaleRequest = {
      ...BODY,
      customer: {
        kind: 'CONSUMER',
        consumer: { name: 'Salim', identifierScheme: 'CID', identifierValue: '98765432' },
      },
    }
    await submitSale(TILL, named, 'sale-key-3', [], PRINTED)
    saleOnline = true
    await submitSale(TILL, BODY, 'sale-key-4', [], PRINTED)
    const sent = sentSales.find((body) => body.offlineProof)!
    expect(sent.customer.consumer?.identifierValue).toBe('98765432')
    expect(await verifies(sent, 'sale-key-3')).toBe(true)
  })

  it('a corrected entry loses both its proof and its printed totals', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    await submitSale(TILL, BODY, 'sale-key-5', [], PRINTED)
    await correctQueuedSale(TILL_ID, 'sale-key-5', [{ method: 'CARD', amount: 2.31 }])
    const [entry] = queuedFor(TILL_ID)
    expect(entry.body.offlineProof).toBeUndefined()
    expect(entry.body.printed).toBeUndefined()
  })
})

describe('forgetting the key (WEB-5)', () => {
  it('removes every signing key and keeps the queue and the device id', async () => {
    await ensureSigningKey({ shiftId: SHIFT, userId: USER, tenantId: TENANT })
    await submitSale(TILL, BODY, 'sale-key-6', [], PRINTED)
    const queueBefore = window.localStorage.getItem('fawtir.pos.queue')
    await forgetSigningKeys()
    expect((await vault.ids('keys')).filter((id) => id.startsWith('sign:'))).toEqual([])
    expect(await vault.ids('keys')).toContain('device')
    expect(window.localStorage.getItem('fawtir.pos.queue')).toBe(queueBefore)
    expect(queuedFor(TILL_ID)).toHaveLength(1)
  })
})
