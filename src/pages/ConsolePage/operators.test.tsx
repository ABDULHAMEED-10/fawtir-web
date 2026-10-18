import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, peekEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { PlatformUser, UserPage } from '../../lib/console/platformOperators'
import { OperatorsPage } from './OperatorsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const usersUrl = (page = 0) => `/api/v1/users?page=${page}&size=50&sort=createdAt,asc`
const roleUrl = (userId: string, role: string) => `/api/v1/platform/operators/${userId}/roles/${role}`
const PENDING_URL = '/api/v1/users/invitations?status=PENDING&page=0&size=100'
const EXPIRED_URL = '/api/v1/users/invitations?status=EXPIRED&page=0&size=100'
const CSRF = 'csrf-token-value'

const OPERATOR: Entitlements = {
  userId: 'u-self',
  username: 'hafidh.ops',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform Tenant Administrator', systemRole: true }],
  permissions: ['platform.tenants.manage', 'platform.operators.manage', 'admin.users.manage', 'platform.support'],
  scopes: [],
  featureFlags: {},
}

const SELF: PlatformUser = {
  id: 'u-self',
  username: 'hafidh.ops',
  email: 'hafidh@example.test',
  firstName: 'Hafidh',
  lastName: 'Al Harthi',
  enabled: true,
  roles: ['PLATFORM_TENANT_ADMIN', 'PLATFORM_SUPPORT'],
  createdAt: '2026-09-01T08:00:00Z',
  mfaEnabled: false,
  locked: false,
  lockedUntil: null,
}
const NOOR: PlatformUser = {
  id: 'u-noor',
  username: 'noor.support',
  email: 'noor@example.test',
  firstName: 'Noor',
  lastName: null,
  enabled: true,
  roles: ['PLATFORM_SUPPORT'],
  createdAt: '2026-09-02T08:00:00.5Z',
  mfaEnabled: false,
  locked: false,
  lockedUntil: null,
}
const SAID: PlatformUser = {
  id: 'u-said',
  username: 'said.new',
  email: 'said@example.test',
  firstName: null,
  lastName: null,
  enabled: false,
  roles: ['PLATFORM_OPERATOR'],
  createdAt: '2026-09-03T08:00:00.123456Z',
  mfaEnabled: false,
  locked: false,
  lockedUntil: null,
}

const page = (content: PlatformUser[], extra: Partial<UserPage> = {}): UserPage => ({
  content,
  totalElements: content.length,
  totalPages: 1,
  number: 0,
  size: 50,
  ...extra,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, detail: 'Server prose that must not be shown.' })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler | Handler[]>) {
  // The page also reads both open-invitation states; none unless a test says otherwise.
  const withInvitations = {
    [PENDING_URL]: () => json(200, []),
    [EXPIRED_URL]: () => json(200, []),
    ...handlers,
  }
  const queues = Object.fromEntries(
    Object.entries(withInvitations).map(([url, handler]) => [url, Array.isArray(handler) ? [...handler] : handler]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const initOf = (url: string, index = 0) => callsTo(url)[index][1] as RequestInit

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderOperators(path = '/console/operators') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/operators" element={<OperatorsPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const reads = (team: Handler | Handler[] = () => json(200, page([SELF, NOOR, SAID]))) => ({
  [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
  [usersUrl()]: team,
})

async function openTeam(extra: Record<string, Handler | Handler[]> = {}, team?: Handler | Handler[]) {
  answer({ ...reads(team), ...extra })
  renderOperators()
  await screen.findByText('Hafidh Al Harthi')
}

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement
const dialog = () => screen.getByRole('dialog')
const t = (key: string, values?: Record<string, string>) => i18n.t(key, values)
const roleName = (role: string) => t(`console.operators.role.${role}`)

/** Opens the named person's row menu and returns one of its items, or null when it is not offered. */
function rowAction(name: string, labelKey: string): HTMLButtonElement | null {
  fireEvent.click(within(row(name)).getByRole('button', { name: t('console.operators.actionsFor', { name }) }))
  // A floating menu is drawn in the body, not in the row; one is open at a time.
  return screen.queryByRole('menuitem', { name: t(labelKey) }) as HTMLButtonElement | null
}
const closeMenus = () => fireEvent.keyDown(document, { key: 'Escape' })

async function manage(name: string) {
  fireEvent.click(rowAction(name, 'console.operators.manage')!)
  await screen.findByRole('dialog')
}
const actionButton = (action: 'give' | 'remove', role: string) =>
  within(dialog()).getByRole('button', {
    name: t(action === 'give' ? 'console.operators.giveRole' : 'console.operators.removeRole', { role: roleName(role) }),
  }) as HTMLButtonElement
const confirmButton = (action: 'give' | 'remove') =>
  within(dialog()).getByRole('button', {
    name: t(action === 'give' ? 'console.operators.confirm.give' : 'console.operators.confirm.remove'),
  }) as HTMLButtonElement

async function confirm(action: 'give' | 'remove') {
  await act(async () => {
    fireEvent.click(confirmButton(action))
  })
}

beforeEach(async () => {
  // The loading test holds its read open until the page shows it. If that times out under load the
  // read stays in the shared registry and every later test joins it (see `inflight.ts`).
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Access', () => {
  it('reads the team once, ordered by creation, and each open invitation state once', async () => {
    await openTeam()

    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
    expect(callsTo(usersUrl())).toHaveLength(1)
    expect(callsTo(PENDING_URL)).toHaveLength(1)
    expect(callsTo(EXPIRED_URL)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['platform.operators.manage', ['admin.users.manage', 'platform.support']],
    ['admin.users.manage', ['platform.operators.manage', 'platform.support']],
  ])('shows no access, and reads nothing, without %s', async (_missing, permissions) => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, { ...OPERATOR, permissions }) })
    renderOperators()

    expect(await screen.findByText(t('console.access.missingPermission'))).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(0)
  })

  it('is not granted by a role name alone', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, { ...OPERATOR, permissions: ['platform.support'] }) })
    renderOperators()

    expect(await screen.findByText(t('console.access.missingPermission'))).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(0)
  })

  it('reads a backend 403 as no access, never as an empty team', async () => {
    answer(reads(() => problem(403, 'insufficient-permission')))
    renderOperators()

    expect(await screen.findByText(t('console.access.missingPermission'))).toBeTruthy()
    expect(screen.queryByText(t('console.operators.empty'))).toBeNull()
  })

  it('sends a 401 to sign in and forgets the cached entitlements', async () => {
    answer(reads(() => problem(401, 'unauthenticated')))
    renderOperators()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })
})

