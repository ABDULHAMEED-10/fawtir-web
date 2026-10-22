import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { byCompany } from '../../../lib/console/branchAccessReadiness'
import { ConsoleCompaniesWithoutOwnerPage } from './ConsoleCompaniesWithoutOwnerPage'
import { TenantOwnerHandoverCard } from './TenantOwnerHandoverCard'
import { ConsoleBranchAccessReadinessPage } from '../branchAccess/ConsoleBranchAccessReadinessPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const WITHOUT_OWNER = '/api/v1/platform/companies/without-owner'
const CANDIDATES = '/api/v1/platform/companies/t-1/owner-candidates'
const PICK = '/api/v1/platform/companies/t-1/owner'
const HANDOVER = '/api/v1/platform/companies/t-1/owner-handover'
const READINESS = '/api/v1/platform/branch-access/readiness'

const OPERATOR: Entitlements = {
  userId: 'u-me',
  username: 'me',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Tenant admin', systemRole: true }],
  permissions: ['platform.tenants.manage'],
  scopes: [],
  featureFlags: {},
}

const COMPANY = {
  tenantId: 't-1',
  tenantCode: 'SUR-FISH',
  companyName: 'Sur Fisheries LLC',
  createdAt: '2025-09-01T06:00:00Z',
  origin: 'CONSOLE',
  classification: 'NO_ORIGIN_USER',
  activeAdministrators: 2,
  enabledUsers: 5,
}

const AISHA = {
  userId: 'u-aisha',
  name: 'Aisha Al Balushi',
  username: 'aisha',
  isOrigin: true,
  isOwner: true,
  lastLoginAt: null,
}
const KHALID = {
  ...AISHA,
  userId: 'u-khalid',
  name: 'Khalid Al Harthy',
  username: 'khalid',
  isOrigin: false,
  isOwner: false,
}

function handover(over: Record<string, unknown> = {}) {
  return {
    id: 'h-1',
    tenantId: 't-1',
    fromUserId: 'u-aisha',
    toUserId: 'u-khalid',
    reason: 'Owner left the country',
    evidenceRef: 'Ticket 4821',
    evidenceObjectKey: null,
    status: 'REQUESTED',
    requestedBy: 'u-other',
    requestedAt: new Date(Date.now() - 3_600_000).toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    decidedBy: null,
    decidedAt: null,
    ...over,
  }
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
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  answers = {}
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, OPERATOR)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function posts(url: string) {
  return fetchMock.mock.calls
    .filter(([called, init]) => called === url && init?.method === 'POST')
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))
}

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Console › Companies without an Owner (OW-5)', () => {
  it('lists each company in words and picks an Administrator with a reason', async () => {
    let picked = false
    answers[WITHOUT_OWNER] = () => json(200, { items: picked ? [] : [COMPANY], nextCursor: null })
    answers[CANDIDATES] = () => json(200, [{ ...AISHA, isOwner: false }, KHALID])
    answers[`POST ${PICK}`] = () => {
      picked = true
      return json(200, { ownerUserId: 'u-khalid' })
    }
    const user = userEvent.setup({ delay: null })
    renderAt('/console/owners', <ConsoleCompaniesWithoutOwnerPage />)

    expect(await screen.findByText('Sur Fisheries LLC')).toBeTruthy()
    expect(screen.getByText(i18n.t('console.owners.classification.NO_ORIGIN_USER'))).toBeTruthy()
    expect(screen.queryByText('NO_ORIGIN_USER')).toBeNull()

    await user.click(screen.getByRole('button', { name: i18n.t('console.owners.choose') }))
    const dialog = await screen.findByRole('dialog')
    const submit = within(dialog).getByRole('button', {
      name: i18n.t('console.owners.dialog.submit'),
    })
    await user.click(
      await within(dialog).findByRole('button', { name: i18n.t('console.owners.dialog.person') }),
    )
    await user.click(screen.getByRole('option', { name: /Khalid Al Harthy/ }))
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    await user.type(
      within(dialog).getByLabelText(new RegExp(i18n.t('console.owners.dialog.reason'))),
      'Registrant left; Khalid runs the company',
    )
    await user.click(submit)

    await waitFor(() => expect(posts(PICK)).toHaveLength(1))
    expect(posts(PICK)[0]).toEqual({
      userId: 'u-khalid',
      reason: 'Registrant left; Khalid runs the company',
    })
    expect(await screen.findByText(i18n.t('console.owners.empty'))).toBeTruthy()
    expect(
      screen.getByText(
        i18n.t('console.owners.chosen', {
          name: 'Khalid Al Harthy (khalid)',
          company: 'Sur Fisheries LLC',
        }),
      ),
    ).toBeTruthy()
  })

  it('shows the refusal in our words, never the server detail', async () => {
    answers[WITHOUT_OWNER] = () => json(200, { items: [COMPANY], nextCursor: null })
    answers[CANDIDATES] = () => json(200, [KHALID])
    answers[`POST ${PICK}`] = () =>
      json(409, {
        type: 'https://fawtir.om/problems/owner-already-set',
        detail: 'raw server words',
      })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/owners', <ConsoleCompaniesWithoutOwnerPage />)

    await user.click(await screen.findByRole('button', { name: i18n.t('console.owners.choose') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      await within(dialog).findByRole('button', { name: i18n.t('console.owners.dialog.person') }),
    )
    await user.click(screen.getByRole('option', { name: /Khalid Al Harthy/ }))
    await user.type(
      within(dialog).getByLabelText(new RegExp(i18n.t('console.owners.dialog.reason'))),
      'why',
    )
    await user.click(
      within(dialog).getByRole('button', { name: i18n.t('console.owners.dialog.submit') }),
    )

    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('raw server words')).toBeNull()
  })
})

