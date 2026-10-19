import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import {
  forgetEntitlements,
  payAvailable,
  type Entitlements,
} from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BillingPage } from './BillingPage'
import { BillDueCard } from '../../components/billing/BillDueCard'
import { resetLeftFawtirRefusal } from '../../lib/leftFawtirRefusal'
import { hostedCheckout } from '../../api/settings/billing'

/**
 * `payAvailable` on `GET /v1/me/entitlements`: when the server says false, no Pay (bank transfer,
 * cash, card), no "Prepare my next bill", no dashboard "Pay your bill" and no Continue on a card
 * checkout already opened. True, or a server that does not send it, keeps every action. The LV-6
 * note for a company that has left Fawtir still shows.
 */
const ADMIN = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage', 'tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const DISCONNECTION = '/api/v1/settings/fawtir-disconnection'
const BILLING = '/api/v1/settings/billing'
const SUBSCRIPTION = '/api/v1/settings/subscription'

const CONNECTED = {
  companyName: 'Real Trading LLC',
  connected: true,
  canRequest: true,
  canWithdraw: false,
  canReconnect: false,
  reconnection: null,
  request: null,
}
const LEFT = {
  ...CONNECTED,
  connected: false,
  canRequest: false,
  canReconnect: true,
  request: {
    path: 'ALREADY_DISCONNECTED',
    status: 'DISCONNECTED',
    origin: 'CUSTOMER',
    askedVia: null,
    requestedAt: '2026-10-12T06:00:00Z',
    portalRequestRaisedAt: null,
    approvalDueAt: null,
    approvalExpired: false,
    disconnectedAt: '2026-10-13T09:00:00Z',
    smpRemovedAt: '2026-10-13T10:00:00Z',
    notCompletedReason: null,
    closedAt: null,
    subscriptionEndsOn: '2099-11-08',
    steps: [],
  },
}

const STATUS = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: false,
  today: '2026-10-18',
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodPrice: '80.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-11-08',
  renewsOn: '2026-11-09',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
}

const bill = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  number: `FWT-SUB-2026-${id}`,
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-09',
  periodEndsOn: '2026-11-08',
  subtotal: '80.000',
  vatRate: '0.05000',
  vatAmount: '4.000',
  total: '84.000',
  currency: 'OMR',
  taxDocumentStatus: 'NOT_A_TAX_INVOICE',
  status: 'OPEN',
  dueOn: '2026-10-20',
  issuedAt: '2026-10-18T05:00:00Z',
  paidAt: null,
  appliedPaidThrough: null,
  voidReason: null,
  version: 0,
  ...over,
})

function billing(bills: unknown[]) {
  return {
    bills,
    nextBillsCursor: null,
    beneficiary: {
      legalName: 'Fawtir LLC',
      bankName: 'Bank Muscat',
      iban: 'OM810180000001299123456',
      swiftCode: 'BMUSOMMX',
    },
    methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true, card: true },
    proofMaximumBytes: 1000000,
    signupPayment: null,
  }
}
const OPEN_BILL = billing([
  {
    bill: bill('000007'),
    payments: [],
    card: { available: true, purpose: 'SUBSCRIPTION', reason: null },
  },
])

const HOSTED = 'https://oman.paymob.com/unifiedcheckout/?publicKey=pk_test&clientSecret=cs_test'
const LIVE_CARD = {
  id: 'p-1',
  billId: '000007',
  method: 'CARD',
  status: 'SUBMITTED',
  amount: '84.000',
  submittedAt: '2026-10-18T06:00:00Z',
  reference: null,
  customerNote: null,
  proofContentType: null,
  receiptNumber: null,
  receivedAmount: null,
  receivedAt: null,
  rejectionReason: null,
  version: 0,
}
const READY_CHECKOUT = {
  paymentId: 'p-1',
  billId: '000007',
  status: 'READY',
  checkoutUrl: HOSTED,
  expiresAt: '2099-10-18T06:30:00Z',
  amount: '84.000',
  currency: 'OMR',
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let me: Entitlements
let answers: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  resetLeftFawtirRefusal()
  forgetEntitlements()
  me = ADMIN
  answers = {
    [DISCONNECTION]: () => json(200, CONNECTED),
    [SUBSCRIPTION]: () => json(200, STATUS),
    [BILLING]: () => json(200, OPEN_BILL),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).split('?')[0]
    if (path === '/api/v1/me/entitlements') return json(200, me)
    const method = init?.method ?? 'GET'
    const answer = answers[method === 'GET' ? path : `${method} ${path}`]
    return answer ? answer() : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

async function settled() {
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => url === DISCONNECTION)).toBe(true),
  )
  await new Promise((resolve) => setTimeout(resolve, 30))
}

