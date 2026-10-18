import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BillingPage } from './BillingPage'
import { ExtraDocumentsPage } from './ExtraDocumentsPage'
import { PaidExtrasPage } from './PaidExtrasPage'
import { BillDueCard } from '../../components/billing/BillDueCard'
import { resetLeftFawtirRefusal } from '../../lib/leftFawtirRefusal'
import { hostedCheckout } from '../../api/settings/billing'

/**
 * Plan v4 A3.8 with Business Rules LV-6: once the server reports a completed disconnection that
 * offers to come back, with no reconnection in effect, no way to start a payment is offered
 * (the server refuses them all), for every role that can read it. A connected company, a server
 * with reconnecting off, and a server that does not send the fields see every action as before.
 */
const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage', 'tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements
/** A custom role that may pay and read the danger zone's view, but is not its owner or admin. */
const CUSTOM_PAYER: Entitlements = {
  ...ADMIN,
  roles: [{ id: 'r-9', code: 'BILLING_LEAD', name: 'Billing lead', systemRole: false }],
} as Entitlements
/** A custom role that may pay but cannot read the disconnection view (403 on the server). */
const PAYER_ONLY: Entitlements = {
  ...ADMIN,
  roles: [{ id: 'r-8', code: 'PAYER', name: 'Payer', systemRole: false }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
} as Entitlements

const DISCONNECTION = '/api/v1/settings/fawtir-disconnection'
const BILLING = '/api/v1/settings/billing'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const EXTRA_DOCUMENTS = '/api/v1/settings/plan/extra-documents'
const PAID_EXTRAS = '/api/v1/settings/plan/extras'

const REQUEST = {
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
}
const LEFT = {
  companyName: 'Real Trading LLC',
  connected: false,
  canRequest: false,
  canWithdraw: false,
  canReconnect: true,
  reconnection: null,
  request: REQUEST,
}
const CONNECTED = { ...LEFT, connected: true, canRequest: true, canReconnect: false, request: null }
const SWITCHED_OFF = { ...LEFT, canReconnect: false }
const OLD_SERVER: Record<string, unknown> = { ...LEFT }
delete OLD_SERVER.canReconnect
delete OLD_SERVER.reconnection
const BACK = {
  ...LEFT,
  canReconnect: false,
  reconnection: {
    status: 'CONNECTED',
    origin: 'CUSTOMER',
    requestedAt: '2026-10-15T06:00:00Z',
    acceptedAt: '2026-10-16T06:00:00Z',
    effectiveFrom: '2026-10-17T06:00:00Z',
    effectiveDue: true,
    connectedAt: '2026-10-17T06:00:00Z',
    smpAddedAt: null,
    notCompletedReason: null,
    closedAt: null,
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

function billing(bills: unknown[], over: Record<string, unknown> = {}) {
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
    ...over,
  }
}
const OPEN_BILL = billing([
  {
    bill: bill('000007'),
    payments: [],
    card: { available: true, purpose: 'SUBSCRIPTION', reason: null },
  },
])

const ALLOWANCE = {
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  resetsOn: '2026-11-01',
  planDocuments: 200,
  extraDocuments: 0,
  totalAllowance: 200,
  issued: 150,
  resubmissions: 0,
  received: 50,
  receivedHidden: 0,
  used: 200,
  planUsed: 200,
  extraUsed: 0,
  left: 0,
  warningPercent: 100,
  issuingAllowed: false,
  extrasExpireOn: '2026-10-31',
  byBranch: [],
}
const extraDocuments = (over: Record<string, unknown> = {}) => ({
  planCode: 'STARTER',
  offered: true,
  unitPrice: '0.150',
  minPerPurchase: 10,
  maxPerPurchase: 5000,
  expiresOn: '2026-10-31',
  allowance: ALLOWANCE,
  outstanding: null,
  credits: [],
  ...over,
})
const DOCUMENTS_BILL = bill('000042', { subtotal: '15.000', vatAmount: '0.750', total: '15.750' })
const DOCUMENTS_ORDER = {
  credit: {
    id: 'c-1',
    source: 'PURCHASE',
    status: 'PENDING',
    documents: 100,
    unitPrice: '0.150',
    netAmount: '15.000',
    billId: DOCUMENTS_BILL.id,
    startsOn: null,
    expiresOn: null,
    createdAt: '2026-10-11T08:00:00Z',
    activatedAt: null,
    cancelledAt: null,
  },
  bill: DOCUMENTS_BILL,
}

const kind = (over: Record<string, unknown> = {}) => ({
  included: 5,
  inUse: 5,
  paidPlacesNow: 0,
  capacity: 5,
  unitMonthlyPrice: '2.500',
  offered: true,
  ...over,
})
const paidExtras = (over: Record<string, unknown> = {}) => ({
  open: true,
  users: kind(),
  branches: kind({ included: 2, inUse: 2, capacity: 2, unitMonthlyPrice: '5.000' }),
  erpAddon: { offered: true, monthlyPrice: '20.000', status: null, endsOn: null },
  maxUsersPerOrder: 50,
  maxBranchesPerOrder: 20,
  outstanding: null,
  places: [],
  ...over,
})
const PLACES_BILL = bill('000057', { subtotal: '3.333', vatAmount: '0.167', total: '3.500' })
const place = (kindOf: string) => ({
  id: `pl-${kindOf}`,
  kind: kindOf,
  quantity: 1,
  source: 'PURCHASE',
  status: 'PENDING',
  unitPeriodPrice: '2.500',
  netAmount: '1.111',
  planCode: 'BUSINESS',
  billingCycle: 'MONTHLY',
  coversFrom: '2026-10-11',
  coversTo: '2026-10-31',
  billId: PLACES_BILL.id,
  reason: null,
  createdAt: '2026-10-11T08:00:00Z',
  activatedAt: null,
  cancelledAt: null,
})
const PLACES_ORDER = { places: [place('USER'), place('BRANCH')], bill: PLACES_BILL }

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
    [DISCONNECTION]: () => json(200, LEFT),
    [SUBSCRIPTION]: () => json(200, STATUS),
    [BILLING]: () => json(200, OPEN_BILL),
    [EXTRA_DOCUMENTS]: () => json(200, extraDocuments()),
    [PAID_EXTRAS]: () => json(200, paidExtras()),
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

const disconnectionReads = () => fetchMock.mock.calls.filter(([url]) => url === DISCONNECTION)

/** Let the disconnection read (or its absence) settle before asserting something is missing. */
async function settled() {
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/me/entitlements')).toBe(true),
  )
  if (me.permissions.includes('admin.settings.manage')) {
    await waitFor(() => expect(disconnectionReads().length).toBeGreaterThan(0))
  }
  await new Promise((resolve) => setTimeout(resolve, 30))
}

const NOT_HELD: [string, unknown][] = [
  ['a connected company', CONNECTED],
  ['reconnecting switched off', SWITCHED_OFF],
  ['a server without the fields', OLD_SERVER],
  ['a reconnection in effect', BACK],
]

const method = (name: string) =>
  screen.queryByRole('radio', { name: new RegExp(i18n.t(`billing.method.${name}.title`)) })

describe('A3.8 / LV-6: Bills and payment holds back paying once the company has left', () => {
  it('offers no bank transfer, cash or card on the open bill, and shows the note instead', async () => {
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(/Reconnect to Fawtir before paying/)).toBeTruthy()
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    await settled()
    expect(method('BANK_TRANSFER')).toBeNull()
    expect(method('CASH')).toBeNull()
    expect(method('CARD')).toBeNull()
    expect(screen.queryByText(i18n.t('billing.howToPay'))).toBeNull()
  })

  it.each(NOT_HELD)('offers every way to pay for %s', async (_, view) => {
    answers[DISCONNECTION] = () => json(200, view)
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('radio', {
        name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')),
      }),
    ).toBeTruthy()
    expect(method('CASH')).toBeTruthy()
    expect(method('CARD')).toBeTruthy()
    expect(screen.queryByText(/Reconnect to Fawtir before paying/)).toBeNull()
  })

  it('offers every way to pay when the view cannot be read', async () => {
    answers[DISCONNECTION] = () => json(500, { type: 'about:blank' })
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
    ).toBeTruthy()
  })

  it('prepares no next bill once the company has left, and does for a connected one', async () => {
    answers[BILLING] = () => json(200, billing([]))
    const { unmount } = renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(i18n.t('billing.nothingDue'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
    unmount()

    resetSharedRequests()
    answers[DISCONNECTION] = () => json(200, CONNECTED)
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByRole('button', { name: i18n.t('billing.prepare') })).toBeTruthy()
  })

  it('keeps a payment already sent, and its withdrawal, as they were', async () => {
    const sent = {
      id: 'p-1',
      billId: '000007',
      method: 'CASH',
      status: 'SUBMITTED',
      amount: '84.000',
      currency: 'OMR',
      reference: null,
      customerNote: null,
      submittedAt: '2026-10-18T06:00:00Z',
      rejectionReason: null,
    }
    answers[BILLING] = () =>
      json(
        200,
        billing([{ bill: bill('000007', { status: 'PENDING_VERIFICATION' }), payments: [sent] }]),
      )
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(i18n.t('billing.waiting.CASH.SUBMITTED'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('billing.withdraw') })).toBeTruthy()
  })
})

