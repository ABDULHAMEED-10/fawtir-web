import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { PaidExtrasPage } from './PaidExtrasPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements
const READER: Entitlements = { ...MANAGER, permissions: ['tenant.plan.read'] } as Entitlements

const EXTRAS = '/api/v1/settings/plan/extras'
const QUOTE = `${EXTRAS}/quote`
const ORDER = `POST ${EXTRAS}/orders`
const STOP = `POST ${EXTRAS}/erp-addon/cancellation`
const KEEP = `DELETE ${EXTRAS}/erp-addon/cancellation`
const BILLING = '/api/v1/settings/billing'
const SUBSCRIPTION = '/api/v1/settings/subscription'

function kind(over: Record<string, unknown> = {}) {
  return { included: 5, inUse: 5, paidPlacesNow: 1, capacity: 6, unitMonthlyPrice: '2.500', offered: true, ...over }
}

function overview(over: Record<string, unknown> = {}) {
  return {
    open: true,
    users: kind(),
    branches: kind({ included: 2, inUse: 2, paidPlacesNow: 0, capacity: 2, unitMonthlyPrice: '5.000' }),
    erpAddon: { offered: false, monthlyPrice: null, status: null, endsOn: null },
    maxUsersPerOrder: 50,
    maxBranchesPerOrder: 20,
    outstanding: null,
    places: [],
    ...over,
  }
}

const PLUS_ADDON = (status: string | null, endsOn: string | null = null) => ({
  offered: true,
  monthlyPrice: '20.000',
  status,
  endsOn,
})

/**
 * Odd figures on purpose: 1 user for 21 of 31 days at 2.500 is 1.694, which no browser arithmetic
 * on the unit price would print as 1.111, so the screen can only be showing the server's lines.
 */
function quote(users: number, branches: number, erpAddon: boolean, over: Record<string, unknown> = {}) {
  const lines = [
    ...(users > 0
      ? [{ kind: 'USER', quantity: users, from: '2026-10-11', to: '2026-10-31', days: 21, periodDays: 31,
          unitPeriodPrice: '2.500', net: '1.111', planCode: 'BUSINESS', planVersionId: 'v-1', billingCycle: 'MONTHLY' }]
      : []),
    ...(branches > 0
      ? [{ kind: 'BRANCH', quantity: branches, from: '2026-10-11', to: '2026-10-31', days: 21, periodDays: 31,
          unitPeriodPrice: '5.000', net: '2.222', planCode: 'BUSINESS', planVersionId: 'v-1', billingCycle: 'MONTHLY' }]
      : []),
    ...(erpAddon
      ? [{ kind: 'ERP_ADDON', quantity: 1, from: '2026-10-11', to: '2026-10-31', days: 21, periodDays: 31,
          unitPeriodPrice: '20.000', net: '13.548', planCode: 'BUSINESS_PLUS', planVersionId: 'v-1', billingCycle: 'MONTHLY' }]
      : []),
  ]
  return {
    users, branches, erpAddon, lines, subtotal: '3.333', vatRate: '0.05000', vatAmount: '0.167', total: '3.500',
    currency: 'OMR', renewalOn: '2026-11-01', placesEnd: null, maxUsersPerOrder: 50, maxBranchesPerOrder: 20, ...over,
  }
}

const BILL = {
  id: 'b-px', number: 'FWT-SUB-2026-000057', planCode: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-11', periodEndsOn: '2026-10-31', subtotal: '3.333', vatRate: '0.05000',
  vatAmount: '0.167', total: '3.500', currency: 'OMR', taxDocumentStatus: 'NOT_A_TAX_INVOICE', status: 'OPEN',
  dueOn: '2026-10-11', issuedAt: '2026-10-11T08:00:00Z', paidAt: null, appliedPaidThrough: null, voidReason: null,
  version: 0, kind: 'PAID_EXTRAS',
}

function place(kindOf: string, status: string, over: Record<string, unknown> = {}) {
  return {
    id: `pl-${kindOf}-${status}`, kind: kindOf, quantity: 1, source: 'PURCHASE', status, unitPeriodPrice: '2.500',
    netAmount: '1.111', planCode: 'BUSINESS', billingCycle: 'MONTHLY', coversFrom: '2026-10-11',
    coversTo: '2026-10-31', billId: 'b-px', reason: null, createdAt: '2026-10-11T08:00:00Z',
    activatedAt: status === 'ACTIVE' ? '2026-10-11T08:10:00Z' : null, cancelledAt: null, ...over,
  }
}

