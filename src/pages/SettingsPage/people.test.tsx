import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { TeamPage } from './TeamPage'
import { SigningInPage } from './SigningInPage'
import { RolesPage } from './RolesPage'
import { InvitePage } from './InvitePage'
import { PlanPage } from './PlanPage'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.users.manage', 'role.list', 'tenant.plan.read'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const NO_PEOPLE: Entitlements = { ...ADMIN, permissions: ['tenant.plan.read'] } as Entitlements

const PEOPLE = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const INVITED = '/api/v1/users/invitations?status=PENDING&page=0&size=50'
const ROLES = '/api/v1/roles'
const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PUBLIC_PLANS = '/api/v1/public/plans'
const NOT_TRACKED = {
  tracked: false, access: 'NOT_TRACKED', restrictionsEnforced: false, today: '2026-10-08', planCode: 'STARTER',
  planName: 'Starter', billingCycle: null, periodPrice: '35.000', trialStartsOn: null, trialEndsOn: null,
  trialDay: null, trialDaysLeft: null, paidThrough: null, renewsOn: null, graceDays: 7, graceUntil: null,
  autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null, cancelAtPeriodEnd: false,
  accessEndsOn: null, scheduledChange: null,
}

const USERS = {
  content: [
    {
      id: 'p-1', username: 'owner', email: 'owner@real.example', firstName: 'Mona', lastName: 'Rashid',
      enabled: true, mfaEnabled: true, roles: ['ADMIN'], createdAt: '2026-10-01T08:00:00Z',
      locked: false, lockedUntil: null,
    },
    {
      id: 'p-2', username: 'clerk', email: 'clerk@real.example', firstName: null, lastName: null,
      enabled: true, mfaEnabled: false, roles: ['ACCOUNTANT'], createdAt: '2026-10-02T08:00:00Z',
      locked: true, lockedUntil: null,
    },
  ],
  totalElements: 2, totalPages: 1, number: 0, size: 100,
}

const ROLE_LIST = [
  { id: 'r-1', code: 'ADMIN', name: 'Administrator', description: null, enabled: true, systemRole: true,
    permissionCodes: ['admin.users.manage', 'invoice.read'] },
  { id: 'r-2', code: 'ACCOUNTANT', name: 'Accountant', description: 'Reads the books', enabled: true,
    systemRole: false, permissionCodes: ['invoice.read'] },
]

const PLAN_OVERVIEW = {
  plan: { code: 'STARTER', name: 'Starter', invoicesPerMonth: 300, peopleIncluded: 3, branchesIncluded: null },
  usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-08' }, used: 42, resubmissions: 1, quota: 300, raisedToday: 5 },
  activePeople: 2,
  openInvitations: 1,
  activeBranches: 1,
}

const catalogued = (code: string, nameEn: string, monthlyPrice: string, invoicesPerMonth: number, sortOrder: number) => ({
  code, nameEn, nameAr: null, descriptionEn: null, descriptionAr: null, currency: 'OMR',
  priceVersionId: `v-${code}`, monthlyPrice, annualPrice: '0.000', annualFreeMonths: 2, invoicesPerMonth,
  peopleIncluded: 3, extraPersonPrice: null, branchesIncluded: null, extraBranchPrice: null,
  overagePricePerInvoice: null, apiAccess: false, prioritySupport: false, recommended: false,
  trialDays: 14, trialDocuments: null, features: [], sortOrder,
})
const CATALOGUE = [catalogued('STARTER', 'Starter', '35.000', 300, 1), catalogued('BUSINESS', 'Business', '80.000', 800, 2)]

/** What the settings shell (sidebar and account card) reads on every page, whatever the page. */
const SHELL_READS = [
  'GET /api/v1/me/entitlements',
  'GET /api/v1/settings/plan',
  'GET /api/v1/branches/overview',
  'GET /api/v1/reference-data',
]
const isShellRead = (line: string) =>
  SHELL_READS.includes(line) || line.startsWith('GET /api/v1/compliance/activity/summary?')

