import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { hintOf, matchRequest, overSimplifiedLimit } from '../../lib/posBuyerMatch'

/**
 * "Matches customer on file": the full-invoice buyer's ID (and phone) matches a customer stored
 * under another name, said under the ID before the invoice is filed, never blocking it.
 */

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
  scopes: [],
  featureFlags: {},
}

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const ON_FILE = {
  match: 'identifier',
  customerId: 'c-1',
  name: 'Saif Al Busaidi',
  sameName: false,
  identifierScheme: 'CID',
  identifierValue: '•••• 5678',
  identifierValueMasked: true,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let calls: { url: string; init?: RequestInit }[]
let matchAnswer: () => Response | Promise<Response>
let saleAnswer: (() => Response) | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  calls = []
  matchAnswer = () => json(ON_FILE)
  saleAnswer = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url === '/api/v1/pos/customers/match') return matchAnswer()
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        if (saleAnswer) return saleAnswer()
        return json(
          {
            type: 'https://api.fawtir.om/problems/simplified-invoice-limit',
            status: 422,
            code: 'SIMPLIFIED_INVOICE_LIMIT',
            buyerIdentifierSchemes: ['CR', 'CID'],
          },
          422,
        )
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const matches = () => calls.filter((call) => call.url === '/api/v1/pos/customers/match')

async function buyerForm() {
  render(
    <MemoryRouter initialEntries={['/pos/payment']}>
      <Routes>
        <Route path="/pos/payment" element={<PosPaymentPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
  await screen.findByRole('button', { name: 'Make it a full invoice' })
  fireEvent.change(screen.getByLabelText("Buyer's name"), { target: { value: 'Hamed Al Rawahi' } })
  fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '9234 5678' } })
  fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '12345678' } })
}

