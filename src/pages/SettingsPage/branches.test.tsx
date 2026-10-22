import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BranchesPage } from './BranchesPage'
import { AddBranchPage } from './AddBranchPage'
import { BRANCHES_OVERVIEW } from '../../../tools/mock-api/routes/branchesOverview.mjs'

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
/** What GET /branches/b-1 says about the Head Branch; a test sets it. */
let b1Extra: Record<string, unknown> = {}
/** Per-test answers for the side cards' reads (company profile, standing, plan), by URL. */
let reads: Record<string, () => Response>

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
  b1Extra = {}
  reads = {}
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === OVERVIEW_PATH && method === 'GET') return json(200, overview)
    if (method === 'GET' && reads[url]) return reads[url]()
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
        ...b1Extra,
      })
    }
    if (url === '/api/v1/branches' && method === 'POST') {
      return json(201, {
        id: 'b-2',
        code: JSON.parse(init?.body as string).code,
        name: JSON.parse(init?.body as string).name,
        nameAr: JSON.parse(init?.body as string).nameAr ?? null,
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

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
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

describe('Settings › Branches, plan allowance', () => {
  it('shows the plan’s real allowance, and says so when it cannot be read', async () => {
    overview = ONE_BRANCH_OVERVIEW
    reads = {
      '/api/v1/settings/plan': () =>
        json(200, { plan: { name: 'Growth', branchesIncluded: 3 }, activeBranches: 1, usage: {} }),
    }
    const first = render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(i18n.t('branches.kpi.includedFromPlan', { plan: 'Growth' })),
    ).toBeTruthy()
    expect(screen.queryByText(/sixth/)).toBeNull()
    first.unmount()

    resetSharedRequests()
    reads = {
      '/api/v1/settings/plan': () =>
        json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' }),
    }
    render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText(i18n.t('branches.kpi.includedUnavailable'))).toBeTruthy()
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
    fireEvent.change(screen.getByLabelText(/Prefix/), { target: { value: 'sr' } })
    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))

    await waitFor(() => expect(calls('POST', '/api/v1/branches')).toHaveLength(1))
    const body = JSON.parse(calls('POST', '/api/v1/branches')[0][1].body as string)
    expect(body).toMatchObject({ code: 'SU', name: 'Sur', type: 'STORE', city: 'Sur', state: null })
    await waitFor(() => expect(calls('POST', '/api/v1/branches/b-2/head-office')).toHaveLength(1))
    expect(
      JSON.parse(calls('PUT', '/api/v1/branches/b-2/invoice-prefix')[0][1].body as string),
    ).toMatchObject({
      prefix: 'SR',
    })
  })

  it('opens a new branch empty: no sample town, postcode, governorate, prefix, date or roster', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const nameInput = (await screen.findByLabelText(/Branch name/)) as HTMLInputElement
    expect(nameInput.value).toBe('')
    expect((screen.getByLabelText(/Town or city/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Postal code/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Prefix/) as HTMLInputElement).value).toBe('')
    expect(screen.getByText(i18n.t('addBranch.chooseGovernorate'))).toBeTruthy()
    const text = document.body.textContent ?? ''
    for (const sample of [
      'Sur',
      'صور',
      '411',
      'Ash Sharqiyah South',
      'SR-INV',
      '1 October 2026',
      'INV-2048',
    ])
      expect(text).not.toContain(sample)
    for (const leak of ['Al Bahja', 'OM1100234567', 'Hafidh', 'Salim'])
      expect(text).not.toContain(leak)
    // The designed opening date and roster are drawn but hold nothing until the backend has them.
    expect(screen.getByText('Who works there')).toBeTruthy()
    expect((screen.getByLabelText(i18n.t('addBranch.opens')) as HTMLInputElement).disabled).toBe(
      true,
    )
    expect(screen.queryByText(/prefix is free/)).toBeNull()
    expect(
      (screen.getByRole('button', { name: /Add the branch/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('picks a code no existing branch holds', async () => {
    overview = ONE_BRANCH_OVERVIEW
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByLabelText(/Branch name/)
    await waitFor(() => expect(calls('GET', OVERVIEW_PATH).length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText(/Branch name/), { target: { value: 'Nizwa Souq' } })
    fireEvent.change(screen.getByLabelText(/Town or city/), { target: { value: 'Nizwa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Numbering' }))
    fireEvent.click(await screen.findByRole('option', { name: /Carry on the company series/ }))
    await screen.findByText(i18n.t('addBranch.continuesCompanySeries'))
    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))

    await waitFor(() => expect(calls('POST', '/api/v1/branches')).toHaveLength(1))
    expect(JSON.parse(calls('POST', '/api/v1/branches')[0][1].body as string).code).toBe('NI')
    // Not the tenant's first branch, so the head office stays where it is.
    expect(calls('POST', '/api/v1/branches/b-2/head-office')).toHaveLength(0)
  })

  it('does not move the head office when the overview could not be read', async () => {
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === OVERVIEW_PATH ? json(503, { type: 'about:blank' }) : original(url, init),
    )
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText(/Branch name/), { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Town or city/), { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Prefix/), { target: { value: 'SR' } })
    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))

    await waitFor(() => expect(calls('PUT', '/api/v1/branches/b-2/invoice-prefix')).toHaveLength(1))
    expect(calls('POST', '/api/v1/branches/b-2/head-office')).toHaveLength(0)
  })

  it('shows what it inherits from the real company and the verified ID, and the real plan allowance', async () => {
    reads = {
      '/api/v1/company-profile': () =>
        json(200, { legalName: 'Real Tenant LLC', taxNumber: 'OM1199999999' }),
      '/api/v1/peppol/smp/data-submissions/standing': () =>
        json(200, {
          state: 'VERIFIED',
          verification: { participantScheme: '0248', participantValue: 'OM1199999999' },
        }),
      '/api/v1/settings/plan': () =>
        json(200, { plan: { branchesIncluded: 2 }, activeBranches: 2, usage: {} }),
    }
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Real Tenant LLC')).toBeTruthy()
    expect(screen.getByText('OM1199999999')).toBeTruthy()
    expect(screen.getByText('0248:OM1199999999')).toBeTruthy()
    expect(await screen.findByText('3 of 2')).toBeTruthy()
    expect(screen.getByText(i18n.t('addBranch.beyondPlan'))).toBeTruthy()
  })

  it('leaves out what it cannot read: no VAT, no ID, no plan card', async () => {
    const forbidden = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    reads = {
      '/api/v1/company-profile': forbidden,
      '/api/v1/peppol/smp/data-submissions/standing': () =>
        json(200, {
          state: 'AWAITING_REVIEW',
          verification: { participantScheme: '0248', participantValue: 'OM1199999999' },
        }),
      '/api/v1/settings/plan': forbidden,
    }
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText(i18n.t('addBranch.inherits'))
    await waitFor(() => expect(calls('GET', '/api/v1/settings/plan').length).toBeGreaterThan(0))
    expect(screen.queryByText(i18n.t('addBranch.inherit.vat'))).toBeNull()
    expect(screen.queryByText(i18n.t('addBranch.inherit.peppol'))).toBeNull()
    expect(screen.queryByText('0248:OM1199999999')).toBeNull()
    expect(screen.queryByText(i18n.t('addBranch.cost'))).toBeNull()
  })

  it('reads in Arabic with the same empty form', async () => {
    await i18n.changeLanguage('ar')
    render(
      <div dir="rtl">
        <MemoryRouter initialEntries={['/settings/branches/new']}>
          <Routes>
            <Route path="/settings/branches/new" element={<AddBranchPage />} />
          </Routes>
        </MemoryRouter>
      </div>,
    )
    expect(await screen.findByText(i18n.t('addBranch.chooseGovernorate'))).toBeTruthy()
    expect(i18n.t('addBranch.chooseGovernorate')).not.toBe('Choose a governorate')
    expect(document.body.textContent).not.toContain('صور')
  })

  it('marks the Head Branch, shows its Arabic name in Arabic, and offers no way to close it (BR-1, BR-2)', async () => {
    overview = {
      ...ONE_BRANCH_OVERVIEW,
      branches: [
        {
          ...ONE_BRANCH_OVERVIEW.branches[0],
          name: 'Nizwa Co Head Branch',
          headBranch: true,
          nameAr: 'نزوى - الفرع الرئيسي',
        },
      ],
    }
    render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Nizwa Co Head Branch')).toBeTruthy()
    expect(screen.getByText('Head Branch')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'This branch' }))
    expect(await screen.findByRole('menuitem', { name: /Change its details/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Close this branch/ })).toBeNull()

    await i18n.changeLanguage('ar')
    expect(await screen.findByText('نزوى - الفرع الرئيسي')).toBeTruthy()
    expect(screen.getByText(i18n.t('branches.headBranch'))).toBeTruthy()
  })

  it('reads the mock API overview: the Head Branch mark and the Arabic names (BR-1, BR-2)', async () => {
    overview = BRANCHES_OVERVIEW
    render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Al Bahja Coffee (Main)')).toBeTruthy()
    expect(screen.getAllByText('Head Branch')).toHaveLength(1)

    await i18n.changeLanguage('ar')
    expect(await screen.findByText('قهوة البهجة (الفرع الرئيسي)')).toBeTruthy()
    expect(screen.getByText('قهوة البهجة (نزوى)')).toBeTruthy()
    // No Arabic name yet: the name is shown as it is.
    expect(screen.getByText('Al Bahja Coffee (Seeb)')).toBeTruthy()
  })

  it('an ordinary branch carries no Head Branch mark', async () => {
    overview = ONE_BRANCH_OVERVIEW
    render(
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Nizwa')).toBeTruthy()
    expect(screen.queryByText('Head Branch')).toBeNull()
  })

  it('fills the Arabic name from the branch and sends a changed one with the update', async () => {
    overview = ONE_BRANCH_OVERVIEW
    b1Extra = { headBranch: true, nameAr: 'نزوى' }
    render(
      <MemoryRouter initialEntries={['/settings/branches/b-1']}>
        <Routes>
          <Route path="/settings/branches/:id" element={<AddBranchPage />} />
          <Route path="/settings/branches" element={<p>list</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText(/Arabic name/) as HTMLInputElement).value).toBe('نزوى'),
    )
    fireEvent.change(screen.getByLabelText(/Arabic name/), { target: { value: ' نزوى الجديدة ' } })
    fireEvent.click(screen.getByRole('button', { name: /Save the changes/ }))

    await waitFor(() => expect(calls('PUT', '/api/v1/branches/b-1')).toHaveLength(1))
    expect(JSON.parse(calls('PUT', '/api/v1/branches/b-1')[0][1].body as string)).toMatchObject({
      name: 'Nizwa',
      nameAr: 'نزوى الجديدة',
      active: true,
      expectedVersion: 1,
    })
  })

  it('lets the Arabic name be removed: an emptied one is sent as an empty string', async () => {
    overview = ONE_BRANCH_OVERVIEW
    b1Extra = { nameAr: 'نزوى' }
    // A server older than backend #682 takes an empty nameAr as "leave it" and answers with it set.
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === '/api/v1/branches/b-1' && init?.method === 'PUT'
        ? json(200, { id: 'b-1', code: 'NZ', name: 'Nizwa', nameAr: 'نزوى', version: 2 })
        : base(url, init),
    )
    render(
      <MemoryRouter initialEntries={['/settings/branches/b-1']}>
        <Routes>
          <Route path="/settings/branches/:id" element={<AddBranchPage />} />
          <Route path="/settings/branches" element={<p>list</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText(/Arabic name/) as HTMLInputElement).value).toBe('نزوى'),
    )
    fireEvent.change(screen.getByLabelText(/Arabic name/), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Save the changes/ }))

    await waitFor(() => expect(calls('PUT', '/api/v1/branches/b-1')).toHaveLength(1))
    expect(JSON.parse(calls('PUT', '/api/v1/branches/b-1')[0][1].body as string)).toMatchObject({
      nameAr: '',
    })
    // The server's answer still carries the Arabic name: the screen says so instead of leaving.
    expect(await screen.findByText(i18n.t('addBranch.arabicNameNotRemoved'))).toBeTruthy()
    expect(screen.queryByText('list')).toBeNull()
  })

  it('leaves an Arabic name the branch never had out of the update', async () => {
    overview = ONE_BRANCH_OVERVIEW
    render(
      <MemoryRouter initialEntries={['/settings/branches/b-1']}>
        <Routes>
          <Route path="/settings/branches/:id" element={<AddBranchPage />} />
          <Route path="/settings/branches" element={<p>list</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText(/Branch name/) as HTMLInputElement).value).toBe('Nizwa'),
    )
    fireEvent.click(screen.getByRole('button', { name: /Save the changes/ }))
    await waitFor(() => expect(calls('PUT', '/api/v1/branches/b-1')).toHaveLength(1))
    expect(
      JSON.parse(calls('PUT', '/api/v1/branches/b-1')[0][1].body as string),
    ).not.toHaveProperty('nameAr')
    expect(await screen.findByText('list')).toBeTruthy()
  })

  it('creates a new branch with its Arabic name in one call', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
          <Route path="/settings/branches" element={<p>list</p>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText(/Branch name/), { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Arabic name/), { target: { value: ' صور ' } })
    fireEvent.change(screen.getByLabelText(/Town or city/), { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Prefix/), { target: { value: 'sr' } })
    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))

    expect(await screen.findByText('list')).toBeTruthy()
    expect(calls('POST', '/api/v1/branches')).toHaveLength(1)
    expect(JSON.parse(calls('POST', '/api/v1/branches')[0][1].body as string)).toMatchObject({
      name: 'Sur',
      nameAr: 'صور',
    })
    expect(calls('PUT', '/api/v1/branches/b-2')).toHaveLength(0)
  })

  it('says a new branch was created without its Arabic name when the server did not keep it, and sends it again without creating the branch twice', async () => {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      // A server older than backend #682 ignores nameAr on the create.
      if (url === '/api/v1/branches' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        return json(201, { id: 'b-2', code: body.code, name: body.name, nameAr: null, version: 0 })
      }
      if (url === '/api/v1/branches/b-2' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string)
        return json(200, {
          id: 'b-2',
          code: body.code,
          name: body.name,
          nameAr: body.nameAr,
          version: 1,
        })
      }
      return base(url, init)
    })
    render(
      <MemoryRouter initialEntries={['/settings/branches/new']}>
        <Routes>
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
          <Route path="/settings/branches" element={<p>list</p>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText(/Branch name/), { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Arabic name/), { target: { value: 'صور' } })
    fireEvent.change(screen.getByLabelText(/Town or city/), { target: { value: 'Sur' } })
    fireEvent.change(screen.getByLabelText(/Prefix/), { target: { value: 'sr' } })
    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))

    expect(await screen.findByText(i18n.t('addBranch.arabicNameNotSaved'))).toBeTruthy()
    expect(calls('POST', '/api/v1/branches')).toHaveLength(1)
    expect(calls('PUT', '/api/v1/branches/b-2')).toHaveLength(0)
    // Nothing after the create ran: no numbering or head office for a half-saved branch yet.
    expect(calls('PUT', '/api/v1/branches/b-2/invoice-prefix')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Add the branch/ }))
    expect(await screen.findByText('list')).toBeTruthy()
    expect(calls('POST', '/api/v1/branches')).toHaveLength(1)
    expect(calls('PUT', '/api/v1/branches/b-2/invoice-prefix')).toHaveLength(1)
    const retried = calls('PUT', '/api/v1/branches/b-2')
    expect(retried).toHaveLength(1)
    expect(JSON.parse(retried[0][1].body as string)).toMatchObject({
      nameAr: 'صور',
      expectedVersion: 0,
    })
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
