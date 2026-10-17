import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { hostedCheckout } from '../../api/settings/billing'
import { PayDonePage, PayPage } from './PayPage'

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456'
const VIEW = '/api/v1/public/pay-links/view'
const CARD = '/api/v1/public/pay-links/card-checkout'
const STATUS = '/api/v1/public/pay-links/card-checkout/status'
const BANK = '/api/v1/public/pay-links/bank-transfer'
const CASH = '/api/v1/public/pay-links/cash-request'

function view(over: Record<string, unknown> = {}) {
  return {
    status: 'PAYABLE',
    sellerName: 'Thumb International LLC',
    companyName: 'Wadi Builders SPC',
    billNumber: 'FSB-2026-0050',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodStartsOn: '2026-10-17',
    periodEndsOn: '2026-11-16',
    subtotal: '80.000',
    vatRate: '0.00000',
    vatAmount: '0.000',
    total: '80.000',
    currency: 'OMR',
    dueOn: '2026-10-24',
    expiresAt: '2026-10-24T06:00:00Z',
    tokenHint: 'x7Qa',
    paidAt: null,
    methods: {
      card: false,
      bankTransfer: {
        available: true,
        account: {
          beneficiary: 'Thumb International LLC',
          bank: 'Bank Muscat',
          iban: 'OM810180000001299123456',
        },
      },
      cash: true,
    },
    pendingPayment: null,
    ...over,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}
const problem = (status: number, type: string) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    title: type,
    status,
    detail: 'English detail',
  })

let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  // A portal session of another company in the same browser: it must never be sent.
  document.cookie = 'FAWTIR_CSRF=csrf-of-another-session; path=/'
  answers = { [VIEW]: () => json(200, view()) }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const answer = answers[url]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.cookie = 'FAWTIR_CSRF=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  window.history.replaceState(null, '', '/')
})

const L = (key: string, options?: Record<string, unknown>) => i18n.t(`payLink.${key}`, options)

function openPay(address = `/pay#${TOKEN}`) {
  window.history.replaceState(null, '', address)
  render(
    <MemoryRouter initialEntries={['/pay']}>
      <PayPage />
    </MemoryRouter>,
  )
}

function calls(path: string) {
  return fetchMock.mock.calls.filter(([url]) => url === path).map(([, init]) => init as RequestInit)
}
const headersOf = (init: RequestInit) => init.headers as Record<string, string>

