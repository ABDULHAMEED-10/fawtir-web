import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { BillDueCard } from './BillDueCard'

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

let answer: () => Response
beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  vi.stubGlobal('fetch', vi.fn(async () => answer()))
})
afterEach(() => vi.unstubAllGlobals())

const renderCard = () => render(<MemoryRouter><BillDueCard /></MemoryRouter>)

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