describe('Console › Owner handover through support (OW-4)', () => {
  it("lets a second operator confirm another operator's request", async () => {
    let confirmed = false
    answers[HANDOVER] = () =>
      json(200, [handover(confirmed ? { status: 'CONFIRMED', decidedBy: 'u-me' } : {})])
    answers[CANDIDATES] = () => json(200, [AISHA, KHALID])
    answers[`POST ${HANDOVER}/h-1/confirm`] = () => {
      confirmed = true
      return json(200, handover({ status: 'CONFIRMED' }))
    }
    const user = userEvent.setup({ delay: null })
    renderAt('/console/tenants/t-1', <TenantOwnerHandoverCard tenantId="t-1" />)

    expect(await screen.findByText(i18n.t('console.owners.handover.status.REQUESTED'))).toBeTruthy()
    expect(screen.getByText(/Ticket 4821/)).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.owners.handover.confirm') }),
    )

    await waitFor(() => expect(posts(`${HANDOVER}/h-1/confirm`)).toHaveLength(1))
    expect(await screen.findByText(i18n.t('console.owners.handover.confirmed'))).toBeTruthy()
  })

  it('names the Owner the server marks, and a person no longer listed as "a former user", never an id', async () => {
    answers[HANDOVER] = () =>
      json(200, [handover({ status: 'CONFIRMED', fromUserId: 'u-gone', toUserId: 'u-aisha' })])
    answers[CANDIDATES] = () => json(200, [AISHA, KHALID])
    renderAt('/console/tenants/t-1', <TenantOwnerHandoverCard tenantId="t-1" />)

    expect(
      await screen.findByText(
        i18n.t('console.owners.handover.owner', { name: 'Aisha Al Balushi (aisha)' }),
      ),
    ).toBeTruthy()
    expect(screen.getByText(new RegExp(i18n.t('console.owners.handover.formerUser')))).toBeTruthy()
    expect(screen.queryByText(/u-gone/)).toBeNull()
  })

  it('says nothing about the Owner when no listed Administrator is marked as the Owner', async () => {
    // The Owner may be switched off or no longer an Administrator, so absent from the candidates;
    // that is not "this company has no Owner".
    answers[HANDOVER] = () => json(200, [])
    answers[CANDIDATES] = () => json(200, [KHALID])
    renderAt('/console/tenants/t-1', <TenantOwnerHandoverCard tenantId="t-1" />)

    await waitFor(() =>
      expect(screen.queryByText(i18n.t('console.owners.handover.loading'))).toBeNull(),
    )
    expect(screen.getByText(i18n.t('console.owners.handover.title'))).toBeTruthy()
    expect(screen.queryByText(/has no Owner/)).toBeNull()
    expect(screen.queryByText(/The Owner is/)).toBeNull()
  })

  it('never offers the operator who asked the confirmation', async () => {
    answers[HANDOVER] = () => json(200, [handover({ requestedBy: 'u-me' })])
    answers[CANDIDATES] = () => json(200, [AISHA, KHALID])
    renderAt('/console/tenants/t-1', <TenantOwnerHandoverCard tenantId="t-1" />)

    expect(await screen.findByText(i18n.t('console.owners.handover.secondOperator'))).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('console.owners.handover.confirm') }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: i18n.t('console.owners.handover.start') }),
    ).toBeNull()
  })

  it('asks for a handover to another Administrator, with the reason and the proof', async () => {
    answers[HANDOVER] = () => json(200, [])
    answers[CANDIDATES] = () => json(200, [AISHA, KHALID])
    answers[`POST ${HANDOVER}`] = () => json(201, handover())
    const user = userEvent.setup({ delay: null })
    renderAt('/console/tenants/t-1', <TenantOwnerHandoverCard tenantId="t-1" />)

    expect(
      await screen.findByText(
        i18n.t('console.owners.handover.owner', { name: 'Aisha Al Balushi (aisha)' }),
      ),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('console.owners.handover.start') }))
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.owners.handover.form.to') }),
    )
    // The current Owner is never a target.
    expect(screen.queryByRole('option', { name: /Aisha/ })).toBeNull()
    await user.click(screen.getByRole('option', { name: /Khalid/ }))
    await user.type(
      screen.getByLabelText(new RegExp(`^${i18n.t('console.owners.handover.form.reason')}`)),
      'Owner unreachable for a month',
    )
    await user.type(
      screen.getByLabelText(new RegExp(`^${i18n.t('console.owners.handover.form.evidence')}`)),
      'Ticket 4821',
    )
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.owners.handover.form.submit') }),
    )

    await waitFor(() => expect(posts(HANDOVER)).toHaveLength(1))
    expect(posts(HANDOVER)[0]).toEqual({
      toUserId: 'u-khalid',
      reason: 'Owner unreachable for a month',
      evidenceRef: 'Ticket 4821',
    })
  })
})