describe('A3.8 / LV-6: every role that can read the view, not only the danger zone', () => {
  it('holds paying back for a custom role, which is not shown the note', async () => {
    me = CUSTOM_PAYER
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    await settled()
    expect(method('CASH')).toBeNull()
    expect(screen.queryByText(/Reconnect to Fawtir before paying/)).toBeNull()
  })

  it('changes nothing for a role that cannot read the view, and asks nothing', async () => {
    me = PAYER_ONLY
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
    ).toBeTruthy()
    expect(disconnectionReads()).toHaveLength(0)
  })
})

describe('A3.8 / LV-6: Buy extra documents', () => {
  it('offers no order form once the company has left', async () => {
    renderAt('/settings/plan/extra-documents', <ExtraDocumentsPage />)
    expect(await screen.findByText(/Reconnect to Fawtir before paying/)).toBeTruthy()
    await settled()
    expect(screen.queryByText(i18n.t('extraDocuments.buy.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('extraDocuments.buy.submit') })).toBeNull()
  })

  it('offers neither paying for nor changing an order already placed', async () => {
    answers[EXTRA_DOCUMENTS] = () =>
      json(200, extraDocuments({ outstanding: DOCUMENTS_ORDER, credits: [DOCUMENTS_ORDER.credit] }))
    answers[BILLING] = () =>
      json(
        200,
        billing([
          {
            bill: DOCUMENTS_BILL,
            payments: [],
            card: { available: true, purpose: 'EXTRA_DOCUMENTS', reason: null },
          },
        ]),
      )
    renderAt('/settings/plan/extra-documents', <ExtraDocumentsPage />)
    expect(await screen.findByText('FWT-SUB-2026-000042')).toBeTruthy()
    await settled()
    expect(method('CASH')).toBeNull()
    expect(method('CARD')).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('extraDocuments.order.change') })).toBeNull()
  })

  it.each(NOT_HELD)('offers the order form, paying and changing for %s', async (_, view) => {
    answers[DISCONNECTION] = () => json(200, view)
    const { unmount } = renderAt('/settings/plan/extra-documents', <ExtraDocumentsPage />)
    expect(
      await screen.findByRole('button', { name: i18n.t('extraDocuments.buy.submit') }),
    ).toBeTruthy()
    unmount()

    resetSharedRequests()
    answers[EXTRA_DOCUMENTS] = () =>
      json(200, extraDocuments({ outstanding: DOCUMENTS_ORDER, credits: [DOCUMENTS_ORDER.credit] }))
    answers[BILLING] = () =>
      json(
        200,
        billing([
          {
            bill: DOCUMENTS_BILL,
            payments: [],
            card: { available: true, purpose: 'EXTRA_DOCUMENTS', reason: null },
          },
        ]),
      )
    renderAt('/settings/plan/extra-documents', <ExtraDocumentsPage />)
    expect(
      await screen.findByRole('button', { name: i18n.t('extraDocuments.order.change') }),
    ).toBeTruthy()
    expect(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
    ).toBeTruthy()
  })
})

