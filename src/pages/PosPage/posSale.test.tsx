import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosSalePanel } from './PosSalePanel'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  resetOpenSale,
  setSaleDiscount,
  setSaleLines,
  startNewSale,
  useFinishedSale,
  useOpenSale,
} from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { heldSlipPhotos } from '../../lib/posSlipOutbox'
import { memoryVault, setPosVault } from '../../lib/posVault'
import { CashierPicker } from './CashierPicker'
import { resetSharedRequests } from '../../api'

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.close', 'pos.refund'],
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** The panel as the sale screen mounts it: on the shared open sale. */
function SharedPanel() {
  const { lines } = useOpenSale()
  return <PosSalePanel lines={lines} onLines={setSaleLines} onTakePayment={vi.fn()} />
}

function Done() {
  const done = useFinishedSale()
  return <p>done {done?.sale?.invoiceNumber ?? done?.queuedNumber}</p>
}

/** The till's totals are the invoice's (owner, 21 Oct 2026). */
describe('the sale panel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale(SAMPLE_SALE)
  })

  it('takes a discount on the whole sale after the price rule and before VAT', () => {
    render(
      <MemoryRouter>
        <PosSalePanel lines={SAMPLE_SALE} onLines={vi.fn()} onTakePayment={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('VAT 5%')).toBeTruthy()
    expect(screen.getByText('5.649')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Discount/ }))
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '10' } })
    expect(screen.getByText('Discount on the sale')).toBeTruthy()
    expect(screen.getByText('−0.538')).toBeTruthy()
    expect(screen.getByText('5.084')).toBeTruthy()
  })

  it('says no One size on a line with no sizes, goods or service', () => {
    const [sample] = SAMPLE_SALE
    const plain = { ...sample, variant: null, addOns: [] }
    const { unmount } = render(
      <MemoryRouter>
        <PosSalePanel lines={[plain]} onLines={vi.fn()} onTakePayment={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(i18n.t('pos.oneSizeOnly'))).toBeNull()
    unmount()

    const service = { ...plain, itemType: 'service' as const }
    render(
      <MemoryRouter>
        <PosSalePanel
          lines={[
            service,
            { ...service, id: 'l9', addOns: [{ id: 'a', label: 'Rush', price: 100 }] },
          ]}
          onLines={vi.fn()}
          onTakePayment={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText(i18n.t('pos.oneSizeOnly'))).toBeNull()
    // Add-ons with nothing before them carry no leading separator.
    expect(screen.getByText('+ Rush')).toBeTruthy()
  })

  it('names the size and the add-ons the catalogue gave the line', () => {
    render(
      <MemoryRouter>
        <SharedPanel />
      </MemoryRouter>,
    )
    expect(screen.getByText(/\+ extra shot, \+ oat milk/)).toBeTruthy()
  })

  it('starts the next sale empty', () => {
    setSaleLines((current) => current.slice(0, 1))
    startNewSale()
    render(
      <MemoryRouter>
        <SharedPanel />
      </MemoryRouter>,
    )
    expect(screen.getByText('Nothing on this sale yet.', { exact: false })).toBeTruthy()
  })
})

