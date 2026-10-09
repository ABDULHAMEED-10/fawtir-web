import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BillingPage } from './BillingPage'

const PAYER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const SUBSCRIPTION = '/api/v1/settings/subscription'
const BILLING = '/api/v1/settings/billing'

const STATUS = {
  tracked: true, access: 'TRIAL', restrictionsEnforced: false, today: '2026-10-18', planCode: 'STARTER',
  planName: 'Starter', billingCycle: 'MONTHLY', periodPrice: '35.000', trialStartsOn: '2026-10-09',
  trialEndsOn: '2026-10-22', trialDay: 10, trialDaysLeft: 5, paidThrough: null, renewsOn: '2026-10-23',
  graceDays: 7, graceUntil: null, autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null,
  cancelAtPeriodEnd: false, accessEndsOn: null, scheduledChange: null,
}

const BILL = {
  id: 'b-1', number: 'FWT-SUB-2026-000007', planCode: 'STARTER', planName: 'Starter', billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-23', periodEndsOn: '2026-11-22', subtotal: '35.000', vatRate: '0.05000',
  vatAmount: '1.750', total: '36.750', currency: 'OMR', taxDocumentStatus: 'NOT_A_TAX_INVOICE', status: 'OPEN',
  dueOn: '2026-10-22', issuedAt: '2026-10-18T05:00:00Z', paidAt: null, appliedPaidThrough: null, voidReason: null,
  version: 0,
}

const BENEFICIARY = { legalName: 'Fawtir LLC', bankName: 'Bank Muscat', iban: 'OM810180000001299123456', swiftCode: 'BMUSOMMX' }

function overview(over: Partial<Record<string, unknown>> = {}) {
  return {
    bills: [{ bill: BILL, payments: [] }],
    beneficiary: BENEFICIARY,
    methods: { bankTransfer: true, cash: true },
    proofMaximumBytes: 1000000,
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
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  answers = {
    [SUBSCRIPTION]: () => json(200, STATUS),
    [BILLING]: () => json(200, overview()),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, PAYER)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderBilling() {
  return render(
    <MemoryRouter initialEntries={['/settings/bills']}>
      <Routes>
        <Route path="/settings/bills" element={<BillingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function charges() {
  return screen.getByRole('region', { name: i18n.t('billing.title') })
}

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
}

describe('Settings › Billing: the charge', () => {
  it('shows the server-computed subtotal, 5% VAT and total with the rial sign, and says it is not a tax invoice', async () => {
    renderBilling()
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    const region = charges()

    expect(within(region).getByText('35.000')).toBeTruthy()
    expect(within(region).getByText('1.750')).toBeTruthy()
    expect(within(region).getByText('36.750')).toBeTruthy()
    expect(within(region).getByText(i18n.t('billing.bill.vat', { rate: '5%' }))).toBeTruthy()
    expect(within(region).getByText(i18n.t('billing.bill.notTaxInvoice'))).toBeTruthy()
    expect(region.textContent).not.toMatch(/OMR/)
    expect(within(region).queryByText(/card/i)).toBeNull()
  })

  it('sends bank-transfer proof as multipart with an Idempotency-Key, and a retry reuses the key', async () => {
    let attempts = 0
    answers[`POST ${BILLING}/bills/b-1/bank-transfer`] = () => {
      attempts += 1
      return attempts === 1 ? json(503, { type: 'about:blank' }) : json(201, { id: 'p-1', status: 'SUBMITTED' })
    }
    const user = userEvent.setup({ delay: null })
    renderBilling()

    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) }))
    expect(screen.getByText('OM810180000001299123456')).toBeTruthy()
    const file = new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    await user.type(screen.getByRole('textbox', { name: i18n.t('billing.bank.reference') }), 'TRX-1001')
    await user.click(screen.getByRole('button', { name: i18n.t('billing.bank.submit') }))
    expect(await screen.findByText(i18n.t('billing.refusal.other'))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('billing.bank.submit') }))
    await waitFor(() => expect(attempts).toBe(2))

    const [first, second] = writes().filter(([url]) => String(url).endsWith('/bank-transfer'))
    const keyOf = (init: RequestInit | undefined) => (init?.headers as Record<string, string>)['Idempotency-Key']
    expect(keyOf(first[1])).toMatch(/^subscription-payment-/)
    expect(keyOf(second[1])).toBe(keyOf(first[1]))
    const body = first[1]?.body as FormData
    expect(body.get('reference')).toBe('TRX-1001')
    expect((body.get('proof') as File).name).toBe('receipt.pdf')
  })

  it('shows a submitted payment as waiting, never as paid, and lets it be withdrawn', async () => {
    answers[BILLING] = () =>
      json(200, overview({
        bills: [{ bill: { ...BILL, status: 'PENDING_VERIFICATION' }, payments: [{ id: 'p-1', billId: 'b-1', method: 'CASH', status: 'SUBMITTED', amount: '36.750', submittedAt: '2026-10-18T06:00:00Z', reference: null, customerNote: null, proofContentType: null, receiptNumber: null, receivedAmount: null, receivedAt: null, rejectionReason: null, version: 0 }] }],
      }))
    answers[`POST ${BILLING}/payments/p-1/withdrawal`] = () => json(200, { id: 'p-1', status: 'WITHDRAWN' })
    const user = userEvent.setup({ delay: null })
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.waiting.CASH.SUBMITTED'))).toBeTruthy()
    expect(within(charges()).queryByText(i18n.t('billing.billStatus.PAID'))).toBeNull()
    expect(within(charges()).queryByRole('radio')).toBeNull()
    await user.click(screen.getByRole('button', { name: i18n.t('billing.withdraw') }))
    await waitFor(() => expect(writes().some(([url]) => String(url).endsWith('/payments/p-1/withdrawal'))).toBe(true))
  })

  it('offers no way to pay when the server reports no method available', async () => {
    answers[BILLING] = () => json(200, overview({ beneficiary: null, methods: { bankTransfer: false, cash: false } }))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.noMethod'))).toBeTruthy()
    expect(within(charges()).queryByRole('radio')).toBeNull()
  })

  it('shows the reason for a rejected payment and lets the customer pay again', async () => {
    answers[BILLING] = () =>
      json(200, overview({
        bills: [{ bill: BILL, payments: [{ id: 'p-0', billId: 'b-1', method: 'BANK_TRANSFER', status: 'REJECTED', amount: '36.750', submittedAt: '2026-10-17T06:00:00Z', reference: 'X', customerNote: null, proofContentType: 'application/pdf', receiptNumber: null, receivedAmount: null, receivedAt: null, rejectionReason: 'Amount on the receipt is 30.000', version: 2 }] }],
      }))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.rejected', { reason: 'Amount on the receipt is 30.000' }))).toBeTruthy()
    expect(within(charges()).getAllByRole('radio')).toHaveLength(2)
  })

  it('reads in Arabic with Latin digits and the rial sign', async () => {
    await i18n.changeLanguage('ar')
    renderBilling()

    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    expect(within(charges()).getByText('36.750')).toBeTruthy()
    expect(charges().textContent).not.toMatch(/[٠-٩]/)
  })
})