const ORDERED = { places: [place('USER', 'PENDING'), place('BRANCH', 'PENDING')], bill: BILL }

const BILLING_OVERVIEW = {
  bills: [{ bill: BILL, payments: [], card: { available: true, purpose: 'PAID_EXTRAS', reason: null } }],
  nextBillsCursor: null,
  beneficiary: { legalName: 'Fawtir LLC', bankName: 'Bank Muscat', iban: 'OM810180000001299123456', swiftCode: 'BMUSOMMX' },
  methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true, card: true },
  proofMaximumBytes: 1000000,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

function problem(status: number, slug: string, extra: Record<string, unknown> = {}) {
  return json(status, { type: `https://api.fawtir.om/problems/${slug}`, title: slug, status, detail: 'English detail', ...extra })
}

let me: Entitlements
let answers: Record<string, (url: string, init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  me = MANAGER
  answers = {
    [EXTRAS]: () => json(200, overview()),
    [QUOTE]: (url) => {
      const query = new URL(url, 'http://x').searchParams
      return json(200, quote(Number(query.get('users')), Number(query.get('branches')), query.get('erpAddon') === 'true'))
    },
    [BILLING]: () => json(200, BILLING_OVERVIEW),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, me)
    const method = init?.method ?? 'GET'
    const path = String(url).split('?')[0]
    const answer = answers[method === 'GET' ? path : `${method} ${path}`]
    return answer ? answer(String(url), init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/plan/extras']}>
      <Routes>
        <Route path="/settings/plan/extras" element={<PaidExtrasPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function calls(key: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const method = init?.method ?? 'GET'
    const path = String(url).split('?')[0]
    return (method === 'GET' ? path : `${method} ${path}`) === key
  })
}

const usersField = () => screen.findByLabelText(i18n.t('paidExtras.buy.users')) as Promise<HTMLInputElement>
const submitButton = () => screen.findByRole('button', { name: i18n.t('paidExtras.buy.submit') }) as Promise<HTMLButtonElement>

describe('Settings › Paid extras: what the plan includes and what is paid (US-1, BR-3, US-2, BR-4)', () => {
  it('shows users and branches in use against included plus paid places, and when removals take effect', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('paidExtras.places.inUseOf', { inUse: '5', capacity: '6' }))).toBeTruthy()
    expect(screen.getByText(i18n.t('paidExtras.places.split', { included: '5', paid: '1' }))).toBeTruthy()
    expect(screen.getByText(i18n.t('paidExtras.places.inUseOf', { inUse: '2', capacity: '2' }))).toBeTruthy()
    expect(screen.getByText(i18n.t('paidExtras.places.removal'))).toBeTruthy()
  })

  it('never shows the ERP add-on on a plan that does not offer it (ER-1)', async () => {
    renderPage()
    await usersField()
    expect(screen.queryByText(i18n.t('paidExtras.addon.title'))).toBeNull()
    expect(screen.queryByLabelText(i18n.t('paidExtras.buy.addon'))).toBeNull()
  })
})

describe('Settings › Paid extras: the price (PY-2, CF-3)', () => {
  it('shows the server quote line by line and computes nothing itself', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: i18n.t('paidExtras.buy.more', { what: i18n.t('paidExtras.buy.users') }) }))
    expect(await screen.findByText('1.111')).toBeTruthy()
    expect(screen.getByText('3.500')).toBeTruthy()
    expect(screen.getByText('0.167')).toBeTruthy()
    expect(screen.getByText(/1 user, .* \(21 of 31 days\)/)).toBeTruthy()
    expect(screen.getByText(i18n.t('paidExtras.quote.renewal', { date: '1 Nov 2026' }))).toBeTruthy()
    expect(String(calls(QUOTE).at(-1)?.[0])).toBe(`${QUOTE}?users=1&branches=0&erpAddon=false`)
  })

  it('caps each field at the per-order maximum and asks no price above it', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const field = await usersField()
    await user.clear(field)
    await user.type(field, '51')
    const hint = screen.getAllByText(i18n.t('paidExtras.buy.limit', { max: '50' }))[0]
    expect(hint.getAttribute('role')).toBe('alert')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(calls(QUOTE)).toHaveLength(0)
    expect((await submitButton()).disabled).toBe(true)
  })

  it('names the per-order maximum the server gives when it refuses (paid-extras-order-limit)', async () => {
    const user = userEvent.setup({ delay: null })
    answers[QUOTE] = () => problem(409, 'paid-extras-order-limit', { maxUsers: 40, maxBranches: 10 })
    renderPage()
    const field = await usersField()
    await user.clear(field)
    await user.type(field, '45')
    expect(
      await screen.findByText(i18n.t('paidExtras.refusal.paid-extras-order-limit', { users: '40', branches: '10' })),
    ).toBeTruthy()
    expect(screen.queryByText('English detail')).toBeNull()
  })
})