describe('A3.8 / LV-6: Add users or branches', () => {
  it('offers no order form and no add-on once the company has left', async () => {
    renderAt('/settings/plan/extras', <PaidExtrasPage />)
    expect(await screen.findByText(/Reconnect to Fawtir before paying/)).toBeTruthy()
    expect(await screen.findByText(i18n.t('paidExtras.addon.title'))).toBeTruthy()
    await settled()
    expect(screen.queryByText(i18n.t('paidExtras.buy.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.buy.submit') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.addon.add') })).toBeNull()
  })

  it('offers neither paying for nor changing an order already placed', async () => {
    answers[PAID_EXTRAS] = () =>
      json(200, paidExtras({ outstanding: PLACES_ORDER, places: PLACES_ORDER.places }))
    answers[BILLING] = () =>
      json(
        200,
        billing([
          {
            bill: PLACES_BILL,
            payments: [],
            card: { available: true, purpose: 'PAID_EXTRAS', reason: null },
          },
        ]),
      )
    renderAt('/settings/plan/extras', <PaidExtrasPage />)
    expect(await screen.findByText('FWT-SUB-2026-000057')).toBeTruthy()
    await settled()
    expect(method('CASH')).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('paidExtras.order.change') })).toBeNull()
  })

  it.each(NOT_HELD)(
    'offers the order form, the add-on, paying and changing for %s',
    async (_, view) => {
      answers[DISCONNECTION] = () => json(200, view)
      const { unmount } = renderAt('/settings/plan/extras', <PaidExtrasPage />)
      expect(
        await screen.findByRole('button', { name: i18n.t('paidExtras.buy.submit') }),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: i18n.t('paidExtras.addon.add') })).toBeTruthy()
      unmount()

      resetSharedRequests()
      answers[PAID_EXTRAS] = () =>
        json(200, paidExtras({ outstanding: PLACES_ORDER, places: PLACES_ORDER.places }))
      answers[BILLING] = () =>
        json(
          200,
          billing([
            {
              bill: PLACES_BILL,
              payments: [],
              card: { available: true, purpose: 'PAID_EXTRAS', reason: null },
            },
          ]),
        )
      renderAt('/settings/plan/extras', <PaidExtrasPage />)
      expect(
        await screen.findByRole('button', { name: i18n.t('paidExtras.order.change') }),
      ).toBeTruthy()
      expect(
        await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
      ).toBeTruthy()
    },
  )
})

