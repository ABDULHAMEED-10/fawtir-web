import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BranchesPage } from './BranchesPage'
import { AddBranchPage } from './AddBranchPage'

/**
 * Settings › Branches: closing and reopening a branch (Business Rules BR-2, BR-4; option (a),
 * 21 Oct 2026). It closes now; its paid place stays until the renewal and can be given to a new
 * branch. The server decides; the screen asks it and says what it answered.
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
const SUBSCRIPTION = '/api/v1/settings/subscription'

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
    [`GET ${SUBSCRIPTION}`]: () => json(200, { renewsOn: '2026-11-05' }),
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
  it('closes now, saving the branch as it stands, after saying its paid place stays until the renewal', async () => {
    answers['PUT /api/v1/branches/b-1'] = () => json(200, detail('b-1', 'Sohar', false))
    renderBranches()
    await screen.findByText('Sohar')
    await vi.waitFor(() => expect(sent('GET', SUBSCRIPTION).length).toBeGreaterThan(0))
    const dialog = await chooseClose()
    expect(
      within(dialog).getByText(
        /^Access stops now: nobody can work in Sohar and no new document can be issued from it\.$/,
      ),
    ).toBeTruthy()
    expect(
      within(dialog).getByText(
        /^Its place is paid until .*2026, with no refund\. Until then you can use it for a new branch at no extra charge\.$/,
      ),
    ).toBeTruthy()
    expect(
      within(dialog).getByText(
        'Its name stays on every record made there, and its invoices stay in your reports.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close now' }))

    expect(
      await screen.findByText(
        /^Sohar is closed\. The place is paid until .*2026 and can go to a new branch at no extra charge\.$/,
      ),
    ).toBeTruthy()
    const [, init] = sent('PUT', '/api/v1/branches/b-1')[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ active: false, expectedVersion: 3, name: 'Sohar', city: 'Sohar' })
  })

  it('does not offer "Close this branch" on the Head Branch', async () => {
    answers[`GET ${OVERVIEW}`] = () =>
      json(200, overview([{ ...row('b-1', 'Sohar', true), headOffice: true }]))
    renderBranches()
    fireEvent.click(await screen.findByRole('button', { name: 'This branch' }))
    expect(screen.queryByRole('menuitem', { name: 'Close this branch' })).toBeNull()
  })

  it('says the Head Branch is never closed when the server refuses it', async () => {
    answers['PUT /api/v1/branches/b-1'] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/head-branch-always-on', status: 409 })
    renderBranches()
    const dialog = await chooseClose()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close now' }))
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

/** The branch's own page (/settings/branches/:id), with the list behind it to come back to. */
function renderBranchPage(id = 'b-1') {
  return render(
    <MemoryRouter initialEntries={[`/settings/branches/${id}`]}>
      <Routes>
        <Route path="/settings/branches/:id" element={<AddBranchPage />} />
        <Route path="/settings/branches" element={<BranchesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// The name and the town are both "Sohar"; either shows the branch has filled the form.
const branchPageReady = () =>
  vi.waitFor(() => expect(screen.getAllByDisplayValue('Sohar').length).toBeGreaterThan(0))

describe("A branch's own page, closing it (E38)", () => {
  it('asks first, in plain words, then saves the branch closed and goes back to the list', async () => {
    answers['PUT /api/v1/branches/b-1'] = () => {
      answers[`GET ${OVERVIEW}`] = () => json(200, overview([row('b-1', 'Sohar', false)]))
      return json(200, detail('b-1', 'Sohar', false))
    }
    renderBranchPage()
    await branchPageReady()
    await vi.waitFor(() => expect(sent('GET', SUBSCRIPTION).length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Close this branch' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Close Sohar?')).toBeTruthy()
    expect(
      within(dialog).getByText(
        /^Its place is paid until .*2026, with no refund\. Until then you can use it for a new branch at no extra charge\.$/,
      ),
    ).toBeTruthy()
    expect(
      within(dialog).getByText(
        'Its name stays on every record made there, and its invoices stay in your reports.',
      ),
    ).toBeTruthy()
    // Nothing is sent until it is confirmed.
    expect(sent('PUT', '/api/v1/branches/b-1')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close now' }))

    expect(
      await screen.findByText(
        /^Sohar is closed\. The place is paid until .*2026 and can go to a new branch at no extra charge\.$/,
      ),
    ).toBeTruthy()
    const [, init] = sent('PUT', '/api/v1/branches/b-1')[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      code: 'B-1',
      name: 'Sohar',
      type: 'STORE',
      city: 'Sohar',
      country: 'OM',
      active: false,
      expectedVersion: 3,
    })
    expect(await screen.findByRole('button', { name: 'Reopen it' })).toBeTruthy()
  })

  it('cancelling the dialog sends nothing', async () => {
    renderBranchPage()
    await branchPageReady()
    fireEvent.click(screen.getByRole('button', { name: 'Close this branch' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('PUT', '/api/v1/branches/b-1')).toHaveLength(0)
  })

  it.each([
    ['the Head Branch', { headBranch: true }],
    ['the head office', { headOffice: true }],
    ['a branch already closed', { active: false }],
  ])('does not show "Close this branch" on %s', async (_label, extra) => {
    answers['GET /api/v1/branches/b-1'] = () =>
      json(200, { ...detail('b-1', 'Sohar', true), ...extra })
    renderBranchPage()
    await branchPageReady()
    expect(screen.getByRole('button', { name: 'Save the changes' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close this branch' })).toBeNull()
  })

  it('says the Head Branch is never closed when the server refuses it, and stays on the page', async () => {
    answers['PUT /api/v1/branches/b-1'] = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/head-branch-always-on',
        status: 409,
        detail: 'The Head Branch cannot be switched off; it can be renamed.',
      })
    renderBranchPage()
    await branchPageReady()
    fireEvent.click(screen.getByRole('button', { name: 'Close this branch' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close now' }))
    expect(
      await within(dialog).findByText('The Head Branch is never closed. You can rename it.'),
    ).toBeTruthy()
    expect(screen.getByLabelText(/Branch name/)).toBeTruthy()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderBranchPage()
    await branchPageReady()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('addBranch.closeThisBranch') }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(i18n.t('removal.branch.title', { name: 'Sohar' }))).toBeTruthy()
    expect(within(dialog).getByText(i18n.t('removal.branch.records'))).toBeTruthy()
    await i18n.changeLanguage('en')
  })

  it('names the branch in Arabic, in the dialog and after closing, when it has an Arabic name', async () => {
    await i18n.changeLanguage('ar')
    answers['GET /api/v1/branches/b-1'] = () =>
      json(200, { ...detail('b-1', 'Sohar', true), nameAr: 'صحار' })
    answers['PUT /api/v1/branches/b-1'] = () =>
      json(200, { ...detail('b-1', 'Sohar', false), nameAr: 'صحار' })
    try {
      renderBranchPage()
      await branchPageReady()
      fireEvent.click(screen.getByRole('button', { name: i18n.t('addBranch.closeThisBranch') }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(i18n.t('removal.branch.title', { name: 'صحار' }))).toBeTruthy()
      expect(within(dialog).queryByText(i18n.t('removal.branch.title', { name: 'Sohar' }))).toBeNull()
      fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('removal.branch.confirm') }))
      expect(await screen.findByText(/صحار/)).toBeTruthy()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('titles the page "Edit" with the Arabic name in Arabic and the English name in English', async () => {
    answers['GET /api/v1/branches/b-1'] = () =>
      json(200, { ...detail('b-1', 'Sohar', true), nameAr: 'صحار' })
    await i18n.changeLanguage('ar')
    try {
      renderBranchPage()
      await branchPageReady()
      expect(
        screen.getByRole('heading', { name: i18n.t('addBranch.editTitle', { name: 'صحار' }) }),
      ).toBeTruthy()
      expect(
        screen.queryByRole('heading', { name: i18n.t('addBranch.editTitle', { name: 'Sohar' }) }),
      ).toBeNull()
      await i18n.changeLanguage('en')
      expect(
        await screen.findByRole('heading', { name: 'Sohar: what it is and how it invoices' }),
      ).toBeTruthy()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('keeps a closed branch closed when its details are saved', async () => {
    answers['GET /api/v1/branches/b-1'] = () => json(200, detail('b-1', 'Sohar', false))
    answers['PUT /api/v1/branches/b-1'] = () => json(200, detail('b-1', 'Sohar', false))
    renderBranchPage()
    await branchPageReady()
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    await vi.waitFor(() => expect(sent('PUT', '/api/v1/branches/b-1')).toHaveLength(1))
    const [, init] = sent('PUT', '/api/v1/branches/b-1')[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ active: false })
  })
})

describe("A branch's own page, its numbering", () => {
  it('shows a branch with its own series as such even when the overview answers after the branch', async () => {
    let release: () => void = () => {}
    const overviewLate = new Promise<void>((resolve) => {
      release = resolve
    })
    answers[`GET ${OVERVIEW}`] = () =>
      json(200, overview([{ ...row('b-1', 'Sohar', true), invoicePrefix: 'SOH' }]))
    const answer = answers[`GET ${OVERVIEW}`]
    const inner = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === OVERVIEW) {
        await overviewLate
        return answer(init)
      }
      return inner(url, init)
    })
    renderBranchPage()
    await branchPageReady()
    expect(screen.queryByText('Sohar · carries on the company series')).toBeNull()
    release()
    expect(await screen.findByText('Sohar · first invoice SOH-INV-0001')).toBeTruthy()
    expect(screen.queryByText('Sohar · carries on the company series')).toBeNull()
  })
})
