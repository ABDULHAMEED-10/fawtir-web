import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tillContact } from './posContact'
import { movementTime } from './catalogStock'
import { amountNote, saleState } from './posToday'
import { notEligiblePaths } from './customerEligibility'
import { loadOrRecall } from './posOffline'
import { ownBranches } from '../components/branch/useWorkingBranch'
import { ApiError, NetworkError } from '../api'
import * as entitlements from './identity/entitlements'
import type { PosTodaySaleRow } from '../api/pos/pos'

describe('the buyer’s phone or email on the till (E2E F-2)', () => {
  it('puts +968 in front of an Omani number typed as eight digits', () => {
    expect(tillContact('92345678')).toEqual({ ok: true, value: '+96892345678' })
    expect(tillContact(' 9234 5678 ')).toEqual({ ok: true, value: '+96892345678' })
    expect(tillContact('968 9234 5678')).toEqual({ ok: true, value: '+96892345678' })
    expect(tillContact('0096892345678')).toEqual({ ok: true, value: '+96892345678' })
  })

  it('keeps an international number and an email, and nothing at all', () => {
    expect(tillContact('+971 50 123 4567')).toEqual({ ok: true, value: '+971501234567' })
    expect(tillContact('Saif@Example.om')).toEqual({ ok: true, value: 'saif@example.om' })
    expect(tillContact('  ')).toEqual({ ok: true, value: null })
  })

  it('refuses what is neither', () => {
    expect(tillContact('1234')).toEqual({ ok: false, reason: 'phone' })
    expect(tillContact('+0123456789')).toEqual({ ok: false, reason: 'phone' })
    expect(tillContact('saif@')).toEqual({ ok: false, reason: 'email' })
  })
})

describe('a company the server will not invoice yet (E2E F-1)', () => {
  it('picks the missing fields out of the refusal', () => {
    expect(
      notEligiblePaths({
        code: 'CUSTOMER_NOT_INVOICE_ELIGIBLE',
        detail:
          'Customer is missing invoice fields: invoiceAddress.countryCode, invoiceAddress.cityName, invoiceAddress.streetName',
      }),
    ).toEqual([
      'invoiceAddress.countryCode',
      'invoiceAddress.cityName',
      'invoiceAddress.streetName',
    ])
  })

  it('prefers a list the server sends, and ignores any other refusal', () => {
    expect(
      notEligiblePaths({
        code: 'CUSTOMER_NOT_INVOICE_ELIGIBLE',
        missingInvoiceFields: ['invoiceAddress.cityName'],
      }),
    ).toEqual(['invoiceAddress.cityName'])
    expect(notEligiblePaths({ code: 'POS_TILL_RETIRED', detail: 'invoiceAddress.cityName' })).toBe(
      null,
    )
  })
})

describe('a delivery’s time on the item page (E2E F-10)', () => {
  const receipt = { type: 'RECEIPT' as const, occurredAt: '2026-10-27T20:00:00Z' }

  it('shows when it was recorded instead of midnight, the same day', () => {
    expect(movementTime({ ...receipt, recordedAt: '2026-10-28T10:05:00Z' })).toBe('14:05')
  })

  it('shows no time for a delivery recorded on a later day', () => {
    expect(movementTime({ ...receipt, recordedAt: '2026-10-30T10:05:00Z' })).toBe('')
  })

  it('keeps the time of anything else', () => {
    expect(
      movementTime({
        type: 'SALE',
        occurredAt: '2026-10-28T08:00:00Z',
        recordedAt: '2026-10-28T08:00:00Z',
      }),
    ).toBe('12:00')
  })
})

describe('a sale on Today (E2E F-7)', () => {
  const row = (patch: Partial<PosTodaySaleRow>): PosTodaySaleRow =>
    ({
      displayState: 'filed',
      credit: { state: 'NONE', credited: 0, creditNoteNumbers: [] },
      tip: 0,
      changeGiven: 0,
      customer: { kind: 'WALK_IN', customerId: 'c', name: null },
      ...patch,
    }) as PosTodaySaleRow

  it('says Waiting while the filing is still queued, and Filed once it has gone', () => {
    const queued = {
      dispatchState: 'QUEUED',
      tddStatus: null,
      acceptedAt: null,
      channel: 'TAX_AUTHORITY',
    } as const
    expect(saleState(row({ filing: queued }))).toBe('waiting')
    expect(saleState(row({ filing: { ...queued, dispatchState: 'DISPATCHED' } }))).toBe('filed')
    // A company sale too, while it waits to go over Peppol (retest N-9).
    expect(saleState(row({ displayState: 'peppol', filing: queued }))).toBe('waiting')
    expect(
      saleState(
        row({ displayState: 'peppol', filing: { ...queued, dispatchState: 'DISPATCHED' } }),
      ),
    ).toBe('peppol')
    expect(saleState(row({}))).toBe('filed')
  })

  it('takes waiting and failed from a server that sends them (backend #810)', () => {
    expect(saleState(row({ displayState: 'waiting' }))).toBe('waiting')
    expect(saleState(row({ displayState: 'failed' }))).toBe('failed')
  })

  it('puts the tip on top of the total, not inside it', () => {
    expect(amountNote(row({ tip: 0.588 }))).toEqual({
      key: 'pos.today.plusTip',
      values: { amount: '0.588' },
    })
  })
})

describe('the branch for a reader the branch list refuses (E2E F-3)', () => {
  const refused = {
    status: 'failed' as const,
    error: new ApiError({ status: 403, problemType: 'forbidden' }),
  }
  const who = (branchIds: string[]) =>
    ({
      userId: 'u',
      username: 'v',
      tenantId: 't',
      roles: [],
      permissions: [],
      scopes: [],
      featureFlags: {},
      branchIds,
    }) as entitlements.Entitlements

  it('falls back on their own branches from the entitlements', () => {
    expect(ownBranches(refused, who(['b-1']))?.map((branch) => branch.id)).toEqual(['b-1'])
  })

  it('does not cover up any other failure, or a refusal with no branch to fall back on', () => {
    expect(
      ownBranches({ status: 'failed', error: new NetworkError('offline') }, who(['b-1'])),
    ).toBe(null)
    expect(ownBranches(refused, who([]))).toBe(null)
    expect(ownBranches({ status: 'ready', data: [] }, who(['b-1']))).toBe(null)
  })
})

describe('what the till keeps for offline (E2E F-4)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(entitlements, 'peekEntitlements').mockReturnValue({
      userId: 'u-1',
      tenantId: 't-1',
    } as entitlements.Entitlements)
  })
  afterEach(() => vi.restoreAllMocks())

  it('answers the last copy only when the server cannot be reached', async () => {
    expect(await loadOrRecall('tills.b-1', async () => ['till-1'])).toEqual(['till-1'])
    expect(
      await loadOrRecall('tills.b-1', async () => {
        throw new NetworkError('offline')
      }),
    ).toEqual(['till-1'])
    await expect(
      loadOrRecall('tills.b-1', async () => {
        throw new ApiError({ status: 403, problemType: 'forbidden' })
      }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('keeps one person’s copy from another on the same device', async () => {
    await loadOrRecall('branches', async () => ['b-1'])
    vi.mocked(entitlements.peekEntitlements).mockReturnValue({
      userId: 'u-2',
      tenantId: 't-1',
    } as entitlements.Entitlements)
    await expect(
      loadOrRecall('branches', async () => {
        throw new NetworkError('offline')
      }),
    ).rejects.toBeInstanceOf(NetworkError)
  })
})