/** Every request the page itself sent, as "METHOD url", leaving out the shell's own reads. */
function requests(): string[] {
  return fetchMock.mock.calls
    .map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`)
    .filter((line) => !isShellRead(line))
}

/**
 * The same, leaving out the subscription too: the read-only line above every screen reads it for
 * anyone who may (ST-2). For pages that do not read it themselves.
 */
function pageRequests(): string[] {
  return requests().filter((line) => line !== `GET ${SUBSCRIPTION}`)
}

const NOT_AVAILABLE = 'Not available yet'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  who = ADMIN
  answers = {
    [PEOPLE]: () => json(200, USERS),
    [INVITED]: () =>
      json(200, [{ id: 'i-1', email: 'new@real.example', roleCodes: ['ACCOUNTANT'], status: 'PENDING',
        expiresAt: '2026-10-15T00:00:00Z', sentCount: 1, lastSentAt: null, createdAt: '2026-10-08T00:00:00Z' }]),
    [ROLES]: () => json(200, ROLE_LIST),
    [PLAN]: () => json(200, PLAN_OVERVIEW),
    [SUBSCRIPTION]: () => json(200, NOT_TRACKED),
    [PUBLIC_PLANS]: () => json(200, CATALOGUE),
  }
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    const answer = answers[url]
    return answer ? answer() : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/team" element={<TeamPage />} />
        <Route path="/settings/team/invite" element={<InvitePage />} />
        <Route path="/settings/signing-in" element={<SigningInPage />} />
        <Route path="/settings/roles" element={<RolesPage />} />
        <Route path="/settings/plan" element={<PlanPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const SAMPLE_NAMES = /Al Bahja|albahja|Hafidh|Aisha|Nizwa|Sohar/

describe('Team members', () => {
  it("lists the company's own people and waiting invitations, with role names, and no sample staff", async () => {
    renderAt('/settings/team')
    const row = (await screen.findByText('Mona Rashid')).closest('tr')!
    expect(within(row).getByText('owner@real.example')).toBeTruthy()
    expect(within(row).getByText('Administrator')).toBeTruthy()
    expect(within(row).getByText('Set up')).toBeTruthy()
    const clerk = screen.getByText('clerk@real.example').closest('tr')!
    expect(within(clerk).getByText('Locked')).toBeTruthy()
    expect(within(clerk).getByText('Not set up')).toBeTruthy()
    // The invitations waiting are the design's "Waiting to accept" tab.
    fireEvent.click(await screen.findByRole('button', { name: /Waiting to accept/ }))
    expect(await screen.findByText('new@real.example')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(SAMPLE_NAMES)
  })

  it('draws the four figures and the tabs from the lists, and the rest as not available yet', async () => {
    renderAt('/settings/team')
    await screen.findByText('Mona Rashid')
    const figure = (label: string) =>
      screen.getAllByRole('heading', { name: label }).find((h) => h.closest('article'))!.closest('article')!
    expect(within(figure('With a login')).getByText('2')).toBeTruthy()
    expect(await within(figure('With a login')).findByText('1 invitation waiting')).toBeTruthy()
    expect(within(figure('Two-step sign-in')).getByText('1')).toBeTruthy()
    expect(within(figure('Signed in this week')).getByText(NOT_AVAILABLE)).toBeTruthy()
    expect(within(figure('Extra people cost')).getByText(NOT_AVAILABLE)).toBeTruthy()
    // Sign-in history is drawn as a column, one "not available yet" per person.
    expect(screen.getByRole('columnheader', { name: 'Last signed in' })).toBeTruthy()
    expect(within(screen.getByText('Mona Rashid').closest('tr')!).getByText(NOT_AVAILABLE)).toBeTruthy()
    // The tabs the lists cannot answer are drawn, and cannot be chosen.
    expect((screen.getByRole('button', { name: /Not signed in lately/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Removed/ }) as HTMLButtonElement).disabled).toBe(true)
    // "Without two-step" leaves only the person with no authenticator app.
    fireEvent.click(screen.getByRole('button', { name: /Without two-step/ }))
    expect(screen.queryByText('Mona Rashid')).toBeNull()
    expect(screen.getByText('clerk@real.example')).toBeTruthy()
    // The branches column names branches from the picker's list (BA-1).
    expect(new Set(pageRequests())).toEqual(
      new Set([`GET ${PEOPLE}`, `GET ${INVITED}`, `GET ${ROLES}`, 'GET /api/v1/branches']),
    )
  })

  it('says no access without admin.users.manage, and asks for nobody', async () => {
    who = NO_PEOPLE
    renderAt('/settings/team')
    expect(await screen.findByText(i18n.t('appAccess.missingPermission'))).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === PEOPLE)).toBe(false)
  })

  it('offers a retry when the list fails, rather than an empty team', async () => {
    answers[PEOPLE] = () => json(500, { type: 'about:blank', title: 'boom' })
    renderAt('/settings/team')
    expect(await screen.findByRole('button', { name: i18n.t('appAccess.retry') })).toBeTruthy()
    expect(screen.queryByText(i18n.t('people.team.empty'))).toBeNull()
  })
})

describe('Signing in', () => {
  it('counts authenticator apps from the real list and draws the policy switches disabled, saving nothing', async () => {
    renderAt('/settings/signing-in')
    expect(await screen.findByText('1 of 2 people has an authenticator app set up.')).toBeTruthy()
    // The design's switches are drawn but cannot be used: no policy endpoint stands behind them.
    const requireAll = screen.getByRole('switch', { name: i18n.t('signingIn.requireEveryone') }) as HTMLButtonElement
    expect(requireAll.disabled).toBe(true)
    expect(requireAll.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/1 of your 2 would be prompted/)).toBeTruthy()
    expect(screen.getByText(i18n.t('signingIn.sessions'))).toBeTruthy()
    expect(screen.getAllByText(NOT_AVAILABLE).length).toBeGreaterThanOrEqual(3)
    fireEvent.click(requireAll)
    expect(screen.queryByRole('button', { name: i18n.t('signingIn.save') })).toBeNull()
    expect(new Set(pageRequests())).toEqual(new Set([`GET ${PEOPLE}`, `GET ${ROLES}`]))
  })
})

describe('Roles', () => {
  it("lists the server's roles with their permissions and how many people hold each", async () => {
    renderAt('/settings/roles')
    const accountant = (await screen.findByRole('heading', { name: 'Accountant' })).closest('section')!
    expect(within(accountant).getByText('Reads the books')).toBeTruthy()
    expect(within(accountant).getByText('1 person')).toBeTruthy()
    expect(within(accountant).getByText('1 permission')).toBeTruthy()
    expect(screen.queryByText(/wholesale/i)).toBeNull()
  })

  it('names permissions in words, never as raw codes, and fills the matrix from the roles', async () => {
    renderAt('/settings/roles')
    const accountant = (await screen.findByRole('heading', { name: 'Accountant' })).closest('section')!
    expect(within(accountant).getByText('Invoices: See')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/invoice\.read|admin\.users\.manage/)
    // The matrix: one row per code any role holds, a mark per role.
    expect(screen.getByRole('img', { name: 'Invoices: See, Accountant: Can do it' })).toBeTruthy()
    expect(screen.getByRole('img', { name: "People: Manage, Accountant: Can't" })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'People: Manage, Administrator: Can do it' })).toBeTruthy()
    // Export is drawn, disabled; "Make a role" needs admin.roles.manage.
    expect((screen.getByRole('button', { name: /Export this as a PDF/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('link', { name: /Make a role/ })).toBeNull()
    expect(requests().every((line) => line.startsWith('GET '))).toBe(true)
  })

  it('offers "Make a role" to those who may manage roles', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'admin.roles.manage'] } as Entitlements
    renderAt('/settings/roles')
    const link = await screen.findByRole('link', { name: /Make a role/ })
    expect(link.getAttribute('href')).toBe('/settings/roles/new')
  })
})

describe('Invite someone', () => {
  it('starts empty and sends only the email and chosen role codes', async () => {
    let sent: unknown = null
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, who)
      if (url === '/api/v1/users/invitations' && init?.method === 'POST') {
        sent = JSON.parse(String(init.body))
        return json(201, { id: 'i-9', email: 'x@real.example', roleCodes: ['ACCOUNTANT'], status: 'PENDING',
          expiresAt: '2026-10-15T00:00:00Z', sentCount: 1, lastSentAt: null, createdAt: '2026-10-08T00:00:00Z' })
      }
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    })
    renderAt('/settings/team/invite')
    const email = (await screen.findByRole('textbox', { name: /Email/ })) as HTMLInputElement
    expect(email.value).toBe('')
    fireEvent.change(email, { target: { value: 'x@real.example' } })
    // One role per person (RL-1): a single choice.
    fireEvent.click(await screen.findByRole('radio', { name: /Accountant/ }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText('Invitation sent to x@real.example.')).toBeTruthy()
    expect(sent).toEqual({ email: 'x@real.example', roleCodes: ['ACCOUNTANT'] })
    expect(document.body.textContent).not.toMatch(SAMPLE_NAMES)
  })

  it('draws the name, note and two-step ask as not available yet, and sends none of them', async () => {
    let sent: unknown = null
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, who)
      if (url === '/api/v1/users/invitations' && init?.method === 'POST') {
        sent = JSON.parse(String(init.body))
        return json(201, { id: 'i-9', email: 'y@real.example', roleCodes: [], status: 'PENDING',
          expiresAt: '2026-10-15T00:00:00Z', sentCount: 1, lastSentAt: null, createdAt: '2026-10-08T00:00:00Z' })
      }
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    })
    renderAt('/settings/team/invite')
    const name = (await screen.findByRole('textbox', { name: 'Name' })) as HTMLInputElement
    expect(name.disabled).toBe(true)
    expect((screen.getByRole('textbox', { name: /Add a note/ }) as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('switch', { name: i18n.t('invite.askTwoStep') }) as HTMLButtonElement).disabled).toBe(true)
    // The branches are chosen now (BA-1); with none to offer the panel says so and sends none.
    expect(await screen.findByText(i18n.t('branchAccess.invite.noBranches'))).toBeTruthy()
    expect(screen.getByText(i18n.t('invite.previewNote'))).toBeTruthy()
    // The preview names the real company from the session, not a sample one.
    expect(screen.getByText('owner has invited you to Real Trading LLC on Fawtir')).toBeTruthy()
    // Role cards name what each role reaches in words.
    expect((await screen.findAllByText('People')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByRole('textbox', { name: /Email/ }), { target: { value: 'y@real.example' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText('Invitation sent to y@real.example.')).toBeTruthy()
    expect(sent).toEqual({ email: 'y@real.example', roleCodes: [] })
    expect(new Set(pageRequests())).toEqual(
      new Set([`GET ${ROLES}`, 'GET /api/v1/branches', 'POST /api/v1/users/invitations']),
    )
  })

  it('says why an invitation was refused and claims no success', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, who)
      if (url === '/api/v1/users/invitations' && init?.method === 'POST')
        return json(500, { type: 'about:blank', title: 'boom' })
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), { target: { value: 'x@real.example' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('people.invite.send') })).toBeTruthy())
    expect(screen.queryByText(/Invitation sent/)).toBeNull()
  })

  it('says a suspended subscription stopped the invitation, not a conflict, and links to the bills', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, who)
      if (url === '/api/v1/users/invitations' && init?.method === 'POST')
        return json(409, {
          type: 'https://api.fawtir.om/problems/subscription-restricted',
          title: 'Conflict',
          status: 409,
          detail: 'Your subscription is read-only until the renewal is paid.',
          code: 'SUBSCRIPTION_SUSPENDED',
          action: 'ADD_PEOPLE',
        })
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), { target: { value: 'x@real.example' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText(i18n.t('apiErrors.subscriptionRestricted.suspended'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('apiErrors.conflict'))).toBeNull()
    const link = screen.getByRole('link', { name: i18n.t('apiErrors.subscriptionRestricted.action.bills') })
    expect(link.getAttribute('href')).toBe('/settings/bills')
    expect(screen.queryByText(/Invitation sent/)).toBeNull()
  })

  it('at the plan\'s user capacity, leads whoever manages the plan to buy a place (US-1)', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'tenant.plan.manage'] } as Entitlements
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, who)
      if (url === '/api/v1/users/invitations' && init?.method === 'POST')
        return json(409, {
          type: 'https://api.fawtir.om/problems/extra-place-required',
          title: 'Conflict', status: 409, detail: 'English detail', kind: 'USER', included: 5, inUse: 5, capacity: 5,
        })
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), { target: { value: 'x@real.example' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText(i18n.t('paidExtras.refusal.extraPlace.USER'))).toBeTruthy()
    const link = screen.getByRole('link', { name: i18n.t('paidExtras.refusal.extraPlaceLink') })
    expect(link.getAttribute('href')).toBe('/settings/plan/extras')
    expect(screen.queryByText('English detail')).toBeNull()
  })
})

describe('while the subscription is read-only (ST-2)', () => {
  const SUSPENDED = {
    ...NOT_TRACKED, tracked: true, access: 'PAYMENT_REQUIRED', restrictionsEnforced: true, billingCycle: 'MONTHLY',
    paidThrough: '2026-09-30', renewsOn: '2026-10-01', graceUntil: '2026-10-07', enterprise: null,
    restriction: 'SUBSCRIPTION_SUSPENDED',
  }
  const invite = () => screen.queryByRole('link', { name: i18n.t('team.inviteSomeone') })

  it('offers Invite on the team while the subscription is usable', async () => {
    renderAt('/settings/team')
    await screen.findByText('Mona Rashid')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === SUBSCRIPTION)).toBe(true))
    expect(invite()).toBeTruthy()
  })

  it('hides Invite but keeps the lists, and does not draw the invite form', async () => {
    answers[SUBSCRIPTION] = () => json(200, SUSPENDED)
    renderAt('/settings/team')
    await screen.findByText('Mona Rashid')
    await waitFor(() => expect(invite()).toBeNull())
    expect(screen.getByText('clerk@real.example')).toBeTruthy()
  })

  it('does not draw the invite form at its own address either', async () => {
    answers[SUBSCRIPTION] = () => json(200, SUSPENDED)
    renderAt('/settings/team/invite')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === SUBSCRIPTION)).toBe(true))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull())
    expect(screen.queryByRole('button', { name: i18n.t('people.invite.send') })).toBeNull()
  })

  it('hides nothing with the backend switch off', async () => {
    answers[SUBSCRIPTION] = () => json(200, { ...SUSPENDED, restrictionsEnforced: false, restriction: null })
    renderAt('/settings/team/invite')
    expect(await screen.findByRole('textbox', { name: /Email/ })).toBeTruthy()
  })
})

describe('Plan and usage', () => {
  it("draws only the server's figures: plan name, usage, people and branches", async () => {
    renderAt('/settings/plan')
    expect(await screen.findByText('Your plan: Starter')).toBeTruthy()
    // The sidebar's account card names the same real plan, not "Business plan".
    expect(screen.getByText('Starter plan')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText(/of 300 documents/)).toBeTruthy()
    expect(screen.getByText('2 of 3 included')).toBeTruthy()
    expect(screen.getByText('1 (no limit on your plan)')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/880|1,000|Business plan/)
  })

  it('draws the forecast, the four stats, the plans and the add-ons, with what the API lacks as not available yet', async () => {
    renderAt('/settings/plan')
    await screen.findByText('Your plan: Starter')
    // 42 over 8 days is about 5 a day; 23 days left need 115, well within the 258 left.
    expect(screen.getByText('You have room to the end of this period')).toBeTruthy()
    expect(screen.getByText('1 of the 42')).toBeTruthy()
    const stat = (label: string) => screen.getByText(label).closest('div')!
    expect(within(stat('Busiest day so far')).getByText(NOT_AVAILABLE)).toBeTruthy()
    expect(within(stat('Last month')).getByText(NOT_AVAILABLE)).toBeTruthy()
    // The plans come from the published catalogue; Enterprise always offers a call.
    const business = (await screen.findByRole('heading', { name: 'Business' })).closest('article')!
    expect(within(business).getByText(/45\.000/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Talk to our team' }).getAttribute('href')).toBe('/contact')
    expect(screen.getByRole('link', { name: 'Open ERP integration' }).getAttribute('href')).toBe('/settings/erp')
    // Without tenant.plan.manage no move is offered at all.
    expect(screen.queryByRole('button', { name: /Move/ })).toBeNull()
    // The paid places and the add-on (US-1, BR-3, ER-1) are read once for both of their cards.
    expect(new Set(requests())).toEqual(
      new Set([`GET ${SUBSCRIPTION}`, `GET ${PUBLIC_PLANS}`, 'GET /api/v1/settings/plan/extras']),
    )
    expect(fetchMock.mock.calls.some(([url]) => url === PLAN)).toBe(true)
  })

  it('hides the plan moves and the overage switch, not greys them, even for those who may manage the plan (plan v4)', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'tenant.plan.manage'] } as Entitlements
    renderAt('/settings/plan')
    await screen.findByRole('heading', { name: 'Business' })
    expect(screen.queryByRole('button', { name: /Move/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Switch overage on or off' })).toBeNull()
    expect(screen.getByText(/To change your plan, contact the Fawtir team/)).toBeTruthy()
    expect(requests().every((line) => line.startsWith('GET '))).toBe(true)
  })

  it('names the plan in Arabic from the catalogue, and groups the figures, for an Arabic reader (G11)', async () => {
    await i18n.changeLanguage('ar')
    answers[PLAN] = () =>
      json(200, { ...PLAN_OVERVIEW, usage: { ...PLAN_OVERVIEW.usage, used: 0, quota: 1000, raisedToday: 0, resubmissions: 0 } })
    answers[PUBLIC_PLANS] = () =>
      json(200, CATALOGUE.map((plan) => (plan.code === 'STARTER' ? { ...plan, nameAr: 'المبتدئة' } : plan)))
    renderAt('/settings/plan')
    expect(await screen.findByText(`${i18n.t('plan.yourPlan')}: المبتدئة`)).toBeTruthy()
    expect(screen.getByText(i18n.t('plan.leftCount', { count: '1,000' }))).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('plan.billsAndPayment') })).toBeTruthy()
    expect(i18n.t('plan.billsAndPayment')).toBe(i18n.t('bills.title'))
  })

  it('offers a retry when the plan cannot be read', async () => {
    answers[PLAN] = () => json(500, { type: 'about:blank', title: 'boom' })
    renderAt('/settings/plan')
    expect(await screen.findByRole('button', { name: i18n.t('appAccess.retry') })).toBeTruthy()
  })
})
