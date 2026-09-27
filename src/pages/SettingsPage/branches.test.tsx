import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BranchesPage } from './BranchesPage'
import { AddBranchPage } from './AddBranchPage'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['branch.manage', 'branch.read'],
  scopes: [],
  featureFlags: {},
}

const OVERVIEW_PATH = '/api/v1/branches/overview'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let overview: {
  openCount: number
  everCount: number
  peopleAcross: number
  invoicesThisMonth: number
  branches: unknown[]
}
let fetchMock: ReturnType<typeof vi.fn>

const EMPTY_OVERVIEW = {
  openCount: 0,
  everCount: 0,
  peopleAcross: 0,
  invoicesThisMonth: 0,
  branches: [],
}

const ONE_BRANCH_OVERVIEW = {
  openCount: 1,
  everCount: 1,
  peopleAcross: 0,
  invoicesThisMonth: 0,
  branches: [
    {
      id: 'b-1',
      code: 'NZ',
      name: 'Nizwa',
      headOffice: true,
      active: true,
      closedOn: null,
      invoicePrefix: null,
      nextNumber: null,
      invoicesThisMonth: 0,
      invoicedThisMonth: 0,
      people: 0,
      devices: 0,
    },
  ],
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  overview = EMPTY_OVERVIEW
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === OVERVIEW_PATH && method === 'GET') return json(200, overview)
    if (url === '/api/v1/branches/b-1' && method === 'GET') {
      return json(200, {
        id: 'b-1',
        code: 'NZ',
        name: 'Nizwa',
        type: 'HEAD_OFFICE',
        address: 'Building 42',
        city: 'Nizwa',
        state: 'Ad Dakhiliyah',
        country: 'OM',
        postalCode: '611',
        phone: '92345678',
        email: null,
        active: true,
        closedOn: null,
        closureReason: null,
        headOffice: true,
        version: 1,
      })
    }
    if (url === '/api/v1/branches' && method === 'POST') {
      return json(201, {
        id: 'b-2',
        code: JSON.parse(init?.body as string).code,
        name: JSON.parse(init?.body as string).name,
        type: 'STORE',
        address: null,
        city: null,
        state: null,
        country: 'OM',
        postalCode: null,
        phone: null,
        email: null,
        active: true,
        closedOn: null,
        closureReason: null,
        headOffice: false,
        version: 0,
      })
    }
    if (url === '/api/v1/branches/b-2/head-office' && method === 'POST') {
      return json(200, { id: 'b-2' })
    }
    if (url === '/api/v1/branches/b-2/invoice-prefix' && method === 'PUT') {
      return json(200, { id: 'b-2' })
    }
    // The shell around every settings screen reads a few things of its own (notifications,
    // usage); none of it is under test here, so answer benignly rather than block on it.
    return json(200, {})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const calls = (method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === path && ((init as RequestInit)?.method ?? 'GET') === method,
  )

describe('Settings › Branches, from the real overview', () => {
  it('prompts a brand-new company to add its first branch, with no fabricated figures', async () => {
    render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Add your first branch')).toBeTruthy()
    expect(screen.queryByText('Nizwa')).toBeNull()
  })

  it('shows the real branch, with a plain count where the design has no data for a name', async () => {
    overview = ONE_BRANCH_OVERVIEW
    render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Nizwa')).toBeTruthy()
    expect(screen.getByText('Head office')).toBeTruthy()
    expect(screen.getByText('the registered address')).toBeTruthy()
    // "Who works here" shows "None" rather than a fabricated roster.
    const cell = screen.getByText('Who works here').closest('div') as HTMLElement
    expect(within(cell).getByText('None')).toBeTruthy()
  })
})

describe('Add a branch, for real', () => {
  it('creates the branch and makes it head office, since it is the tenant’s first', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const nameInput = await screen.findByLabelText(/Branch name/)
    fireEvent.change(nameInput, { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Town or city/), { target: { value: 'Sur' } })
    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))

    await waitFor(() => expect(calls('POST', '/api/v1/branches')).toHaveLength(1))
    const body = JSON.parse(calls('POST', '/api/v1/branches')[0][1].body as string)
    expect(body).toMatchObject({ code: 'SU', name: 'Sur', type: 'STORE', city: 'Sur' })
    await waitFor(() =>
      expect(calls('POST', '/api/v1/branches/b-2/head-office')).toHaveLength(1),
    )
  })

  it('reopens an existing branch filled with its real data, not a mock one', async () => {
    overview = ONE_BRANCH_OVERVIEW
    render(
      <MemoryRouter initialEntries={['/settings/branches/b-1']}>
        <Routes>
          <Route path="/settings/branches/:id" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Branch name/) as HTMLInputElement
      expect(nameInput.value).toBe('Nizwa')
    })
    expect(screen.getByDisplayValue('Building 42')).toBeTruthy()
    expect(screen.getByDisplayValue('611')).toBeTruthy()
  })
})
