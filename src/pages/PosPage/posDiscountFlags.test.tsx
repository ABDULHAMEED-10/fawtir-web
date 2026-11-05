import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosDiscountFlagsPage } from './PosDiscountFlagsPage'
import {
  forgetEntitlements,
  loadEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'
import { noteQueueSender, resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

// NOT RUN (RC5 A2, static only). The manager's list of sales kept above the discount limit and the
// acknowledgement of each, against backend 598fd6715 (openapi /pos/discount-flags).

const MANAGER = 'u-mgr-0001'
const CASHIER = 'u-csh-0002'
const OTHER_MANAGER = 'u-oth-0003'

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: null,
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const flag = (over: Record<string, unknown> = {}) => ({
  saleId: 's-1',
  tillId: 'till-1',
  invoiceNumber: 'NZW-T01-INV-2026-000041',
  soldAt: '2026-11-04T08:00:00Z',
  total: 12.5,
  cashierUserId: CASHIER,
  cashierName: 'Maryam',
  discountPercentMax: 25,
  limitPercent: 10,
  judgedAt: 'FILING',
  flaggedAt: '2026-11-04T08:00:02Z',
  acknowledgedBy: null,
  acknowledgedAt: null,
  ...over,
})

const person = (userId: string, permissions: string[]): Entitlements => ({
  userId,
  username: 'someone',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const problem = (status: number, code: string) =>
  json({ type: 'about:blank', title: 'Refused', status, code }, status)

let signedIn: Entitlements
let flags: () => Response
let acknowledge: (body: unknown) => Response
let calls: { url: string; method: string; body: unknown }[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.stubEnv('VITE_POS_OFFLINE_SIGNING', 'off')
  resetPosQueue()
  noteQueueSender(MANAGER)
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  calls = []
  flags = () => json([flag()])
  acknowledge = () =>
    json({
      saleId: 's-1',
      originatingCashierUserId: CASHIER,
      acknowledgedBy: MANAGER,
      acknowledgedAt: '2026-11-05T09:00:00Z',
      note: null,
      replayed: false,
    })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })
      if (url === '/api/v1/me/entitlements') return json(signedIn)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/pos/discount-flags?')) return flags()
      if (url === '/api/v1/pos/discount-flags/s-1/acknowledge' && method === 'POST') {
        return acknowledge(body)
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function open(userId = MANAGER, permissions = ['pos.read', 'pos.sell', 'pos.close']) {
  signedIn = person(userId, permissions)
  await loadEntitlements()
  render(
    <MemoryRouter initialEntries={['/pos/discount-flags']}>
      <Routes>
        <Route path="/pos/discount-flags" element={<PosDiscountFlagsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const listCalls = () => calls.filter((call) => call.url.startsWith('/api/v1/pos/discount-flags?'))
const postCalls = () => calls.filter((call) => call.method === 'POST')
const submit = () => screen.findByRole('button', { name: i18n.t('pos.discountFlags.submit') })

describe('the discount-flag list (RC5 A2)', () => {
  it('asks for the branch over the server’s widest window and shows each flag', async () => {
    flags = () =>
      json([
        flag(),
        flag({
          saleId: 's-2',
          invoiceNumber: 'NZW-T01-INV-2026-000040',
          cashierName: null,
          limitPercent: null,
          judgedAt: 'RESOLUTION',
          acknowledgedBy: OTHER_MANAGER,
          acknowledgedAt: '2026-11-04T10:00:00Z',
        }),
      ])
    await open()
    await screen.findByText('NZW-T01-INV-2026-000041')
    const query = new URL(listCalls()[0].url, 'http://x').searchParams
    expect(query.get('branchId')).toBe('b-1')
    const from = Date.parse(query.get('from') ?? '')
    const to = Date.parse(query.get('to') ?? '')
    // At the ceiling, never over it: over 92 days is POS_DISCOUNT_FLAG_RANGE_INVALID.
    expect(to - from).toBe(92 * 24 * 3_600_000)

    expect(screen.getByText(i18n.t('pos.discountFlags.cashier', { name: 'Maryam' }))).toBeTruthy()
    expect(
      screen.getByText(i18n.t('pos.discountFlags.discount', { discount: '25', limit: '10' })),
    ).toBeTruthy()
    expect(screen.getByText('12.500')).toBeTruthy()
    expect(
      screen.getByText(i18n.t('pos.discountFlags.cashierUnnamed', { id: CASHIER.slice(0, 8) })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.discountFlags.discountNoLimit', { discount: '25' }))).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.discountFlags.afterReview'))).toBeTruthy()
    expect(
      screen.getByText((text) =>
        text.startsWith(
          i18n.t('pos.discountFlags.acknowledgedByOther', {
            id: OTHER_MANAGER.slice(0, 8),
            at: '',
          }),
        ),
      ),
    ).toBeTruthy()
    // Only the row not yet acknowledged offers the action.
    expect(screen.getAllByRole('button', { name: i18n.t('pos.discountFlags.submit') })).toHaveLength(1)
  })

  it('names the reader when they acknowledged it themselves', async () => {
    flags = () => json([flag({ acknowledgedBy: MANAGER, acknowledgedAt: '2026-11-04T10:00:00Z' })])
    await open()
    await screen.findByText('NZW-T01-INV-2026-000041')
    expect(
      screen.getByText((text) =>
        text.startsWith(i18n.t('pos.discountFlags.acknowledgedByYou', { at: '' })),
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.discountFlags.submit') })).toBeNull()
  })

  it('says so when there is nothing over the limit', async () => {
    flags = () => json([])
    await open()
    expect(await screen.findByText(i18n.t('pos.discountFlags.none'))).toBeTruthy()
  })

  it('is not asked for without pos.close, as the offline holds are not', async () => {
    await open(MANAGER, ['pos.read', 'pos.sell'])
    expect(await screen.findByText(i18n.t('pos.discountFlags.notAllowed'))).toBeTruthy()
    expect(listCalls()).toHaveLength(0)
  })

  it('words pos.close OWN instead of offering a retry', async () => {
    flags = () => problem(403, 'POS_ATTRIBUTION_REVIEWER_ONLY')
    await open()
    expect(
      await screen.findByText(i18n.t('pos.refusal.POS_ATTRIBUTION_REVIEWER_ONLY')),
    ).toBeTruthy()
  })

  it('offers no form on the cashier’s own flag (four-eyes)', async () => {
    await open(CASHIER)
    await screen.findByText('NZW-T01-INV-2026-000041')
    expect(screen.getByText(i18n.t('pos.refusal.POS_DISCOUNT_FLAG_SELF'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.discountFlags.submit') })).toBeNull()
  })
})

describe('acknowledging a flag', () => {
  it('sends the trimmed note and reloads the list', async () => {
    await open()
    fireEvent.change(await screen.findByLabelText(i18n.t('pos.discountFlags.note')), {
      target: { value: '  Checked with Maryam  ' },
    })
    fireEvent.click(await submit())
    await waitFor(() => expect(listCalls()).toHaveLength(2))
    expect(postCalls()).toEqual([
      {
        url: '/api/v1/pos/discount-flags/s-1/acknowledge',
        method: 'POST',
        body: { note: 'Checked with Maryam' },
      },
    ])
  })

  it('sends a blank note as null', async () => {
    await open()
    fireEvent.click(await submit())
    await waitFor(() => expect(postCalls()).toHaveLength(1))
    expect(postCalls()[0].body).toEqual({ note: null })
  })

  it('caps the note at the server’s 500 characters', async () => {
    await open()
    const note = await screen.findByLabelText(i18n.t('pos.discountFlags.note'))
    expect(note.getAttribute('maxLength') ?? note.getAttribute('maxlength')).toBe('500')
  })

  it('takes a replay as the success it is', async () => {
    acknowledge = () =>
      json({
        saleId: 's-1',
        originatingCashierUserId: CASHIER,
        acknowledgedBy: MANAGER,
        acknowledgedAt: '2026-11-05T09:00:00Z',
        note: null,
        replayed: true,
      })
    let answered = false
    flags = () =>
      json([
        answered
          ? flag({ acknowledgedBy: MANAGER, acknowledgedAt: '2026-11-05T09:00:00Z' })
          : flag(),
      ])
    await open()
    const button = await submit()
    answered = true
    fireEvent.click(button)
    expect(
      await screen.findByText((text) =>
        text.startsWith(i18n.t('pos.discountFlags.acknowledgedByYou', { at: '' })),
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // The list is read again only where the refusal says the row itself is out of date (review AW-2).
  for (const [status, code, reads] of [
    [403, 'POS_DISCOUNT_FLAG_HUMAN_ONLY', 1],
    [404, 'POS_DISCOUNT_FLAG_NOT_FOUND', 2],
    [409, 'POS_DISCOUNT_FLAG_SELF', 1],
    [409, 'POS_DISCOUNT_FLAG_ALREADY_ACKNOWLEDGED', 2],
    [409, 'POS_DISCOUNT_FLAG_HOLD_OPEN', 2],
  ] as const) {
    it(`words ${code} and withdraws the form, since sending again cannot succeed`, async () => {
      acknowledge = () => problem(status, code)
      await open()
      fireEvent.click(await submit())
      await waitFor(() => expect(listCalls()).toHaveLength(reads))
      // After a reload the row is drawn afresh: the sentence must survive it, and the form must not
      // come back (the mocked list still shows the row unacknowledged).
      expect((await screen.findByRole('alert')).textContent).toBe(i18n.t(`pos.refusal.${code}`))
      expect(screen.queryByRole('button', { name: i18n.t('pos.discountFlags.submit') })).toBeNull()
    })
  }

  it('shows the recorded acknowledgement after ALREADY_ACKNOWLEDGED', async () => {
    acknowledge = () => problem(409, 'POS_DISCOUNT_FLAG_ALREADY_ACKNOWLEDGED')
    let refused = false
    flags = () =>
      json([
        refused
          ? flag({ acknowledgedBy: OTHER_MANAGER, acknowledgedAt: '2026-11-05T08:59:00Z' })
          : flag(),
      ])
    await open()
    const button = await submit()
    refused = true
    fireEvent.click(button)
    expect(
      await screen.findByText((text) =>
        text.startsWith(
          i18n.t('pos.discountFlags.acknowledgedByOther', { id: OTHER_MANAGER.slice(0, 8), at: '' }),
        ),
      ),
    ).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      i18n.t('pos.refusal.POS_DISCOUNT_FLAG_ALREADY_ACKNOWLEDGED'),
    )
  })

  // RefusalType.IMPERSONATION_NOT_ALLOWED at 598fd6715 (GlobalExceptionHandler l.434 builds the type URI);
  // it carries no `code` (review AW-1).
  it('words a support session’s refusal as its own and withdraws the form', async () => {
    acknowledge = () =>
      json(
        { type: 'https://api.fawtir.om/problems/impersonation-not-allowed', title: 'Access denied', status: 403 },
        403,
      )
    await open()
    fireEvent.click(await submit())
    expect((await screen.findByRole('alert')).textContent).toBe(i18n.t('pos.refusal.impersonation'))
    expect(screen.queryByRole('button', { name: i18n.t('pos.discountFlags.submit') })).toBeNull()
    expect(listCalls()).toHaveLength(1)
  })

  it('does not tell an API key it might be a support session', () => {
    expect(i18n.t('pos.refusal.POS_DISCOUNT_FLAG_HUMAN_ONLY', { lng: 'en' })).not.toMatch(/support/i)
    expect(i18n.t('pos.refusal.POS_DISCOUNT_FLAG_HUMAN_ONLY', { lng: 'ar' })).not.toContain('جلسة دعم')
  })

  // Backend 3f483a01a (review FB-3): the note is refused before the append-only insert. Correcting
  // the note is the way out, so the form and what was typed stay.
  it('keeps the form and the typed note after POS_NOTE_CARD_NUMBER', async () => {
    acknowledge = () =>
      json(
        { type: 'about:blank', title: 'Refused', status: 400, code: 'POS_NOTE_CARD_NUMBER', field: 'note' },
        400,
      )
    await open()
    const typed = 'Paid with card 4111 1111 1111 1111'
    fireEvent.change(await screen.findByLabelText(i18n.t('pos.discountFlags.note')), {
      target: { value: typed },
    })
    fireEvent.click(await submit())
    expect((await screen.findByRole('alert')).textContent).toBe(
      i18n.t('pos.refusal.POS_NOTE_CARD_NUMBER'),
    )
    expect(await submit()).toBeTruthy()
    expect(
      (screen.getByLabelText(i18n.t('pos.discountFlags.note')) as HTMLTextAreaElement).value,
    ).toBe(typed)
    expect(listCalls()).toHaveLength(1)
  })

  it('keeps the form after a failure that may pass on a second try', async () => {
    acknowledge = () => json({ type: 'about:blank', status: 503 }, 503)
    await open()
    fireEvent.click(await submit())
    expect((await screen.findByRole('alert')).textContent).toBe(i18n.t('pos.refusal.failed'))
    expect(await submit()).toBeTruthy()
  })
})

describe('the discount-flag sentences', () => {
  it('has every key in English and Arabic', () => {
    const keys = [
      'pos.discountFlags.link',
      'pos.discountFlags.title',
      'pos.discountFlags.intro',
      'pos.discountFlags.none',
      'pos.discountFlags.notAllowed',
      'pos.discountFlags.cashier',
      'pos.discountFlags.cashierUnnamed',
      'pos.discountFlags.discount',
      'pos.discountFlags.discountNoLimit',
      'pos.discountFlags.afterReview',
      'pos.discountFlags.acknowledgedByYou',
      'pos.discountFlags.acknowledgedByOther',
      'pos.discountFlags.note',
      'pos.discountFlags.final',
      'pos.discountFlags.submit',
      'pos.refusal.POS_DISCOUNT_FLAG_HUMAN_ONLY',
      'pos.refusal.POS_DISCOUNT_FLAG_NOT_FOUND',
      'pos.refusal.POS_DISCOUNT_FLAG_SELF',
      'pos.refusal.POS_DISCOUNT_FLAG_ALREADY_ACKNOWLEDGED',
      'pos.refusal.POS_DISCOUNT_FLAG_RANGE_INVALID',
      'pos.refusal.impersonation',
      'pos.refusal.POS_DISCOUNT_FLAG_HOLD_OPEN',
      'pos.refusal.POS_NOTE_CARD_NUMBER',
    ]
    for (const lng of ['en', 'ar']) {
      for (const key of keys) expect(i18n.exists(key, { lng }), `${lng} ${key}`).toBe(true)
    }
  })
})
