import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { resetSharedRequests } from '../../api'
import { resetLeftFawtirRefusal } from '../../lib/leftFawtirRefusal'
import { PlanPage } from './PlanPage'

/**
 * US-4 and BR-5 under PC-7 (owner, 23 Oct 2026): a whole period of a cheaper plan with a
 * billing-cycle change, bought while unpaid, when the company has more users or branches than it
 * includes. The preview says `choosesSwitchOff`; before confirming the customer keeps each one as
 * a paid extra or switches it off as the period starts. Every tick and total is the server's for
 * the choice sent, and the request carries the same choice. With no choice the default applies.
 */
const MANAGER: Entitlements = {
  userId: 'u-owner',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage', 'admin.users.manage', 'branch.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PUBLIC_PLANS = '/api/v1/public/plans'
const CHANGES = '/api/v1/settings/plan/changes'
const PREVIEW = `${CHANGES}/preview`
const REQUEST = `POST ${CHANGES}`
const PEOPLE = '/api/v1/users'
const BRANCHES = '/api/v1/branches/overview'

const STATUS = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: false,
  today: '2026-10-11',
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodPrice: '80.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-10-31',
  renewsOn: '2026-11-01',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
  enterprise: null,
}

const OVERVIEW = {
  plan: {
    code: 'BUSINESS',
    name: 'Business',
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    branchesIncluded: 3,
    monthlyPrice: '80.000',
  },
  usage: {
    period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-11' },
    used: 12,
    resubmissions: 0,
    quota: 1000,
    raisedToday: 0,
  },
  activePeople: 4,
  openInvitations: 0,
  activeBranches: 3,
}

const catalogued = (code: string, nameEn: string, monthlyPrice: string, sortOrder: number) => ({
  code,
  nameEn,
  nameAr: null,
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  priceVersionId: `v-${code}`,
  monthlyPrice,
  annualPrice: '0.000',
  annualFreeMonths: 2,
  invoicesPerMonth: 1000,
  peopleIncluded: 2,
  extraPersonPrice: null,
  branchesIncluded: 1,
  extraBranchPrice: null,
  overagePricePerInvoice: null,
  apiAccess: false,
  prioritySupport: false,
  recommended: false,
  trialDays: 14,
  trialDocuments: null,
  features: [],
  sortOrder,
})
const CATALOGUE = [
  catalogued('STARTER', 'Starter', '35.000', 1),
  catalogued('BUSINESS', 'Business', '80.000', 2),
]

const person = (id: string, firstName: string, roles: string[], owner = false) => ({
  id,
  username: id,
  email: `${id}@example.om`,
  firstName,
  lastName: null,
  enabled: true,
  mfaEnabled: false,
  roles,
  createdAt: '2026-08-01T00:00:00Z',
  locked: false,
  lockedUntil: null,
  owner,
})
const PEOPLE_PAGE = {
  content: [
    person('u-owner', 'Yusuf', ['ADMIN'], true),
    person('u-admin', 'Huda', ['ADMIN']),
    person('u-sara', 'Sara', ['ACCOUNTANT']),
    person('u-omar', 'Omar', ['ACCOUNTANT']),
  ],
  totalElements: 4,
  totalPages: 1,
  number: 0,
  size: 100,
}

const branch = (id: string, name: string, headBranch: boolean) => ({
  id,
  code: id,
  name,
  headOffice: headBranch,
  active: true,
  closedOn: null,
  invoicePrefix: null,
  nextNumber: null,
  invoicesThisMonth: 0,
  invoicedThisMonth: 0,
  people: 0,
  devices: 0,
  headBranch,
  nameAr: null,
})
const BRANCH_OVERVIEW = {
  openCount: 2,
  everCount: 2,
  peopleAcross: 4,
  invoicesThisMonth: 0,
  branches: [branch('b-head', 'Muscat Head Branch', true), branch('b-sohar', 'Sohar', false)],
}

const side = (planCode: string, planName: string, cycle: string, periodPrice: string) => ({
  planCode,
  planName,
  planVersionId: `pv-${planCode}`,
  cycle,
  periodPrice,
})

