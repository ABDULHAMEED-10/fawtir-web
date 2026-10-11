import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { hostedCheckout, isTrustedCheckoutUrl } from '../../api/settings/billing'
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
const CHECKOUT = `POST ${BILLING}/bills/b-1/card-checkout`
const STATUS_OF_P1 = `${BILLING}/payments/p-1/card-checkout`
const HOSTED = 'https://oman.paymob.com/unifiedcheckout/?publicKey=pk_test&clientSecret=cs_test'

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
const CARD_OK = { available: true, purpose: 'NEW_SUBSCRIPTION', reason: null }
const CARD_PAYMENT = {
  id: 'p-1', billId: 'b-1', method: 'CARD', status: 'SUBMITTED', amount: '36.750', submittedAt: '2026-10-18T06:00:00Z',
  reference: null, customerNote: null, proofContentType: null, receiptNumber: null, receivedAmount: null,
  receivedAt: null, rejectionReason: null, version: 0,
}

function overview(over: Partial<Record<string, unknown>> = {}, card: unknown = CARD_OK, cardOn = true) {
  return {
    bills: [{ bill: BILL, payments: [], card }],
    nextBillsCursor: null,
    beneficiary: BENEFICIARY,
    methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true, card: cardOn },
    proofMaximumBytes: 1000000,
    ...over,
  }
}

function checkout(status: string, over: Record<string, unknown> = {}) {
  return {
    paymentId: 'p-1', billId: 'b-1', status, checkoutUrl: status === 'READY' ? HOSTED : null,
    expiresAt: status === 'READY' ? '2026-10-18T06:30:00Z' : null, amount: '36.750', currency: 'OMR', ...over,
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
let opened: ReturnType<typeof vi.spyOn>

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
  opened = vi.spyOn(hostedCheckout, 'open').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Address() {
  const location = useLocation()
  return <output data-testid="address">{location.search}</output>
}

function renderBilling(at = '/settings/bills') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route
          path="/settings/bills"
          element={
            <>
              <BillingPage />
              <Address />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function charges() {
  return screen.getByRole('region', { name: i18n.t('billing.title') })
}

function calls(key: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const method = init?.method ?? 'GET'
    return (method === 'GET' ? String(url) : `${method} ${url}`) === key
  })
}

function cardRadio() {
  return screen.queryByRole('radio', { name: new RegExp(i18n.t('billing.method.CARD.title')) })
}

async function chooseCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CARD.title')) }))
}

