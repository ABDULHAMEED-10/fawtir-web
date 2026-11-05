import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { TeamPage } from './TeamPage'
import { InvitePage } from './InvitePage'
import { PersonPage } from './PersonPage'
import { BranchRoster } from './BranchRoster'
import { AddBranchPage } from './AddBranchPage'
import { branchAccessOn } from '../../lib/identity/branchAccessSwitch'
import { permissionWords } from '../../lib/permissionLabels'

/** Branch access screens (Business Rules BA-1, BA-2, OW-1, OW-4, RL-1, RL-2, RL-3, LG-3). */

/**
 * The switch is read from the session: `branchAccessEnforced` on `GET /v1/me/entitlements`. The
 * fixtures below are sessions with it on; "Branch access off" reads the Owner with it off.
 */

const OWNER: Entitlements = {
  userId: 'p-owner',
  username: 'mona',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'admin.users.manage',
    'admin.roles.manage',
    'role.list',
    'role.read',
    'branch.manage',
    'invoice.read',
  ],
  scopes: [],
  featureFlags: {},
  isOwner: true,
  allBranches: true,
  branchIds: [],
  branchAdministrator: false,
  manageableBranchIds: [],
  branchAccessEnforced: true,
}

/** The Owner on a server with branch access off: every branch, and the switch reads false. */
const OWNER_OFF: Entitlements = { ...OWNER, branchAccessEnforced: false }

const BRANCH_ADMIN: Entitlements = {
  ...OWNER,
  userId: 'p-lead',
  roles: [{ id: 'r-3', code: 'SALES_MANAGER', name: 'Sales manager', systemRole: true }],
  permissions: ['branch.users.manage', 'role.list', 'invoice.read'],
  isOwner: false,
  allBranches: false,
  branchIds: ['b-sohar'],
  branchAdministrator: true,
  manageableBranchIds: ['b-sohar'],
}

const PEOPLE_URL = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const INVITED = '/api/v1/users/invitations?status=PENDING&page=0&size=50'
const OVERVIEW = '/api/v1/branches/overview'

const user = (
  id: string,
  firstName: string,
  roles: string[],
  branchIds: string[],
  owner = false,
) => ({
  id,
  username: firstName.toLowerCase(),
  email: `${firstName.toLowerCase()}@real.example`,
  firstName,
  lastName: null,
  enabled: true,
  mfaEnabled: true,
  roles,
  createdAt: '2026-10-01T08:00:00Z',
  locked: false,
  lockedUntil: null,
  owner,
  branchIds,
})

const MONA = user('p-owner', 'Mona', ['ADMIN'], ['b-muscat', 'b-sohar'], true)
const SAMI = user('p-admin', 'Sami', ['ADMIN'], [])
const LAILA = user('p-clerk', 'Laila', ['ACCOUNTANT'], ['b-muscat', 'b-sohar', 'b-sur'])

const branchRow = (id: string, name: string, active = true) => ({
  id,
  code: id,
  name,
  headOffice: false,
  active,
  closedOn: null,
  invoicePrefix: null,
  nextNumber: null,
  invoicesThisMonth: 0,
  invoicedThisMonth: 0,
  people: 0,
  devices: 0,
})
const OVERVIEW_BODY = {
  openCount: 3,
  everCount: 4,
  peopleAcross: 3,
  peopleInSeveral: 2,
  invoicesThisMonth: 0,
  branches: [
    branchRow('b-muscat', 'Muscat'),
    branchRow('b-sohar', 'Sohar'),
    branchRow('b-sur', 'Sur'),
    branchRow('b-old', 'Old souq', false),
  ],
}

const ROLE_LIST = [
  {
    id: 'r-1',
    code: 'ADMIN',
    name: 'Administrator',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['admin.users.manage', 'invoice.read'],
    catalogueKind: 'ROLE',
  },
  {
    id: 'r-2',
    code: 'ACCOUNTANT',
    name: 'Accountant',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.read', 'bill.read'],
    catalogueKind: 'ROLE',
  },
  {
    id: 'r-3',
    code: 'SALES_MANAGER',
    name: 'Sales manager',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.read'],
    catalogueKind: 'ROLE',
  },
  {
    id: 'r-4',
    code: 'APPROVER',
    name: 'Approver',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.approve'],
    catalogueKind: 'PERMISSION_SET',
  },
  {
    id: 'r-5',
    code: 'VIEWER',
    name: 'Viewer',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.read'],
    catalogueKind: 'PERMISSION_SET',
  },
]

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const refusal = (status: number, type: string) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    title: 'Refused',
    status,
    detail: 'English detail',
  })

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