describe('A3.8 / LV-6: the dashboard bill card', () => {
  it('still names the open bill but does not send a company that has left to pay it', async () => {
    renderAt('/', <BillDueCard />)
    expect(await screen.findByText(i18n.t('billDue.title'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('link', { name: i18n.t('billDue.cta') })).toBeNull()
  })

  it.each(NOT_HELD)('sends %s to pay', async (_, view) => {
    answers[DISCONNECTION] = () => json(200, view)
    renderAt('/', <BillDueCard />)
    expect(await screen.findByRole('link', { name: i18n.t('billDue.cta') })).toBeTruthy()
  })
})

const LEFT_REFUSAL = () =>
  json(409, {
    type: 'https://api.fawtir.om/problems/disconnected-from-fawtir',
    title: 'disconnected-from-fawtir',
    status: 409,
    detail: 'English detail',
  })
const refusedNote = () => i18n.t('billing.refusal.disconnected-from-fawtir')

describe('D20 (a): a role that may pay but cannot read the view learns it from the refusal', () => {
  it('says why after the server refuses cash, and holds every way to pay back from then on', async () => {
    me = PAYER_ONLY
    answers[`POST ${BILLING}/bills/000007/cash-request`] = LEFT_REFUSAL
    const user = userEvent.setup({ delay: null })
    const { unmount } = renderAt('/settings/bills', <BillingPage />)
    await user.click(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
    )
    await user.click(screen.getByRole('button', { name: i18n.t('billing.cash.submit') }))
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(method('CASH')).toBeNull()
    expect(method('BANK_TRANSFER')).toBeNull()
    expect(screen.queryByText(i18n.t('fawtirReconnection.beforePaying.note'))).toBeNull()
    expect(disconnectionReads()).toHaveLength(0)
    unmount()

    // The rest of the session: buying extra documents is held back too, with the same words.
    resetSharedRequests()
    renderAt('/settings/plan/extra-documents', <ExtraDocumentsPage />)
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('extraDocuments.buy.submit') })).toBeNull()
  })

  it('says why after the server refuses a card checkout', async () => {
    me = PAYER_ONLY
    answers[`POST ${BILLING}/bills/000007/card-checkout`] = LEFT_REFUSAL
    const user = userEvent.setup({ delay: null })
    renderAt('/settings/bills', <BillingPage />)
    await user.click(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CARD.title')) }),
    )
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(method('CARD')).toBeNull()
  })

  it('says why after the server refuses preparing the next bill, once', async () => {
    me = PAYER_ONLY
    answers[BILLING] = () => json(200, billing([]))
    answers[`POST ${BILLING}/bills/next`] = LEFT_REFUSAL
    const user = userEvent.setup({ delay: null })
    renderAt('/settings/bills', <BillingPage />)
    await user.click(await screen.findByRole('button', { name: i18n.t('billing.prepare') }))
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(screen.getAllByText(refusedNote())).toHaveLength(1)
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
  })

  it('shows no such words to anyone the server has not refused', async () => {
    me = PAYER_ONLY
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }),
    ).toBeTruthy()
    expect(screen.queryByText(refusedNote())).toBeNull()
  })

  it('has the words in English and Arabic, with no em dash', () => {
    const english = i18n.getFixedT('en')('billing.refusal.disconnected-from-fawtir')
    const arabic = i18n.getFixedT('ar')('billing.refusal.disconnected-from-fawtir')
    expect(english).toMatch(/left Fawtir/)
    expect(arabic).toMatch(/فوتر/)
    expect(arabic).not.toBe(english)
    expect(english + arabic).not.toMatch(/\u2014/)
  })
})