describe('Settings › Billing: the hosted checkout host', () => {
  it.each([
    ['https://oman.paymob.com/unifiedcheckout/?publicKey=a&clientSecret=b'],
    ['https://OMAN.PAYMOB.COM/unifiedcheckout/'],
    ['https://oman.paymob.com:443/unifiedcheckout/'],
  ])('accepts %s', (url) => {
    expect(isTrustedCheckoutUrl(url)).toBe(true)
  })

  it.each([
    ['http://oman.paymob.com/checkout'],
    ['https://oman.paymob.com.evil.example/'],
    ['https://evil.example/oman.paymob.com/'],
    ['https://evil.example/?next=https://oman.paymob.com/'],
    ['https://oman.paymob.com@evil.example/'],
    ['https://user:pass@oman.paymob.com/'],
    ['https://oman.paymob.com:8443/'],
    ['https://oman.paymob.com./'],
    ['https://accept.paymob.com/'],
    ['//oman.paymob.com/unifiedcheckout/'],
    ['/unifiedcheckout/'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['blob:https://oman.paymob.com/1234'],
    [' '],
    [''],
  ])('refuses %s', (url) => {
    expect(isTrustedCheckoutUrl(url)).toBe(false)
  })
})

describe('Settings › Billing: card availability', () => {
  it('offers no card when the server reports card switched off, even if the bill would qualify, and keeps bank and cash', async () => {
    answers[BILLING] = () => json(200, overview({}, CARD_OK, false))
    renderBilling()
    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) })).toBeTruthy()
    expect(cardRadio()).toBeNull()
    expect(within(charges()).queryByText(/card/i)).toBeNull()
  })

  it('offers no card to a server that predates card payment (no methods.card, no bill card)', async () => {
    answers[BILLING] = () =>
      json(200, {
        ...overview(),
        bills: [{ bill: BILL, payments: [] }],
        methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true },
      })
    renderBilling()
    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(cardRadio()).toBeNull()
  })

  it('offers card only when the bill itself is eligible, and says why when it is not', async () => {
    answers[BILLING] = () =>
      json(200, overview({}, { available: false, purpose: null, reason: 'PAYMOB_AMOUNT_NOT_REPRESENTABLE' }))
    renderBilling()
    expect(await screen.findByText(i18n.t('billing.card.notForThisBill'))).toBeTruthy()
    expect(cardRadio()).toBeNull()
    expect(screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
  })

  it('says nothing when the bill reports card switched off', async () => {
    answers[BILLING] = () => json(200, overview({}, { available: false, purpose: null, reason: 'CARD_NOT_AVAILABLE' }))
    renderBilling()
    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(cardRadio()).toBeNull()
    expect(screen.queryByText(i18n.t('billing.card.notForThisBill'))).toBeNull()
  })

  it('offers no way to pay while earlier card money for the bill is with Finance', async () => {
    answers[BILLING] = () =>
      json(200, overview({}, { available: false, purpose: null, reason: 'CARD_PAYMENT_UNDER_REVIEW' }))
    renderBilling()
    expect(await screen.findByText(i18n.t('billing.card.underReviewBill'))).toBeTruthy()
    expect(within(charges()).queryByRole('radio')).toBeNull()
  })

  it('does not offer card to someone who can read billing but not pay', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, { ...PAYER, permissions: ['tenant.plan.read'] })
      const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
      const answer = answers[key]
      return answer ? answer(init) : json(404, { type: 'about:blank' })
    })
    renderBilling()
    expect(await screen.findByText('FWT-SUB-2026-000007')).toBeTruthy()
    expect(cardRadio()).toBeNull()
  })
})