describe('Settings › Paid extras: ordering and paying', () => {
  it('orders once on a double click with the quoted total, then offers the bill with the usual ways to pay', async () => {
    const user = userEvent.setup({ delay: null })
    let ordered = false
    answers[ORDER] = () => {
      ordered = true
      return json(201, ORDERED)
    }
    answers[EXTRAS] = () => json(200, overview(ordered ? { outstanding: ORDERED, places: ORDERED.places } : {}))
    renderPage()
    await user.click(await screen.findByRole('button', { name: i18n.t('paidExtras.buy.more', { what: i18n.t('paidExtras.buy.users') }) }))
    await user.click(screen.getByRole('button', { name: i18n.t('paidExtras.buy.more', { what: i18n.t('paidExtras.buy.branches') }) }))
    const submit = await submitButton()
    await waitFor(() => expect(submit.disabled).toBe(false))
    await user.dblClick(submit)
    await screen.findByText(i18n.t('paidExtras.order.title'))
    expect(calls(ORDER)).toHaveLength(1)
    expect(JSON.parse(String(calls(ORDER)[0][1]?.body))).toEqual({
      users: 1,
      branches: 1,
      erpAddon: false,
      expectedTotal: '3.500',
    })
    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CARD.title')) })).toBeTruthy()
    expect(screen.getByText('FWT-SUB-2026-000057')).toBeTruthy()
    expect(screen.getAllByText('1 extra user, 1 extra branch').length).toBeGreaterThan(0)
  })

  it('asks again and says so when the server total moved since the quote (extras-price-changed)', async () => {
    const user = userEvent.setup({ delay: null })
    answers[ORDER] = () => problem(409, 'extras-price-changed')
    renderPage()
    await user.click(await screen.findByRole('button', { name: i18n.t('paidExtras.buy.more', { what: i18n.t('paidExtras.buy.users') }) }))
    const submit = await submitButton()
    await waitFor(() => expect(submit.disabled).toBe(false))
    const before = calls(QUOTE).length
    await user.click(submit)
    expect(await screen.findByText(i18n.t('paidExtras.refusal.extras-price-changed'))).toBeTruthy()
    await waitFor(() => expect(calls(QUOTE).length).toBe(before + 1))
  })

  it('says the places are on once the order is paid', async () => {
    let paid = false
    answers[EXTRAS] = () =>
      json(200, paid ? overview({ places: [place('USER', 'ACTIVE')] }) : overview({ outstanding: ORDERED, places: ORDERED.places }))
    renderPage()
    await screen.findByText(i18n.t('paidExtras.order.title'))
    // Any change to the order reads the overview again; here Fawtir has confirmed it meanwhile.
    const user = userEvent.setup({ delay: null })
    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }))
    answers[`POST ${BILLING}/bills/b-px/cash-request`] = () => {
      paid = true
      return json(201, { id: 'p-1', billId: 'b-px', method: 'CASH', status: 'SUBMITTED', amount: '3.500' })
    }
    await user.click(screen.getByRole('button', { name: i18n.t('billing.cash.submit') }))
    expect(await screen.findByText(i18n.t('paidExtras.result.added'))).toBeTruthy()
  })
})

