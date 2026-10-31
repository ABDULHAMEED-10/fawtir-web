import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { BillDueCard } from './BillDueCard'
import { SessionContext } from '../../lib/session/session'
import type { Entitlements } from '../../lib/identity/entitlements'

const BILL = {
  id: 'b-1', number: 'FWT-SUB-2026-000001', planCode: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-12', periodEndsOn: '2026-11-11', subtotal: '80.000', vatRate: '0.05000', vatAmount: '4.000',
  total: '84.000', currency: 'OMR', taxDocumentStatus: 'NOT_A_TAX_INVOICE', status: 'OPEN', dueOn: '2026-10-12',
  issuedAt: '2026-10-12T05:00:00Z', paidAt: null, appliedPaidThrough: null, voidReason: null, version: 0,
}
const overview = (status: string) => ({
  bills: [{ bill: { ...BILL, status }, payments: [] }], nextBillsCursor: null, beneficiary: null,
  methods: { bankTransfer: false, bankTransferStatus: 'NO_ACCOUNT', cash: true }, proofMaximumBytes: 1000000,
})
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** The billing overview is `tenant.plan.read`'s; the card is asked only of a reader with it. */
const PAYER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions: ['tenant.plan.read'],
  scopes: [],
  featureFlags: {},
}

let answer: () => Response
let who: Entitlements
beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  who = PAYER
  // Only the billing read is answered: who is signed in stays unknown, so nothing else is asked.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/v1/me/entitlements' ? json(404, { type: 'about:blank' }) : answer(),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

const renderCard = () =>
  render(
    <SessionContext.Provider value={who}>
      <MemoryRouter>
        <BillDueCard />
      </MemoryRouter>
    </SessionContext.Provider>,
  )

describe('Dashboard: the bill waiting to be paid', () => {
  it('points to an open bill with its number and total', async () => {
    answer = () => json(200, overview('OPEN'))
    renderCard()
    expect(await screen.findByText(i18n.t('billDue.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('billDue.body', { number: BILL.number }))).toBeTruthy()
    expect(screen.getByText('84.000')).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('billDue.cta') }).getAttribute('href')).toBe('/settings/bills')
  })

  it('says nothing once a payment was sent, or the bill is paid', async () => {
    for (const status of ['PENDING_VERIFICATION', 'PAID']) {
      answer = () => json(200, overview(status))
      resetSharedRequests()
      const { unmount } = renderCard()
      await new Promise((r) => setTimeout(r, 50))
      expect(screen.queryByText(i18n.t('billDue.title'))).toBeNull()
      unmount()
    }
  })

  it('says nothing to a user who may not see billing', async () => {
    answer = () => json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderCard()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(i18n.t('billDue.title'))).toBeNull()
  })
})

describe('the bill card for a reader without tenant.plan.read (B-14)', () => {
  it('asks nothing and says nothing', async () => {
    who = { ...PAYER, permissions: ['invoice.read'] }
    answer = () => json(200, overview('OPEN'))
    renderCard()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText(i18n.t('billDue.title'))).toBeNull()
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/v1/settings/billing'),
    ).toBe(false)
  })
})