/** Every body sent with this method to this URL, parsed. */
function sent(method: string, url: string): unknown[] {
  return fetchMock.mock.calls
    .filter(
      ([u, init]) => u === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method,
    )
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  who = OWNER
  answers = {
    [PEOPLE_URL]: () =>
      json(200, {
        content: [MONA, SAMI, LAILA],
        totalElements: 3,
        totalPages: 1,
        number: 0,
        size: 100,
      }),
    [INVITED]: () => json(200, []),
    [OVERVIEW]: () => json(200, OVERVIEW_BODY),
    '/api/v1/branches': () =>
      json(200, [{ id: 'b-sohar', code: 'SOH', name: 'Sohar', type: 'STORE', city: null }]),
    '/api/v1/roles': () => json(200, ROLE_LIST),
    '/api/v1/users/p-owner': () => json(200, MONA),
    '/api/v1/users/p-admin': () => json(200, SAMI),
    '/api/v1/users/p-clerk': () => json(200, LAILA),
    '/api/v1/users/p-clerk/permissions': () =>
      json(200, {
        userId: 'p-clerk',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT'],
        grants: [{ code: 'invoice.approve', qualifier: null, value: null }],
        denials: ['bill.read'],
        effective: ['invoice.approve', 'invoice.read'],
      }),
    '/api/v1/permissions': () =>
      json(
        200,
        [
          'invoice.read',
          'invoice.approve',
          'bill.read',
          'bill.settle',
          'branch.users.manage',
          'tenant.plan.manage',
        ].map((code) => ({ code, module: 'X', description: code, assignable: true })),
      ),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    const method = init?.method ?? 'GET'
    const answer = answers[method === 'GET' ? url : `${method} ${url}`]
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
        <Route path="/settings/team" element={<TeamPage />} />
        <Route path="/settings/team/invite" element={<InvitePage />} />
        <Route path="/settings/team/:userId" element={<PersonPage />} />
        <Route path="/roster" element={<BranchRoster branchId="b-sohar" />} />
        <Route path="/settings/branches/:id" element={<AddBranchPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('The switch', () => {
  it('reads on from branchAccessEnforced, for the Owner and Administrators too', () => {
    expect(branchAccessOn(null)).toBe(false)
    expect(branchAccessOn(OWNER)).toBe(true)
    expect(branchAccessOn({ ...OWNER, isOwner: false })).toBe(true)
    expect(branchAccessOn(OWNER_OFF)).toBe(false)
    expect(branchAccessOn({ ...OWNER_OFF, isOwner: false, allBranches: undefined })).toBe(false)
  })

  it('reads a server that omits the field as off', () => {
    const older: Entitlements = { ...OWNER }
    delete older.branchAccessEnforced
    expect(branchAccessOn(older)).toBe(false)
  })

  it('still reads on from a branch administrator, or not every branch, without the field', () => {
    const older: Entitlements = { ...BRANCH_ADMIN }
    delete older.branchAccessEnforced
    expect(branchAccessOn(older)).toBe(true)
    expect(
      branchAccessOn({
        ...older,
        branchAdministrator: false,
        permissions: ['invoice.read'],
      }),
    ).toBe(true)
  })
})

describe('Branch access off (production today)', () => {
  beforeEach(() => {
    who = OWNER_OFF
  })

  it('draws Team members with no Branches column, but marks the Owner and links each person', async () => {
    renderAt('/settings/team')
    const link = await screen.findByRole('link', { name: 'Laila' })
    expect(link.getAttribute('href')).toBe('/settings/team/p-clerk')
    expect(screen.queryByRole('columnheader', { name: 'Branches' })).toBeNull()
    expect(screen.getByText('Owner')).toBeTruthy()
    expect(screen.queryByText('Every branch')).toBeNull()
    expect(screen.queryByText('No branch yet')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === INVITED)).toBe(true)
  })

  it('keeps the invitation as before and sends no branchIds, so the server gives every branch (BA-6)', async () => {
    answers['POST /api/v1/users/invitations'] = () =>
      json(201, {
        id: 'i-9',
        email: 'x@real.example',
        roleCodes: ['ACCOUNTANT', 'APPROVER'],
        status: 'PENDING',
        expiresAt: '2026-10-25T00:00:00Z',
        sentCount: 1,
        lastSentAt: null,
        createdAt: '2026-10-17T00:00:00Z',
      })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), {
      target: { value: 'x@real.example' },
    })
    // The roles are ticks, as before; no branch is asked for.
    fireEvent.click(await screen.findByRole('checkbox', { name: /Accountant/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Approver/ }))
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText(i18n.t('invite.branchesUnavailable'))).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Sohar' })).toBeNull()
    expect(screen.getByText(i18n.t('people.invite.noRoleMeansDefault'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText('Invitation sent to x@real.example.')).toBeTruthy()
    expect(sent('POST', '/api/v1/users/invitations')).toEqual([
      { email: 'x@real.example', roleCodes: ['ACCOUNTANT', 'APPROVER'] },
    ])
  })

  it("opens a person's page with their role and permissions (RL-3), and no branch", async () => {
    answers['PUT /api/v1/users/p-clerk/permissions'] = () =>
      json(200, {
        userId: 'p-clerk',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT'],
        grants: [],
        denials: [],
        effective: ['bill.read', 'invoice.read'],
      })
    renderAt('/settings/team/p-clerk')
    expect(await screen.findByRole('heading', { name: 'Laila' })).toBeTruthy()
    await screen.findByText('Given to them')
    expect(screen.queryByText(i18n.t('branchAccess.person.branchesTitle'))).toBeNull()
    expect(screen.queryByText(i18n.t('branchAccess.person.branchAdminTitle'))).toBeNull()
    const settle = screen
      .getAllByRole('checkbox')
      .find((box) => box.closest('label')?.textContent?.includes('Settle')) as HTMLInputElement
    fireEvent.click(settle)
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await screen.findByText('Permissions saved. They apply from their next action.')
    expect(sent('PUT', '/api/v1/users/p-clerk/permissions')).toEqual([
      { grants: [{ code: 'invoice.approve' }, { code: 'bill.settle' }], denials: ['bill.read'] },
    ])
  })

  it('changes an Administrator to a job role without asking for branches', async () => {
    answers['PUT /api/v1/users/p-admin/role'] = () => json(200, ['ACCOUNTANT'])
    renderAt('/settings/team/p-admin')
    await screen.findByRole('heading', { name: 'Sami' })
    fireEvent.click(await screen.findByRole('button', { name: 'Role' }))
    fireEvent.click(await screen.findByRole('option', { name: /Accountant/ }))
    expect(screen.queryByText('Branches for the new role')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }))
    await screen.findByText('Role changed.')
    expect(sent('PUT', '/api/v1/users/p-admin/role')).toEqual([{ roleCode: 'ACCOUNTANT' }])
  })

  it('lets the Owner hand ownership over (OW-4)', async () => {
    answers['POST /api/v1/settings/owner/handover'] = () =>
      json(200, { userId: 'p-admin', name: 'Sami' })
    renderAt('/settings/team/p-owner')
    expect(await screen.findByText("The Owner has full access. It can't be reduced.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hand over ownership' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'New Owner' }))
    fireEvent.click(await screen.findByRole('option', { name: /Sami/ }))
    fireEvent.change(within(dialog).getByLabelText(/Type Real Trading LLC to confirm/), {
      target: { value: 'Real Trading LLC' },
    })
    fireEvent.change(within(dialog).getByLabelText('Your password'), {
      target: { value: 'secret-1' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hand over' }))
    await waitFor(() => expect(sent('POST', '/api/v1/settings/owner/handover')).toHaveLength(1))
  })

  it('keeps "Who works there" on a branch as not available yet', async () => {
    answers['/api/v1/branches/b-sohar'] = () =>
      json(200, {
        id: 'b-sohar',
        code: 'SOH',
        name: 'Sohar',
        type: 'BRANCH',
        headOffice: false,
        active: true,
      })
    renderAt('/settings/branches/b-sohar')
    expect(await screen.findByText(i18n.t('addBranch.whoWorksThere'))).toBeTruthy()
    const panel = screen
      .getByText(i18n.t('addBranch.whoWorksThere'))
      .closest('section') as HTMLElement
    expect(within(panel).getByText(i18n.t('addBranch.notAvailableYet'))).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/branches/b-sohar/people')).toBe(
      false,
    )
  })
})

describe('Team members', () => {
  it('marks the Owner, says "Every branch" for the Owner and Administrators, and names other people\'s branches', async () => {
    renderAt('/settings/team')
    const owner = await screen.findByRole('link', { name: 'Mona' })
    expect(owner.getAttribute('href')).toBe('/settings/team/p-owner')
    const ownerRow = owner.closest('tr') as HTMLElement
    expect(within(ownerRow).getByText('Owner')).toBeTruthy()
    expect(within(ownerRow).getByText('Every branch')).toBeTruthy()
    const samiRow = screen.getByRole('link', { name: 'Sami' }).closest('tr') as HTMLElement
    expect(within(samiRow).getByText('Every branch')).toBeTruthy()
    const lailaRow = screen.getByRole('link', { name: 'Laila' }).closest('tr') as HTMLElement
    // Branch names come from their own read, which can land after the people list.
    expect(await within(lailaRow).findByText('Muscat, Sohar +1')).toBeTruthy()
  })

  it('lets a branch administrator see their people, without asking for the invitation list', async () => {
    who = BRANCH_ADMIN
    answers[PEOPLE_URL] = () =>
      json(200, { content: [LAILA], totalElements: 1, totalPages: 1, number: 0, size: 100 })
    renderAt('/settings/team')
    expect(await screen.findByRole('link', { name: 'Laila' })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === INVITED)).toBe(false)
  })
})

describe('Names in the reader\'s language (E16, E25)', () => {
  it('names a built-in role by its label for a branch administrator who may not list roles', async () => {
    who = { ...BRANCH_ADMIN, permissions: ['branch.users.manage', 'invoice.read'] }
    const FARAH = user('p-fin', 'Farah', ['FINANCE_MANAGER'], ['b-sohar'])
    answers[PEOPLE_URL] = () =>
      json(200, { content: [FARAH], totalElements: 1, totalPages: 1, number: 0, size: 100 })
    answers['/api/v1/users/p-fin'] = () => json(200, FARAH)
    renderAt('/settings/team')
    const row = (await screen.findByRole('link', { name: 'Farah' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Finance manager')).toBeTruthy()
    expect(within(row).queryByText('FINANCE_MANAGER')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/roles')).toBe(false)
  })

  it('names a built-in role the same for the Owner, and a custom role by its own name', async () => {
    const FARAH = user('p-fin', 'Farah', ['FINANCE_MANAGER'], ['b-sohar'])
    const HADI = user('p-cus', 'Hadi', ['NIGHT_SHIFT'], ['b-sohar'])
    answers[PEOPLE_URL] = () =>
      json(200, { content: [FARAH, HADI], totalElements: 2, totalPages: 1, number: 0, size: 100 })
    answers['/api/v1/roles'] = () =>
      json(200, [
        ...ROLE_LIST,
        { ...ROLE_LIST[1], id: 'r-6', code: 'FINANCE_MANAGER', name: 'Finance Manager' },
        { ...ROLE_LIST[1], id: 'r-7', code: 'NIGHT_SHIFT', name: 'Night shift', systemRole: false, catalogueKind: 'CUSTOM' },
      ])
    renderAt('/settings/team')
    const farah = (await screen.findByRole('link', { name: 'Farah' })).closest('tr') as HTMLElement
    await waitFor(() => expect(within(farah).getByText('Finance manager')).toBeTruthy())
    const hadi = screen.getByRole('link', { name: 'Hadi' }).closest('tr') as HTMLElement
    expect(within(hadi).getByText('Night shift')).toBeTruthy()
  })

  it('names roles and branches in Arabic, the branch by its Arabic name when it has one', async () => {
    await i18n.changeLanguage('ar')
    answers[OVERVIEW] = () =>
      json(200, {
        ...OVERVIEW_BODY,
        branches: [
          { ...branchRow('b-muscat', 'Muscat'), nameAr: 'مسقط' },
          { ...branchRow('b-sohar', 'Sohar'), nameAr: 'فرع صحار' },
          branchRow('b-sur', 'Sur'),
          branchRow('b-old', 'Old souq', false),
        ],
      })
    renderAt('/settings/team')
    const laila = (await screen.findByRole('link', { name: 'Laila' })).closest('tr') as HTMLElement
    await waitFor(() => expect(within(laila).getByText(/مسقط، فرع صحار|مسقط, فرع صحار/)).toBeTruthy())
    expect(within(laila).getByText('محاسب')).toBeTruthy()
  })
})

describe('Invite someone', () => {
  it('sends one role, approval as a set on top, and the branches chosen', async () => {
    answers['POST /api/v1/users/invitations'] = () =>
      json(201, {
        id: 'i-1',
        email: 'x@real.example',
        roleCodes: ['ACCOUNTANT'],
        status: 'PENDING',
        expiresAt: '2026-10-25T00:00:00Z',
        sentCount: 1,
        lastSentAt: null,
        createdAt: '2026-10-17T00:00:00Z',
      })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), {
      target: { value: 'x@real.example' },
    })
    fireEvent.click(await screen.findByRole('radio', { name: /Accountant/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Sales manager/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Accountant/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Can approve/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sohar' }))
    // A closed branch is not offered for new work.
    expect(screen.queryByRole('checkbox', { name: 'Old souq' })).toBeNull()
    expect(screen.getByText('You will work in: Sohar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(await screen.findByText('Invitation sent to x@real.example.')).toBeTruthy()
    expect(sent('POST', '/api/v1/users/invitations')).toEqual([
      { email: 'x@real.example', roleCodes: ['ACCOUNTANT', 'APPROVER'], branchIds: ['b-sohar'] },
    ])
  })

  it('asks for a branch before sending, unless the role is Administrator', async () => {
    answers['POST /api/v1/users/invitations'] = () =>
      json(201, {
        id: 'i-2',
        email: 'a@real.example',
        roleCodes: ['ADMIN'],
        status: 'PENDING',
        expiresAt: '2026-10-25T00:00:00Z',
        sentCount: 1,
        lastSentAt: null,
        createdAt: '2026-10-17T00:00:00Z',
      })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), {
      target: { value: 'a@real.example' },
    })
    await screen.findByRole('checkbox', { name: 'Sohar' })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect((await screen.findAllByText('Choose at least one branch.')).length).toBeGreaterThan(0)
    expect(sent('POST', '/api/v1/users/invitations')).toEqual([])

    fireEvent.click(screen.getByRole('radio', { name: /Administrator/ }))
    expect(
      screen.getByText('Administrators see every branch, so there is nothing to choose.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    await screen.findByText('Invitation sent to a@real.example.')
    expect(sent('POST', '/api/v1/users/invitations')).toEqual([
      { email: 'a@real.example', roleCodes: ['ADMIN'] },
    ])
  })

  it('view only clears the role; a branch administrator is offered only their branches and never Administrator', async () => {
    who = BRANCH_ADMIN
    renderAt('/settings/team/invite')
    expect(await screen.findByRole('radio', { name: /Accountant/ })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Administrator/ })).toBeNull()
    expect(await screen.findByRole('checkbox', { name: 'Sohar' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Muscat' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Accountant/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /View only/ }))
    expect((screen.getByRole('radio', { name: /Accountant/ }) as HTMLInputElement).checked).toBe(
      false,
    )
  })

  it('ticks the only branch for them, and the role can go back to the default', async () => {
    answers[OVERVIEW] = () =>
      json(200, { ...OVERVIEW_BODY, branches: [branchRow('b-sohar', 'Sohar')] })
    answers['POST /api/v1/users/invitations'] = () =>
      json(201, {
        id: 'i-3',
        email: 'd@real.example',
        roleCodes: [],
        status: 'PENDING',
        expiresAt: '2026-10-25T00:00:00Z',
        sentCount: 1,
        lastSentAt: null,
        createdAt: '2026-10-17T00:00:00Z',
      })
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), {
      target: { value: 'd@real.example' },
    })
    const sohar = (await screen.findByRole('checkbox', { name: 'Sohar' })) as HTMLInputElement
    expect(sohar.checked && sohar.disabled).toBe(true)
    fireEvent.click(await screen.findByRole('radio', { name: /Accountant/ }))
    const fallback = screen.getByRole('radio', { name: /The default role/ }) as HTMLInputElement
    expect(fallback.checked).toBe(false)
    fireEvent.click(fallback)
    expect(fallback.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    await screen.findByText('Invitation sent to d@real.example.')
    expect(sent('POST', '/api/v1/users/invitations')).toEqual([
      { email: 'd@real.example', roleCodes: [], branchIds: ['b-sohar'] },
    ])
  })

  it('says an extra person is charged from the day the payment is confirmed (US-1), in English and Arabic', async () => {
    renderAt('/settings/team/invite')
    await screen.findByRole('checkbox', { name: 'Sohar' })
    const row = (label: string) =>
      screen.getByText(label).closest('div')!.querySelector('dd')!.textContent
    expect(row(i18n.t('invite.chargedFrom'))).toBe('The day the payment is confirmed')
    await i18n.changeLanguage('ar')
    expect(await screen.findByText('يوم تأكيد الدفع')).toBeTruthy()
    await i18n.changeLanguage('en')
  })

  it('says a refused escalation in our words, never the server detail', async () => {
    answers['POST /api/v1/users/invitations'] = () => refusal(403, 'permission-escalation')
    renderAt('/settings/team/invite')
    fireEvent.change(await screen.findByRole('textbox', { name: /Email/ }), {
      target: { value: 'x@real.example' },
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sohar' }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
    expect(
      await screen.findByText("You can't give permissions or branches you don't have."),
    ).toBeTruthy()
    expect(screen.queryByText('English detail')).toBeNull()
  })
})

describe('One person', () => {
  it('saves the permission ticks as grants and denials against the role, keeping reserved codes off', async () => {
    answers['PUT /api/v1/users/p-clerk/permissions'] = () =>
      json(200, {
        userId: 'p-clerk',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT'],
        grants: [],
        denials: [],
        effective: ['bill.read', 'invoice.read'],
      })
    renderAt('/settings/team/p-clerk')
    expect(await screen.findByRole('heading', { name: 'Laila' })).toBeTruthy()
    // Approval was given; reading bills was taken away from the role.
    await screen.findByText('Given to them')
    expect(screen.getByText('Taken away from them')).toBeTruthy()
    // Only the Administrator's: never offered as a person's own.
    expect(document.body.textContent).not.toMatch(/tenant\.plan\.manage/)
    const boxes = screen.getAllByRole('checkbox')
    const settle = boxes.find((box) =>
      box.closest('label')?.textContent?.includes('Settle'),
    ) as HTMLInputElement
    fireEvent.click(settle)
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await screen.findByText('Permissions saved. They apply from their next action.')
    expect(sent('PUT', '/api/v1/users/p-clerk/permissions')).toEqual([
      { grants: [{ code: 'invoice.approve' }, { code: 'bill.settle' }], denials: ['bill.read'] },
    ])
  })

  it('makes someone a branch administrator by a grant, for the Administrator', async () => {
    answers['PUT /api/v1/users/p-clerk/permissions'] = () =>
      json(200, {
        userId: 'p-clerk',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT'],
        grants: [],
        denials: [],
        effective: [],
      })
    renderAt('/settings/team/p-clerk')
    const pending = i18n.t('branchAccess.person.branchAdminPending')
    const tick = await screen.findByRole('checkbox', { name: /Make them a branch administrator/ })
    expect(document.body.textContent).not.toContain(pending)
    fireEvent.click(tick)
    // E15: the tick says it waits for "Save permissions", which it has switched on.
    expect(tick.closest('label')!.textContent).toContain(pending)
    expect((screen.getByRole('button', { name: 'Save permissions' }) as HTMLButtonElement).disabled).toBe(false)
    // Unticked again, nothing is waiting.
    fireEvent.click(tick)
    expect(document.body.textContent).not.toContain(pending)
    expect((screen.getByRole('button', { name: 'Save permissions' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(tick)
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await waitFor(() => expect(sent('PUT', '/api/v1/users/p-clerk/permissions')).toHaveLength(1))
    expect(sent('PUT', '/api/v1/users/p-clerk/permissions')[0]).toEqual({
      grants: [{ code: 'invoice.approve' }, { code: 'branch.users.manage' }],
      denials: ['bill.read'],
    })
    await screen.findByText('Permissions saved. They apply from their next action.')
  })

  it('saves branches, and says the server refusal in our words', async () => {
    answers['PUT /api/v1/users/p-clerk/branches'] = () => refusal(403, 'permission-escalation')
    renderAt('/settings/team/p-clerk')
    const sur = await screen.findByRole('checkbox', { name: 'Sur' })
    expect((sur as HTMLInputElement).checked).toBe(true)
    fireEvent.click(sur)
    fireEvent.click(screen.getByRole('button', { name: 'Save branches' }))
    expect(
      await screen.findByText("You can't give permissions or branches you don't have."),
    ).toBeTruthy()
    expect(sent('PUT', '/api/v1/users/p-clerk/branches')).toEqual([
      { branchIds: ['b-muscat', 'b-sohar'] },
    ])
  })

  it('changes the one role through PUT /role', async () => {
    answers['PUT /api/v1/users/p-clerk/role'] = () => json(200, ['SALES_MANAGER'])
    renderAt('/settings/team/p-clerk')
    await screen.findByRole('heading', { name: 'Laila' })
    fireEvent.click(await screen.findByRole('button', { name: 'Role' }))
    fireEvent.click(await screen.findByRole('option', { name: /Sales manager/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }))
    await screen.findByText('Role changed.')
    expect(sent('PUT', '/api/v1/users/p-clerk/role')).toEqual([{ roleCode: 'SALES_MANAGER' }])
  })

  it("reads a legacy person by their job role, approval as a permission, and never re-sends a role's codes as grants", async () => {
    const legacy = user('p-old', 'Badr', ['ACCOUNTANT', 'APPROVER'], ['b-sohar'])
    answers['/api/v1/users/p-old'] = () => json(200, legacy)
    answers['/api/v1/users/p-old/permissions'] = () =>
      json(200, {
        userId: 'p-old',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT', 'APPROVER'],
        grants: [],
        denials: [],
        effective: ['bill.read', 'invoice.approve', 'invoice.read'],
      })
    answers['PUT /api/v1/users/p-old/permissions'] = () =>
      json(200, {
        userId: 'p-old',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT', 'APPROVER'],
        grants: [],
        denials: ['bill.read'],
        effective: ['invoice.approve', 'invoice.read'],
      })
    renderAt('/settings/team/p-old')
    expect(await screen.findByText('Accountant, Can approve')).toBeTruthy()
    // The Select shows the job role, not Approver, which is not one of its options. It is drawn
    // once the role list has come back, which can be after the person's own roles are named.
    expect((await screen.findByRole('button', { name: 'Role' })).textContent).toMatch(/Accountant/)
    await screen.findAllByText('From their role')
    expect(screen.queryByText('Given to them')).toBeNull()
    const bills = screen
      .getAllByRole('checkbox')
      .find(
        (box) =>
          box.closest('label')?.textContent?.includes('From their role') &&
          (box as HTMLInputElement).checked &&
          !box.closest('label')?.textContent?.match(/approve/i),
      ) as HTMLInputElement
    fireEvent.click(bills)
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await screen.findByText('Permissions saved. They apply from their next action.')
    const [body] = sent('PUT', '/api/v1/users/p-old/permissions') as {
      grants: { code: string }[]
      denials: string[]
    }[]
    expect(body.grants).toEqual([])
    expect(body.denials).toHaveLength(1)
  })

  it('warns before collapsing several legacy job roles into one', async () => {
    const two = user('p-two', 'Huda', ['ACCOUNTANT', 'SALES_MANAGER'], ['b-sohar'])
    answers['/api/v1/users/p-two'] = () => json(200, two)
    answers['/api/v1/users/p-two/permissions'] = () =>
      json(200, {
        userId: 'p-two',
        role: 'ACCOUNTANT',
        roleCodes: ['ACCOUNTANT', 'SALES_MANAGER'],
        grants: [],
        denials: [],
        effective: ['bill.read', 'invoice.read'],
      })
    renderAt('/settings/team/p-two')
    expect(
      await screen.findByText(
        /They hold more than one role from before: Accountant, Sales manager/,
      ),
    ).toBeTruthy()
  })

  it('asks for branches when an Administrator moves to a job role, and sends them with the role', async () => {
    answers['PUT /api/v1/users/p-admin/role'] = () => json(200, ['ACCOUNTANT'])
    renderAt('/settings/team/p-admin')
    await screen.findByRole('heading', { name: 'Sami' })
    fireEvent.click(await screen.findByRole('button', { name: 'Role' }))
    fireEvent.click(await screen.findByRole('option', { name: /Accountant/ }))
    expect(await screen.findByText('Branches for the new role')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }))
    expect(await screen.findByText('Choose at least one branch.')).toBeTruthy()
    expect(sent('PUT', '/api/v1/users/p-admin/role')).toEqual([])
    const roleCard = screen
      .getByText('Branches for the new role')
      .closest('fieldset') as HTMLElement
    fireEvent.click(within(roleCard).getByRole('checkbox', { name: 'Sur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }))
    await screen.findByText('Role changed.')
    expect(sent('PUT', '/api/v1/users/p-admin/role')).toEqual([
      { roleCode: 'ACCOUNTANT', branchIds: ['b-sur'] },
    ])
  })

  it('asks an Administrator to confirm before taking it away from themselves', async () => {
    who = { ...OWNER, userId: 'p-admin', isOwner: false }
    answers['PUT /api/v1/users/p-admin/role'] = () => json(200, ['ACCOUNTANT'])
    renderAt('/settings/team/p-admin')
    await screen.findByRole('heading', { name: 'Sami' })
    fireEvent.click(await screen.findByRole('button', { name: 'Role' }))
    fireEvent.click(await screen.findByRole('option', { name: /Accountant/ }))
    const roleCard = (await screen.findByText('Branches for the new role')).closest(
      'fieldset',
    ) as HTMLElement
    fireEvent.click(within(roleCard).getByRole('checkbox', { name: 'Muscat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/You will be Accountant and no longer an Administrator/),
    ).toBeTruthy()
    expect(sent('PUT', '/api/v1/users/p-admin/role')).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change my role' }))
    await screen.findByText('Role changed.')
    expect(sent('PUT', '/api/v1/users/p-admin/role')).toEqual([
      { roleCode: 'ACCOUNTANT', branchIds: ['b-muscat'] },
    ])
  })

  it('shows the Owner read-only, and only the Owner can hand ownership to another Administrator', async () => {
    answers['POST /api/v1/settings/owner/handover'] = () =>
      json(200, { userId: 'p-admin', name: 'Sami' })
    renderAt('/settings/team/p-owner')
    expect(await screen.findByText("The Owner has full access. It can't be reduced.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change role' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hand over ownership' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'New Owner' }))
    fireEvent.click(await screen.findByRole('option', { name: /Sami/ }))
    fireEvent.change(within(dialog).getByLabelText('Your password'), {
      target: { value: 'secret-1' },
    })
    const handOver = within(dialog).getByRole('button', { name: 'Hand over' }) as HTMLButtonElement
    fireEvent.change(within(dialog).getByLabelText(/Type Real Trading LLC to confirm/), {
      target: { value: 'Real Trading' },
    })
    // Not the company's name: the server would refuse it, so it is not offered.
    expect(handOver.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(/Type Real Trading LLC to confirm/), {
      target: { value: '  real  trading llc ' },
    })
    expect(handOver.disabled).toBe(false)
    fireEvent.change(within(dialog).getByLabelText(/Type Real Trading LLC to confirm/), {
      target: { value: 'Real Trading LLC' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hand over' }))
    await waitFor(() => expect(sent('POST', '/api/v1/settings/owner/handover')).toHaveLength(1))
    expect(sent('POST', '/api/v1/settings/owner/handover')[0]).toEqual({
      toUserId: 'p-admin',
      currentPassword: 'secret-1',
      confirmCompanyName: 'Real Trading LLC',
    })
  })

  it('offers no handover to an Administrator looking at the Owner', async () => {
    who = { ...OWNER, userId: 'p-admin', isOwner: false }
    renderAt('/settings/team/p-owner')
    await screen.findByText("The Owner has full access. It can't be reduced.")
    expect(screen.queryByRole('button', { name: 'Hand over ownership' })).toBeNull()
  })
})

describe('Who works there', () => {
  const ROSTER = [
    {
      userId: 'p-owner',
      name: 'Mona',
      owner: true,
      allBranches: true,
      assigned: false,
      otherBranchCount: 0,
    },
    {
      userId: 'p-clerk',
      name: 'Laila',
      owner: false,
      allBranches: false,
      assigned: true,
      otherBranchCount: 2,
    },
    {
      userId: 'p-new',
      name: 'Omar',
      owner: false,
      allBranches: false,
      assigned: false,
      otherBranchCount: 1,
    },
  ]

  it('ticks who works here, keeps the Owner and Administrators fixed, and saves the whole list', async () => {
    answers['/api/v1/branches/b-sohar/people'] = () => json(200, ROSTER)
    answers['PUT /api/v1/branches/b-sohar/people'] = () => json(200, ROSTER)
    renderAt('/roster')
    const mona = (await screen.findByRole('checkbox', { name: /Mona/ })) as HTMLInputElement
    expect(mona.checked && mona.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Omar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save who works here' }))
    await screen.findByText('Saved.')
    expect(sent('PUT', '/api/v1/branches/b-sohar/people')).toEqual([
      { userIds: ['p-clerk', 'p-new'] },
    ])
  })

  it('says why a save that strands someone was refused', async () => {
    answers['/api/v1/branches/b-sohar/people'] = () => json(200, ROSTER)
    answers['PUT /api/v1/branches/b-sohar/people'] = () => refusal(409, 'branch-required')
    renderAt('/roster')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Laila/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save who works here' }))
    expect(
      await screen.findByText(
        'Someone you unticked works in no other branch. Give them another branch first.',
      ),
    ).toBeTruthy()
  })
})

// NOT RUN (static only). Backend 37b2fedca (review FR2-1): a 0% limit a role collapse carried is
// listed apart as read-only carriedLimits. Full replacement keeps it only while the save does not
// name its code, so the form must never send it back as a grant (that would lift the 0% to no limit
// at all), and must name it, as a denial, only when the reader unticks it.
describe('A carried limit (FR2-1)', () => {
  const CARRIED_VIEW = {
    userId: 'p-clerk',
    role: 'ACCOUNTANT',
    roleCodes: ['ACCOUNTANT'],
    grants: [{ code: 'invoice.approve', qualifier: null, value: null }],
    denials: [],
    effective: ['bill.read', 'invoice.approve', 'invoice.read', 'pos.sell'],
    carriedLimits: [{ code: 'pos.sell', qualifier: 'MAX_PERCENT', value: 0 }],
  }

  beforeEach(() => {
    answers['/api/v1/users/p-clerk/permissions'] = () => json(200, CARRIED_VIEW)
    answers['PUT /api/v1/users/p-clerk/permissions'] = () => json(200, CARRIED_VIEW)
    answers['/api/v1/permissions'] = () =>
      json(
        200,
        ['invoice.read', 'invoice.approve', 'bill.read', 'bill.settle', 'pos.sell'].map((code) => ({
          code,
          module: 'X',
          description: code,
          assignable: true,
        })),
      )
  })

  const sell = () => {
    const words = permissionWords('pos.sell', i18n.t, i18n)
    return screen
      .getAllByRole('checkbox')
      .find(
        (box) =>
          box.closest('fieldset')?.querySelector('legend')?.textContent === words.group &&
          box.closest('label')?.textContent?.startsWith(words.action),
      ) as HTMLInputElement
  }
  const carriedLine = () => {
    const words = permissionWords('pos.sell', i18n.t, i18n)
    return i18n.t('branchAccess.person.carriedLimit', {
      permission: `${words.group}: ${words.action}`,
      percent: 0,
    })
  }

  it('shows it read-only, and the till limit as the carried 0%', async () => {
    renderAt('/settings/team/p-clerk')
    expect(await screen.findByText(carriedLine())).toBeTruthy()
    expect(sell().checked).toBe(true)
    expect(document.body.textContent).toContain(
      i18n.t('branchAccess.person.sellLimitCarried', { percent: 0 }),
    )
  })

  it('never sends it back as a grant when another tick is saved', async () => {
    renderAt('/settings/team/p-clerk')
    await screen.findByText(carriedLine())
    const settle = screen
      .getAllByRole('checkbox')
      .find((box) => box.closest('label')?.textContent?.includes('Settle')) as HTMLInputElement
    fireEvent.click(settle)
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await screen.findByText('Permissions saved. They apply from their next action.')
    expect(sent('PUT', '/api/v1/users/p-clerk/permissions')).toEqual([
      { grants: [{ code: 'invoice.approve' }, { code: 'bill.settle' }], denials: [] },
    ])
  })

  it('names it as a denial when the reader unticks it, or the server would keep it', async () => {
    renderAt('/settings/team/p-clerk')
    await screen.findByText(carriedLine())
    fireEvent.click(sell())
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await screen.findByText('Permissions saved. They apply from their next action.')
    expect(sent('PUT', '/api/v1/users/p-clerk/permissions')).toEqual([
      { grants: [{ code: 'invoice.approve' }], denials: ['pos.sell'] },
    ])
  })

  it('replaces it only with a limit the reader types', async () => {
    renderAt('/settings/team/p-clerk')
    await screen.findByText(carriedLine())
    const limit = document.querySelector('input[name="posSellLimit"]') as HTMLInputElement
    fireEvent.change(limit, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    await screen.findByText('Permissions saved. They apply from their next action.')
    expect(sent('PUT', '/api/v1/users/p-clerk/permissions')).toEqual([
      {
        grants: [
          { code: 'invoice.approve' },
          { code: 'pos.sell', qualifier: 'MAX_PERCENT', value: 5 },
        ],
        denials: [],
      },
    ])
  })

  it('reads a server before 37b2fedca, which sends no carriedLimits, as before', async () => {
    const { carriedLimits: _omitted, ...older } = CARRIED_VIEW
    answers['/api/v1/users/p-clerk/permissions'] = () => json(200, older)
    renderAt('/settings/team/p-clerk')
    await screen.findAllByText('Given to them')
    expect(screen.queryByText(carriedLine())).toBeNull()
  })
})