describe('Settings › Billing: starting a card payment', () => {
  it('shows the server total, asks with an Idempotency-Key and no body, and leaves for the hosted page', async () => {
    answers[CHECKOUT] = () => json(201, checkout('READY'))
    const user = userEvent.setup({ delay: null })
    renderBilling()

    await chooseCard(user)
    expect(within(charges()).getAllByText('36.750').length).toBeGreaterThanOrEqual(2)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))

    await waitFor(() => expect(opened).toHaveBeenCalledWith(HOSTED))
    const [[, init]] = calls(CHECKOUT)
    expect(init?.body ?? null).toBeNull()
    expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^subscription-payment-/)
    expect(screen.getByText(i18n.t('billing.card.redirecting'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('billing.card.submit') }).hasAttribute('disabled')).toBe(true)
    expect(within(charges()).queryByText(i18n.t('billing.card.status.PAID'))).toBeNull()
  })

  it('a double click opens one checkout', async () => {
    let release: () => void = () => {}
    answers[CHECKOUT] = () => json(201, checkout('READY'))
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') await new Promise<void>((resolve) => (release = resolve))
      return original(url, init)
    })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    const button = screen.getByRole('button', { name: i18n.t('billing.card.submit') })
    await user.click(button)
    await user.click(button)
    release()
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    expect(calls(CHECKOUT)).toHaveLength(1)
  })

  it('refuses to leave for any page but the card provider\'s own host', async () => {
    answers[CHECKOUT] = () =>
      json(201, checkout('READY', { checkoutUrl: 'https://oman.paymob.com.evil.example/unifiedcheckout/?clientSecret=x' }))
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.untrustedPage'))).toBeTruthy()
    expect(opened).not.toHaveBeenCalled()
  })

  it('after an uncertain answer, never asks again by itself, and asking again reuses the key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    let attempts = 0
    answers[CHECKOUT] = () => {
      attempts += 1
      return attempts === 1 ? json(503, { type: 'about:blank' }) : json(201, checkout('READY'))
    }
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.uncertain'))).toBeTruthy()

    await vi.advanceTimersByTimeAsync(120_000)
    expect(calls(CHECKOUT)).toHaveLength(1)
    expect(opened).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.checkAgain') }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith(HOSTED))
    const keys = calls(CHECKOUT).map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('treats an unreachable server as uncertain, not as a failure to retry', async () => {
    let attempts = 0
    answers[CHECKOUT] = () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return json(201, checkout('READY'))
    }
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.uncertain'))).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls(CHECKOUT)).toHaveLength(1)
    expect(opened).not.toHaveBeenCalled()
  })

  it('two clicks in the same tick still make one request', async () => {
    answers[CHECKOUT] = () => json(201, checkout('READY'))
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    const button = screen.getByRole('button', { name: i18n.t('billing.card.submit') })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    expect(calls(CHECKOUT)).toHaveLength(1)
  })

  it('after a definite "not completed", a new attempt uses a new key', async () => {
    let attempts = 0
    answers[CHECKOUT] = () => {
      attempts += 1
      return json(201, attempts === 1 ? checkout('NOT_COMPLETED') : checkout('READY'))
    }
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.notStarted'))).toBeTruthy()
    expect(opened).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    const keys = calls(CHECKOUT).map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys[0]).not.toBe(keys[1])
  })

  it('shows the bill total the provider cannot take exactly, removes card, keeps bank and cash, and does not retry', async () => {
    answers[CHECKOUT] = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/paymob-amount-not-representable',
        code: 'PAYMOB_AMOUNT_NOT_REPRESENTABLE',
        billTotal: '36.876',
        currency: 'OMR',
      })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))

    expect(await screen.findByText(new RegExp(i18n.t('billing.card.notRepresentable')))).toBeTruthy()
    expect(within(charges()).getByText('36.876')).toBeTruthy()
    expect(cardRadio()).toBeNull()
    expect(screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) })).toBeTruthy()
    expect(calls(CHECKOUT)).toHaveLength(1)
    expect(opened).not.toHaveBeenCalled()
  })

  it('a bill the server finds not eligible for card loses the card option', async () => {
    answers[CHECKOUT] = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/card-payment-not-eligible',
        code: 'CARD_PAYMENT_PURPOSE_NOT_ELIGIBLE',
        reason: 'ADD_ON_LINE',
      })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.notForThisBill'))).toBeTruthy()
    expect(cardRadio()).toBeNull()
  })

  it('card switched off between load and click: card goes away, other methods stay', async () => {
    answers[CHECKOUT] = () => json(409, { type: 'https://api.fawtir.om/problems/payment-method-unavailable' })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.switchedOff'))).toBeTruthy()
    expect(cardRadio()).toBeNull()
    expect(screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) })).toBeTruthy()
  })

  it('reloads and tells the customer not to pay again when earlier card money is under review', async () => {
    let held = false
    answers[BILLING] = () =>
      json(200, held ? overview({}, { available: false, purpose: null, reason: 'CARD_PAYMENT_UNDER_REVIEW' }) : overview())
    answers[CHECKOUT] = () => {
      held = true
      return json(409, { type: 'https://api.fawtir.om/problems/bill-not-payable', code: 'CARD_PAYMENT_UNDER_REVIEW' })
    }
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    await waitFor(() => expect(within(charges()).queryByRole('radio')).toBeNull())
    expect(screen.getAllByText(i18n.t('billing.card.underReviewBill')).length).toBeGreaterThanOrEqual(1)
  })

  it('points to the company profile when the company has no contact to pay as', async () => {
    answers[CHECKOUT] = () => json(400, { type: 'https://api.fawtir.om/problems/validation-failed' })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    await user.click(screen.getByRole('button', { name: i18n.t('billing.card.submit') }))
    const link = await screen.findByRole('link', { name: i18n.t('billing.card.contactMissingLink') })
    expect(link.getAttribute('href')).toBe('/settings/company')
  })
})