describe('Settings › Paid extras: the ERP add-on (ER-1, ER-2, ER-3)', () => {
  it('adds the add-on through the same order, ticked from its card', async () => {
    const user = userEvent.setup({ delay: null })
    answers[EXTRAS] = () => json(200, overview({ erpAddon: PLUS_ADDON(null) }))
    renderPage()
    expect(await screen.findByText(i18n.t('paidExtras.addon.title'))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('paidExtras.addon.add') }))
    expect((screen.getByLabelText(i18n.t('paidExtras.buy.addon')) as HTMLInputElement).checked).toBe(true)
    expect(await screen.findByText('13.548')).toBeTruthy()
    expect(String(calls(QUOTE).at(-1)?.[0])).toBe(`${QUOTE}?users=0&branches=0&erpAddon=true`)
  })

  it('stops the add-on at the end of the paid time after a confirmation, and keeps it again', async () => {
    const user = userEvent.setup({ delay: null })
    let status = 'ACTIVE'
    answers[EXTRAS] = () => json(200, overview({ erpAddon: PLUS_ADDON(status, status === 'ENDING' ? '2026-10-31' : null) }))
    answers[STOP] = () => {
      status = 'ENDING'
      return json(200, PLUS_ADDON('ENDING', '2026-10-31'))
    }
    answers[KEEP] = () => {
      status = 'ACTIVE'
      return json(200, PLUS_ADDON('ACTIVE'))
    }
    renderPage()
    await user.click(await screen.findByRole('button', { name: i18n.t('paidExtras.addon.stop') }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(i18n.t('paidExtras.addon.stopBody'))).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: i18n.t('paidExtras.addon.stopConfirm') }))
    expect(await screen.findByText(i18n.t('paidExtras.addon.status.ENDING', { date: '31 Oct 2026' }))).toBeTruthy()
    expect(calls(STOP)).toHaveLength(1)
    // An add-on already on cannot be ticked again in the order form.
    expect(screen.queryByLabelText(i18n.t('paidExtras.buy.addon'))).toBeNull()
    await user.click(screen.getByRole('button', { name: i18n.t('paidExtras.addon.keep') }))
    expect(await screen.findByText(i18n.t('paidExtras.addon.kept'))).toBeTruthy()
    expect(calls(KEEP)).toHaveLength(1)
  })
})

describe('Settings › Paid extras: who and when', () => {
  it('shows the places but no order form or add-on action to someone who may only read the plan', async () => {
    me = READER
    answers[EXTRAS] = () => json(200, overview({ erpAddon: PLUS_ADDON('ACTIVE') }))
    renderPage()
    expect(await screen.findByText(i18n.t('paidExtras.noPermission'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.buy.submit') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.addon.stop') })).toBeNull()
  })

  it('says places can be added after the first payment during the trial', async () => {
    answers[SUBSCRIPTION] = () => json(200, { access: 'TRIAL', paidThrough: null, trialEndsOn: '2026-10-20' })
    renderPage()
    expect(await screen.findByText(i18n.t('paidExtras.refusal.paid-extras-not-in-trial'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.buy.submit') })).toBeNull()
  })

  it('sends an unpaid subscription to Bills and payment first', async () => {
    answers[SUBSCRIPTION] = () => json(200, { access: 'PAYMENT_REQUIRED', paidThrough: '2026-09-30', trialEndsOn: null })
    renderPage()
    const callout = await screen.findByText(i18n.t('paidExtras.refusal.subscription-state-conflict'), { exact: false })
    expect(within(callout).getByRole('link').getAttribute('href')).toBe('/settings/bills')
  })

  it('says so while Fawtir has not opened paid extras', async () => {
    answers[EXTRAS] = () => json(200, overview({ open: false }))
    renderPage()
    expect(await screen.findByText(i18n.t('paidExtras.notOpen'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.buy.submit') })).toBeNull()
  })
})

describe('Settings › Paid extras: Arabic', () => {
  it('has every message in both languages, in Arabic, calling the bill مطالبة', () => {
    type Tree = { [key: string]: string | Tree }
    const flat = (tree: Tree, prefix = ''): Record<string, string> =>
      Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key
        return typeof value === 'string' ? { ...all, [path]: value } : { ...all, ...flat(value, path) }
      }, {})
    const base = (keys: string[]) => [...new Set(keys.map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')))].sort()
    const english = flat((en as unknown as { paidExtras: Tree }).paidExtras)
    const arabic = flat((ar as unknown as { paidExtras: Tree }).paidExtras)
    expect(base(Object.keys(arabic))).toEqual(base(Object.keys(english)))
    for (const [key, text] of Object.entries(arabic)) {
      expect(text.trim(), key).not.toBe('')
      expect(text, key).toMatch(/[؀-ۿ]/)
    }
    expect(arabic['buy.howAdded']).toMatch(/مطالبة/)
  })

  it('words counts without a counted noun after the figure, for any figure', () => {
    for (const n of [1, 2, 7, 14, 120]) {
      const text = i18n.t('paidExtras.quote.line.USER', {
        lng: 'ar', count: n, n: String(n), from: 'A', to: 'B', days: String(n), periodDays: '31',
      })
      expect(text).toContain(`المستخدمون: ${n}`)
      expect(text).not.toMatch(/\d+\s*(?:يومًا|أيام|مستخدمين|مستخدمًا)/)
    }
  })
})