describe('taking the payment (P.12)', () => {
  let calls: { url: string; init?: RequestInit }[]
  let saleReply: () => Response

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale(SAMPLE_SALE)
    resetPosQueue()
    resetSharedRequests()
    forgetEntitlements()
    window.localStorage.clear()
    calls = []
    saleReply = () =>
      json(
        {
          saleId: 's-1',
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          receipt: { qr: { status: 'PENDING' } },
          filing: { dispatchState: 'QUEUED', acceptedAt: null },
          warnings: [],
        },
        201,
      )
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
        if (url === '/api/v1/pos/sales' && init?.method === 'POST') return saleReply()
        return new Response('', { status: 404 })
      }),
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  const renderPayment = () =>
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
          <Route path="/pos/done" element={<Done />} />
        </Routes>
      </MemoryRouter>,
    )

  it('shows no One size on the payment screen, goods or service', async () => {
    const plain = { ...SAMPLE_SALE[0], variant: null, addOns: [] }
    resetOpenSale([plain])
    const goods = renderPayment()
    expect(await screen.findAllByText(plain.name)).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.oneSizeOnly'))).toBeNull()
    goods.unmount()

    resetOpenSale([{ ...plain, itemType: 'service' }])
    renderPayment()
    expect(await screen.findAllByText(plain.name)).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.oneSizeOnly'))).toBeNull()
  })

  it('charges on the payment screen what the sale screen discounted', async () => {
    setSaleDiscount({ type: 'PERCENTAGE', value: '10' })
    renderPayment()
    expect(await screen.findByText('Discount on the sale')).toBeTruthy()
    expect(screen.getByText('−0.538')).toBeTruthy()
    // The sale (5.084); no tip unless the customer asks for one.
    expect(screen.getAllByText('5.084').length).toBeGreaterThan(0)
  })

  it('sends the sale once, with its key, its catalogue lines and the cash handed over', async () => {
    renderPayment()
    fireEvent.change(await screen.findByLabelText('Cash handed over'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()

    const sent = calls.filter((call) => call.url === '/api/v1/pos/sales')
    expect(sent).toHaveLength(1)
    const headers = sent[0].init?.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/^pos-sale-[0-9a-f-]{36}$/)
    const body = JSON.parse(String(sent[0].init?.body))
    expect(body).toMatchObject({
      tillId: 'till-1',
      queuedOffline: false,
      invoiceNumber: null,
      customer: { kind: 'WALK_IN' },
      payments: [{ method: 'CASH', amount: 5.649, tendered: 10 }],
      tip: null,
      draft: { branchId: 'b-1', vatMode: 'EXCLUSIVE', details: { transactionType: 'SIMPLIFIED' } },
    })
    expect(body.lineRefs).toHaveLength(5)
    expect(body.draft.customerId).toBeUndefined()
  })

  it('records a card as only what the cashier typed: the approval code is optional', async () => {
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /^Card/ }))
    fireEvent.change(screen.getByLabelText('Approval code'), { target: { value: '898498' } })
    fireEvent.click(screen.getByRole('button', { name: /^Paid/ }))
    expect(screen.getByText('Approval 898498')).toBeTruthy()
    expect(screen.queryByText(/Visa/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    await screen.findByText(/^done/)
    const body = JSON.parse(String(calls.find((c) => c.url === '/api/v1/pos/sales')?.init?.body))
    expect(body.payments).toEqual([{ method: 'CARD', amount: 5.649, cardApprovalCode: '898498' }])
  })

  it('at the document limit, says so without calling it monthly, and tells a cashier who can help', async () => {
    saleReply = () =>
      json(
        {
          type: 'https://api.fawtir.om/problems/quota-exceeded',
          title: 'Conflict',
          status: 409,
          detail: 'The free trial of the Business plan includes 25 documents.',
        },
        409,
      )
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /^Card/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Paid/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(i18n.t('pos.refusal.quota'))
    expect(alert.textContent).toContain(i18n.t('pos.refusal.quotaAskManager'))
    expect(alert.textContent).not.toMatch(/month/i)
    expect(screen.queryByRole('link', { name: i18n.t('extraDocuments.entry') })).toBeNull()
  })

  it('at the document limit, gives whoever manages the plan the way on, as the invoice screen does', async () => {
    const reply = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') {
        return json({ ...CASHIER, permissions: [...CASHIER.permissions, 'tenant.plan.manage'] })
      }
      if (url === '/api/v1/settings/plan/changes') {
        return json({ available: true, pending: null, history: [] })
      }
      return reply(input, init)
    })
    saleReply = () =>
      json(
        { type: 'https://api.fawtir.om/problems/quota-exceeded', title: 'Conflict', status: 409 },
        409,
      )
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /^Card/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Paid/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(
      (await screen.findByRole('link', { name: i18n.t('extraDocuments.entry') })).getAttribute(
        'href',
      ),
    ).toBe('/settings/plan/extra-documents')
    expect(
      (await screen.findByRole('link', { name: i18n.t('planGate.seePlans') })).getAttribute('href'),
    ).toBe('/settings/plan')
    expect(screen.queryByText(new RegExp(i18n.t('pos.refusal.quotaAskManager')))).toBeNull()
  })

  it('offers a full invoice when the sale is over the simplified limit, and asks for the buyer ID', async () => {
    saleReply = () =>
      json(
        {
          type: 'https://api.fawtir.om/problems/simplified-invoice-limit',
          status: 422,
          code: 'SIMPLIFIED_INVOICE_LIMIT',
          limit: 500,
          taxableAmount: 648,
          buyerIdentifierSchemes: ['CR', 'CID'],
        },
        422,
      )
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByRole('button', { name: 'Make it a full invoice' })).toBeTruthy()

    saleReply = () =>
      json(
        {
          saleId: 's-2',
          invoiceNumber: 'NZW-T01-INV-2026-000049',
          receipt: { qr: { status: 'NOT_APPLICABLE' } },
          filing: { dispatchState: 'QUEUED' },
          warnings: [],
        },
        201,
      )
    fireEvent.change(screen.getByLabelText("Buyer's name"), {
      target: { value: 'Salim Al Harthy' },
    })
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make it a full invoice' }))
    await screen.findByText(/^done/)

    const sent = calls.filter((call) => call.url === '/api/v1/pos/sales')
    expect(sent).toHaveLength(2)
    const second = JSON.parse(String(sent[1].init?.body))
    expect(second.customer).toEqual({
      kind: 'CONSUMER',
      consumer: {
        name: 'Salim Al Harthy',
        contact: null,
        identifierScheme: 'CID',
        identifierValue: '12345678',
      },
    })
    expect(second.draft.details.transactionType).toBe('FULL_TAX')
    // A different body is a different sale: it carries its own key.
    const keys = sent.map(
      (call) => (call.init?.headers as Record<string, string>)['Idempotency-Key'],
    )
    expect(keys[0]).not.toBe(keys[1])
  })

  it('numbers the sale from the till series and keeps it when the till is offline', async () => {
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    await waitFor(() => {
      const queued = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')
      expect(queued[0].body).toMatchObject({
        queuedOffline: true,
        invoiceNumber: 'NZW-T01-INV-2026-000049',
      })
    })
  })
})