describe('Pay page › the link', () => {
  it('takes the token from the fragment, clears the address and sends it only in a header, without cookies', async () => {
    openPay()
    expect(await screen.findByText(L('title', { number: 'FSB-2026-0050' }))).toBeTruthy()
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(sessionStorage.getItem('fawtir.payLink.token')).toBe(TOKEN)

    const [init] = calls(VIEW)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(headersOf(init)['X-Pay-Link-Token']).toBe(TOKEN)
    expect(headersOf(init)['X-CSRF-Token']).toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).not.toContain(TOKEN)
  })

  it('says the link is not valid without asking the server when there is no token or a malformed one', async () => {
    openPay('/pay#not-a-token')
    expect(await screen.findByText(L('problem.invalid'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  it.each([
    [404, 'pay-link-not-found', 'problem.invalid'],
    [410, 'pay-link-expired', 'problem.expired'],
    [429, 'rate-limited', 'problem.tooMany'],
  ])('answers %i with its own sentence, never the server detail', async (status, type, key) => {
    answers[VIEW] = () => problem(status, type)
    openPay()
    expect(await screen.findByText(L(key))).toBeTruthy()
    expect(screen.queryByText('English detail')).toBeNull()
  })

  it('reads the switch being off as an unknown link (the server answers a bare 404)', async () => {
    answers[VIEW] = () => new Response('', { status: 404 })
    openPay()
    expect(await screen.findByText(L('problem.invalid'))).toBeTruthy()
    expect(screen.queryByText(L('howToPay'))).toBeNull()
  })

  it.each([401, 403, 405])(
    'reads %i from a server without the public pay routes as an unknown link',
    async (status) => {
      answers[VIEW] = () => new Response('', { status })
      openPay()
      expect(await screen.findByText(L('problem.invalid'))).toBeTruthy()
      expect(screen.queryByText(L('problem.other'))).toBeNull()
      expect(screen.queryByText(L('howToPay'))).toBeNull()
    },
  )

  it('offers a retry when Fawtir cannot be reached', async () => {
    let up = false
    answers[VIEW] = () => {
      if (!up) throw new TypeError('Failed to fetch')
      return json(200, view())
    }
    const user = userEvent.setup({ delay: null })
    openPay()
    expect(await screen.findByText(L('problem.network'))).toBeTruthy()
    up = true
    await user.click(screen.getByRole('button', { name: L('retry') }))
    expect(await screen.findByText('Wadi Builders SPC')).toBeTruthy()
  })

  it('keeps the token out of localStorage', async () => {
    openPay()
    await screen.findByText('Wadi Builders SPC')
    for (let i = 0; i < localStorage.length; i += 1) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain(TOKEN)
    }
  })
})

describe('Pay page › the bill', () => {
  it('shows the server figures, no VAT line at zero, and no card while card is off', async () => {
    openPay()
    expect(await screen.findByText('Wadi Builders SPC')).toBeTruthy()
    expect(screen.getAllByText('80.000').length).toBeGreaterThan(0)
    expect(screen.queryByText(L('summary.vat'))).toBeNull()
    expect(screen.getByText(L('summary.due', { date: '24 Oct 2026' }))).toBeTruthy()
    expect(screen.queryByRole('button', { name: new RegExp(L('method.card.title')) })).toBeNull()
    expect(screen.getByText(L('cardUnavailable'))).toBeTruthy()
    expect(screen.getByText('x7Qa')).toBeTruthy()
  })

  it('shows the VAT line when VAT is charged', async () => {
    answers[VIEW] = () =>
      json(200, view({ vatRate: '0.05000', vatAmount: '4.000', total: '84.000' }))
    openPay()
    expect(await screen.findByText(L('summary.vat'))).toBeTruthy()
    expect(screen.getByText('84.000')).toBeTruthy()
  })

  it('offers no payment while one is being checked', async () => {
    answers[VIEW] = () =>
      json(
        200,
        view({
          status: 'PAYMENT_PENDING',
          pendingPayment: { method: 'BANK_TRANSFER', submittedAt: '2026-10-17T07:30:00Z' },
        }),
      )
    openPay()
    expect(
      await screen.findByText(L('pending.BANK_TRANSFER', { date: '17 Oct 2026' })),
    ).toBeTruthy()
    expect(screen.queryByText(L('howToPay'))).toBeNull()
  })

  it('says a bill is paid', async () => {
    answers[VIEW] = () => json(200, view({ status: 'PAID', paidAt: '2026-10-17T08:00:00Z' }))
    openPay()
    expect(await screen.findByText(L('paidOn', { date: '17 Oct 2026' }))).toBeTruthy()
  })

  it('words a rejected last payment in a fixed sentence', async () => {
    answers[VIEW] = () => json(200, view({ lastPaymentNotConfirmed: true }))
    openPay()
    expect(await screen.findByText(L('rejected'))).toBeTruthy()
  })
})

describe('Pay page › paying', () => {
  it('needs a receipt and a reference, then uploads them with one key and shows the payment being checked', async () => {
    let paid = false
    answers[VIEW] = () =>
      json(
        200,
        paid
          ? view({
              status: 'PAYMENT_PENDING',
              pendingPayment: { method: 'BANK_TRANSFER', submittedAt: '2026-10-17T07:30:00Z' },
            })
          : view(),
      )
    answers[BANK] = () => {
      paid = true
      return json(201, {
        paymentId: 'p-1',
        method: 'BANK_TRANSFER',
        status: 'PAYMENT_PENDING',
        submittedAt: '2026-10-17T07:30:00Z',
      })
    }
    const user = userEvent.setup({ delay: null })
    openPay()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.bankTransfer.title')) }),
    )
    expect(screen.getByText('OM810180000001299123456')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: L('bank.submit') }))
    expect(screen.getByText(i18n.t('payment.bank.receiptRequired'))).toBeTruthy()
    expect(calls(BANK)).toHaveLength(0)

    const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    await user.type(
      screen.getByRole('textbox', { name: i18n.t('payment.bank.referenceLabel') }),
      'TRX-77',
    )
    await user.click(screen.getByRole('button', { name: L('bank.submit') }))

    expect(
      await screen.findByText(L('pending.BANK_TRANSFER', { date: '17 Oct 2026' })),
    ).toBeTruthy()
    const [init] = calls(BANK)
    expect(init.credentials).toBe('omit')
    expect(headersOf(init)['X-Pay-Link-Token']).toBe(TOKEN)
    expect(headersOf(init)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    const form = init.body as FormData
    expect(form.get('reference')).toBe('TRX-77')
    expect((form.get('proof') as File).name).toBe('receipt.pdf')
  })

  it('says when there is no confirmed account, and still takes the receipt', async () => {
    answers[VIEW] = () =>
      json(
        200,
        view({
          methods: { card: false, bankTransfer: { available: true, account: null }, cash: true },
        }),
      )
    const user = userEvent.setup({ delay: null })
    openPay()
    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.bankTransfer.title')) }),
    )
    expect(screen.getByText(L('bank.noAccount'))).toBeTruthy()
    expect(screen.getByRole('button', { name: L('bank.submit') })).toBeTruthy()
  })

  it('opens a cash request', async () => {
    answers[CASH] = () =>
      json(201, {
        paymentId: 'p-2',
        method: 'CASH',
        status: 'PAYMENT_PENDING',
        submittedAt: '2026-10-17T07:30:00Z',
      })
    const user = userEvent.setup({ delay: null })
    openPay()
    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.cash.title')) }),
    )
    await user.click(screen.getByRole('button', { name: L('cash.submit') }))
    await waitFor(() => expect(calls(CASH)).toHaveLength(1))
    expect(headersOf(calls(CASH)[0])['Idempotency-Key']).toBeTruthy()
    expect(calls(CASH)[0].credentials).toBe('omit')
  })

  it('says a payment is already being checked when the slot is taken', async () => {
    answers[CASH] = () => problem(409, 'payment-state-conflict')
    const user = userEvent.setup({ delay: null })
    openPay()
    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.cash.title')) }),
    )
    await user.click(screen.getByRole('button', { name: L('cash.submit') }))
    expect(await screen.findByText(L('problem.slotTaken'))).toBeTruthy()
  })

  it('opens the provider checkout with one key, reused on a retry, and only at the provider address', async () => {
    answers[VIEW] = () => json(200, view({ methods: { ...view().methods, card: true } }))
    answers[CARD] = () =>
      json(200, {
        paymentId: 'p-card',
        status: 'READY',
        checkoutUrl: 'https://oman.paymob.com/unifiedcheckout/?x=1',
        expiresAt: null,
        amount: '80.000',
        currency: 'OMR',
      })
    const open = vi.spyOn(hostedCheckout, 'open').mockImplementation(() => {})
    const user = userEvent.setup({ delay: null })
    openPay()

    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.card.title')) }),
    )
    await user.click(screen.getByRole('button', { name: L('card.open') }))
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://oman.paymob.com/unifiedcheckout/?x=1'),
    )
    expect(sessionStorage.getItem('fawtir.payLink.cardPayment')).toBe('p-card')

    await user.click(screen.getByRole('button', { name: L('card.open') }))
    await waitFor(() => expect(calls(CARD)).toHaveLength(2))
    expect(headersOf(calls(CARD)[0])['Idempotency-Key']).toBe(
      headersOf(calls(CARD)[1])['Idempotency-Key'],
    )
  })

  it('says card is unavailable when the server refuses it, and forgets a finished attempt', async () => {
    answers[VIEW] = () => json(200, view({ methods: { ...view().methods, card: true } }))
    answers[CARD] = () => problem(409, 'payment-method-unavailable')
    const user = userEvent.setup({ delay: null })
    openPay()
    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.card.title')) }),
    )
    await user.click(screen.getByRole('button', { name: L('card.open') }))
    expect(await screen.findByText(L('problem.cardUnavailable'))).toBeTruthy()

    answers[CARD] = () =>
      json(201, {
        paymentId: 'p-old',
        status: 'NOT_COMPLETED',
        checkoutUrl: null,
        expiresAt: null,
        amount: '80.000',
        currency: 'OMR',
      })
    await user.click(screen.getByRole('button', { name: L('card.open') }))
    await user.click(await screen.findByRole('button', { name: L('card.open') }))
    await waitFor(() => expect(calls(CARD)).toHaveLength(3))
    expect(headersOf(calls(CARD)[1])['Idempotency-Key']).not.toBe(
      headersOf(calls(CARD)[2])['Idempotency-Key'],
    )
  })

  it('shows the link as expired when it dies while paying', async () => {
    let dead = false
    answers[VIEW] = () => (dead ? problem(410, 'pay-link-expired') : json(200, view()))
    answers[CASH] = () => {
      dead = true
      return problem(410, 'pay-link-expired')
    }
    const user = userEvent.setup({ delay: null })
    openPay()
    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.cash.title')) }),
    )
    await user.click(screen.getByRole('button', { name: L('cash.submit') }))
    await waitFor(() => expect(screen.queryByText(L('howToPay'))).toBeNull())
    expect(screen.getByText(L('problem.expired'))).toBeTruthy()
    expect(calls(VIEW)).toHaveLength(2)
  })

  it('never navigates to an address that is not the provider', async () => {
    answers[VIEW] = () => json(200, view({ methods: { ...view().methods, card: true } }))
    answers[CARD] = () =>
      json(200, {
        paymentId: 'p-card',
        status: 'READY',
        checkoutUrl: 'https://evil.example/pay',
        expiresAt: null,
        amount: '80.000',
        currency: 'OMR',
      })
    const open = vi.spyOn(hostedCheckout, 'open').mockImplementation(() => {})
    const user = userEvent.setup({ delay: null })
    openPay()
    await user.click(
      await screen.findByRole('button', { name: new RegExp(L('method.card.title')) }),
    )
    await user.click(screen.getByRole('button', { name: L('card.open') }))
    expect(await screen.findByText(L('problem.notReady'))).toBeTruthy()
    expect(open).not.toHaveBeenCalled()
  })
})

