import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { DowngradeSwitchOffPage } from './DowngradeSwitchOffPage'
import { PlanPage } from './PlanPage'

const MANAGER: Entitlements = {
  userId: 'u-owner',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'TENANT_ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage', 'admin.users.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements
const READER: Entitlements = { ...MANAGER, permissions: ['tenant.plan.read'] } as Entitlements

const SWITCH_OFF = '/api/v1/settings/subscription/scheduled-change/switch-off'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PEOPLE = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const PLAN = '/api/v1/settings/plan'

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
  paidThrough: '2026-11-22',
  renewsOn: '2026-11-23',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: {
    planCode: 'STARTER',
    planName: 'Starter',
    billingCycle: 'MONTHLY',
    periodPrice: '35.000',
    effectiveOn: '2026-11-23',
  },
}

const user = (id: string, firstName: string, email: string) => ({
  id,
  username: id,
  email,
  firstName,
  lastName: null,
  enabled: true,
  mfaEnabled: false,
  roles: [],
  createdAt: '2026-08-01T00:00:00Z',
  locked: false,
  lockedUntil: null,
})

const PEOPLE_PAGE = {
  content: [
    user('u-owner', 'Yusuf', 'yusuf@example.om'),
    user('u-sara', 'Sara', 'sara@example.om'),
    user('u-omar', 'Omar', 'omar@example.om'),
    user('u-lina', 'Lina', 'lina@example.om'),
  ],
  totalElements: 4,
  totalPages: 1,
  number: 0,
  size: 100,
}