describe('Settings › Billing: a card payment in progress', () => {
  const pending = () =>
    overview({ bills: [{ bill: { ...BILL, status: 'PENDING_VERIFICATION' }, payments: [CARD_PAYMENT], card: null }] })

  it('drops the provider\'s return parameters unread and shows pending until the server says otherwise', async () => {
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(200, checkout('PROCESSING'))
    renderBilling('/settings/bills?success=true&hmac=abc&source_data.pan=2346&merchant_order_id=x&tab=keep')

    expect(await screen.findByText(i18n.t('billing.card.status.PROCESSING'))).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('address').textContent).toBe('?tab=keep'))
    expect(within(charges()).queryByText(i18n.t('billing.card.status.PAID'))).toBeNull()
    expect(within(charges()).queryByText(i18n.t('billing.billStatus.PAID'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('billing.withdraw') })).toBeNull()
    expect(within(charges()).queryByRole('radio')).toBeNull()
  })

  it('polls the server and shows paid only when it says PAID, then reloads the bill', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    let paid = false
    answers[BILLING] = () =>
      json(200, paid
        ? overview({ bills: [{ bill: { ...BILL, status: 'PAID', paidAt: '2026-10-18T06:05:00Z' }, payments: [{ ...CARD_PAYMENT, status: 'CONFIRMED' }], card: null }] })
        : pending())
    answers[STATUS_OF_P1] = () => json(200, checkout(paid ? 'PAID' : 'PROCESSING'))
    renderBilling()

    expect(await screen.findByText(i18n.t('billing.card.status.PROCESSING'))).toBeTruthy()
    paid = true
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await screen.findByText(i18n.t('billing.card.status.PAID'))).toBeTruthy()
    expect(await screen.findByText(new RegExp(i18n.t('billing.method.CARD.title')))).toBeTruthy()
    const polls = calls(STATUS_OF_P1).length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls(STATUS_OF_P1).length).toBe(polls)
  })

  it('slows to every 15 seconds after the first minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(200, checkout('PROCESSING'))
    renderBilling()
    await vi.waitFor(() => expect(calls(STATUS_OF_P1).length).toBe(1))
    await vi.advanceTimersByTimeAsync(60_000)
    const afterMinute = calls(STATUS_OF_P1).length
    expect(afterMinute).toBeGreaterThanOrEqual(20)
    await vi.advanceTimersByTimeAsync(14_000)
    const before = calls(STATUS_OF_P1).length
    expect(before - afterMinute).toBeLessThanOrEqual(1)
    await vi.advanceTimersByTimeAsync(16_000)
    expect(calls(STATUS_OF_P1).length).toBeGreaterThan(before)
  })

  it('stops asking when the bill leaves the screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(200, checkout('PROCESSING'))
    const view = renderBilling()
    expect(await screen.findByText(i18n.t('billing.card.status.PROCESSING'))).toBeTruthy()
    view.unmount()
    const asked = calls(STATUS_OF_P1).length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(calls(STATUS_OF_P1).length).toBe(asked)
  })

  it('does not poll a hidden tab, and asks at once when it is shown again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(200, checkout('PROCESSING'))
    renderBilling()
    expect(await screen.findByText(i18n.t('billing.card.status.PROCESSING'))).toBeTruthy()
    visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(3_000)
    const parked = calls(STATUS_OF_P1).length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(calls(STATUS_OF_P1).length).toBe(parked)
    visibility = 'visible'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(calls(STATUS_OF_P1).length).toBe(parked + 1))
  })

  it('waits as long as the gateway asks when it is rate limited', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout'] })
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () =>
      new Response(JSON.stringify({ type: 'https://api.fawtir.om/problems/rate-limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '40' },
      })
    renderBilling()
    await vi.waitFor(() => expect(calls(STATUS_OF_P1).length).toBe(1))
    await vi.advanceTimersByTimeAsync(39_000)
    expect(calls(STATUS_OF_P1).length).toBe(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(calls(STATUS_OF_P1).length).toBe(2)
  })

  it.each([
    ['NOT_COMPLETED'],
    ['UNDER_REVIEW'],
    ['REVERSED'],
  ])('reports a final %s once and stops asking', async (status) => {
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(200, checkout(status))
    renderBilling()
    expect((await screen.findAllByText(i18n.t(`billing.card.status.${status}`))).length).toBeGreaterThanOrEqual(1)
    // The reload still lists the payment as live (it raced the settlement); it must not loop.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls(BILLING).length).toBeLessThanOrEqual(2)
    expect(within(charges()).queryByText(i18n.t('billing.card.status.PAID'))).toBeNull()
  })

  it('offers to continue a ready checkout only on the provider\'s host', async () => {
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(200, checkout('READY'))
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await user.click(await screen.findByRole('button', { name: i18n.t('billing.card.continue') }))
    expect(opened).toHaveBeenCalledWith(HOSTED)
  })

  it('says it cannot check right now and keeps the payment pending when the status read fails', async () => {
    answers[BILLING] = () => json(200, pending())
    answers[STATUS_OF_P1] = () => json(503, { type: 'about:blank' })
    renderBilling()
    expect(await screen.findByText(i18n.t('billing.card.statusUnreachable'))).toBeTruthy()
    expect(screen.getByText(i18n.t('billing.card.status.PROCESSING'))).toBeTruthy()
  })
})