describe('D20 (a): fawtirConnection on Settings > Billing tells every role up front', () => {
  const leftOnBilling = (left: boolean) => {
    answers[BILLING] = () => json(200, { ...OPEN_BILL, fawtirConnection: { leftFawtir: left } })
  }
  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET')

  it('holds every way to pay back for a custom payer before any attempt, and says why', async () => {
    me = PAYER_ONLY
    leftOnBilling(true)
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    await settled()
    expect(method('BANK_TRANSFER')).toBeNull()
    expect(method('CASH')).toBeNull()
    expect(method('CARD')).toBeNull()
    expect(screen.queryByText(i18n.t('fawtirReconnection.beforePaying.note'))).toBeNull()
    expect(disconnectionReads()).toHaveLength(0)
    expect(posts()).toHaveLength(0)
    expect(fetchMock.mock.calls.filter(([url]) => url === BILLING)).toHaveLength(1)
  })

  it('prepares no next bill for a custom payer once the server says the company has left', async () => {
    me = PAYER_ONLY
    answers[BILLING] = () => json(200, billing([], { fawtirConnection: { leftFawtir: true } }))
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    await settled()
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
  })

  it('holds buying extra documents and the dashboard link back for a custom payer too', async () => {
    me = PAYER_ONLY
    leftOnBilling(true)
    const { unmount } = renderAt('/settings/plan/extra-documents', <ExtraDocumentsPage />)
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(
      screen.queryByRole('button', {
        name: i18n.t('extraDocuments.buy.submit'),
      }),
    ).toBeNull()
    unmount()

    resetSharedRequests()
    renderAt('/', <BillDueCard />)
    expect(await screen.findByText(i18n.t('billDue.title'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('link', { name: i18n.t('billDue.cta') })).toBeNull()
  })

  it('offers every way to pay when the server says the company has not left', async () => {
    me = PAYER_ONLY
    leftOnBilling(false)
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('radio', {
        name: new RegExp(i18n.t('billing.method.CASH.title')),
      }),
    ).toBeTruthy()
    expect(method('CARD')).toBeTruthy()
    expect(screen.queryByText(refusedNote())).toBeNull()
  })

  it('without the field (an older server) offers paying until the refusal, as before', async () => {
    me = PAYER_ONLY
    answers[`POST ${BILLING}/bills/000007/cash-request`] = LEFT_REFUSAL
    const user = userEvent.setup({ delay: null })
    renderAt('/settings/bills', <BillingPage />)
    await user.click(
      await screen.findByRole('radio', {
        name: new RegExp(i18n.t('billing.method.CASH.title')),
      }),
    )
    expect(screen.queryByText(refusedNote())).toBeNull()
    await user.click(screen.getByRole('button', { name: i18n.t('billing.cash.submit') }))
    expect(await screen.findByText(refusedNote())).toBeTruthy()
    expect(method('CASH')).toBeNull()
  })
})

describe('D20 (b): a card checkout already opened is not continued once the company has left', () => {
  const HOSTED = 'https://oman.paymob.com/unifiedcheckout/?publicKey=pk_test&clientSecret=cs_test'
  const live = {
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
  const ready = {
    paymentId: 'p-1',
    billId: '000007',
    status: 'READY',
    checkoutUrl: HOSTED,
    expiresAt: '2099-10-18T06:30:00Z',
    amount: '84.000',
    currency: 'OMR',
  }

  beforeEach(() => {
    vi.spyOn(hostedCheckout, 'open').mockImplementation(() => {})
    answers[BILLING] = () =>
      json(
        200,
        billing([{ bill: bill('000007', { status: 'PENDING_VERIFICATION' }), payments: [live] }]),
      )
    answers[`${BILLING}/payments/p-1/card-checkout`] = () => json(200, ready)
  })

  it('offers no Continue once the company has left, but still checks the status', async () => {
    renderAt('/settings/bills', <BillingPage />)
    expect(await screen.findByText(i18n.t('billing.card.status.READY'))).toBeTruthy()
    await settled()
    expect(screen.queryByRole('button', { name: i18n.t('billing.card.continue') })).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('billing.card.checkAgain') })).toBeTruthy()
  })

  it.each(NOT_HELD)('offers Continue for %s', async (_, view) => {
    answers[DISCONNECTION] = () => json(200, view)
    renderAt('/settings/bills', <BillingPage />)
    expect(
      await screen.findByRole('button', { name: i18n.t('billing.card.continue') }),
    ).toBeTruthy()
  })
})
