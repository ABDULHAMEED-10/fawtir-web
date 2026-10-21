import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { MakeRolePage } from './MakeRolePage'
import { RolesPage } from './RolesPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-admin', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.users.manage', 'admin.roles.manage', 'role.list', 'role.read', 'tenant.plan.read'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const READER: Entitlements = { ...MANAGER, permissions: ['role.list', 'tenant.plan.read'] } as Entitlements

const ROLES = '/api/v1/roles'
const MATRIX = '/api/v1/roles/matrix'
const PEOPLE = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const PLAN = '/api/v1/settings/plan'

const permission = (code: string, module: string, qualifiers: string[] = []) => ({
  code,
  module,
  description: `${code} (server words)`,
  qualifiers,
})

const CATALOGUE = [
  permission('admin.users.manage', 'IDENTITY'),
  permission('admin.roles.manage', 'IDENTITY'),
  permission('tenant.plan.manage', 'TENANT'),
  permission('branch.manage', 'TENANT'),
  permission('erp.connection.manage', 'INTEGRATION'),
  permission('erp.connection.read', 'INTEGRATION'),
  permission('customer.read', 'CUSTOMER'),
  permission('invoice.read', 'INVOICE'),
  permission('invoice.draft', 'INVOICE', ['MAX_PERCENT']),
  permission('invoice.issue', 'INVOICE'),
  permission('creditnote.create', 'INVOICE', ['OWN']),
  permission('product.read', 'INVOICE'),
  permission('bill.settle', 'INVOICE'),
  permission('reports.read', 'REPORT'),
]

const full = { state: 'FULL', qualifier: null, value: null }

const MATRIX_BODY = {
  permissions: CATALOGUE,
  roles: [
    { id: 'r-admin', code: 'ADMIN', name: 'Administrator', systemRole: true, enabled: true,
      cells: Object.fromEntries(CATALOGUE.map((p) => [p.code, full])) },
    { id: 'r-sales', code: 'SALES_MANAGER', name: 'Sales manager', systemRole: true, enabled: true,
      cells: { 'customer.read': full, 'invoice.read': full, 'invoice.issue': full } },
    { id: 'r-approver', code: 'APPROVER', name: 'Approver', systemRole: true, enabled: true,
      cells: { 'invoice.read': full } },
    { id: 'r-collect', code: 'collections_ab12cd', name: 'Collections', systemRole: false, enabled: true,
      cells: {
        'invoice.read': full,
        'creditnote.create': { state: 'LIMITED', qualifier: 'OWN', value: null },
        'admin.users.manage': full,
      } },
  ],
}

const ROLE_LIST = [
  { id: 'r-admin', code: 'ADMIN', name: 'Administrator', description: null, enabled: true, systemRole: true,
    catalogueKind: 'ROLE', permissionCodes: ['admin.users.manage', 'invoice.read'] },
  { id: 'r-sales', code: 'SALES_MANAGER', name: 'Sales manager', description: 'Sells and invoices',
    enabled: true, systemRole: true, catalogueKind: 'ROLE', permissionCodes: ['invoice.read'] },
  { id: 'r-approver', code: 'APPROVER', name: 'Approver', description: null, enabled: true, systemRole: true,
    catalogueKind: 'PERMISSION_SET', permissionCodes: ['invoice.approve'] },
  { id: 'r-collect', code: 'collections_ab12cd', name: 'Collections', description: 'Chases payments',
    enabled: true, systemRole: false, catalogueKind: 'CUSTOM',
    permissionCodes: ['admin.users.manage', 'creditnote.create', 'invoice.read'] },
]

const USERS = {
  content: [
    { id: 'p-1', username: 'a', email: 'a@x.om', firstName: 'A', lastName: null, enabled: true,
      mfaEnabled: true, roles: ['collections_ab12cd'], createdAt: '2026-10-01T08:00:00Z', locked: false,
      lockedUntil: null },
  ],
  totalElements: 1, totalPages: 1, number: 0, size: 100,
}

const PLAN_OVERVIEW = {
  plan: { code: 'STARTER', name: 'Starter', invoicesPerMonth: 300, peopleIncluded: 5, branchesIncluded: null },
  usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-21' }, used: 1, resubmissions: 0,
    quota: 300, raisedToday: 0 },
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

const problem = (status: number, type: string) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, title: 'Refused', status, detail: 'English only' })