describe('POS follow-ups (Abdul, 28 Oct 2026)', () => {
  let calls: { url: string; init?: RequestInit }[]
  let online: boolean

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale(SAMPLE_SALE)
    resetPosQueue()
    resetSharedRequests()
    forgetEntitlements()
    window.localStorage.clear()
    setPosVault(memoryVault(true))
    calls = []
    online = true
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
        if (url === '/api/v1/auth/logout') return new Response(null, { status: 204 })
        if (!online) throw new TypeError('Failed to fetch')
        return new Response('', { status: 404 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setPosVault(null)
  })

  it('Switch user signs out and sends the next cashier back to the till after sign-in', async () => {
    function Where() {
      const location = useLocation()
      return <p>at {`${location.pathname}${location.search}`}</p>
    }
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <Routes>
          <Route path="/pos" element={<CashierPicker till={TILL as never} mine />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Who is on the till' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Switch user' }))
    expect(await screen.findByText('at /login?next=%2Fpos')).toBeTruthy()
    expect(calls.some((call) => call.url === '/api/v1/auth/logout')).toBe(true)
  })

  it('keeps a slip photographed offline with the queued sale instead of failing', async () => {
    online = false
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
          <Route path="/pos/done" element={<Done />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /^Card/ }))
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(['jpeg bytes'], 'slip.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(
      await screen.findByText(/The slip photo is kept with this sale and sent once the connection/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Paid/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()

    const [queued] = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')
    expect(queued.body.payments[0]).toMatchObject({ method: 'CARD' })
    expect(queued.body.payments[0].slipFileId).toBeUndefined()
    const held = await heldSlipPhotos(queued.key)
    expect(held).toHaveLength(1)
    expect(held[0]).toMatchObject({ position: 1, name: 'slip.jpg', fileId: null })
  })
})
