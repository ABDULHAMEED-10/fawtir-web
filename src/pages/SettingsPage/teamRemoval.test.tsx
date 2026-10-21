import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { TeamPage } from './TeamPage'

/**
 * Team members: switching a person off and back on (Business Rules US-2, US-3, LG-2; option (a),
 * 21 Oct 2026). Access stops at once; the paid place stays until the renewal and can be given to
 * someone else. The server decides; the screen asks it and says what it answered.
 */
const ADMIN = {
  userId: 'u-1',
  username: 'admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.users.manage', 'role.list', 'tenant.plan.read'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PEOPLE = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const SWITCHED_OFF = '/api/v1/users?status=DEACTIVATED&page=0&size=100'
const EXTRAS = '/api/v1/settings/plan/extras'

const role = (id: string, code: string, name: string) => ({
  id,
  code,
  name,
  description: null,
  enabled: true,
  systemRole: true,
  permissionCodes: [],
  catalogueKind: 'ROLE',
})
const ROLES = [
  role('r-admin', 'ADMIN', 'Administrator'),
  role('r-accountant', 'ACCOUNTANT', 'Accountant'),
  role('r-cashier', 'CASHIER', 'Cashier'),
]

const placesOverview = (users: Record<string, unknown>) => ({
  open: true,
  users,
  branches: {
    included: 1,
    inUse: 1,
    paidPlacesNow: 0,
    capacity: 1,
    unitMonthlyPrice: null,
    offered: true,
  },
  erpAddon: { offered: false, monthlyPrice: null, status: null, endsOn: null },
  maxUsersPerOrder: 10,
  maxBranchesPerOrder: 5,
  outstanding: null,
  places: [],
})

const person = (id: string, firstName: string, extra: Record<string, unknown> = {}) => ({
  id,
  username: firstName.toLowerCase(),
  email: `${firstName.toLowerCase()}@real.example`,
  firstName,
  lastName: 'Test',
  enabled: true,
  mfaEnabled: true,
  roles: ['ACCOUNTANT'],
  createdAt: '2026-10-01T08:00:00Z',
  locked: false,
  lockedUntil: null,
  ...extra,
})

const page = (content: unknown[]) => ({
  content,
  totalElements: content.length,
  totalPages: 1,
  number: 0,
  size: 100,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let answers: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  answers = {
    [`GET ${PEOPLE}`]: () =>
      json(
        200,
        page([
          person('p-owner', 'Mona', { owner: true, roles: ['ADMIN'] }),
          person('u-1', 'Admin', { roles: ['ADMIN'] }),
          person('p-2', 'Salim'),
        ]),
      ),
    [`GET ${SUBSCRIPTION}`]: () => json(200, { renewsOn: '2026-11-05' }),
    'GET /api/v1/roles': () => json(200, ROLES),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    const answer = answers[`${init?.method ?? 'GET'} ${url}`]
    return answer ? answer() : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const sent = (method: string, url: string) =>
  fetchMock.mock.calls.filter(
    ([u, init]) => u === url && ((init as RequestInit)?.method ?? 'GET') === method,
  )

function renderTeam() {
  return render(
    <MemoryRouter initialEntries={['/settings/team']}>
      <Routes>
        <Route path="/settings/team" element={<TeamPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openMenuOf(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
}

describe('Team members, switching a person off', () => {
  it('offers no switch-off on the Owner or on your own row', async () => {
    renderTeam()
    await screen.findByText('Salim Test')
    expect(await screen.findByRole('button', { name: 'Actions for Salim Test' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Actions for Mona Test' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Actions for Admin Test' })).toBeNull()
  })

  it('switches a person off only after saying access stops and the paid place stays, then says so', async () => {
    answers['DELETE /api/v1/users/p-2'] = () => json(204)
    renderTeam()
    await waitFor(() => expect(sent('GET', SUBSCRIPTION).length).toBeGreaterThan(0))
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }))
    const dialog = await screen.findByRole('dialog')
    // Access stops now; paid until the renewal date; reusable at no extra charge; the name stays.
    expect(
      within(dialog).getByText(
        'Access stops now: Salim Test cannot sign in, and every session they have ends.',
      ),
    ).toBeTruthy()
    expect(
      within(dialog).getByText(
        /^Their place is paid until .*2026, with no refund\. Until then you can give it to someone new at no extra charge\.$/,
      ),
    ).toBeTruthy()
    expect(within(dialog).getByText('Their name stays on every record they made.')).toBeTruthy()
    expect(sent('DELETE', '/api/v1/users/p-2')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off' }))
    expect(
      await screen.findByText(
        /^Access stopped for Salim Test\. The place is paid until .*2026 and can go to someone new at no extra charge\.$/,
      ),
    ).toBeTruthy()
    expect(sent('DELETE', '/api/v1/users/p-2')).toHaveLength(1)
  })

  it('reads the switch-off dialog from the start, not from the end-aligned menu cell', async () => {
    renderTeam()
    await waitFor(() => expect(sent('GET', SUBSCRIPTION).length).toBeGreaterThan(0))
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.closest('.text-start, .text-end')?.classList.contains('text-start')).toBe(true)
  })

  it('keeps the hidden column headings inside the scrolling table, so the page does not scroll sideways', async () => {
    renderTeam()
    const heading = await screen.findByText('Actions', { selector: '.sr-only' })
    expect(heading.closest('.overflow-x-auto')?.classList.contains('relative')).toBe(true)
  })

  it('says "until the next renewal" when the subscription date cannot be read', async () => {
    answers[`GET ${SUBSCRIPTION}`] = () => json(403, { type: 'about:blank' })
    answers['DELETE /api/v1/users/p-2'] = () => json(204)
    renderTeam()
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'Their place is paid until the next renewal, with no refund. Until then you can give it to someone new at no extra charge.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off' }))
    expect(
      await screen.findByText(
        'Access stopped for Salim Test. The place is paid until the next renewal and can go to someone new at no extra charge.',
      ),
    ).toBeTruthy()
  })

  it('says why the server refused, in our words', async () => {
    answers['DELETE /api/v1/users/p-2'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/last-administrator', status: 409 })
    renderTeam()
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off' }))
    expect(
      await within(dialog).findByText('The company must keep at least one administrator.'),
    ).toBeTruthy()
  })
})

describe('Team members, Switched off', () => {
  const huda = (extra: Record<string, unknown> = {}) =>
    person('p-9', 'Huda', { enabled: false, roles: [], ...extra })

  it('lists the people switched off when the tab is opened, and switches one back on with the role chosen', async () => {
    answers[`GET ${SWITCHED_OFF}`] = () => json(200, page([huda()]))
    answers['POST /api/v1/users/p-9/reactivate'] = () =>
      json(200, person('p-9', 'Huda', { roles: ['CASHIER'] }))
    renderTeam()
    await screen.findByText('Salim Test')
    expect(sent('GET', SWITCHED_OFF)).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Switched off/ }))
    const row = (await screen.findByText('huda@real.example')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Switch back on' }))
    const dialog = await screen.findByRole('dialog', { name: /Switch Huda Test back on/ })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Role' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Cashier' }))
    expect(sent('POST', '/api/v1/users/p-9/reactivate')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch back on' }))

    expect(await screen.findByText('Huda Test is back on as Cashier.')).toBeTruthy()
    const [, init] = sent('POST', '/api/v1/users/p-9/reactivate')[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ roleId: 'r-cashier' })
  })

  it('preselects the role the person held, and says when and by whom they were switched off', async () => {
    answers[`GET ${SWITCHED_OFF}`] = () =>
      json(
        200,
        page([
          huda({
            deactivatedAt: '2026-10-20T09:30:00Z',
            deactivatedByName: 'Mona Test',
            previousRoles: ['ACCOUNTANT'],
          }),
        ]),
      )
    answers['POST /api/v1/users/p-9/reactivate'] = () =>
      json(200, person('p-9', 'Huda', { roles: [] }))
    renderTeam()
    fireEvent.click(await screen.findByRole('button', { name: /Switched off/ }))
    const row = (await screen.findByText('huda@real.example')).closest('tr')!
    expect(within(row).getByText(/^Switched off on .*2026 by Mona Test$/)).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Switch back on' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Accountant')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch back on' }))
    // A server that does not take the role yet answers no role; the screen says so.
    expect(await screen.findByText('Huda Test is back on, with no role yet.')).toBeTruthy()
    const [, init] = sent('POST', '/api/v1/users/p-9/reactivate')[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ roleId: 'r-accountant' })
  })

  it('draws no "switched off on" line while the server does not say when', async () => {
    answers[`GET ${SWITCHED_OFF}`] = () => json(200, page([huda()]))
    renderTeam()
    fireEvent.click(await screen.findByRole('button', { name: /Switched off/ }))
    const row = (await screen.findByText('huda@real.example')).closest('tr')!
    expect(within(row).queryByText(/Switched off on/)).toBeNull()
  })

  it('says the plan is full when switching back on needs a place', async () => {
    answers[`GET ${SWITCHED_OFF}`] = () =>
      json(200, page([huda({ previousRoles: ['ACCOUNTANT'] })]))
    answers['POST /api/v1/users/p-9/reactivate'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/extra-place-required', status: 409 })
    renderTeam()
    fireEvent.click(await screen.findByRole('button', { name: /Switched off/ }))
    const row = (await screen.findByText('huda@real.example')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Switch back on' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Accountant')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch back on' }))
    expect(await within(dialog).findByText(/Every place on your plan is in use/)).toBeTruthy()
  })
})

describe('Team members, free paid places', () => {
  it('counts the paid user places nobody uses', async () => {
    // Plan includes 3; 4 in use need 1 paid place; 3 paid now, so 2 are free.
    answers[`GET ${EXTRAS}`] = () =>
      json(
        200,
        placesOverview({
          included: 3,
          inUse: 4,
          paidPlacesNow: 3,
          capacity: 6,
          unitMonthlyPrice: '2.500',
          offered: true,
        }),
      )
    renderTeam()
    expect(
      await screen.findByText('2 paid places free, for someone new at no extra charge'),
    ).toBeTruthy()
  })
})
