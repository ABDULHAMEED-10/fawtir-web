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
    nextBillsCursor: null,
    beneficiary: BENEFICIARY,
    methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true },
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
  it('points a customer who owes payment to the ways to pay below, not to Fawtir, when one works', async () => {
    answers[SUBSCRIPTION] = () => json(200, { ...STATUS, access: 'PAYMENT_REQUIRED', trialDay: null, trialDaysLeft: null })
    renderBilling()
    const notice = await screen.findByText(i18n.t('subscription.notice.paymentRequiredBilling'))
    expect(notice.textContent).not.toMatch(/contact Fawtir/i)
    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.noMethod'))).toBeNull()
  })

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

  it('shows no VAT line on a bill at rate 0, and names the seller the bill carries', async () => {
    const seller = {
      legalNameEn: 'Thumb International SPC', legalNameAr: 'الإبهام العالمية ش ش و', crNumber: '1383315',
      taxIdentificationNumber: '1875504', vatNumber: null, addressEn: 'Al Khuwair, Muscat', addressAr: null,
    }
    const bill = { ...BILL, vatRate: '0.00000', vatAmount: '0.000', total: '35.000', seller }
    answers[BILLING] = () => json(200, overview({ bills: [{ bill, payments: [] }] }))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.bill.seller', { name: 'Thumb International SPC' }))).toBeTruthy()
    const region = charges()
    expect(within(region).queryByText(i18n.t('billing.bill.vat', { rate: '0%' }))).toBeNull()
    expect(within(region).getByText(i18n.t('billing.bill.subtotal'))).toBeTruthy()
    expect(within(region).getByText(i18n.t('billing.bill.total'))).toBeTruthy()
  })

  it('names the Arabic seller in Arabic, and no seller for a bill issued before one existed', async () => {
    const seller = {
      legalNameEn: 'Thumb International SPC', legalNameAr: 'الإبهام العالمية ش ش و', crNumber: '1383315',
      taxIdentificationNumber: null, vatNumber: null, addressEn: 'Al Khuwair, Muscat', addressAr: null,
    }
    await i18n.changeLanguage('ar')
    answers[BILLING] = () => json(200, overview({ bills: [{ bill: { ...BILL, seller }, payments: [] }] }))
    const { unmount } = renderBilling()
    expect(await screen.findByText(i18n.t('billing.bill.seller', { name: 'الإبهام العالمية ش ش و' }))).toBeTruthy()
    unmount()

    await i18n.changeLanguage('en')
    resetSharedRequests()
    answers[BILLING] = () => json(200, overview({ bills: [{ bill: { ...BILL, seller: null }, payments: [] }] }))
    renderBilling()
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    expect(charges().textContent).not.toContain(i18n.t('billing.bill.seller', { name: '' }).trim())
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

  it('offers no way to pay when the server reports no method available, says why, and keeps the contact fallback', async () => {
    answers[BILLING] = () => json(200, overview({ beneficiary: null, methods: { bankTransfer: false, bankTransferStatus: 'NO_ACCOUNT', cash: false } }))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.noMethod'))).toBeTruthy()
    expect(screen.getByText(i18n.t('billing.bankNoAccount'))).toBeTruthy()
    expect(within(charges()).queryByRole('radio')).toBeNull()
  })

  it('shows the confirmed account and the exact amount to transfer, in rials with three decimals', async () => {
    const user = userEvent.setup({ delay: null })
    renderBilling()

    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) }))
    const region = charges()
    for (const [label, value] of [
      ['billing.bank.holder', 'Fawtir LLC'],
      ['billing.bank.bank', 'Bank Muscat'],
      ['billing.bank.iban', 'OM810180000001299123456'],
      ['billing.bank.swift', 'BMUSOMMX'],
    ]) {
      expect(within(region).getByText(i18n.t(label))).toBeTruthy()
      expect(within(region).getByText(value)).toBeTruthy()
    }
    // The bill's own total (36.750), not the plan's price (35.000), beside the account.
    const amount = within(region).getByText(i18n.t('billing.bank.amount')).parentElement as HTMLElement
    expect(within(amount).getByText('36.750')).toBeTruthy()
    expect(amount.textContent).not.toMatch(/OMR|35\.000/)
    expect(within(region).getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
  })

  it('says bank transfer is unavailable when Fawtir has no confirmed account, shows no account, and still offers cash', async () => {
    answers[BILLING] = () =>
      json(200, overview({ beneficiary: null, methods: { bankTransfer: false, bankTransferStatus: 'NO_ACCOUNT', cash: true } }))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.bankNoAccount'))).toBeTruthy()
    const region = charges()
    expect(within(region).getAllByRole('radio')).toHaveLength(1)
    expect(within(region).getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(within(region).queryByText(i18n.t('billing.bank.iban'))).toBeNull()
    expect(within(region).queryByText(i18n.t('billing.noMethod'))).toBeNull()
  })

  it('adds no bank warning when the deployment does not offer bank transfer at all', async () => {
    answers[BILLING] = () =>
      json(200, overview({ beneficiary: null, methods: { bankTransfer: false, bankTransferStatus: 'NOT_OFFERED', cash: true } }))
    renderBilling()

    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.bankNoAccount'))).toBeNull()
    expect(screen.queryByText(i18n.t('billing.bankUnavailable'))).toBeNull()
  })

  it('shows a sent receipt as pending verification by Fawtir Finance at every step, never as paid', async () => {
    for (const status of ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL']) {
      answers[BILLING] = () =>
        json(200, overview({ bills: [{ bill: { ...BILL, status: 'PENDING_VERIFICATION' }, payments: [{ id: 'p-2', billId: 'b-1', method: 'BANK_TRANSFER', status, amount: '36.750', submittedAt: '2026-10-18T06:00:00Z', reference: 'TRX-1001', customerNote: null, proofContentType: 'application/pdf', receiptNumber: null, receivedAmount: null, receivedAt: null, rejectionReason: null, version: 0 }] }] }))
      resetSharedRequests()
      const { unmount } = renderBilling()

      const waiting = await screen.findByText(i18n.t(`billing.waiting.BANK_TRANSFER.${status}`))
      expect(waiting.textContent).toMatch(/^Pending verification by Fawtir Finance\./)
      expect(within(charges()).queryByText(i18n.t('billing.billStatus.PAID'))).toBeNull()
      expect(within(charges()).queryByRole('radio')).toBeNull()
      unmount()
    }
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

  it('a reason that ends with a full stop is not followed by a second one', async () => {
    answers[BILLING] = () =>
      json(200, overview({
        bills: [{ bill: BILL, payments: [{ id: 'p-0', billId: 'b-1', method: 'BANK_TRANSFER', status: 'REJECTED', amount: '36.750', submittedAt: '2026-10-17T06:00:00Z', reference: 'X', customerNote: null, proofContentType: 'application/pdf', receiptNumber: null, receivedAmount: null, receivedAt: null, rejectionReason: 'Amount on the receipt is 30.000.', version: 2 }] }],
      }))
    renderBilling()

    const alert = await screen.findByText(i18n.t('billing.rejected', { reason: 'Amount on the receipt is 30.000' }))
    expect(alert.textContent).not.toContain('..')
  })

  it('says why bank transfer is missing when proof storage is unavailable, and still offers cash', async () => {
    answers[BILLING] = () =>
      json(200, overview({ methods: { bankTransfer: false, bankTransferStatus: 'STORAGE_UNAVAILABLE', cash: true } }))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.bankUnavailable'))).toBeTruthy()
    expect(within(charges()).getAllByRole('radio')).toHaveLength(1)
    expect(within(charges()).getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
  })

  it('reloads and explains when the bill was replaced by a plan change before it was paid', async () => {
    let replaced = false
    answers[BILLING] = () =>
      json(200, replaced
        ? overview({ bills: [{ bill: { ...BILL, status: 'VOID', voidReason: 'Superseded: PLAN_CHANGE' }, payments: [] }] })
        : overview())
    answers[`POST ${BILLING}/bills/b-1/cash-request`] = () => {
      replaced = true
      return json(409, { type: 'https://api.fawtir.om/problems/bill-stale' })
    }
    const user = userEvent.setup({ delay: null })
    renderBilling()

    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }))
    await user.click(screen.getByRole('button', { name: i18n.t('billing.cash.submit') }))

    expect(await screen.findByText(i18n.t('billing.refusal.bill-stale'))).toBeTruthy()
    expect(await screen.findByText(i18n.t('billing.superseded'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('billing.prepare') })).toBeTruthy()
  })

  it('shows older bills a page at a time from the cursor', async () => {
    const seller = {
      legalNameEn: 'Thumb International SPC', legalNameAr: null, crNumber: '1383315',
      taxIdentificationNumber: null, vatNumber: null, addressEn: 'Muscat', addressAr: null,
    }
    const paid = (id: string, number: string) => ({
      bill: { ...BILL, id, number, status: 'PAID', paidAt: '2026-09-20T08:00:00Z', appliedPaidThrough: '2026-10-22', seller },
      payments: [],
    })
    answers[BILLING] = () =>
      json(200, overview({ bills: [{ bill: BILL, payments: [] }, paid('b-0', 'FWT-SUB-2026-000006')], nextBillsCursor: 'c-2' }))
    answers[`${BILLING}/bills?before=c-2`] = () =>
      json(200, { bills: [paid('b-old', 'FWT-SUB-2026-000001')], nextCursor: null })
    const user = userEvent.setup({ delay: null })
    renderBilling()

    expect(await screen.findByText(/FWT-SUB-2026-000006/)).toBeTruthy()
    expect(screen.queryByText(/FWT-SUB-2026-000001/)).toBeNull()
    await user.click(screen.getByRole('button', { name: i18n.t('billing.olderBills') }))

    expect(await screen.findByText(/FWT-SUB-2026-000001/)).toBeTruthy()
    expect(screen.getByText(/FWT-SUB-2026-000006/)).toBeTruthy()
    // A paid bill names the seller it was issued under.
    expect(screen.getAllByText(i18n.t('billing.bill.seller', { name: 'Thumb International SPC' })).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: i18n.t('billing.olderBills') })).toBeNull()
  })

  it('reads in Arabic with Latin digits and the rial sign', async () => {
    await i18n.changeLanguage('ar')
    renderBilling()

    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    expect(within(charges()).getByText('36.750')).toBeTruthy()
    expect(charges().textContent).not.toMatch(/[٠-٩]/)
  })

  it('in Arabic, keeps the IBAN left to right, the amount in Latin digits, and the new wording translated', async () => {
    await i18n.changeLanguage('ar')
    const user = userEvent.setup({ delay: null })
    renderBilling()

    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) }))
    const region = charges()
    expect(within(region).getByText('OM810180000001299123456').getAttribute('dir')).toBe('ltr')
    const amount = within(region).getByText(i18n.t('billing.bank.amount')).parentElement as HTMLElement
    expect(within(amount).getByText('36.750')).toBeTruthy()
    expect(region.textContent).not.toMatch(/[٠-٩]/)
    for (const key of ['billing.bank.amount', 'billing.bankNoAccount', 'billing.waiting.BANK_TRANSFER.SUBMITTED',
      'subscription.notice.paymentRequiredBilling', 'subscription.notice.paymentRequiredPlan']) {
      expect(i18n.t(key)).toMatch(/[\u0600-\u06FF]/)
    }
  })
})

describe('Settings › Billing: after a pay-now signup', () => {
  it('opens the pay form on the method chosen at signup, and any offered method can still be picked', async () => {
    answers[BILLING] = () => json(200, overview({ signupMethod: 'CASH' }))
    renderBilling()
    const cash = await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })
    expect((cash as HTMLInputElement).checked).toBe(true)
    const bank = screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) })
    expect((bank as HTMLInputElement).checked).toBe(false)
    expect((bank as HTMLInputElement).disabled).toBe(false)
  })

  it('ignores a signup method that is not offered any more', async () => {
    answers[BILLING] = () => json(200, overview({ signupMethod: 'CARD' }))
    renderBilling()
    const bank = await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) })
    expect((bank as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }) as HTMLInputElement).checked).toBe(false)
  })
})
