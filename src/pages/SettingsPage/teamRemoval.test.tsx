import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { TeamPage } from './TeamPage'

/**
 * Team members: switching a person off now, removing them at the renewal, keeping them, and
 * switching them back on (Business Rules US-2, US-3, LG-2). The server decides; the screen asks
 * it and says what it answered.
 */
const ADMIN = {
  userId: 'u-1',
  username: 'admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.users.manage', 'role.list'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PEOPLE = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const REMOVALS = '/api/v1/settings/scheduled-removals'
const SWITCHED_OFF = '/api/v1/users?status=DEACTIVATED&page=0&size=100'

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
    [`GET ${REMOVALS}`]: () => json(200, { open: true, renewsOn: '2026-11-05', removals: [] }),
    'GET /api/v1/roles': () => json(200, []),
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

  it('switches a person off now only after saying what happens, and sends the DELETE', async () => {
    answers['DELETE /api/v1/users/p-2'] = () => json(204)
    renderTeam()
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off now' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/cannot sign in from now on/)).toBeTruthy()
    expect(within(dialog).getByText(/Their name stays on everything they made/)).toBeTruthy()
    expect(sent('DELETE', '/api/v1/users/p-2')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off now' }))
    expect(await screen.findByText('Salim Test is switched off.')).toBeTruthy()
    expect(sent('DELETE', '/api/v1/users/p-2')).toHaveLength(1)
  })

  it('removes a person at the renewal, shows the day they leave, and keeps them on request', async () => {
    answers['POST /api/v1/users/p-2/scheduled-removal'] = () => {
      answers[`GET ${REMOVALS}`] = () =>
        json(200, {
          open: true,
          renewsOn: '2026-11-05',
          removals: [
            {
              id: 'r-1',
              kind: 'USER',
              subjectId: 'p-2',
              effectiveOn: '2026-11-05',
              status: 'SCHEDULED',
              scheduledBy: 'u-1',
              scheduledAt: '2026-10-21T08:00:00Z',
            },
          ],
        })
      return json(200, {
        id: 'r-1',
        kind: 'USER',
        subjectId: 'p-2',
        effectiveOn: '2026-11-05',
        status: 'SCHEDULED',
        scheduledBy: 'u-1',
        scheduledAt: '2026-10-21T08:00:00Z',
      })
    }
    answers['DELETE /api/v1/users/p-2/scheduled-removal'] = () => json(204)
    renderTeam()
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove at the renewal' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/can sign in until the renewal on/)).toBeTruthy()
    expect(within(dialog).getByText(/nothing is refunded/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove at the renewal' }))

    expect(await screen.findByText(/Salim Test leaves at the renewal on/)).toBeTruthy()
    const row = (await screen.findByText('salim@real.example')).closest('tr')!
    await waitFor(() => expect(within(row).getByText(/^Leaves /)).toBeTruthy())

    await openMenuOf('Salim Test')
    expect(screen.queryByRole('menuitem', { name: 'Remove at the renewal' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keep them' }))
    expect(await screen.findByText('Salim Test stays.')).toBeTruthy()
    expect(sent('DELETE', '/api/v1/users/p-2/scheduled-removal')).toHaveLength(1)
  })

  it('offers only "Switch off now" while removal at the renewal is not open', async () => {
    answers[`GET ${REMOVALS}`] = () => json(200, { open: false, renewsOn: null, removals: [] })
    renderTeam()
    await screen.findByText('Salim Test')
    await waitFor(() => expect(sent('GET', REMOVALS)).toHaveLength(1))
    await openMenuOf('Salim Test')
    expect(screen.getByRole('menuitem', { name: 'Switch off now' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Remove at the renewal' })).toBeNull()
  })

  it('says why the server refused, in our words', async () => {
    answers['DELETE /api/v1/users/p-2'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/last-administrator', status: 409 })
    renderTeam()
    await openMenuOf('Salim Test')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off now' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off now' }))
    expect(
      await within(dialog).findByText('The company must keep at least one administrator.'),
    ).toBeTruthy()
  })
})

describe('Team members, Removed', () => {
  it('lists the people switched off when the tab is opened, and switches one back on', async () => {
    answers[`GET ${SWITCHED_OFF}`] = () =>
      json(200, page([person('p-9', 'Huda', { enabled: false, roles: [] })]))
    answers['POST /api/v1/users/p-9/reactivate'] = () =>
      json(200, person('p-9', 'Huda', { roles: [] }))
    renderTeam()
    await screen.findByText('Salim Test')
    expect(sent('GET', SWITCHED_OFF)).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Removed/ }))
    const row = (await screen.findByText('huda@real.example')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Switch back on' }))
    expect(await screen.findByText('Huda Test is back on, with no role yet.')).toBeTruthy()
    expect(sent('POST', '/api/v1/users/p-9/reactivate')).toHaveLength(1)
  })

  it('says the plan is full when switching back on needs a place', async () => {
    answers[`GET ${SWITCHED_OFF}`] = () =>
      json(200, page([person('p-9', 'Huda', { enabled: false, roles: [] })]))
    answers['POST /api/v1/users/p-9/reactivate'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/extra-place-required', status: 409 })
    renderTeam()
    fireEvent.click(await screen.findByRole('button', { name: /Removed/ }))
    const row = (await screen.findByText('huda@real.example')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Switch back on' }))
    expect(await within(row).findByText(/Every place on your plan is in use/)).toBeTruthy()
  })
})