/** Starter includes 2 users and 1 branch; the company has 4 users and 2 open branches. */
function view(
  chosenUsers: string[] = [],
  chosenBranches: string[] = [],
  recordedAt: string | null = null,
) {
  const offUsers = chosenUsers.length ? chosenUsers.slice(0, 2) : ['u-lina', 'u-omar']
  const offBranches = chosenBranches.length ? chosenBranches.slice(0, 1) : ['b-sohar']
  const seat = (userId: string, addedAt: string, kept: string | null) => ({
    userId,
    addedAt,
    kept,
    candidate: kept === null,
    chosen: chosenUsers.includes(userId),
    switchesOff: offUsers.includes(userId),
  })
  const branch = (branchId: string, name: string, addedAt: string, kept: string | null) => ({
    branchId,
    name,
    addedAt,
    kept,
    candidate: kept === null,
    chosen: chosenBranches.includes(branchId),
    switchesOff: offBranches.includes(branchId),
  })
  return {
    planCode: 'STARTER',
    planVersionId: 'pv-1',
    effectiveOn: '2026-11-23',
    peopleIncluded: 2,
    branchesIncluded: 1,
    activeUsers: 4,
    openBranches: 2,
    choiceRecordedAt: recordedAt,
    users: [
      seat('u-owner', '2026-08-01T08:00:00Z', 'OWNER'),
      seat('u-sara', '2026-08-10T08:00:00Z', null),
      seat('u-omar', '2026-09-01T08:00:00Z', null),
      seat('u-lina', '2026-09-20T08:00:00Z', null),
    ],
    branches: [
      branch('b-head', 'Muscat Head Branch', '2026-08-01T08:00:00Z', 'HEAD_BRANCH'),
      branch('b-sohar', 'Sohar', '2026-09-05T08:00:00Z', null),
    ],
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const NOT_ALLOWED = {
  type: 'https://api.fawtir.om/problems/downgrade-choice-not-allowed',
  title: 'Conflict',
  status: 409,
  detail: 'No downgrade is waiting for the next renewal.',
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  who = MANAGER
  answers = {
    [SWITCH_OFF]: () => json(200, view()),
    [SUBSCRIPTION]: () => json(200, STATUS),
    [PEOPLE]: () => json(200, PEOPLE_PAGE),
    [PLAN]: () => json(500, {}),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
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
        <Route path="/settings/plan" element={<PlanPage />} />
        <Route path="/settings/plan/switch-off" element={<DowngradeSwitchOffPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
}

function card(title: string) {
  return screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
}

function row(region: HTMLElement, text: string) {
  return within(region).getByText(text).closest('tr') as HTMLElement
}

describe('Settings › Plan › What switches off (BR-5, US-4)', () => {
  it('says what the downgrade does on the renewal date, by name, with the server marks', async () => {
    renderAt('/settings/plan/switch-off')
    expect(
      await screen.findByText(i18n.t('subscription.switchOff.summaryTitle', { plan: 'Starter' })),
    ).toBeTruthy()
    expect(
      screen.getByText(i18n.t('subscription.switchOff.summaryNote', { date: '23 Nov 2026' })),
    ).toBeTruthy()
    expect(
      screen.getByText(i18n.t('subscription.switchOff.howItWorks', { date: '23 Nov 2026' })),
    ).toBeTruthy()

    const users = card(i18n.t('subscription.switchOff.usersTitle'))
    expect(
      within(users).getByText(
        i18n.t('subscription.switchOff.usersChoose', { count: 2, date: '23 Nov 2026' }),
      ),
    ).toBeTruthy()
    await within(users).findByText('Yusuf')
    // The owner always stays and cannot be ticked.
    const owner = row(users, 'Yusuf')
    expect(within(owner).getByText(i18n.t('subscription.switchOff.kept.OWNER'))).toBeTruthy()
    expect(within(owner).queryByRole('checkbox')).toBeNull()
    // With no choice, the server's default: the most recently added go.
    expect(
      within(row(users, 'Lina')).getByText(i18n.t('subscription.switchOff.switchesOff')),
    ).toBeTruthy()
    expect(
      within(row(users, 'Sara')).getByText(i18n.t('subscription.switchOff.staysOn')),
    ).toBeTruthy()

    const branches = card(i18n.t('subscription.switchOff.branchesTitle'))
    const head = row(branches, 'Muscat Head Branch')
    expect(within(head).getByText(i18n.t('subscription.switchOff.kept.HEAD_BRANCH'))).toBeTruthy()
    expect(within(head).queryByRole('checkbox')).toBeNull()
    expect(
      within(row(branches, 'Sohar')).getByText(i18n.t('subscription.switchOff.switchesOff')),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/HEAD_BRANCH|OWNER|STARTER/)
  })

  it('lets the customer tick only as many as must go, then saves the choice', async () => {
    answers[`PUT ${SWITCH_OFF}`] = () =>
      json(200, view(['u-sara', 'u-omar'], [], '2026-10-18T09:00:00Z'))
    renderAt('/settings/plan/switch-off')
    const users = await waitFor(() => card(i18n.t('subscription.switchOff.usersTitle')))
    await within(users).findByText('Sara')
    const save = screen.getByRole('button', {
      name: i18n.t('subscription.switchOff.save'),
    }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    await userEvent.click(
      within(users).getByRole('checkbox', {
        name: i18n.t('subscription.switchOff.chooseUser', { name: 'Sara' }),
      }),
    )
    await userEvent.click(
      within(users).getByRole('checkbox', {
        name: i18n.t('subscription.switchOff.chooseUser', { name: 'Omar' }),
      }),
    )
    // Two must go: a third cannot be ticked.
    const lina = within(users).getByRole('checkbox', {
      name: i18n.t('subscription.switchOff.chooseUser', { name: 'Lina' }),
    }) as HTMLInputElement
    expect(lina.disabled).toBe(true)
    expect(screen.getByText(i18n.t('subscription.switchOff.unsaved'))).toBeTruthy()

    await userEvent.click(save)
    await screen.findByText(i18n.t('subscription.switchOff.recordedOn', { date: '18 Oct 2026' }))
    expect(writes()).toHaveLength(1)
    const [url, init] = writes()[0]
    expect(url).toBe(SWITCH_OFF)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      userIds: ['u-sara', 'u-omar'],
      branchIds: [],
    })
    // The marks are the server's new answer.
    const after = card(i18n.t('subscription.switchOff.usersTitle'))
    expect(
      within(row(after, 'Sara')).getByText(i18n.t('subscription.switchOff.switchesOff')),
    ).toBeTruthy()
    expect(
      within(row(after, 'Lina')).getByText(i18n.t('subscription.switchOff.staysOn')),
    ).toBeTruthy()
  })

  it('clears a recorded choice back to the default with two empty lists', async () => {
    answers[SWITCH_OFF] = () => json(200, view(['u-sara'], ['b-sohar'], '2026-10-18T09:00:00Z'))
    answers[`PUT ${SWITCH_OFF}`] = () => json(200, view())
    renderAt('/settings/plan/switch-off')
    await userEvent.click(
      await screen.findByRole('button', { name: i18n.t('subscription.switchOff.useDefault') }),
    )
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(JSON.parse(writes()[0][1].body as string)).toEqual({ userIds: [], branchIds: [] })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: i18n.t('subscription.switchOff.useDefault') }),
      ).toBeNull(),
    )
  })

  it('words a refused choice as our own sentence, never the server detail', async () => {
    answers[`PUT ${SWITCH_OFF}`] = () => json(409, NOT_ALLOWED)
    renderAt('/settings/plan/switch-off')
    const branches = await waitFor(() => card(i18n.t('subscription.switchOff.branchesTitle')))
    await userEvent.click(
      within(branches).getByRole('checkbox', {
        name: i18n.t('subscription.switchOff.chooseBranch', { name: 'Sohar' }),
      }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('subscription.switchOff.save') }),
    )
    expect((await screen.findByRole('alert')).textContent).toBe(
      i18n.t('subscription.switchOff.notAllowed'),
    )
    expect(document.body.textContent).not.toContain(NOT_ALLOWED.detail)
  })

  it('says nothing switches off when no downgrade is waiting', async () => {
    answers[SWITCH_OFF] = () => json(409, NOT_ALLOWED)
    renderAt('/settings/plan/switch-off')
    expect(await screen.findByText(i18n.t('subscription.switchOff.noneWaiting'))).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('names a user by the day added without the team permission', async () => {
    who = { ...MANAGER, permissions: ['tenant.plan.read', 'tenant.plan.manage'] } as Entitlements
    renderAt('/settings/plan/switch-off')
    const users = await waitFor(() => card(i18n.t('subscription.switchOff.usersTitle')))
    expect(
      within(users).getByText(i18n.t('subscription.switchOff.userAdded', { date: '10 Aug 2026' })),
    ).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === PEOPLE)).toBe(false)
  })

  it('refuses a reader without tenant.plan.manage before asking the server', async () => {
    who = READER
    renderAt('/settings/plan/switch-off')
    expect(await screen.findByText(i18n.t('appAccess.missingPermission'))).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === SWITCH_OFF)).toBe(false)
  })

  it('is reached from the waiting downgrade on Settings › Plan', async () => {
    renderAt('/settings/plan')
    const link = await screen.findByRole('link', { name: i18n.t('subscription.switchOff.open') })
    expect(link.getAttribute('href')).toBe('/settings/plan/switch-off')
  })

  it('reads in Arabic with the plan name from the catalogue', async () => {
    await i18n.changeLanguage('ar')
    answers['/api/v1/public/plans'] = () =>
      json(200, [
        { code: 'STARTER', nameEn: 'Starter', nameAr: 'المبتدئة', monthlyPrice: '35.000' },
      ])
    renderAt('/settings/plan/switch-off')
    expect(
      await screen.findByText(i18n.t('subscription.switchOff.summaryTitle', { plan: 'المبتدئة' })),
    ).toBeTruthy()
  })
})