describe('Console › Branch access check (BA-6)', () => {
  const REPORT = {
    enforced: false,
    customRolesWithReservedCodes: [
      {
        tenantId: 't-2',
        tenantCode: 'B',
        companyName: 'Beta LLC',
        roleId: 'r-1',
        roleCode: 'PLAN_DESK',
        roleName: 'Plan desk',
        reservedCodes: ['tenant.plan.manage'],
        holders: 2,
      },
    ],
    invitationsNamingSeveralRoles: [
      {
        tenantId: 't-2',
        tenantCode: 'B',
        companyName: 'Beta LLC',
        invitationId: 'i-1',
        expiresAt: '2026-11-01T00:00:00Z',
        jobRoles: ['ACCOUNTANT'],
        otherRoles: ['PLAN_DESK'],
      },
    ],
    peopleWithoutBranch: [
      { tenantId: 't-1', tenantCode: 'A', companyName: 'Alpha LLC', people: 3 },
    ],
    peopleWithSeveralRoles: [
      { tenantId: 't-2', tenantCode: 'B', companyName: 'Beta LLC', people: 1 },
    ],
  }

  it('regroups the report per company, in code order', () => {
    const companies = byCompany(REPORT)
    expect(companies.map((c) => c.companyName)).toEqual(['Alpha LLC', 'Beta LLC'])
    expect(companies[1]).toMatchObject({ peopleWithSeveralRoles: 1, peopleWithoutBranch: 0 })
    expect(companies[1].roles).toHaveLength(1)
  })

  it('shows what each company would meet when branch access is switched on', async () => {
    answers[READINESS] = () => json(200, REPORT)
    renderAt('/console/branch-access', <ConsoleBranchAccessReadinessPage />)

    const alpha = await screen.findByRole('region', { name: 'Alpha LLC' })
    expect(
      within(alpha).getByText(i18n.t('console.branchAccess.withoutBranch.title', { count: 3 })),
    ).toBeTruthy()
    const beta = screen.getByRole('region', { name: 'Beta LLC' })
    expect(
      within(beta).getByText(i18n.t('console.branchAccess.severalRoles.title', { count: 1 })),
    ).toBeTruthy()
    expect(
      within(beta).getByText(
        i18n.t('console.branchAccess.reserved.title', { role: 'Plan desk', count: 2 }),
      ),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('console.branchAccess.switch.off'))).toBeTruthy()
    // Words, not codes: the permission and the roles are named, never printed as codes.
    expect(within(beta).getByText('Accountant')).toBeTruthy()
    expect(within(beta).getByText('Plan desk', { selector: 'span' })).toBeTruthy()
    expect(within(beta).queryByText('tenant.plan.manage')).toBeNull()
    expect(within(beta).queryByText('ACCOUNTANT')).toBeNull()
  })
})