const method = (name: string) =>
  screen.queryByRole('radio', { name: new RegExp(i18n.t(`billing.method.${name}.title`)) })

const OFFERED: [string, Entitlements][] = [
  ['payAvailable true', { ...ADMIN, payAvailable: true }],
  ['a server without the field', ADMIN],
]

describe('payAvailable on the entitlements', () => {
  it('reads false only when the server says false', () => {
    expect(payAvailable(null)).toBe(true)
    expect(payAvailable(ADMIN)).toBe(true)
    expect(payAvailable({ ...ADMIN, payAvailable: true })).toBe(true)
    expect(payAvailable({ ...ADMIN, payAvailable: false })).toBe(false)
  })
})

describe('Bills and payment: no way to pay when payAvailable is false', () => {
  it('offers no bank transfer, cash or card on the open bill, and still shows the bill', async () => {
    me = { ...ADMIN, payAvailable: false }
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    await settled()
    expect(method('BANK_TRANSFER')).toBeNull()
    expect(method('CASH')).toBeNull()
    expect(method('CARD')).toBeNull()
    // Not the LV-6 note: the company has not left.
    expect(screen.queryByText(/Reconnect to Fawtir before paying/)).toBeNull()
  })

  it.each(OFFERED)('offers every way to pay for %s', async (_, who) => {
    me = who
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
    ).toBeTruthy()
    expect(method('BANK_TRANSFER')).toBeTruthy()
  })

  it('still shows the LV-6 note once the company has left', async () => {
    me = { ...ADMIN, payAvailable: false }
    answers[DISCONNECTION] = () => json(200, LEFT)
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(/Reconnect to Fawtir before paying/)).toBeTruthy()
    expect(method('CASH')).toBeNull()
  })

  it('prepares no next bill when false, and does when the field is absent', async () => {
    answers[BILLING] = () => json(200, billing([]))
    me = { ...ADMIN, payAvailable: false }
    const { unmount } = renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(i18n.t('billing.nothingDue'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
    unmount()

    resetSharedRequests()
    forgetEntitlements()
    me = ADMIN
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByRole('button', { name: i18n.t('billing.prepare') })).toBeTruthy()
  })
})

describe('A card checkout already opened: no Continue when payAvailable is false', () => {
  beforeEach(() => {
    vi.spyOn(hostedCheckout, 'open').mockImplementation(() => {})
    answers[BILLING] = () =>
      json(
        200,
        billing([
          { bill: bill('000007', { status: 'PENDING_VERIFICATION' }), payments: [LIVE_CARD] },
        ]),
      )
    answers[`${BILLING}/payments/p-1/card-checkout`] = () => json(200, READY_CHECKOUT)
  })

  it('hides Continue but still checks the status', async () => {
    me = { ...ADMIN, payAvailable: false }
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(i18n.t('billing.card.status.READY'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('button', { name: i18n.t('billing.card.continue') })).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('billing.card.checkAgain') })).toBeTruthy()
  })

  it.each(OFFERED)('offers Continue for %s', async (_, who) => {
    me = who
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('button', { name: i18n.t('billing.card.continue') }),
    ).toBeTruthy()
  })
})

describe('The dashboard bill card', () => {
  it('names the open bill but sends nobody to pay it when payAvailable is false', async () => {
    me = { ...ADMIN, payAvailable: false }
    renderAt('/', <BillDueCard />)
    expect(await screen.findByText(i18n.t('billDue.title'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('link', { name: i18n.t('billDue.cta') })).toBeNull()
  })

  it.each(OFFERED)('sends to pay for %s', async (_, who) => {
    me = who
    renderAt('/', <BillDueCard />)
    expect(await screen.findByRole('link', { name: i18n.t('billDue.cta') })).toBeTruthy()
  })
})
