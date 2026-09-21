import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { AgreementDto } from '../../api/selfBilling/agreements'
import { blockerOf, canIssueUnder, waitingOn } from '../../lib/selfBillingAgreements'
import { AgreementsPage } from './AgreementsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const AGREEMENTS_URL = '/api/v1/self-billing-agreements'
const TODAY = '2026-09-21'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'selfbilling.agreement.manage', 'selfbilling.create'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...MANAGER, permissions: ['invoice.read'] }

function agreement(overrides: Partial<AgreementDto> = {}): AgreementDto {
  return {
    id: 'a-1',
    customerId: 'c-1',
    agreementReference: 'SBA-2026-004',
    status: 'ACTIVE',
    sellerIdentityAssurance: 'COUNTERPARTY_VERIFIED',
    verifiedParticipant: '0248:om1199999001',
    verifiedAt: '2026-09-01T10:00:00Z',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    withdrawnAt: null,
    withdrawalReason: null,
    version: 0,
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let rows: AgreementDto[]
let posted: { url: string; body: unknown }[]
let refuseWith: { code: string; status: number } | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
  who = MANAGER
  rows = [agreement()]
  posted = []
  refuseWith = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    if (url.startsWith('/api/v1/customers')) {
      // The customers list is a Spring page (content/size/totalElements), not an items page.
      return json(200, {
        content: [{ id: 'c-1', displayName: 'Muscat Roastery Co' }],
        page: 0,
        size: 200,
        totalElements: 1,
      })
    }
    if (url.startsWith(AGREEMENTS_URL)) {
      if (init?.method === 'POST') {
        posted.push({ url, body: init.body ? JSON.parse(String(init.body)) : null })
        if (refuseWith !== null) {
          return new Response(
            JSON.stringify({
              code: refuseWith.code,
              status: refuseWith.status,
              type: `https://api.fawtir.om/problems/${refuseWith.code.toLowerCase().replace(/_/g, '-')}`,
              detail: 'refused',
            }),
            { status: refuseWith.status, headers: { 'Content-Type': 'application/problem+json' } },
          )
        }
        return json(200, rows[0])
      }
      return json(200, rows)
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderPage(path = '/income/self-billing/agreements') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/income/self-billing/agreements" element={<AgreementsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('what an agreement permits', () => {
  it('names the same obstacle the server would, in the server order', () => {
    // The server checks MISSING, NOT_ACTIVE, NOT_IN_FORCE, SELLER_NOT_VERIFIED in that order.
    // A withdrawn, lapsed, unverified agreement has three true problems; the one reported has to
    // be the one that would actually come back.
    const hopeless = agreement({
      status: 'WITHDRAWN',
      effectiveTo: '2020-01-01',
      sellerIdentityAssurance: 'UNVERIFIED',
    })
    expect(blockerOf(hopeless, TODAY)).toBe('withdrawn')
    expect(blockerOf(agreement({ status: 'SUSPENDED' }), TODAY)).toBe('suspended')
    expect(blockerOf(agreement({ effectiveTo: '2026-09-20' }), TODAY)).toBe('lapsed')
    expect(blockerOf(agreement({ sellerIdentityAssurance: 'UNVERIFIED' }), TODAY)).toBe('unverified')
    expect(blockerOf(agreement(), TODAY)).toBeNull()
  })

  it('treats the boundary days as in force, because the server does', () => {
    expect(canIssueUnder(agreement({ effectiveFrom: TODAY }), TODAY)).toBe(true)
    expect(canIssueUnder(agreement({ effectiveTo: TODAY }), TODAY)).toBe(true)
    expect(canIssueUnder(agreement({ effectiveFrom: '2026-09-22' }), TODAY)).toBe(false)
  })

  it('separates the wait the tenant owns from the one only Fawtir can clear', () => {
    expect(waitingOn(agreement({ status: 'PENDING_ACTIVATION' }), TODAY)).toBe('tenant')
    expect(waitingOn(agreement({ sellerIdentityAssurance: 'UNVERIFIED' }), TODAY)).toBe('fawtir')
    expect(waitingOn(agreement(), TODAY)).toBe('nobody')
  })
})

describe('the agreements screen', () => {
  it('names the seller by joining the customer, since the agreement carries only an id', async () => {
    renderPage()
    expect(await screen.findByText('Muscat Roastery Co')).toBeTruthy()
    expect(screen.getByText(/SBA-2026-004/)).toBeTruthy()
  })

  it('says issuing is possible when it is', async () => {
    renderPage()
    expect(await screen.findByText(/You can issue self-billed invoices to this seller/)).toBeTruthy()
  })

  it('offers no verify button, because no tenant can ever hold that permission', async () => {
    rows = [agreement({ sellerIdentityAssurance: 'UNVERIFIED', verifiedParticipant: null })]
    renderPage()

    expect(await screen.findByText(/Waiting on Fawtir to verify/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /verify/i })).toBeNull()
  })

  it('calls a lapsed agreement lapsed, which the server never will', async () => {
    rows = [agreement({ effectiveTo: '2026-09-20' })]
    renderPage()

    // Status is still ACTIVE on the wire; there is no EXPIRED state anywhere.
    expect(await screen.findByText('Active')).toBeTruthy()
    expect(screen.getByText('LAPSED')).toBeTruthy()
    expect(screen.getByText(/so issuing is now refused/)).toBeTruthy()
  })

  it('offers only the lifecycle actions the server would accept', async () => {
    rows = [
      agreement({ id: 'a-1', status: 'PENDING_ACTIVATION' }),
      agreement({ id: 'a-2', status: 'ACTIVE', effectiveFrom: '2026-02-01' }),
      agreement({ id: 'a-3', status: 'WITHDRAWN', effectiveFrom: '2026-03-01' }),
    ]
    renderPage()
    await screen.findAllByText('Muscat Roastery Co')

    const items = screen.getAllByRole('listitem')
    // Newest effectiveFrom first: a-3 (Mar), a-2 (Feb), a-1 (Jan).
    expect(within(items[2]).getByRole('button', { name: 'Activate' })).toBeTruthy()
    expect(within(items[2]).queryByRole('button', { name: 'Suspend' })).toBeNull()
    expect(within(items[1]).getByRole('button', { name: 'Suspend' })).toBeTruthy()
    expect(within(items[1]).queryByRole('button', { name: 'Activate' })).toBeNull()
    // Withdrawn is terminal: nothing acts on it.
    expect(within(items[0]).queryByRole('button', { name: 'Withdraw' })).toBeNull()
    expect(within(items[0]).queryByRole('button', { name: 'Activate' })).toBeNull()
  })

  it('activates through the lifecycle route', async () => {
    rows = [agreement({ status: 'PENDING_ACTIVATION' })]
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }))

    await waitFor(() => expect(posted.at(-1)?.url).toContain('/self-billing-agreements/a-1/activation'))
  })

  it('warns that withdrawal is terminal before it writes, and sends the reason', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))

    expect(await screen.findByText(/This cannot be undone/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Contract ended' } })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw it' }))

    await waitFor(() => {
      expect(posted.at(-1)?.url).toContain('/withdrawal')
      expect(posted.at(-1)?.body).toEqual({ reason: 'Contract ended' })
    })
  })

  it('sends an explicit null reason rather than an absent body, which the route requires', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw it' }))

    await waitFor(() => expect(posted.at(-1)?.body).toEqual({ reason: null }))
  })

  it('says the reference and dates are fixed before opening one', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open an agreement' }))
    expect(await screen.findByText(/cannot be changed afterwards/)).toBeTruthy()
  })

  it('refuses a range the server would refuse, and never asks it', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open an agreement' }))
    fireEvent.change(await screen.findByLabelText('In force from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-04-01' } })

    expect(await screen.findByText('The end date is before the start date.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open the agreement' })).toHaveProperty('disabled', true)
    expect(posted).toHaveLength(0)
  })

  it('opens one with an open-ended end date sent as null', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open an agreement' }))
    fireEvent.change(await screen.findByLabelText('Seller'), { target: { value: 'c-1' } })
    fireEvent.change(screen.getByLabelText('Your reference for the agreement'), { target: { value: 'SBA-9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open the agreement' }))

    await waitFor(() =>
      expect(posted.at(-1)?.body).toEqual({
        customerId: 'c-1',
        agreementReference: 'SBA-9',
        effectiveFrom: TODAY,
        effectiveTo: null,
      }),
    )
  })

  it('names a 409 refusal instead of telling the reader to reload', async () => {
    // Seven self-billing codes answer Conflict; the generic 409 sentence would be false here.
    refuseWith = { code: 'SELF_BILLING_AGREEMENT_ALREADY_EXISTS', status: 409 }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open an agreement' }))
    fireEvent.change(await screen.findByLabelText('Seller'), { target: { value: 'c-1' } })
    fireEvent.change(screen.getByLabelText('Your reference for the agreement'), { target: { value: 'SBA-9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open the agreement' }))

    expect(await screen.findByText(/already a live agreement with this seller/)).toBeTruthy()
    expect(screen.queryByText(/Reload to see the latest version/)).toBeNull()
  })

  it('shows nothing at all to someone without the permission, which reading also needs', async () => {
    who = READER
    renderPage()
    expect(await screen.findByText(/doesn't have access to this part of Fawtir/)).toBeTruthy()
    expect(fetchMock.mock.calls.map(([url]) => String(url)).some((url) => url.startsWith(AGREEMENTS_URL))).toBe(false)
  })
})