describe('matches customer on file', () => {
  it('names the customer on file with the masked ID when the name differs, and still allows the sale', async () => {
    await buyerForm()
    expect(
      await screen.findByText(
        'Matches customer on file: Saif Al Busaidi (Civil ID •••• 5678)',
        {},
        { timeout: 2000 },
      ),
    ).toBeTruthy()
    expect(matches()).toHaveLength(1)
    expect(matches()[0].init?.method).toBe('POST')
    expect(JSON.parse(String(matches()[0].init?.body))).toEqual({
      tillId: 'till-1',
      name: 'Hamed Al Rawahi',
      contact: '+96892345678',
      identifierScheme: 'CID',
      identifierValue: '12345678',
    })
    expect(
      (screen.getByRole('button', { name: 'Make it a full invoice' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('says nothing when the endpoint is absent (older server) or offline', async () => {
    matchAnswer = () => json({ type: 'about:blank', status: 404 }, 404)
    await buyerForm()
    await waitFor(() => expect(matches()).toHaveLength(1), { timeout: 2000 })
    expect(screen.queryByText(/Matches customer on file/)).toBeNull()
    matchAnswer = () => Promise.reject(new TypeError('Failed to fetch'))
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '12345679' } })
    await waitFor(() => expect(matches()).toHaveLength(2), { timeout: 2000 })
    expect(screen.queryByText(/Matches customer on file/)).toBeNull()
  })

  it('is worded in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('pos.buyer.onFile', { name: 'سيف' })).toBe('يطابق عميلًا مسجّلًا: سيف')
    expect(i18n.t('pos.buyer.onFileWithId', { name: 'سيف', id: '•••• 5678' })).toBe(
      'يطابق عميلًا مسجّلًا: سيف (•••• 5678)',
    )
  })
})

describe('the lookup', () => {
  const typed = { name: ' Hamed ', scheme: 'CID', value: '12345678', contact: '' }
  it('waits for a name, a whole ID and a phone that can be filed', () => {
    expect(matchRequest('t', typed)).toEqual({
      tillId: 't',
      name: 'Hamed',
      contact: null,
      identifierScheme: 'CID',
      identifierValue: '12345678',
    })
    expect(matchRequest('t', { ...typed, name: ' ' })).toBeNull()
    expect(matchRequest('t', { ...typed, value: '123' })).toBeNull()
    expect(matchRequest('t', { ...typed, contact: '12' })).toBeNull()
  })
  it('reads the simplified limit as the server states it: 500.000 or more before VAT', () => {
    expect(overSimplifiedLimit(499_999)).toBe(false)
    expect(overSimplifiedLimit(500_000)).toBe(true)
  })
  it('is said only for a match under another name', () => {
    expect(hintOf(ON_FILE as never)).not.toBeNull()
    expect(hintOf({ ...ON_FILE, sameName: true } as never)).toBeNull()
    expect(hintOf({ ...ON_FILE, match: 'none', name: null } as never)).toBeNull()
    expect(hintOf(null)).toBeNull()
  })
})

// RB-1 STUCK-QR before payment (0c2d034d4): the match says whether a full tax sale to the buyer
// gets a QR. The server's 422 stays the enforcement; this only refuses earlier.
describe('a full tax sale the buyer cannot get a QR on', () => {
  const REFUSED = 'This sale type cannot be issued with a QR yet'
  // A refused buyer is on file under the same name: a "matches customer on file" hint would sit
  // inside the ID field's label and change the name the field is found by.
  const salePosts = () =>
    calls.filter((call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST')
  const makeFull = () =>
    screen.getByRole('button', { name: 'Make it a full invoice' }) as HTMLButtonElement

  it('is refused at the buyer, in the server\'s words, before anything is sent, keeping the sale and the buyer', async () => {
    matchAnswer = () => json({ ...ON_FILE, sameName: true, qrIssuableOnFullTax: false })
    await buyerForm()
    const alert = await screen.findByText(new RegExp(REFUSED), {}, { timeout: 2000 })
    expect(alert.textContent).toBe(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'))
    expect(makeFull().disabled).toBe(true)
    const sent = salePosts().length
    fireEvent.click(makeFull())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(salePosts()).toHaveLength(sent)
    // Nothing is reclassified: the buyer as typed and the way to a company both stay.
    expect((screen.getByLabelText("Buyer's name") as HTMLInputElement).value).toBe('Hamed Al Rawahi')
    expect((screen.getByLabelText('ID number') as HTMLInputElement).value).toBe('12345678')
    expect(screen.getByRole('link', { name: /company/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish the sale' })).toBeTruthy()
  })

  it('lets the full tax sale go when the server says a QR is issued', async () => {
    matchAnswer = () => json({ ...ON_FILE, qrIssuableOnFullTax: true })
    await buyerForm()
    await screen.findByText(/Matches customer on file/, {}, { timeout: 2000 })
    expect(screen.queryByText(new RegExp(REFUSED))).toBeNull()
    const sent = salePosts().length
    fireEvent.click(makeFull())
    await waitFor(() => expect(salePosts()).toHaveLength(sent + 1))
    expect(JSON.parse(String(salePosts().at(-1)!.init?.body)).customer.kind).toBe('CONSUMER')
  })

  it('leaves the sale to the server when an older server sends no flag', async () => {
    await buyerForm()
    await screen.findByText(/Matches customer on file/, {}, { timeout: 2000 })
    expect(screen.queryByText(new RegExp(REFUSED))).toBeNull()
    const sent = salePosts().length
    fireEvent.click(makeFull())
    await waitFor(() => expect(salePosts()).toHaveLength(sent + 1))
  })

  it('drops the refusal as soon as the ID it was about is changed', async () => {
    matchAnswer = () => json({ ...ON_FILE, sameName: true, qrIssuableOnFullTax: false })
    await buyerForm()
    await screen.findByText(new RegExp(REFUSED), {}, { timeout: 2000 })
    matchAnswer = () => json({ match: 'none', customerId: null, name: null, sameName: false,
      identifierScheme: null, identifierValue: null, identifierValueMasked: false, qrIssuableOnFullTax: true })
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '87654321' } })
    expect(screen.queryByText(new RegExp(REFUSED))).toBeNull()
    expect(makeFull().disabled).toBe(false)
    await waitFor(() => expect(matches()).toHaveLength(2), { timeout: 2000 })
    expect(screen.queryByText(new RegExp(REFUSED))).toBeNull()
  })
})

// STUCKQR-1 (owner: "refuse before payment capture"): a card is charged on the bank's terminal
// before Finish, so a named full tax sale asks for the buyer, and is checked, before any payment.
describe('a named full tax sale is checked before payment (STUCKQR-1)', () => {
  // 600.000 before VAT: over the simplified limit, so only a full invoice to a named buyer.
  const BIG = [
    {
      ...SAMPLE_SALE[2],
      id: 'big',
      productId: 'p-tv',
      productCode: 'TV-1',
      name: 'Television',
      price: 600000,
    },
  ]
  const SAME_NAME = { ...ON_FILE, sameName: true }
  const salePosts = () =>
    calls.filter((call) => call.url === '/api/v1/pos/sales' && call.init?.method === 'POST')
  const takeCash = () =>
    screen.getByRole('button', { name: /^Take .* in cash$/ }) as HTMLButtonElement

  function renderPayment() {
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }
  function typeBuyer(id = '12345678') {
    fireEvent.change(screen.getByLabelText("Buyer's name"), { target: { value: 'Hamed Al Rawahi' } })
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '9234 5678' } })
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: id } })
  }

  it('over the simplified limit, asks for the buyer and takes no payment until one is typed', async () => {
    resetOpenSale(BIG)
    matchAnswer = () => json({ ...SAME_NAME, qrIssuableOnFullTax: true })
    renderPayment()
    expect(await screen.findByText(i18n.t('pos.buyer.firstNeeded'))).toBeTruthy()
    expect(screen.getByLabelText("Buyer's name")).toBeTruthy()
    expect(takeCash().disabled).toBe(true)
    typeBuyer()
    await waitFor(() => expect(matches()).toHaveLength(1), { timeout: 2000 })
    await waitFor(() => expect(takeCash().disabled).toBe(false))
    expect(screen.queryByText(i18n.t('pos.buyer.firstNeeded'))).toBeNull()
    expect(salePosts()).toHaveLength(0)
  })

  it('refuses a buyer the server cannot give a QR before any payment, keeping the sale and the buyer', async () => {
    resetOpenSale(BIG)
    matchAnswer = () => json({ ...SAME_NAME, qrIssuableOnFullTax: false })
    renderPayment()
    await screen.findByLabelText("Buyer's name")
    typeBuyer()
    expect(
      await screen.findByText(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'), {}, { timeout: 2000 }),
    ).toBeTruthy()
    expect(takeCash().disabled).toBe(true)
    fireEvent.click(takeCash())
    // Nor by card: the terminal is not to be used for this buyer.
    fireEvent.click(screen.getByRole('button', { name: /^Card/ }))
    expect((screen.getByRole('button', { name: /^Paid · / }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: i18n.t('pos.pay.remove') })).toBeNull()
    expect(salePosts()).toHaveLength(0)
    expect((screen.getByLabelText("Buyer's name") as HTMLInputElement).value).toBe('Hamed Al Rawahi')
    // The basket is kept: the sale still reads its 630.000 to pay.
    expect(screen.getAllByText(/630\.000/).length).toBeGreaterThan(0)
  })

  it('says the check is still waiting, and does not block payment on it', async () => {
    resetOpenSale(BIG)
    matchAnswer = () => new Promise<Response>(() => undefined)
    renderPayment()
    await screen.findByLabelText("Buyer's name")
    typeBuyer()
    expect(screen.getByText(i18n.t('pos.buyer.checking'))).toBeTruthy()
    expect(takeCash().disabled).toBe(false)
    await waitFor(() => expect(matches()).toHaveLength(1), { timeout: 2000 })
    expect(screen.getByText(i18n.t('pos.buyer.checking'))).toBeTruthy()
  })

  it('does not block payment when the check failed, and says it is unchecked', async () => {
    resetOpenSale(BIG)
    matchAnswer = () => Promise.reject(new TypeError('Failed to fetch'))
    renderPayment()
    await screen.findByLabelText("Buyer's name")
    typeBuyer()
    await waitFor(() => expect(matches()).toHaveLength(1), { timeout: 2000 })
    expect(screen.getByText(i18n.t('pos.buyer.checking'))).toBeTruthy()
    expect(takeCash().disabled).toBe(false)
  })

  // STQ-1: the card went through while the check was still waiting, then the ID was changed to
  // one the server refuses. Finish is shut, so the alert by the ID is the only sentence shown.
  it('tells the cashier to refund a card already taken when the buyer is refused afterwards', async () => {
    resetOpenSale(BIG)
    matchAnswer = () => new Promise<Response>(() => undefined)
    renderPayment()
    await screen.findByLabelText("Buyer's name")
    typeBuyer()
    fireEvent.click(screen.getByRole('button', { name: /^Card/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Paid · / }))
    expect(screen.getByRole('button', { name: i18n.t('pos.pay.remove') })).toBeTruthy()
    matchAnswer = () => json({ ...SAME_NAME, qrIssuableOnFullTax: false })
    typeBuyer('87654321')
    const said = await screen.findByRole('alert', {}, { timeout: 2000 })
    expect(said.textContent).toBe(i18n.t('pos.refusal.qrUnavailableRefundCard'))
    expect(screen.queryByText(/Nothing was charged/)).toBeNull()
    expect(salePosts()).toHaveLength(0)
  })

  it('lets the cashier choose a full invoice before payment, with the same check', async () => {
    matchAnswer = () => json({ ...SAME_NAME, qrIssuableOnFullTax: false })
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.buyer.chooseFull') }))
    expect(takeCash().disabled).toBe(true)
    typeBuyer()
    await screen.findByText(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'), {}, { timeout: 2000 })
    expect(takeCash().disabled).toBe(true)
    typeBuyer('87654321')
    matchAnswer = () => json({ ...SAME_NAME, qrIssuableOnFullTax: true })
    expect(takeCash().disabled).toBe(false)
  })

  it('leaves a walk-in sale under the limit as it was: no buyer asked, payment open', async () => {
    renderPayment()
    expect((await screen.findByRole('button', { name: /Take 5.649 in cash/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByLabelText("Buyer's name")).toBeNull()
    expect(screen.queryByText(i18n.t('pos.buyer.firstNeeded'))).toBeNull()
  })
})

// STUCKQR-2: an older server, or a race, refuses after a card was charged on the terminal.
describe('a QR refusal after a card was taken (STUCKQR-2)', () => {
  const qrRefused = () =>
    json({ type: 'about:blank', status: 422, code: 'POS_SALE_QR_UNAVAILABLE_FOR_BUYER' }, 422)

  it('tells the cashier to refund the card on the terminal; the sale was not recorded', async () => {
    saleAnswer = qrRefused
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /^Card/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Paid · 5\.649/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    const said = await screen.findByText(/Refund the card on the terminal/)
    expect(said.textContent).toBe(i18n.t('pos.refusal.qrUnavailableRefundCard'))
    expect(screen.queryByText(/Nothing was charged/)).toBeNull()
  })

  it('keeps the plain sentence when only cash was taken', async () => {
    saleAnswer = qrRefused
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'))).toBeTruthy()
    expect(screen.queryByText(/Refund the card/)).toBeNull()
  })

  it('is worded in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    for (const key of ['pos.refusal.qrUnavailableRefundCard', 'pos.buyer.firstNeeded', 'pos.buyer.checking', 'pos.buyer.chooseFull']) {
      expect(i18n.t(key)).not.toBe(i18n.t(key, { lng: 'en' }))
    }
  })
})
