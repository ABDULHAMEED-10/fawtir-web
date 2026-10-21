import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BranchesPage } from './BranchesPage'

/**
 * Settings › Branches: closing a branch at the renewal or now, keeping it open, and reopening it
 * (Business Rules BR-2, BR-4). The server decides; the screen asks it and says what it answered.
 */
const ADMIN = {
  userId: 'u-1',
  username: 'admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['branch.manage', 'branch.read'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const OVERVIEW = '/api/v1/branches/overview'
const REMOVALS = '/api/v1/settings/scheduled-removals'

const row = (id: string, name: string, active: boolean) => ({
  id,
  code: id.toUpperCase(),
  name,
  headOffice: false,
  active,
  closedOn: active ? null : '2026-10-01',
  invoicePrefix: null,
  nextNumber: null,
  invoicesThisMonth: 0,
  invoicedThisMonth: 0,
  people: 0,
  devices: 0,
})

const detail = (id: string, name: string, active: boolean) => ({
  id,
  code: id.toUpperCase(),
  name,
  type: 'STORE',
  address: null,
  city: 'Sohar',
  state: null,
  country: 'OM',
  postalCode: null,
  phone: null,
  email: null,
  active,
  closedOn: null,
  closureReason: null,
  headOffice: false,
  version: 3,
})

const overview = (branches: unknown[]) => ({
  openCount: 1,
  everCount: branches.length,
  peopleAcross: 0,
  invoicesThisMonth: 0,
  branches,
})

const waiting = {
  id: 'r-1',
  kind: 'BRANCH',
  subjectId: 'b-1',
  effectiveOn: '2026-11-05',
  status: 'SCHEDULED',
  scheduledBy: 'u-1',
  scheduledAt: '2026-10-21T08:00:00Z',
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  answers = {
    [`GET ${OVERVIEW}`]: () => json(200, overview([row('b-1', 'Sohar', true)])),
    [`GET ${REMOVALS}`]: () => json(200, { open: true, renewsOn: '2026-11-05', removals: [] }),
    'GET /api/v1/branches/b-1': () => json(200, detail('b-1', 'Sohar', true)),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    const answer = answers[`${init?.method ?? 'GET'} ${url}`]
    // The shell reads a few things of its own; none is under test here.
    return answer ? answer(init) : json(200, {})
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

function renderBranches() {
  return render(
    <MemoryRouter>
      <BranchesPage />
    </MemoryRouter>,
  )
}

async function chooseClose() {
  fireEvent.click(await screen.findByRole('button', { name: 'This branch' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Close this branch' }))
  return screen.findByRole('dialog')
}

describe('Settings › Branches, closing a branch', () => {
  it('closes at the renewal after saying so, then shows the date and keeps it open on request', async () => {
    answers['POST /api/v1/branches/b-1/scheduled-closure'] = () => {
      answers[`GET ${REMOVALS}`] = () =>
        json(200, { open: true, renewsOn: '2026-11-05', removals: [waiting] })
      return json(200, waiting)
    }
    answers['DELETE /api/v1/branches/b-1/scheduled-closure'] = () => {
      answers[`GET ${REMOVALS}`] = () =>
        json(200, { open: true, renewsOn: '2026-11-05', removals: [] })
      return json(204)
    }
    renderBranches()
    const dialog = await chooseClose()
    expect(within(dialog).getByText(/stays open until the renewal on/)).toBeTruthy()
    expect(within(dialog).getByText(/nothing is refunded/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close at the renewal' }))

    expect(await screen.findByText(/Sohar closes at the renewal on/)).toBeTruthy()
    expect(
      await screen.findByText(/Closes at the renewal on .*It stays open until then\./),
    ).toBeTruthy()
    expect(sent('PUT', '/api/v1/branches/b-1')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Keep it open' }))
    expect(await screen.findByText('Sohar stays open.')).toBeTruthy()
    expect(sent('DELETE', '/api/v1/branches/b-1/scheduled-closure')).toHaveLength(1)
  })

  it('closes now, saving the branch as it stands, while removal at the renewal is not open', async () => {
    answers[`GET ${REMOVALS}`] = () => json(200, { open: false, renewsOn: null, removals: [] })
    answers['PUT /api/v1/branches/b-1'] = () => json(200, detail('b-1', 'Sohar', false))
    renderBranches()
    await screen.findByText('Sohar')
    await vi.waitFor(() => expect(sent('GET', REMOVALS)).toHaveLength(1))
    const dialog = await chooseClose()
    expect(within(dialog).getByText(/closes now\. Its invoices stay/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close now' }))

    expect(await screen.findByText('Sohar is closed.')).toBeTruthy()
    const [, init] = sent('PUT', '/api/v1/branches/b-1')[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ active: false, expectedVersion: 3, name: 'Sohar', city: 'Sohar' })
    expect(sent('POST', '/api/v1/branches/b-1/scheduled-closure')).toHaveLength(0)
  })

  it('says the Head Branch is never closed when the server refuses it', async () => {
    answers['POST /api/v1/branches/b-1/scheduled-closure'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/head-branch-always-on', status: 409 })
    renderBranches()
    const dialog = await chooseClose()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close at the renewal' }))
    expect(
      await within(dialog).findByText('The Head Branch is never closed. You can rename it.'),
    ).toBeTruthy()
  })
})

describe('Settings › Branches, reopening', () => {
  it('reopens a closed branch, and says when the plan has no place for it', async () => {
    answers[`GET ${OVERVIEW}`] = () => json(200, overview([row('b-1', 'Sohar', false)]))
    answers['GET /api/v1/branches/b-1'] = () => json(200, detail('b-1', 'Sohar', false))
    answers['PUT /api/v1/branches/b-1'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/extra-place-required', status: 409 })
    renderBranches()
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen it' }))
    expect(await screen.findByText(/Every place on your plan is in use/)).toBeTruthy()

    answers['PUT /api/v1/branches/b-1'] = () => json(200, detail('b-1', 'Sohar', true))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen it' }))
    expect(await screen.findByText('Sohar is open again.')).toBeTruthy()
    const [, init] = sent('PUT', '/api/v1/branches/b-1')[1]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ active: true })
  })
})