describe('Settings › Billing: bank transfer and cash with card switched on', () => {
  it('still asks for cash collection exactly as before', async () => {
    answers[`POST ${BILLING}/bills/b-1/cash-request`] = () => json(201, { id: 'p-2', status: 'SUBMITTED' })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CASH.title')) }))
    await user.click(screen.getByRole('button', { name: i18n.t('billing.cash.submit') }))
    await waitFor(() => expect(calls(`POST ${BILLING}/bills/b-1/cash-request`)).toHaveLength(1))
    expect(calls(CHECKOUT)).toHaveLength(0)
  })

  it('still shows the bank account and amount to transfer', async () => {
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await user.click(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) }))
    expect(screen.getByText('OM810180000001299123456')).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('billing.card.submit') })).toBeNull()
  })
})

describe('Settings › Billing: card in Arabic', () => {
  it('reads in Arabic with the amount in Latin digits', async () => {
    await i18n.changeLanguage('ar')
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await chooseCard(user)
    expect(screen.getByText(i18n.t('billing.card.instructions'))).toBeTruthy()
    expect(screen.getByRole('button', { name: 'المتابعة إلى الدفع الآمن بالبطاقة' })).toBeTruthy()
    expect(within(charges()).getAllByText('36.750').length).toBeGreaterThanOrEqual(2)
  })

  it('has every card message in both languages, and the Arabic is Arabic', () => {
    type Tree = { [key: string]: string | Tree }
    const flat = (tree: Tree, prefix = ''): Record<string, string> =>
      Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key
        return typeof value === 'string' ? { ...all, [path]: value } : { ...all, ...flat(value, path) }
      }, {})
    const pick = (locale: { billing: Tree }) => ({
      ...flat(locale.billing.card as Tree, 'card'),
      ...flat((locale.billing.method as Tree).CARD as Tree, 'method.CARD'),
    })
    const english = pick(en as unknown as { billing: Tree })
    const arabic = pick(ar as unknown as { billing: Tree })
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort())
    for (const [key, text] of Object.entries(arabic)) {
      expect(text.trim(), key).not.toBe('')
      expect(text, key).toMatch(/[؀-ۿ]/)
      expect(text, key).not.toBe(english[key])
    }
  })
})

describe('Settings › Billing: card as the only way to pay', () => {
  it('keeps the refusal on screen when card was the only method and the server refused it', async () => {
    answers[BILLING] = () =>
      json(200, overview({ beneficiary: null, methods: { bankTransfer: false, bankTransferStatus: 'NOT_OFFERED', cash: false, card: true } }))
    answers[CHECKOUT] = () => json(409, { type: 'https://api.fawtir.om/problems/payment-method-unavailable' })
    const user = userEvent.setup({ delay: null })
    renderBilling()
    await user.click(await screen.findByRole('button', { name: i18n.t('billing.card.submit') }))
    expect(await screen.findByText(i18n.t('billing.card.switchedOff'))).toBeTruthy()
    expect(screen.getByText(i18n.t('billing.noMethod'))).toBeTruthy()
  })
})
