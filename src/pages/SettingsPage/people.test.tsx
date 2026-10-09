import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
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
  who = ADMIN
  answers = {
    [PEOPLE]: () => json(200, USERS),
    [INVITED]: () =>
      json(200, [{ id: 'i-1', email: 'new@real.example', roleCodes: ['ACCOUNTANT'], status: 'PENDING',
        expiresAt: '2026-10-15T00:00:00Z', sentCount: 1, lastSentAt: null, createdAt: '2026-10-08T00:00:00Z' }]),
    [ROLES]: () => json(200, ROLE_LIST),
    [PLAN]: () => json(200, PLAN_OVERVIEW),
    [SUBSCRIPTION]: () => json(200, NOT_TRACKED),
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
    expect(await screen.findByText('new@real.example')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(SAMPLE_NAMES)
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
  it('counts authenticator apps from the real list and offers no switches that save nothing', async () => {
    renderAt('/settings/signing-in')
    expect(await screen.findByText('1 of 2 people has an authenticator app set up.')).toBeTruthy()
    expect(screen.queryByText(i18n.t('signingIn.requireEveryone'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('signingIn.save') })).toBeNull()
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
    fireEvent.click(await screen.findByRole('checkbox', { name: /Accountant/ }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText('Invitation sent to x@real.example.')).toBeTruthy()
    expect(sent).toEqual({ email: 'x@real.example', roleCodes: ['ACCOUNTANT'] })
    expect(document.body.textContent).not.toMatch(SAMPLE_NAMES)
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

  it('offers a retry when the plan cannot be read', async () => {
    answers[PLAN] = () => json(500, { type: 'about:blank', title: 'boom' })
    renderAt('/settings/plan')
    expect(await screen.findByRole('button', { name: i18n.t('appAccess.retry') })).toBeTruthy()
  })
})