describe('Team', () => {
  it('shows each person, marks the signed-in operator, and names roles in the reader’s language', async () => {
    await openTeam()

    expect(within(row('Hafidh Al Harthi')).getByText(t('console.operators.you'))).toBeTruthy()
    expect(within(row('Hafidh Al Harthi')).getByText(roleName('PLATFORM_TENANT_ADMIN'))).toBeTruthy()
    expect(within(row('Hafidh Al Harthi')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
    expect(within(row('Noor')).queryByText(t('console.operators.you'))).toBeNull()
    expect(within(row('Noor')).getByText('noor@example.test')).toBeTruthy()
    expect(within(row('Noor')).getByText(t('console.operators.status.active'))).toBeTruthy()
  })

  it('falls back to the username, and shows a disabled person and names a role outside the catalogue', async () => {
    await openTeam()

    const said = row('said.new')
    expect(within(said).getByText(t('console.operators.status.off'))).toBeTruthy()
    expect(within(said).getByText(t('console.operators.noRoles'))).toBeTruthy()
    expect(within(said).getByText(t('console.operators.otherRole.PLATFORM_OPERATOR'))).toBeTruthy()
    expect(within(said).queryByText('PLATFORM_OPERATOR')).toBeNull()
  })

  it('shows an unknown role outside the catalogue by its code', async () => {
    await openTeam({}, () => json(200, page([SELF, { ...SAID, roles: ['SOMETHING_NEW'] }])))

    expect(within(row('said.new')).getByText('SOMETHING_NEW')).toBeTruthy()
  })

  it('shows a person the server sends without a roles list, with no roles', async () => {
    const bare = { ...NOOR } as Partial<PlatformUser>
    delete bare.roles
    await openTeam({}, () => json(200, page([SELF, bare as PlatformUser])))

    expect(within(row('Noor')).getByText(t('console.operators.noRoles'))).toBeTruthy()
    expect(within(row('Hafidh Al Harthi')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
  })

  it('shows a loading state until the team arrives', async () => {
    let release: (response: Response) => void = () => {}
    answer(reads(() => new Promise<Response>((resolve) => (release = resolve))))
    renderOperators()

    expect(await screen.findByText(t('console.operators.loading'))).toBeTruthy()
    await act(async () => release(json(200, page([SELF]))))
    expect(await screen.findByText('Hafidh Al Harthi')).toBeTruthy()
  })

  it('says so when the team is empty', async () => {
    answer(reads(() => json(200, page([]))))
    renderOperators()

    expect(await screen.findByText(t('console.operators.empty'))).toBeTruthy()
  })

  it.each([
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch')
      },
      'identityErrors.network',
    ],
  ])('offers a retry after %s', async (_label, failure, key) => {
    answer(reads([failure, () => json(200, page([SELF]))]))
    renderOperators()

    expect(await screen.findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    fireEvent.click(screen.getByRole('button', { name: t('console.access.retry') }))
    expect(await screen.findByText('Hafidh Al Harthi')).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(2)
  })

  it('pages through a large team from the URL', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [usersUrl(1)]: () => json(200, page([NOOR], { totalElements: 51, totalPages: 2, number: 1 })),
    })
    renderOperators('/console/operators?page=2')

    expect(await screen.findByText('Noor')).toBeTruthy()
    expect(screen.getByText('Showing 51–51 of 51')).toBeTruthy()
    expect(callsTo(usersUrl(1))).toHaveLength(1)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    await openTeam()

    expect(screen.getByRole('heading', { level: 1, name: t('console.operators.title') })).toBeTruthy()
    expect(within(row('Noor')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
    expect(t('console.operators.title')).not.toBe('Operators')
    expect(document.querySelector('main')?.textContent ?? '').not.toMatch(/Support|Tenant administration|Active/)
  })
})

describe('Roles dialog', () => {
  it('shows each platform role as held or not', async () => {
    await openTeam()
    await manage('Noor')

    expect(actionButton('give', 'PLATFORM_TENANT_ADMIN')).toBeTruthy()
    expect(actionButton('remove', 'PLATFORM_SUPPORT')).toBeTruthy()
    // Not held: tenant administration and Participant ID ownership.
    expect(within(dialog()).getAllByText(t('console.operators.notHeld'))).toHaveLength(2)
    expect(within(dialog()).getAllByText(t('console.operators.held'))).toHaveLength(1)
  })

  it('does not offer the signed-in operator a role for themselves', async () => {
    await openTeam({}, () => json(200, page([{ ...SELF, roles: ['PLATFORM_TENANT_ADMIN'] }, { ...NOOR, roles: ['PLATFORM_TENANT_ADMIN'] }])))
    await manage('Hafidh Al Harthi')

    expect(actionButton('give', 'PLATFORM_SUPPORT').disabled).toBe(true)
    expect(actionButton('give', 'PLATFORM_PARTICIPANT_OWNERSHIP').disabled).toBe(true)
    // One note per role the operator does not hold: support and Participant ID ownership.
    expect(within(dialog()).getAllByText(t('console.operators.selfGive'))).toHaveLength(2)
  })

  it('does not offer to remove the last tenant administrator', async () => {
    await openTeam()
    await manage('Hafidh Al Harthi')

    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(true)
    expect(within(dialog()).getByText(t('console.operators.lastAdmin'))).toBeTruthy()
    expect(actionButton('remove', 'PLATFORM_SUPPORT').disabled).toBe(false)
  })

  it('leaves the last-administrator decision to the backend when the team spans pages', async () => {
    await openTeam({}, () => json(200, page([SELF, NOOR], { totalElements: 60, totalPages: 2 })))
    await manage('Hafidh Al Harthi')

    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(false)
  })

  it('gives a role with one POST, after confirming, and shows the answer without re-reading', async () => {
    await openTeam({
      [roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')]: () =>
        json(200, { userId: 'u-noor', platformRoles: ['PLATFORM_SUPPORT', 'PLATFORM_TENANT_ADMIN'] }),
    })
    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))

    expect(
      within(dialog()).getByText(t('console.operators.confirm.giveTitle', { role: roleName('PLATFORM_TENANT_ADMIN'), name: 'Noor' })),
    ).toBeTruthy()
    expect(callsTo(roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN'))).toHaveLength(0)
    await confirm('give')

    const url = roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')
    expect(callsTo(url)).toHaveLength(1)
    expect(initOf(url).method).toBe('POST')
    expect(initOf(url).body).toBeUndefined()
    expect((initOf(url).headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    expect(await screen.findByText(t('console.operators.saved', { name: 'Noor' }))).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(row('Noor')).getByText(roleName('PLATFORM_TENANT_ADMIN'))).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(1)
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
  })

  it('removes a role with one DELETE and keeps roles the answer does not speak for', async () => {
    const said = { ...SAID, roles: ['PLATFORM_OPERATOR', 'PLATFORM_SUPPORT'] }
    await openTeam(
      { [roleUrl('u-said', 'PLATFORM_SUPPORT')]: () => json(200, { userId: 'u-said', platformRoles: [] }) },
      () => json(200, page([SELF, said])),
    )
    await manage('said.new')
    fireEvent.click(actionButton('remove', 'PLATFORM_SUPPORT'))
    expect(within(dialog()).getByText(t('console.operators.confirm.removeBody', { name: 'said.new' }))).toBeTruthy()
    await confirm('remove')

    expect(initOf(roleUrl('u-said', 'PLATFORM_SUPPORT')).method).toBe('DELETE')
    await screen.findByText(t('console.operators.saved', { name: 'said.new' }))
    expect(within(row('said.new')).getByText(t('console.operators.noRoles'))).toBeTruthy()
    expect(within(row('said.new')).getByText(t('console.operators.otherRole.PLATFORM_OPERATOR'))).toBeTruthy()
  })

  it('sends one request however often the confirmation is pressed', async () => {
    let release: (response: Response) => void = () => {}
    const url = roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')
    await openTeam({ [url]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))
    await confirm('give')
    const giving = within(dialog()).getByRole('button', { name: t('console.operators.confirm.giving') }) as HTMLButtonElement
    expect(giving.disabled).toBe(true)
    fireEvent.click(giving)

    expect(callsTo(url)).toHaveLength(1)
    await act(async () => release(json(200, { userId: 'u-noor', platformRoles: ['PLATFORM_SUPPORT', 'PLATFORM_TENANT_ADMIN'] })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(callsTo(url)).toHaveLength(1)
  })

  it('goes back to the roles without sending anything', async () => {
    await openTeam()
    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))
    fireEvent.click(within(dialog()).getByRole('button', { name: t('common.back') }))

    expect(actionButton('give', 'PLATFORM_TENANT_ADMIN')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['a refusal (403)', () => problem(403, 'insufficient-permission'), 'console.operators.error.refused'],
    ['a person who has gone (404)', () => problem(404, 'resource-not-found'), 'console.operators.error.gone'],
    ['rate limiting (429)', () => problem(429, 'rate-limited'), 'identityErrors.rateLimited'],
    ['a server fault (500)', () => problem(500, 'internal-error'), 'identityErrors.service'],
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch')
      },
      'identityErrors.network',
    ],
  ])('keeps the confirmation open and explains %s', async (_label, failure, key) => {
    await openTeam({ [roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')]: failure })
    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))
    await confirm('give')

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(confirmButton('give').disabled).toBe(false)
    expect(within(row('Noor')).queryByText(roleName('PLATFORM_TENANT_ADMIN'))).toBeNull()
  })

  it('leaves for sign in when the session ends mid-change', async () => {
    await openTeam({ [roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')]: () => problem(401, 'unauthenticated') })
    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))
    await confirm('give')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })

  it('shows a first-time grant even though the backend’s answer leaves it out', async () => {
    // What the local backend really answered for a role the person had never held.
    await openTeam({
      [roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')]: () => json(200, { userId: 'u-noor', platformRoles: ['PLATFORM_SUPPORT'] }),
    })
    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))
    await confirm('give')
    await screen.findByText(t('console.operators.saved', { name: 'Noor' }))

    expect(within(row('Noor')).getByText(roleName('PLATFORM_TENANT_ADMIN'))).toBeTruthy()
    expect(within(row('Noor')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
    await manage('Hafidh Al Harthi')
    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(false)
  })

  it('stops calling you the last tenant administrator once someone else is one', async () => {
    await openTeam({
      [roleUrl('u-noor', 'PLATFORM_TENANT_ADMIN')]: () =>
        json(200, { userId: 'u-noor', platformRoles: ['PLATFORM_SUPPORT', 'PLATFORM_TENANT_ADMIN'] }),
    })
    await manage('Hafidh Al Harthi')
    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })

    await manage('Noor')
    fireEvent.click(actionButton('give', 'PLATFORM_TENANT_ADMIN'))
    await confirm('give')
    await screen.findByText(t('console.operators.saved', { name: 'Noor' }))

    await manage('Hafidh Al Harthi')
    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(false)
    expect(within(dialog()).queryByText(t('console.operators.lastAdmin'))).toBeNull()
  })
})

describe('Changing your own roles', () => {
  const TWO_ADMINS = page([SELF, { ...NOOR, roles: ['PLATFORM_TENANT_ADMIN'] }])

  it('warns that removing your own tenant administration ends your access here', async () => {
    await openTeam({}, () => json(200, TWO_ADMINS))
    await manage('Hafidh Al Harthi')
    fireEvent.click(actionButton('remove', 'PLATFORM_TENANT_ADMIN'))

    expect(within(dialog()).getByText(t('console.operators.confirm.removeSelfBody'))).toBeTruthy()
    expect(within(dialog()).getByText(t('console.operators.confirm.removeSelfAdminBody'))).toBeTruthy()
  })

  it('asks again who you are afterwards, and says "no access" when that was the point', async () => {
    const url = roleUrl('u-self', 'PLATFORM_TENANT_ADMIN')
    answer({
      [ENTITLEMENTS_URL]: [
        () => json(200, OPERATOR),
        () => json(200, { ...OPERATOR, permissions: ['platform.support'] }),
      ],
      [usersUrl()]: () => json(200, TWO_ADMINS),
      [url]: () => json(200, { userId: 'u-self', platformRoles: ['PLATFORM_SUPPORT'] }),
    })
    renderOperators()
    await screen.findByText('Hafidh Al Harthi')
    await manage('Hafidh Al Harthi')
    fireEvent.click(actionButton('remove', 'PLATFORM_TENANT_ADMIN'))
    await confirm('remove')

    expect(await screen.findByText(t('console.access.missingPermission'))).toBeTruthy()
    expect(callsTo(url)).toHaveLength(1)
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(2)
    expect(callsTo(usersUrl())).toHaveLength(1)
  })

  it('shows the team again, freshly read, after removing a role you can do without', async () => {
    const url = roleUrl('u-self', 'PLATFORM_SUPPORT')
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [usersUrl()]: [() => json(200, page([SELF, NOOR])), () => json(200, page([{ ...SELF, roles: ['PLATFORM_TENANT_ADMIN'] }, NOOR]))],
      [url]: () => json(200, { userId: 'u-self', platformRoles: ['PLATFORM_TENANT_ADMIN'] }),
    })
    renderOperators()
    await screen.findByText('Hafidh Al Harthi')
    await manage('Hafidh Al Harthi')
    fireEvent.click(actionButton('remove', 'PLATFORM_SUPPORT'))
    await confirm('remove')

    await waitFor(() => expect(callsTo(usersUrl())).toHaveLength(2))
    await waitFor(() =>
      expect(within(row('Hafidh Al Harthi')).queryByText(roleName('PLATFORM_SUPPORT'))).toBeNull(),
    )
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(2)
  })
})

describe('Last administrator (P4)', () => {
  it('does not count a disabled tenant administrator as another one', async () => {
    await openTeam({}, () =>
      json(200, page([SELF, { ...NOOR, enabled: false, roles: ['PLATFORM_TENANT_ADMIN'] }])),
    )
    await manage('Hafidh Al Harthi')

    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(true)
    expect(within(dialog()).getByText(t('console.operators.lastAdmin'))).toBeTruthy()
  })
})

describe('Operator invitations (P7)', () => {
  const INVITE_URL = '/api/v1/platform/operators/invitations'
  const resendUrl = (id: string) => `${INVITE_URL}/${id}/resend`
  const revokeUrl = (id: string) => `/api/v1/users/invitations/${id}/revoke`
  const invitation = (id: string, email: string, extra: Record<string, unknown> = {}) => ({
    id,
    email,
    roleCodes: [],
    status: 'PENDING',
    invitedBy: 'u-self',
    expiresAt: '2026-09-20T10:00:00Z',
    sentCount: 1,
    lastSentAt: '2026-09-13T10:00:00Z',
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
    revokedBy: null,
    createdAt: '2026-09-13T10:00:00Z',
    kind: 'PLATFORM_OPERATOR',
    ...extra,
  })
  const OPEN = invitation('i-open', 'open@example.test')
  const OLD = invitation('i-old', 'old@example.test', {
    status: 'EXPIRED',
    createdAt: '2026-09-01T10:00:00Z',
    expiresAt: '2026-09-08T10:00:00Z',
  })
  const MEMBER = invitation('i-member', 'member@example.test', { kind: 'MEMBER', roleCodes: ['VIEWER'] })

  const pendingRow = (email: string) => screen.getByText(email).closest('tr') as HTMLElement
  const inviteButton = () => screen.getByRole('button', { name: t('console.operators.invite.open') })
  const emailInput = () => dialog().querySelector<HTMLInputElement>('input[name="email"]')!
  const sendButton = () =>
    within(dialog()).getByRole('button', { name: t('console.operators.invite.send') }) as HTMLButtonElement

  async function openWithInvitations(extra: Record<string, Handler | Handler[]> = {}) {
    await openTeam({
      [PENDING_URL]: () => json(200, [OPEN, MEMBER]),
      [EXPIRED_URL]: () => json(200, [OLD]),
      ...extra,
    })
    await screen.findByText('open@example.test')
  }

  async function sendInvite(address: string) {
    fireEvent.click(inviteButton())
    await screen.findByRole('dialog')
    fireEvent.change(emailInput(), { target: { value: address } })
    await act(async () => {
      fireEvent.click(sendButton())
    })
  }

  it('lists open operator invitations, pending and expired, newest first, and no member invitations', async () => {
    await openWithInvitations()

    const pendingSection = screen
      .getByRole('heading', { level: 2, name: t('console.operators.pending.title') })
      .closest('section') as HTMLElement
    const listed = Array.from(pendingSection.querySelectorAll('tbody bdi')).map((node) => node.textContent)
    expect(listed).toEqual(['open@example.test', 'old@example.test'])
    expect(screen.queryByText('member@example.test')).toBeNull()
    expect(within(pendingRow('old@example.test')).getByText(t('console.operators.pending.expired'))).toBeTruthy()
  })

  it('invites by email with one POST and adds the invitation without re-reading', async () => {
    const created = invitation('i-new', 'new@example.test', { createdAt: '2026-09-13T12:00:00Z' })
    await openWithInvitations({ [INVITE_URL]: () => json(201, created) })
    await sendInvite('  new@example.test ')

    expect(callsTo(INVITE_URL)).toHaveLength(1)
    const init = initOf(INVITE_URL)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'new@example.test' })
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    expect(await screen.findByText(t('console.operators.invite.sent', { email: 'new@example.test' }))).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pendingRow('new@example.test')).toBeTruthy()
    expect(callsTo(PENDING_URL)).toHaveLength(1)
    expect(callsTo(EXPIRED_URL)).toHaveLength(1)
  })

  it('refuses an invalid address before sending anything', async () => {
    await openWithInvitations()
    await sendInvite('not-an-address')

    expect(within(dialog()).getByText(t('validation.email'))).toBeTruthy()
    expect(callsTo(INVITE_URL)).toHaveLength(0)
  })

  it('sends one invitation however often send is pressed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await openWithInvitations({ [INVITE_URL]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await sendInvite('new@example.test')
    const sending = within(dialog()).getByRole('button', { name: t('console.operators.invite.sending') }) as HTMLButtonElement
    expect(sending.disabled).toBe(true)
    await act(async () => {
      fireEvent.submit(dialog().querySelector('form')!)
    })

    expect(callsTo(INVITE_URL)).toHaveLength(1)
    await act(async () => release(json(201, invitation('i-new', 'new@example.test'))))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each([
    ['an address already on the team or invited (409)', () => problem(409, 'resource-conflict'), 'console.operators.invite.error.conflict'],
    [
      'no acceptance page configured (503)',
      () =>
        json(503, {
          type: 'https://api.fawtir.om/problems/operator-invitations-not-configured',
          detail: 'Server prose that must not be shown.',
        }),
      'console.operators.invite.error.unavailable',
    ],
    ['a refusal (403)', () => problem(403, 'insufficient-permission'), 'console.operators.error.refused'],
    ['a server fault (500)', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('keeps the dialog open and explains %s', async (_label, failure, key) => {
    await openWithInvitations({ [INVITE_URL]: failure })
    await sendInvite('new@example.test')

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(sendButton().disabled).toBe(false)
  })

  it('resends with one POST, keeps the row and says the old link stopped working', async () => {
    await openWithInvitations({
      [resendUrl('i-open')]: () => json(200, { ...OPEN, sentCount: 2, lastSentAt: '2026-09-13T12:00:00Z' }),
    })
    fireEvent.click(
      screen.getByRole('button', { name: t('console.operators.pending.resendFor', { email: 'open@example.test' }) }),
    )

    expect(await screen.findByText(t('console.operators.pending.resent', { email: 'open@example.test' }))).toBeTruthy()
    expect(callsTo(resendUrl('i-open'))).toHaveLength(1)
    expect(initOf(resendUrl('i-open')).method).toBe('POST')
    expect(
      within(pendingRow('open@example.test')).getByText(i18n.t('console.operators.pending.sentTimes', { count: 2 })),
    ).toBeTruthy()
  })

  it('revokes on the generic path and removes the row', async () => {
    await openWithInvitations({
      [revokeUrl('i-old')]: () => json(200, { ...OLD, status: 'REVOKED', revokedAt: '2026-09-13T12:00:00Z' }),
    })
    fireEvent.click(
      screen.getByRole('button', { name: t('console.operators.pending.revokeFor', { email: 'old@example.test' }) }),
    )

    expect(await screen.findByText(t('console.operators.pending.revoked', { email: 'old@example.test' }))).toBeTruthy()
    expect(callsTo(revokeUrl('i-old'))).toHaveLength(1)
    expect(screen.queryByText('old@example.test')).toBeNull()
  })

  it('explains an invitation that closed meanwhile, on its own row', async () => {
    await openWithInvitations({ [resendUrl('i-open')]: () => problem(409, 'resource-conflict') })
    fireEvent.click(
      screen.getByRole('button', { name: t('console.operators.pending.resendFor', { email: 'open@example.test' }) }),
    )

    expect(
      await within(pendingRow('open@example.test')).findByText(t('console.operators.pending.error.closed')),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('keeps the team on screen when the invitations cannot be read, and retries them', async () => {
    await openTeam({ [PENDING_URL]: [() => problem(500, 'internal-error'), () => json(200, [OPEN])] })

    expect(await screen.findByText(t('identityErrors.service'))).toBeTruthy()
    expect(screen.getByText('Hafidh Al Harthi')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('console.access.retry') }))
    expect(await screen.findByText('open@example.test')).toBeTruthy()
    expect(callsTo(PENDING_URL)).toHaveLength(2)
  })
})

describe('Lock state (P9)', () => {
  it('shows who is locked, and when a lockout after failed sign-ins lifts', async () => {
    await openTeam({}, () =>
      json(
        200,
        page([
          SELF,
          { ...NOOR, locked: true, lockedUntil: null },
          { ...SAID, enabled: true, locked: true, lockedUntil: '2026-09-14T10:15:00Z' },
        ]),
      ),
    )

    expect(within(row('Noor')).getByText(t('console.operators.status.locked'))).toBeTruthy()
    expect(within(row('Noor')).queryByText(/Unlocks/)).toBeNull()
    expect(within(row('said.new')).getByText(t('console.operators.status.locked'))).toBeTruthy()
    expect(within(row('said.new')).getByText(/^Unlocks /)).toBeTruthy()
    expect(within(row('Hafidh Al Harthi')).getByText(t('console.operators.status.active'))).toBeTruthy()
  })

  it('does not count a tenant administrator an administrator locked as another one', async () => {
    await openTeam({}, () =>
      json(200, page([SELF, { ...NOOR, roles: ['PLATFORM_TENANT_ADMIN'], locked: true, lockedUntil: null }])),
    )
    await manage('Hafidh Al Harthi')

    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(true)
    expect(within(dialog()).getByText(t('console.operators.lastAdmin'))).toBeTruthy()
  })

  it('still counts one locked out for a while, as the backend does', async () => {
    await openTeam({}, () =>
      json(
        200,
        page([SELF, { ...NOOR, roles: ['PLATFORM_TENANT_ADMIN'], locked: true, lockedUntil: '2026-09-14T10:15:00Z' }]),
      ),
    )
    await manage('Hafidh Al Harthi')

    expect(actionButton('remove', 'PLATFORM_TENANT_ADMIN').disabled).toBe(false)
  })
})

describe('Deactivated operators (P9)', () => {
  const DEACTIVATED_URL = '/api/v1/users?status=DEACTIVATED&page=0&size=50&sort=deletedAt,desc'
  const reactivateUrl = (id: string) => `/api/v1/platform/operators/${id}/reactivate`
  const LAYLA: PlatformUser = {
    id: 'u-layla',
    username: 'layla.ops',
    email: 'layla@example.test',
    firstName: 'Layla',
    lastName: 'Al Said',
    enabled: false,
    roles: [],
    // Between Hafidh (08:00) and Noor (the next day), so she returns between them.
    createdAt: '2026-09-01T12:00:00.25Z',
    mfaEnabled: false,
    locked: false,
    lockedUntil: null,
  }
  const RETURNED: PlatformUser = { ...LAYLA, enabled: true }

  const section = () =>
    screen.getByRole('heading', { level: 2, name: t('console.operators.deactivated.title') }).closest('section') as HTMLElement
  const reason = () => dialog().querySelector<HTMLInputElement>('input[name="reason"]')!
  const confirmReactivate = () =>
    within(dialog()).getByRole('button', { name: t('console.operators.reactivate.confirm') }) as HTMLButtonElement
  const teamNames = () =>
    Array.from(document.querySelector('table')!.querySelectorAll('tbody tr')).map(
      (tr) => tr.querySelector('td span')?.firstChild?.textContent,
    )

  async function showDeactivated(extra: Record<string, Handler | Handler[]> = {}, team?: Handler | Handler[]) {
    await openTeam({ [DEACTIVATED_URL]: () => json(200, page([LAYLA])), ...extra }, team)
    fireEvent.click(within(section()).getByRole('button', { name: t('console.operators.deactivated.show') }))
  }

  async function reactivateLayla(why = 'Back from leave') {
    fireEvent.click(await screen.findByRole('button', { name: t('console.operators.deactivated.reactivateFor', { name: 'Layla Al Said' }) }))
    await screen.findByRole('dialog')
    fireEvent.change(reason(), { target: { value: why } })
    await act(async () => {
      fireEvent.click(confirmReactivate())
    })
  }

  it('reads nothing about deactivated operators until asked, then reads them once', async () => {
    await openTeam({ [DEACTIVATED_URL]: () => json(200, page([LAYLA])) })

    expect(callsTo(DEACTIVATED_URL)).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    fireEvent.click(within(section()).getByRole('button', { name: t('console.operators.deactivated.show') }))

    expect(await within(section()).findByText('Layla Al Said')).toBeTruthy()
    expect(within(section()).getByText('layla.ops')).toBeTruthy()
    expect(callsTo(DEACTIVATED_URL)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('reactivates with one POST carrying only the reason, returns the person with no role, and opens their roles', async () => {
    await showDeactivated({ [reactivateUrl('u-layla')]: () => json(200, RETURNED) })
    await reactivateLayla('  Back from leave ')

    expect(callsTo(reactivateUrl('u-layla'))).toHaveLength(1)
    const init = initOf(reactivateUrl('u-layla'))
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Back from leave' })
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)

    expect(await screen.findByRole('heading', { name: t('console.operators.dialog.title', { name: 'Layla Al Said' }) })).toBeTruthy()
    expect(actionButton('give', 'PLATFORM_SUPPORT').disabled).toBe(false)
    expect(screen.getByText(t('console.operators.reactivate.done', { name: 'Layla Al Said' }))).toBeTruthy()

    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(teamNames()).toEqual(['Hafidh Al Harthi', 'Layla Al Said', 'Noor', 'said.new'])
    expect(within(row('Layla Al Said')).getByText(t('console.operators.noRoles'))).toBeTruthy()
    expect(within(row('Layla Al Said')).getByText(t('console.operators.status.active'))).toBeTruthy()
    expect(within(section()).getByText(t('console.operators.deactivated.empty'))).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(1)
    expect(callsTo(DEACTIVATED_URL)).toHaveLength(1)
  })

  it('gives the returned person a role through the platform-role path only', async () => {
    await showDeactivated({
      [reactivateUrl('u-layla')]: () => json(200, RETURNED),
      [roleUrl('u-layla', 'PLATFORM_SUPPORT')]: () => json(200, { userId: 'u-layla', platformRoles: ['PLATFORM_SUPPORT'] }),
    })
    await reactivateLayla()
    fireEvent.click(await screen.findByRole('button', { name: t('console.operators.giveRole', { role: roleName('PLATFORM_SUPPORT') }) }))
    await confirm('give')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(initOf(roleUrl('u-layla', 'PLATFORM_SUPPORT')).method).toBe('POST')
    expect(within(row('Layla Al Said')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
  })

  it('does not place the person on a team that spans pages, but still opens their roles', async () => {
    await showDeactivated(
      { [reactivateUrl('u-layla')]: () => json(200, RETURNED) },
      () => json(200, page([SELF, NOOR], { totalElements: 60, totalPages: 2 })),
    )
    await reactivateLayla()

    expect(await screen.findByRole('heading', { name: t('console.operators.dialog.title', { name: 'Layla Al Said' }) })).toBeTruthy()
    expect(teamNames()).toEqual(['Hafidh Al Harthi', 'Noor'])
  })

  it('refuses a blank reason before sending anything, and takes focus to it', async () => {
    await showDeactivated()
    await reactivateLayla('   ')

    expect(within(dialog()).getByText(t('validation.required'))).toBeTruthy()
    expect(document.activeElement).toBe(reason())
    expect(callsTo(reactivateUrl('u-layla'))).toHaveLength(0)
  })

  it('never lets the reason run past what the backend accepts', async () => {
    await showDeactivated()
    fireEvent.click(await screen.findByRole('button', { name: t('console.operators.deactivated.reactivateFor', { name: 'Layla Al Said' }) }))
    await screen.findByRole('dialog')

    expect(reason().maxLength).toBe(280)
  })

  it('sends one reactivation however often it is confirmed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await showDeactivated({ [reactivateUrl('u-layla')]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await reactivateLayla()
    const busy = within(dialog()).getByRole('button', { name: t('console.operators.reactivate.confirming') }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    await act(async () => {
      fireEvent.submit(dialog().querySelector('form')!)
      fireEvent.submit(dialog().querySelector('form')!)
    })

    expect(callsTo(reactivateUrl('u-layla'))).toHaveLength(1)
    await act(async () => release(json(200, RETURNED)))
    expect(await screen.findByRole('heading', { name: t('console.operators.dialog.title', { name: 'Layla Al Said' }) })).toBeTruthy()
  })

  it.each([
    ['already active (409)', () => problem(409, 'resource-conflict'), 'console.operators.reactivate.error.active'],
    ['no longer deactivated here (404)', () => problem(404, 'resource-not-found'), 'console.operators.reactivate.error.gone'],
    ['a refusal (403)', () => problem(403, 'insufficient-permission'), 'console.operators.error.refused'],
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('explains %s in the dialog and changes nothing', async (_label, failure, key) => {
    await showDeactivated({ [reactivateUrl('u-layla')]: failure })
    await reactivateLayla()

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(teamNames()).toEqual(['Hafidh Al Harthi', 'Noor', 'said.new'])
    expect(confirmReactivate().disabled).toBe(false)
  })

  it('leaves for sign in when the session ends mid-reactivation', async () => {
    await showDeactivated({ [reactivateUrl('u-layla')]: () => problem(401, 'unauthenticated') })
    await reactivateLayla()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })

  it('says so when nobody is deactivated', async () => {
    await showDeactivated({ [DEACTIVATED_URL]: () => json(200, page([])) })

    expect(await within(section()).findByText(t('console.operators.deactivated.empty'))).toBeTruthy()
  })

  it('says when more were deactivated than one page shows', async () => {
    await showDeactivated({ [DEACTIVATED_URL]: () => json(200, page([LAYLA], { totalElements: 51, totalPages: 51, size: 1 })) })

    expect(
      await within(section()).findByText(t('console.operators.deactivated.more', { shown: '1', total: '51' })),
    ).toBeTruthy()
  })

  it('keeps the team on screen when the list cannot be read, and retries it', async () => {
    await showDeactivated({ [DEACTIVATED_URL]: [() => problem(500, 'internal-error'), () => json(200, page([LAYLA]))] })

    expect(await within(section()).findByText(t('identityErrors.service'))).toBeTruthy()
    expect(screen.getByText('Hafidh Al Harthi')).toBeTruthy()
    fireEvent.click(within(section()).getByRole('button', { name: t('console.access.retry') }))
    expect(await within(section()).findByText('Layla Al Said')).toBeTruthy()
    expect(callsTo(DEACTIVATED_URL)).toHaveLength(2)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    await showDeactivated()
    fireEvent.click(await screen.findByRole('button', { name: t('console.operators.deactivated.reactivateFor', { name: 'Layla Al Said' }) }))

    expect(await screen.findByRole('heading', { name: t('console.operators.reactivate.title', { name: 'Layla Al Said' }) })).toBeTruthy()
    expect(t('console.operators.reactivate.title', { name: 'Layla Al Said' })).toContain('إعادة تنشيط')
  })
})

describe('Two-step reset (P10)', () => {
  const resetUrl = (id: string) => `/api/v1/platform/operators/${id}/mfa-reset`
  const answered = (revokedSessions: number) => () =>
    json(200, { userId: 'u-noor', username: 'noor.support', revokedSessions, resetAt: '2026-09-14T10:00:00Z', resetBy: 'u-self' })
  const resetFor = (name: string) => rowAction(name, 'console.operators.mfaReset.open')
  const reason = () => dialog().querySelector<HTMLInputElement>('input[name="reason"]')!
  const confirmReset = () =>
    within(dialog()).getByRole('button', { name: t('console.operators.mfaReset.confirm') }) as HTMLButtonElement

  async function openReset(name = 'Noor') {
    fireEvent.click(resetFor(name)!)
    await screen.findByRole('dialog')
  }
  async function reset(why = 'Lost phone') {
    fireEvent.change(reason(), { target: { value: why } })
    await act(async () => {
      fireEvent.click(confirmReset())
    })
  }

  it('is offered for every other operator, disabled or locked included, but never on your own row', async () => {
    await openTeam({}, () => json(200, page([SELF, { ...NOOR, locked: true, lockedUntil: null }, SAID])))

    expect(resetFor('Hafidh Al Harthi')).toBeNull()
    closeMenus()
    expect(resetFor('Noor')).toBeTruthy()
    closeMenus()
    expect(resetFor('said.new')).toBeTruthy()
    expect(callsTo(resetUrl('u-noor'))).toHaveLength(0)
  })

  it('says an authenticator will be removed only when one is set up', async () => {
    await openTeam({}, () => json(200, page([SELF, { ...NOOR, mfaEnabled: true }, SAID])))
    await openReset('Noor')
    expect(within(dialog()).getByText(t('console.operators.mfaReset.bodyApp', { name: 'Noor' }))).toBeTruthy()
    fireEvent.click(within(dialog()).getByRole('button', { name: t('common.cancel') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await openReset('said.new')
    expect(within(dialog()).getByText(t('console.operators.mfaReset.bodyNoApp', { name: 'said.new' }))).toBeTruthy()
    expect(callsTo(resetUrl('u-noor'))).toHaveLength(0)
  })

  it('resets with one POST carrying only the reason, says how many sessions ended, and reads nothing again', async () => {
    await openTeam({ [resetUrl('u-noor')]: answered(2) }, () => json(200, page([SELF, { ...NOOR, mfaEnabled: true }, SAID])))
    await openReset()
    await reset('  Lost phone ')

    expect(callsTo(resetUrl('u-noor'))).toHaveLength(1)
    const init = initOf(resetUrl('u-noor'))
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Lost phone' })
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(i18n.t('console.operators.mfaReset.done', { name: 'Noor', count: 2 }))).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(1)

    // The row now knows the authenticator is gone.
    await openReset()
    expect(within(dialog()).getByText(t('console.operators.mfaReset.bodyNoApp', { name: 'Noor' }))).toBeTruthy()
  })

  it.each([
    [0, 'console.operators.mfaReset.doneNoSessions'],
    [1, 'console.operators.mfaReset.done'],
  ])('words the result for %s ended sessions', async (count, key) => {
    await openTeam({ [resetUrl('u-noor')]: answered(count) })
    await openReset()
    await reset()

    expect(await screen.findByText(i18n.t(key, { name: 'Noor', count }))).toBeTruthy()
  })

  it('refuses a blank reason before sending anything, and takes focus to it', async () => {
    await openTeam()
    await openReset()
    await reset('   ')

    expect(within(dialog()).getByText(t('validation.required'))).toBeTruthy()
    expect(document.activeElement).toBe(reason())
    expect(callsTo(resetUrl('u-noor'))).toHaveLength(0)
  })

  it('sends one reset however often it is confirmed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await openTeam({ [resetUrl('u-noor')]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await openReset()
    await reset()
    const busy = within(dialog()).getByRole('button', { name: t('console.operators.mfaReset.confirming') }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    await act(async () => {
      fireEvent.submit(dialog().querySelector('form')!)
      fireEvent.submit(dialog().querySelector('form')!)
    })

    expect(callsTo(resetUrl('u-noor'))).toHaveLength(1)
    await act(async () => release(answered(1)()))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each([
    ['a refusal (403)', () => problem(403, 'insufficient-permission'), 'console.operators.mfaReset.error.refused'],
    ['a person who has gone (404)', () => problem(404, 'resource-not-found'), 'console.operators.error.gone'],
    ['a reason the backend rejects (400)', () => problem(400, 'validation-failed'), 'console.operators.reason.invalid'],
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('keeps the dialog open and explains %s', async (_label, failure, key) => {
    await openTeam({ [resetUrl('u-noor')]: failure })
    await openReset()
    await reset()

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(confirmReset().disabled).toBe(false)
  })

  it('leaves for sign in when the session ends mid-reset', async () => {
    await openTeam({ [resetUrl('u-noor')]: () => problem(401, 'unauthenticated') })
    await openReset()
    await reset()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })

  it('reads in Arabic, with the Arabic plural', async () => {
    await i18n.changeLanguage('ar')
    await openTeam({ [resetUrl('u-noor')]: answered(3) })
    await openReset()

    expect(within(dialog()).getByRole('heading', { name: t('console.operators.mfaReset.title', { name: 'Noor' }) })).toBeTruthy()
    await reset()
    const done = i18n.t('console.operators.mfaReset.done', { name: 'Noor', count: 3 })
    expect(done).toContain('جلسات')
    expect(await screen.findByText(done)).toBeTruthy()
  })
})

describe('Row actions', () => {
  it('offers every action in one menu per row, the two that end access last and marked apart', async () => {
    await openTeam()
    rowAction('Noor', 'console.operators.manage')

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual([
      t('console.operators.manage'),
      t('console.operators.emailChange.open'),
      t('console.operators.lifecycle.lock'),
      t('console.operators.mfaReset.open'),
      t('console.operators.lifecycle.deactivate'),
    ])
    for (const key of ['console.operators.mfaReset.open', 'console.operators.lifecycle.deactivate']) {
      expect(screen.getByRole('menuitem', { name: t(key) }).className).toContain('text-danger-700')
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('offers your own row Roles and Change sign-in email only: nothing that would end your own access', async () => {
    await openTeam()
    rowAction('Hafidh Al Harthi', 'console.operators.manage')

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      t('console.operators.manage'),
      t('console.operators.emailChange.open'),
    ])
  })
})

describe('Email change (P8)', () => {
  const emailUrl = (id: string) => `/api/v1/platform/operators/${id}/email`
  const PENDING = {
    tenantId: 't-platform',
    userId: 'u-noor',
    username: 'noor.support',
    currentEmail: 'noor@example.test',
    requestedEmail: 'noor.new@example.test',
    status: 'PENDING_CONFIRMATION',
    expiresAt: '2026-09-15T10:00:00Z',
    requestedBy: 'u-self',
  }
  const pending = (extra: Record<string, unknown> = {}) => () => json(202, { ...PENDING, ...extra })
  const field = (name: string) => dialog().querySelector<HTMLInputElement>(`input[name="${name}"]`)!
  const send = () =>
    within(dialog()).getByRole('button', { name: t('console.operators.emailChange.confirm') }) as HTMLButtonElement
  // The sidebar's sign-out status is a live region too, so every status on screen is read.
  const notice = () => screen.getAllByRole('status').map((node) => node.textContent ?? '').join(' ').trim()

  async function openEmail(name = 'Noor') {
    fireEvent.click(rowAction(name, 'console.operators.emailChange.open')!)
    await screen.findByRole('dialog')
  }
  async function request(address: string, why = 'Moved team') {
    fireEvent.change(field('newEmail'), { target: { value: address } })
    fireEvent.change(field('reason'), { target: { value: why } })
    await act(async () => {
      fireEvent.click(send())
    })
  }

  it('shows the current address read-only and says nothing moves until they confirm', async () => {
    await openTeam()
    await openEmail()

    expect(field('currentEmail').value).toBe('noor@example.test')
    expect(field('currentEmail').readOnly).toBe(true)
    expect(within(dialog()).getByText(t('console.operators.emailChange.body', { name: 'Noor' }))).toBeTruthy()
    expect(callsTo(emailUrl('u-noor'))).toHaveLength(0)
  })

  it('asks with one PUT naming the address it replaces, and says who must confirm, without touching the row', async () => {
    await openTeam({ [emailUrl('u-noor')]: pending() })
    await openEmail()
    await request('  Noor.New@example.test ', '  Moved team ')

    expect(callsTo(emailUrl('u-noor'))).toHaveLength(1)
    const init = initOf(emailUrl('u-noor'))
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      expectedCurrentEmail: 'noor@example.test',
      newEmail: 'Noor.New@example.test',
      reason: 'Moved team',
    })
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(notice()).toContain('noor.new@example.test')
    expect(notice()).toContain('noor@example.test')
    expect(notice()).toContain('Noor')
    expect(within(row('Noor')).getByText('noor@example.test')).toBeTruthy()
    expect(callsTo(usersUrl())).toHaveLength(1)
  })

  it('tells you where to confirm when the address is your own', async () => {
    await openTeam({ [emailUrl('u-self')]: pending({ userId: 'u-self', currentEmail: 'hafidh@example.test', requestedEmail: 'h@example.test' }) })
    await openEmail('Hafidh Al Harthi')
    expect(within(dialog()).getByText(t('console.operators.emailChange.bodySelf'))).toBeTruthy()
    await request('h@example.test')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(notice()).toContain(t('console.user.confirmEmail'))
  })

  it('refuses an invalid or unchanged address, and a blank reason, before sending anything', async () => {
    await openTeam()
    await openEmail()

    await request('not-an-address')
    expect(within(dialog()).getByText(t('validation.email'))).toBeTruthy()
    expect(document.activeElement).toBe(field('newEmail'))

    await request(' NOOR@example.test ')
    expect(within(dialog()).getByText(t('console.operators.emailChange.error.same'))).toBeTruthy()

    await request('noor.new@example.test', '   ')
    expect(within(dialog()).getByText(t('validation.required'))).toBeTruthy()
    expect(document.activeElement).toBe(field('reason'))
    expect(callsTo(emailUrl('u-noor'))).toHaveLength(0)
  })

  it('sends one request however often it is confirmed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await openTeam({ [emailUrl('u-noor')]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await openEmail()
    await request('noor.new@example.test')
    await act(async () => {
      fireEvent.submit(dialog().querySelector('form')!)
      fireEvent.submit(dialog().querySelector('form')!)
    })

    expect(callsTo(emailUrl('u-noor'))).toHaveLength(1)
    await act(async () => release(pending()()))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says so when the address was already in place', async () => {
    await openTeam({ [emailUrl('u-noor')]: () => json(200, { ...PENDING, status: 'ALREADY_APPLIED', expiresAt: null }) })
    await openEmail()
    await request('noor.new@example.test')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(notice()).toBe(i18n.t('console.operators.emailChange.already', { name: 'Noor', newEmail: 'noor.new@example.test' }))
  })

  it.each([
    ['a taken address or a stale list (409)', () => problem(409, 'resource-conflict'), 'console.operators.emailChange.error.conflict'],
    ['details the backend rejects (400)', () => problem(400, 'validation-failed'), 'console.operators.emailChange.error.rejected'],
    ['a refusal (403)', () => problem(403, 'insufficient-permission'), 'console.operators.emailChange.error.refused'],
    ['a person who has gone (404)', () => problem(404, 'resource-not-found'), 'console.operators.error.gone'],
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('keeps the dialog open and explains %s', async (_label, failure, key) => {
    await openTeam({ [emailUrl('u-noor')]: failure })
    await openEmail()
    await request('noor.new@example.test')

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(send().disabled).toBe(false)
  })

  it('leaves for sign in when the session ends mid-request', async () => {
    await openTeam({ [emailUrl('u-noor')]: () => problem(401, 'unauthenticated') })
    await openEmail()
    await request('noor.new@example.test')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    await openTeam()
    await openEmail()

    expect(within(dialog()).getByRole('heading', { name: t('console.operators.emailChange.title', { name: 'Noor' }) })).toBeTruthy()
    expect(t('console.operators.emailChange.title', { name: 'Noor' })).toContain('تغيير بريد الدخول')
  })
})

describe('Lock, unlock and deactivate (P9)', () => {
  const lockUrl = (id: string) => `/api/v1/platform/operators/${id}/lock`
  const unlockUrl = (id: string) => `/api/v1/platform/operators/${id}/unlock`
  const deactivateUrl = (id: string) => `/api/v1/platform/operators/${id}/deactivate`
  const REASON = 'Left the support rotation'
  const DEACTIVATED_URL = '/api/v1/users?status=DEACTIVATED&page=0&size=50&sort=deletedAt,desc'
  const done = () => new Response(null, { status: 204 })
  const confirmButton = (action: 'lock' | 'unlock' | 'deactivate') =>
    within(dialog()).getByRole('button', { name: t(`console.operators.lifecycle.${action}Confirm`) }) as HTMLButtonElement
  const notice = () => screen.getAllByRole('status').map((node) => node.textContent ?? '').join(' ').trim()

  async function open(name: string, action: 'lock' | 'unlock' | 'deactivate') {
    fireEvent.click(rowAction(name, `console.operators.lifecycle.${action}`)!)
    await screen.findByRole('dialog')
  }
  async function confirmAction(action: 'lock' | 'unlock' | 'deactivate', why = REASON) {
    const reason = dialog().querySelector<HTMLInputElement>('input[name="reason"]')
    if (reason) fireEvent.change(reason, { target: { value: why } })
    await act(async () => {
      fireEvent.click(confirmButton(action))
    })
  }

  it('offers Unlock instead of Lock to someone locked, whether by an administrator or by wrong passwords', async () => {
    await openTeam({}, () =>
      json(200, page([SELF, { ...NOOR, locked: true, lockedUntil: null }, { ...SAID, locked: true, lockedUntil: '2026-09-14T10:15:00Z' }])),
    )

    expect(rowAction('Noor', 'console.operators.lifecycle.unlock')).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: t('console.operators.lifecycle.lock') })).toBeNull()
    closeMenus()
    expect(rowAction('said.new', 'console.operators.lifecycle.unlock')).toBeTruthy()
  })

  it('locks with one POST carrying only the reason, to the operator path, and shows the lock without re-reading', async () => {
    await openTeam({ [lockUrl('u-noor')]: done })
    await open('Noor', 'lock')
    expect(within(dialog()).getByText(t('console.operators.lifecycle.lockBody', { name: 'Noor' }))).toBeTruthy()
    await confirmAction('lock')

    expect(callsTo(lockUrl('u-noor'))).toHaveLength(1)
    const init = initOf(lockUrl('u-noor'))
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: REASON })
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(row('Noor')).getByText(t('console.operators.status.locked'))).toBeTruthy()
    expect(notice()).toContain(t('console.operators.lifecycle.lockDone', { name: 'Noor' }))
    expect(callsTo(usersUrl())).toHaveLength(1)
    expect(rowAction('Noor', 'console.operators.lifecycle.unlock')).toBeTruthy()
  })

  it('refuses a blank reason before sending anything, and takes focus to it', async () => {
    await openTeam()
    await open('Noor', 'lock')
    await confirmAction('lock', '   ')

    expect(within(dialog()).getByText(t('validation.required'))).toBeTruthy()
    expect(document.activeElement).toBe(dialog().querySelector('input[name="reason"]'))
    expect(callsTo(lockUrl('u-noor'))).toHaveLength(0)
  })

  it('unlocks with one POST and shows the person active again', async () => {
    await openTeam({ [unlockUrl('u-noor')]: done }, () => json(200, page([SELF, { ...NOOR, locked: true, lockedUntil: null }, SAID])))
    await open('Noor', 'unlock')
    await confirmAction('unlock')

    expect(callsTo(unlockUrl('u-noor'))).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(row('Noor')).getByText(t('console.operators.status.active'))).toBeTruthy()
    expect(notice()).toContain(t('console.operators.lifecycle.unlockDone', { name: 'Noor' }))
  })

  it('deactivates with one POST, moves the person off the team, and lists them first as deactivated', async () => {
    const LAYLA = { ...NOOR, id: 'u-layla', username: 'layla.ops', email: 'layla@example.test', firstName: 'Layla', enabled: false, roles: [] }
    await openTeam({ [deactivateUrl('u-noor')]: done, [DEACTIVATED_URL]: () => json(200, page([LAYLA])) })
    await open('Noor', 'deactivate')
    await confirmAction('deactivate')

    expect(callsTo(deactivateUrl('u-noor'))).toHaveLength(1)
    expect(initOf(deactivateUrl('u-noor')).method).toBe('POST')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('noor@example.test')).toBeNull()
    expect(notice()).toContain(t('console.operators.lifecycle.deactivateDone', { name: 'Noor' }))

    const section = screen
      .getByRole('heading', { level: 2, name: t('console.operators.deactivated.title') })
      .closest('section') as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: t('console.operators.deactivated.show') }))
    await within(section).findByText('Layla')
    const listed = Array.from(section.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td span')?.textContent)
    expect(listed).toEqual(['Noor', 'Layla'])
    expect(callsTo(usersUrl())).toHaveLength(1)
  })

  it('brings someone deactivated here back with no role, whatever the page read before', async () => {
    const reactivateUrl = '/api/v1/platform/operators/u-noor/reactivate'
    await openTeam({
      [deactivateUrl('u-noor')]: done,
      [DEACTIVATED_URL]: () => json(200, page([])),
      [reactivateUrl]: () => json(200, { ...NOOR, roles: [] }),
    })
    await open('Noor', 'deactivate')
    await confirmAction('deactivate')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const section = screen
      .getByRole('heading', { level: 2, name: t('console.operators.deactivated.title') })
      .closest('section') as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: t('console.operators.deactivated.show') }))
    fireEvent.click(
      await within(section).findByRole('button', { name: t('console.operators.deactivated.reactivateFor', { name: 'Noor' }) }),
    )
    fireEvent.change(dialog().querySelector<HTMLInputElement>('input[name="reason"]')!, { target: { value: 'Back' } })
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: t('console.operators.reactivate.confirm') }))
    })

    await screen.findByRole('heading', { name: t('console.operators.dialog.title', { name: 'Noor' }) })
    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(row('Noor')).getByText(t('console.operators.noRoles'))).toBeTruthy()
    expect(within(section).queryByText('Noor')).toBeNull()
  })

  it.each(['lock', 'deactivate'] as const)(
    'will not %s the last tenant administrator who can act, and sends nothing',
    async (action) => {
      await openTeam({}, () =>
        json(200, page([{ ...SELF, roles: ['PLATFORM_SUPPORT'] }, { ...NOOR, roles: ['PLATFORM_TENANT_ADMIN'] }])),
      )
      await open('Noor', action)

      expect(within(dialog()).getByText(t('console.operators.lastAdmin'))).toBeTruthy()
      expect(confirmButton(action).disabled).toBe(true)
      expect(callsTo(action === 'lock' ? lockUrl('u-noor') : deactivateUrl('u-noor'))).toHaveLength(0)
    },
  )

  it('sends one request however often it is confirmed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await openTeam({ [lockUrl('u-noor')]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await open('Noor', 'lock')
    await confirmAction('lock')
    const busy = within(dialog()).getByRole('button', { name: t('console.operators.lifecycle.lockSending') }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    await act(async () => {
      fireEvent.click(busy)
    })

    expect(callsTo(lockUrl('u-noor'))).toHaveLength(1)
    await act(async () => release(done()))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each([
    ['the last administrator, as the backend decides it (403)', () => problem(403, 'last-administrator'), 'console.operators.lastAdmin'],
    ['another refusal (403)', () => problem(403, 'insufficient-permission'), 'console.operators.lifecycle.error.refused'],
    ['a person who has gone (404)', () => problem(404, 'resource-not-found'), 'console.operators.error.gone'],
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('keeps the dialog open and explains %s', async (_label, failure, key) => {
    await openTeam({ [lockUrl('u-noor')]: failure })
    await open('Noor', 'lock')
    await confirmAction('lock')

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(within(row('Noor')).getByText(t('console.operators.status.active'))).toBeTruthy()
  })

  it('leaves for sign in when the session ends mid-change', async () => {
    await openTeam({ [deactivateUrl('u-noor')]: () => problem(401, 'unauthenticated') })
    await open('Noor', 'deactivate')
    await confirmAction('deactivate')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    await openTeam()
    await open('Noor', 'deactivate')

    expect(within(dialog()).getByRole('heading', { name: t('console.operators.lifecycle.deactivateTitle', { name: 'Noor' }) })).toBeTruthy()
    expect(t('console.operators.lifecycle.deactivateTitle', { name: 'Noor' })).toContain('إلغاء تنشيط')
  })
})

describe('Participant ID ownership role (V386)', () => {
  const OWNERSHIP = 'PLATFORM_PARTICIPANT_OWNERSHIP'
  const ownershipUrl = roleUrl('u-noor', OWNERSHIP)

  it('is offered beside the other platform roles, with its label and what it allows', async () => {
    await openTeam()
    await manage('Noor')

    expect(within(dialog()).getByText('Participant ID ownership')).toBeTruthy()
    expect(within(dialog()).getByText(t(`console.operators.roleNote.${OWNERSHIP}`))).toBeTruthy()
    expect(t(`console.operators.roleNote.${OWNERSHIP}`)).toMatch(/two different operators/)
    expect(actionButton('give', OWNERSHIP).disabled).toBe(false)
    // The roles that were there before are offered exactly as they were.
    expect(actionButton('give', 'PLATFORM_TENANT_ADMIN')).toBeTruthy()
    expect(actionButton('remove', 'PLATFORM_SUPPORT')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('gives the role with one bodiless POST to the role path', async () => {
    await openTeam({
      [ownershipUrl]: () => json(200, { userId: 'u-noor', platformRoles: ['PLATFORM_SUPPORT', OWNERSHIP] }),
    })
    await manage('Noor')
    fireEvent.click(actionButton('give', OWNERSHIP))
    expect(within(dialog()).getByText(t(`console.operators.roleNote.${OWNERSHIP}`))).toBeTruthy()
    await confirm('give')

    expect(callsTo(ownershipUrl)).toHaveLength(1)
    expect(initOf(ownershipUrl).method).toBe('POST')
    expect(initOf(ownershipUrl).body).toBeUndefined()
    expect((initOf(ownershipUrl).headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    await screen.findByText(t('console.operators.saved', { name: 'Noor' }))
    expect(within(row('Noor')).getByText('Participant ID ownership')).toBeTruthy()
    expect(within(row('Noor')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('removes the role with one DELETE and shows the person without it', async () => {
    const noor = { ...NOOR, roles: ['PLATFORM_SUPPORT', OWNERSHIP] }
    await openTeam(
      { [ownershipUrl]: () => json(200, { userId: 'u-noor', platformRoles: ['PLATFORM_SUPPORT'] }) },
      () => json(200, page([SELF, noor])),
    )
    expect(within(row('Noor')).getByText('Participant ID ownership')).toBeTruthy()
    await manage('Noor')
    fireEvent.click(actionButton('remove', OWNERSHIP))
    await confirm('remove')

    expect(callsTo(ownershipUrl)).toHaveLength(1)
    expect(initOf(ownershipUrl).method).toBe('DELETE')
    expect(initOf(ownershipUrl).body).toBeUndefined()
    await screen.findByText(t('console.operators.saved', { name: 'Noor' }))
    expect(within(row('Noor')).queryByText('Participant ID ownership')).toBeNull()
    expect(within(row('Noor')).getByText(roleName('PLATFORM_SUPPORT'))).toBeTruthy()
  })

  it('does not offer the role to the signed-in operator', async () => {
    await openTeam()
    await manage('Hafidh Al Harthi')

    expect(actionButton('give', OWNERSHIP).disabled).toBe(true)
  })

  it.each([
    ['a self-grant', 'own-account-refused', 'console.operators.selfGive'],
    ['a missing permission', 'insufficient-permission', 'console.operators.error.refused'],
  ])('explains %s refused with 403, without the server prose', async (_label, type, key) => {
    await openTeam({ [ownershipUrl]: () => problem(403, type) })
    await manage('Noor')
    fireEvent.click(actionButton('give', OWNERSHIP))
    await confirm('give')

    expect(await within(dialog()).findByText(t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(callsTo(ownershipUrl)).toHaveLength(1)
    expect(within(row('Noor')).queryByText('Participant ID ownership')).toBeNull()
  })

  it.each([
    ['holds only the transfer permission', ['platform.smp.participant.transfer'], 'console.access.missingPermission'],
    ['is a customer administrator', ['admin.users.manage', 'admin.roles.manage'], 'console.access.notOperator'],
  ])('shows no controls, and reads nothing, to someone who %s', async (_label, permissions, key) => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, { ...OPERATOR, permissions }) })
    renderOperators()

    expect(await screen.findByText(t(key))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('console.operators.actionsFor', { name: 'Noor' }) })).toBeNull()
    expect(callsTo(usersUrl())).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is named and explained in Arabic', async () => {
    await i18n.changeLanguage('ar')
    await openTeam()
    await manage('Noor')

    expect(within(dialog()).getByText('ملكية معرّف المشارك')).toBeTruthy()
    expect(within(dialog()).getByText(t(`console.operators.roleNote.${OWNERSHIP}`))).toBeTruthy()
    expect(dialog().textContent).not.toMatch(/Participant ID ownership|two different operators/)
  })
})