/**
 * Four active users on a plan of two: two above it. The server's default switches off the two
 * most recently added (Sara, Omar); with a choice it switches off those named and bills the rest as
 * extras. Totals are odd on purpose, so only the server's figure can be on screen.
 */
function quote(userIds: string[] | null, branchIds: string[] | null) {
  const usersOff = userIds ?? ['u-sara', 'u-omar']
  const branchesOff = branchIds ?? ['b-sohar']
  const extraUsers = 2 - usersOff.length
  const extraBranches = 1 - branchesOff.length
  const extras = [
    ...(extraUsers > 0
      ? [
          {
            type: 'USER',
            count: extraUsers,
            annualUnitPrice: '101.000',
            credit: '0.000',
            amount: (101 * extraUsers).toFixed(3),
            coversFrom: '2026-10-11',
            coversTo: '2027-10-10',
          },
        ]
      : []),
    ...(extraBranches > 0
      ? [
          {
            type: 'BRANCH',
            count: extraBranches,
            annualUnitPrice: '77.000',
            credit: '0.000',
            amount: '77.000',
            coversFrom: '2026-10-11',
            coversTo: '2027-10-10',
          },
        ]
      : []),
  ]
  const subtotal = 350 + 101 * extraUsers + 77 * extraBranches
  const total = (subtotal * 1.05).toFixed(3)
  return {
    kind: 'READ_ONLY_UPGRADE',
    applies: 'AT_ONCE_WHEN_PAID',
    effectiveOn: '2026-10-11',
    from: side('BUSINESS', 'Business', 'MONTHLY', '80.000'),
    to: side('STARTER', 'Starter', 'ANNUAL', '350.000'),
    charge: {
      windowStartsOn: '2026-10-11',
      windowEndsOn: '2027-10-10',
      daysLeft: 365,
      includesToday: true,
      periods: [
        {
          startsOn: '2026-10-11',
          endsOn: '2027-10-10',
          totalDays: 365,
          remainingDays: 365,
          fromPrice: '0.000',
          toPrice: '350.000',
          amount: '350.000',
        },
      ],
      credit: '0.000',
      extras,
      subtotal: subtotal.toFixed(3),
      vatRate: '0.05000',
      vatAmount: (Number(total) - subtotal).toFixed(3),
      total,
      currency: 'OMR',
      newPaidThrough: '2027-10-10',
    },
    cycleChangeOn: null,
    subscriptionDate: 11,
    allowance: { now: 1000, used: 12, afterChange: 1000 },
    lostFeatures: [],
    erpAddonStops: false,
    users: { included: 2, inUse: 4, overBy: 2, defaultSwitchOff: usersOff.slice(0, 2) },
    branches: { included: 1, inUse: 2, overBy: 1, defaultSwitchOff: branchesOff.slice(0, 1) },
    blockers: [],
    periodStartsOn: '2026-10-11',
    endsReadOnly: true,
    replacesRenewalBill: 'FWT-SUB-2026-000050',
    choosesSwitchOff: true,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

/** A query list as the server reads it: absent is null, an empty value an empty list. */
function ids(query: URLSearchParams, name: string): string[] | null {
  const value = query.get(name)
  if (value === null) return null
  return value === '' ? [] : value.split(',')
}

let answers: Record<string, (url: string, init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  resetLeftFawtirRefusal()
  forgetEntitlements()
  forgetSubscriptionStanding()
  answers = {
    [PLAN]: () => json(200, OVERVIEW),
    [SUBSCRIPTION]: () => json(200, STATUS),
    [PUBLIC_PLANS]: () => json(200, CATALOGUE),
    [CHANGES]: () => json(200, { available: true, pending: null, history: [] }),
    [PREVIEW]: (url) => {
      const query = new URL(url, 'http://x').searchParams
      return json(200, quote(ids(query, 'switchOffUserIds'), ids(query, 'switchOffBranchIds')))
    },
    [REQUEST]: () =>
      json(201, { id: 'pc-1', kind: 'READ_ONLY_UPGRADE', status: 'PENDING_PAYMENT' }),
    [PEOPLE]: () => json(200, PEOPLE_PAGE),
    [BRANCHES]: () => json(200, BRANCH_OVERVIEW),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
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
    <MemoryRouter initialEntries={['/settings/plan']}>
      <Routes>
        <Route path="/settings/plan" element={<PlanPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function calls(key: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const method = (init as RequestInit | undefined)?.method ?? 'GET'
    const path = String(url).split('?')[0]
    return (method === 'GET' ? path : `${method} ${path}`) === key
  })
}

const previewQueries = () =>
  calls(PREVIEW).map(([url]) => new URL(String(url), 'http://x').searchParams)

async function openDialog() {
  const user = userEvent.setup({ delay: null })
  renderPage()
  await user.click(
    await screen.findByRole('button', { name: i18n.t('planChange.moveTo', { plan: 'Starter' }) }),
  )
  const box = within(await screen.findByRole('dialog'))
  await box.findByRole('checkbox', {
    name: i18n.t('subscription.switchOff.chooseUser', { name: 'Sara' }),
  })
  return { user, box }
}

const userBox = (box: ReturnType<typeof within>, name: string) =>
  box.queryByRole('checkbox', { name: i18n.t('subscription.switchOff.chooseUser', { name }) })
const branchBox = (box: ReturnType<typeof within>, name: string) =>
  box.queryByRole('checkbox', { name: i18n.t('subscription.switchOff.chooseBranch', { name }) })

describe('Plan changes: who switches off with a smaller plan bought while unpaid (US-4, BR-5, PC-7)', () => {
  it("shows the server's default as ticks, never offers the owner, an administrator or the Head Branch, and says the default applies", async () => {
    const { box } = await openDialog()
    expect((userBox(box, 'Sara') as HTMLInputElement).checked).toBe(true)
    expect((userBox(box, 'Omar') as HTMLInputElement).checked).toBe(true)
    expect(userBox(box, 'Yusuf')).toBeNull()
    expect(userBox(box, 'Huda')).toBeNull()
    expect(box.getByText(i18n.t('subscription.switchOff.kept.OWNER'))).toBeTruthy()
    expect(box.getByText(i18n.t('subscription.switchOff.kept.ADMINISTRATOR'))).toBeTruthy()
    expect((branchBox(box, 'Sohar') as HTMLInputElement).checked).toBe(true)
    expect(branchBox(box, 'Muscat Head Branch')).toBeNull()
    expect(box.getByText(i18n.t('subscription.switchOff.kept.HEAD_BRANCH'))).toBeTruthy()
    expect(box.getByText(i18n.t('planChange.switchOff.defaultApplies'))).toBeTruthy()
    // The first preview asks for the default: no choice sent.
    expect(previewQueries()[0].has('switchOffUserIds')).toBe(false)
    expect(previewQueries()[0].has('switchOffBranchIds')).toBe(false)
  })

  it('keeping a user asks the server again and shows its total with the extra, then confirms that choice', async () => {
    const { user, box } = await openDialog()
    // Default: nobody kept, 350.000 + 5% VAT.
    expect((await box.findAllByText('367.500')).length).toBeGreaterThan(0)
    await user.click(userBox(box, 'Omar')!)
    await waitFor(() => expect(previewQueries().length).toBe(2))
    expect(ids(previewQueries()[1], 'switchOffUserIds')).toEqual(['u-sara'])
    expect(previewQueries()[1].has('switchOffBranchIds')).toBe(false)
    // The server's figure for one extra user: (350 + 101) × 1.05.
    expect((await box.findAllByText('473.550')).length).toBeGreaterThan(0)
    expect((userBox(box, 'Omar') as HTMLInputElement).checked).toBe(false)
    expect(box.queryByText(i18n.t('planChange.switchOff.defaultApplies'))).toBeNull()
    expect(
      box.getByRole('button', { name: i18n.t('subscription.switchOff.useDefault') }),
    ).toBeTruthy()

    const confirm = box.getByRole('button', {
      name: i18n.t('planChange.dialog.confirm.READ_ONLY_UPGRADE'),
    })
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false))
    await user.click(confirm)
    await waitFor(() => expect(calls(REQUEST)).toHaveLength(1))
    const body = JSON.parse(String((calls(REQUEST)[0][1] as RequestInit).body))
    expect(body).toMatchObject({ expectedTotal: '473.550', switchOffUserIds: ['u-sara'] })
    expect(body).not.toHaveProperty('switchOffBranchIds')
  })

  it('keeping every one sends an empty list, not nothing, and clearing goes back to the default', async () => {
    const { user, box } = await openDialog()
    await user.click(branchBox(box, 'Sohar')!)
    await waitFor(() => expect(previewQueries().length).toBe(2))
    expect(ids(previewQueries()[1], 'switchOffBranchIds')).toEqual([])
    expect((await box.findAllByText('448.350')).length).toBeGreaterThan(0)
    await user.click(box.getByRole('button', { name: i18n.t('subscription.switchOff.useDefault') }))
    await waitFor(() => expect(previewQueries().length).toBe(3))
    expect(previewQueries()[2].has('switchOffBranchIds')).toBe(false)
    expect(await box.findByText(i18n.t('planChange.switchOff.defaultApplies'))).toBeTruthy()
  })

  it('confirms the default with no ids at all', async () => {
    const { user, box } = await openDialog()
    await user.click(
      box.getByRole('button', { name: i18n.t('planChange.dialog.confirm.READ_ONLY_UPGRADE') }),
    )
    await waitFor(() => expect(calls(REQUEST)).toHaveLength(1))
    const body = JSON.parse(String((calls(REQUEST)[0][1] as RequestInit).body))
    expect(body).not.toHaveProperty('switchOffUserIds')
    expect(body).not.toHaveProperty('switchOffBranchIds')
  })

  it('says why a refused choice cannot be used and holds the confirm until the server quotes again', async () => {
    const { user, box } = await openDialog()
    answers[PREVIEW] = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/downgrade-choice-not-allowed',
        title: 'x',
        status: 409,
        detail: 'English detail',
      })
    await user.click(userBox(box, 'Sara')!)
    expect(
      await box.findByText(i18n.t('planChange.refusal.downgrade-choice-not-allowed')),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/English detail/)
    const confirm = box.getByRole('button', {
      name: i18n.t('planChange.dialog.confirm.READ_ONLY_UPGRADE'),
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
  })

  it('has every sentence in Arabic, with no raw key', async () => {
    await i18n.changeLanguage('ar')
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: i18n.t('planChange.moveTo', { plan: 'Starter' }) }),
    )
    const box = within(await screen.findByRole('dialog'))
    expect(await box.findByText(i18n.t('planChange.switchOff.defaultApplies'))).toBeTruthy()
    expect(document.body.textContent ?? '').not.toMatch(/planChange\.|subscription\.|billing\./)
  })
})

describe('Plan changes: a server without the switch-off choice', () => {
  it('shows who goes by default as before and sends no ids', async () => {
    const user = userEvent.setup({ delay: null })
    answers[PREVIEW] = () => json(200, { ...quote(null, null), choosesSwitchOff: undefined })
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: i18n.t('planChange.moveTo', { plan: 'Starter' }) }),
    )
    const box = within(await screen.findByRole('dialog'))
    expect(await box.findByText(i18n.t('planChange.loss.chooseLater'))).toBeTruthy()
    expect(box.queryAllByRole('checkbox')).toHaveLength(0)
    await user.click(
      box.getByRole('button', { name: i18n.t('planChange.dialog.confirm.READ_ONLY_UPGRADE') }),
    )
    await waitFor(() => expect(calls(REQUEST)).toHaveLength(1))
    const body = JSON.parse(String((calls(REQUEST)[0][1] as RequestInit).body))
    expect(body).not.toHaveProperty('switchOffUserIds')
    expect(previewQueries().every((query) => !query.has('switchOffUserIds'))).toBe(true)
  })
})