let who: Entitlements
let writes: { method: string; url: string; body: unknown }[]
let onWrite: (method: string, url: string) => Response
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  who = MANAGER
  writes = []
  onWrite = (method) => (method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, ROLE_LIST[3]))
  const reads: Record<string, () => Response> = {
    [ROLES]: () => json(200, ROLE_LIST),
    [MATRIX]: () => json(200, MATRIX_BODY),
    [PEOPLE]: () => json(200, USERS),
    [PLAN]: () => json(200, PLAN_OVERVIEW),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (method !== 'GET') {
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return onWrite(method, url)
    }
    const answer = reads[url]
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
        <Route path="/settings/roles" element={<RolesPage />} />
        <Route path="/settings/roles/new" element={<MakeRolePage />} />
        <Route path="/settings/roles/:roleId/edit" element={<MakeRolePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const switchFor = (name: string) => screen.getByRole('switch', { name })

describe('Make a role', () => {
  it("offers the server's catalogue without anything only Administrators do", async () => {
    renderAt('/settings/roles/new')
    await screen.findByRole('switch', { name: 'Invoices: See' })
    expect(screen.queryByRole('switch', { name: 'People: Manage' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Roles: Manage' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Plan and billing: Manage' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Branches: Manage' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'ERP connections: Manage' })).toBeNull()
    // The ERP read is not Administrator-only, so it is offered.
    expect(switchFor('ERP connections: See')).toBeTruthy()
    // Built-in job roles to start from; never the Administrator, never approve or view only (RL-2).
    expect(screen.getByRole('button', { name: /^Sales manager/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Administrator/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Approver/ })).toBeNull()
    // Words, never codes or the server's English descriptions.
    expect(document.body.textContent).not.toMatch(/invoice\.read|server words/)
    // 9 offered, Sales manager starts with 3 of them on.
    expect(screen.getByText('3 of 9 turned on · changed from Sales manager')).toBeTruthy()
    expect(await screen.findByText('2 free')).toBeTruthy()
  })

  it('makes the role with a code the server accepts, full and limited grants apart', async () => {
    renderAt('/settings/roles/new')
    await screen.findByRole('switch', { name: 'Invoices: See' })
    const make = screen.getByRole('button', { name: /Make the role/ }) as HTMLButtonElement
    expect(make.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Name this role/), { target: { value: 'Delivery driver' } })
    fireEvent.change(screen.getByLabelText(/What it's for/), { target: { value: 'Takes payment at the door' } })
    fireEvent.click(switchFor('Invoices: Issue'))
    fireEvent.click(switchFor('Credit notes: Create'))
    fireEvent.click(screen.getByRole('button', { name: 'Limit for Credit notes: Create' }))
    fireEvent.click(screen.getByRole('option', { name: 'own only' }))
    fireEvent.click(switchFor('Invoices: Draft'))
    fireEvent.click(screen.getByRole('button', { name: 'Limit for Invoices: Draft' }))
    fireEvent.click(screen.getByRole('option', { name: 'discount up to 10%' }))
    fireEvent.click(make)

    await screen.findByRole('heading', { name: 'Collections' })
    expect(writes).toHaveLength(1)
    const { method, url, body } = writes[0] as { method: string; url: string; body: Record<string, unknown> }
    expect(`${method} ${url}`).toBe('POST /api/v1/roles')
    expect(body.code).toMatch(/^delivery_driver_[a-z0-9]{6}$/)
    expect(body).toMatchObject({
      name: 'Delivery driver',
      description: 'Takes payment at the door',
      permissionCodes: ['customer.read', 'invoice.read'],
      qualifiedPermissions: [
        { code: 'creditnote.create', qualifier: 'OWN' },
        { code: 'invoice.draft', qualifier: 'MAX_PERCENT', value: 10 },
      ],
    })
  })

  it('says why the server refused, in English and in Arabic, and stays on the page', async () => {
    onWrite = () => problem(403, 'reserved-permission')
    renderAt('/settings/roles/new')
    await screen.findByRole('switch', { name: 'Invoices: See' })
    fireEvent.change(screen.getByLabelText(/Name this role/), { target: { value: 'Clerk' } })
    fireEvent.click(screen.getByRole('button', { name: /Make the role/ }))
    expect(await screen.findByText(/only for Administrators, so it can't be part of a role you make/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('English only')

    await i18n.changeLanguage('ar')
    fireEvent.click(await screen.findByRole('button', { name: /اصنع الدور/ }))
    expect(await screen.findByText(/للمسؤولين فقط، فلا يمكن أن يكون جزءًا من دور تصنعه/)).toBeTruthy()
  })

  it('says a clash on the role code is a clash, and other refusals in words', async () => {
    onWrite = () => problem(409, 'resource-conflict')
    renderAt('/settings/roles/new')
    await screen.findByRole('switch', { name: 'Invoices: See' })
    fireEvent.change(screen.getByLabelText(/Name this role/), { target: { value: 'Clerk' } })
    fireEvent.click(screen.getByRole('button', { name: /Make the role/ }))
    expect(await screen.findByText(/Give it a different name and try again/)).toBeTruthy()

    onWrite = () => problem(403, 'insufficient-permission')
    fireEvent.click(screen.getByRole('button', { name: /Make the role/ }))
    expect(await screen.findByText("You can't make roles. Ask an Administrator.")).toBeTruthy()
  })

  it('is refused to anyone who may not manage roles, without reading the catalogue', async () => {
    who = READER
    renderAt('/settings/roles/new')
    expect(await screen.findByText(/doesn't have access/)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === MATRIX)).toBe(false)
  })
})

describe('Change a role', () => {
  it("starts from the role's own column and sends the whole column back", async () => {
    renderAt('/settings/roles/r-collect/edit')
    expect(await screen.findByRole('heading', { name: 'Change a role' })).toBeTruthy()
    expect(((await screen.findByLabelText(/Name this role/)) as HTMLInputElement).value).toBe('Collections')
    expect(switchFor('Invoices: See').getAttribute('aria-checked')).toBe('true')
    expect(switchFor('Credit notes: Create').getAttribute('aria-checked')).toBe('true')
    // No "start from" when changing a role.
    expect(screen.queryByText('Start from')).toBeNull()
    // It holds an Administrator-only code (saved before RL-5 was enforced): saving drops it.
    expect(screen.getByText(/It has one thing only Administrators may do. Saving takes it away/)).toBeTruthy()
    expect(await screen.findByText(/One person has this role/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/What it's for/), { target: { value: '' } })
    fireEvent.click(switchFor('Reports: See'))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('heading', { name: 'Collections' })
    expect(writes).toEqual([
      {
        method: 'PATCH',
        url: '/api/v1/roles/r-collect',
        body: {
          name: 'Collections',
          description: '',
          permissionCodes: ['invoice.read', 'reports.read'],
          qualifiedPermissions: [{ code: 'creditnote.create', qualifier: 'OWN' }],
        },
      },
    ])
  })

  it("does not open Fawtir's own roles for changing", async () => {
    renderAt('/settings/roles/r-sales/edit')
    expect(await screen.findByText(/Fawtir's own roles can't be changed/)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('Roles list', () => {
  it('lists job roles only and offers change and delete on the roles the company made', async () => {
    renderAt('/settings/roles')
    const collections = (await screen.findByRole('heading', { name: 'Collections' })).closest('section')!
    expect(screen.queryByRole('heading', { name: 'Approver' })).toBeNull()
    expect(within(collections).getByRole('link', { name: 'Change Collections' }).getAttribute('href')).toBe(
      '/settings/roles/r-collect/edit',
    )
    expect(within(collections).getByRole('button', { name: 'Delete Collections' })).toBeTruthy()
    const sales = screen.getByRole('heading', { name: 'Sales manager' }).closest('section')!
    expect(within(sales).queryByRole('button', { name: /Delete/ })).toBeNull()
  })

  it('hides change and delete from those who may not manage roles', async () => {
    who = { ...MANAGER, permissions: ['admin.users.manage', 'role.list'] } as Entitlements
    renderAt('/settings/roles')
    await screen.findByRole('heading', { name: 'Collections' })
    expect(screen.queryByRole('link', { name: /Change Collections/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete Collections/ })).toBeNull()
  })

  it('says why a role someone holds is not deleted', async () => {
    onWrite = () => problem(409, 'resource-conflict')
    renderAt('/settings/roles')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Collections' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/One person has this role. Give them another role first/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the role' }))
    expect(await within(dialog).findByText(/Someone still has this role/)).toBeTruthy()
    expect(writes).toEqual([{ method: 'DELETE', url: '/api/v1/roles/r-collect', body: undefined }])
  })

  it('deletes a role and reads the list again', async () => {
    renderAt('/settings/roles')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Collections' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete the role' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fetchMock.mock.calls.filter(([url, init]) => url === ROLES && (init?.method ?? 'GET') === 'GET').length).toBeGreaterThan(1)
  })
})