describe('Pay page › back from the card provider', () => {
  function openDone(address: string) {
    window.history.replaceState(null, '', address)
    render(
      <MemoryRouter initialEntries={['/pay/done']}>
        <PayDonePage />
      </MemoryRouter>,
    )
  }

  it('drops the provider query unread and believes only the server', async () => {
    sessionStorage.setItem('fawtir.payLink.token', TOKEN)
    sessionStorage.setItem('fawtir.payLink.cardPayment', 'p-card')
    answers[STATUS] = () =>
      json(200, {
        paymentId: 'p-card',
        status: 'NOT_COMPLETED',
        checkoutUrl: null,
        expiresAt: null,
        amount: '80.000',
        currency: 'OMR',
      })
    openDone('/pay/done?success=true&hmac=forged&id=1')

    expect(window.location.search).toBe('')
    expect(await screen.findByText(L('done.notCompleted'))).toBeTruthy()
    const [init] = calls(STATUS)
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(String(init.body))).toEqual({ paymentId: 'p-card' })
  })

  it('shows paid once the server says so', async () => {
    sessionStorage.setItem('fawtir.payLink.token', TOKEN)
    sessionStorage.setItem('fawtir.payLink.cardPayment', 'p-card')
    answers[STATUS] = () =>
      json(200, {
        paymentId: 'p-card',
        status: 'PAID',
        checkoutUrl: null,
        expiresAt: null,
        amount: '80.000',
        currency: 'OMR',
      })
    openDone('/pay/done')
    expect(await screen.findByText(L('done.paid'))).toBeTruthy()
  })

  it('asks for the link again in a new tab, without inviting a second payment', async () => {
    openDone('/pay/done?success=true')
    expect(await screen.findByText(L('done.noLink'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
