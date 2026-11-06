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
import { noteQueueSender, resetPosQueue } from '../../lib/posQueue'
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
  return <p data-queued-qr={done?.queuedQr ?? ''}>done {done?.sale?.invoiceNumber ?? done?.queuedNumber}</p>
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
  /** The till list the server answers; a test swaps it to give the till another zone. */
  let tillsReply: () => Response

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale(SAMPLE_SALE)
    resetPosQueue()
    // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
    noteQueueSender('u-1')
    resetSharedRequests()
    forgetEntitlements()
    window.localStorage.clear()
    calls = []
    tillsReply = () => json([TILL])
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
        if (url.startsWith('/api/v1/pos/tills')) return tillsReply()
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

  it('charges on the payment screen what the sale screen discounted', async () => {
    setSaleDiscount({ type: 'PERCENTAGE', value: '10' })
    renderPayment()
    expect(await screen.findByText('Discount on the sale')).toBeTruthy()
    expect(screen.getByText('−0.538')).toBeTruthy()
    // The sale (5.084); no tip unless the customer asks for one.
    expect(screen.getAllByText('5.084').length).toBeGreaterThan(0)
  })

  // Owner decision XT2-ZONE-UNREADABLE (2026-11-05 item 4, Option A); Agent 10 test gap 1 on 346d0d06c.
  it('an unreadable company zone says so, not storage, reads the till again, and sells once the zone is valid', async () => {
    const withZone = (timeZone: string) => ({
      ...TILL,
      series: { INVOICE: { ...TILL.series.INVOICE, timeZone } },
    })
    const tillReads = () => calls.filter((call) => call.url.startsWith('/api/v1/pos/tills')).length
    // The first read names a zone this browser cannot read; any read after it, a valid one.
    let reads = 0
    tillsReply = () => json([withZone(reads++ === 0 ? 'Not/AZone' : 'Asia/Muscat')])
    renderPayment()
    fireEvent.change(await screen.findByLabelText('Cash handed over'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Take 5.649 in cash/ }))
    const before = tillReads()
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))

    expect(await screen.findByText(i18n.t('pos.refusal.tenantZoneUnavailable'))).toBeTruthy()
    expect(
      i18n.t('pos.refusal.tenantZoneUnavailable').startsWith("Your company's time zone could not be verified."),
    ).toBe(true)
    // W7A-2: the zone is not the company's to set on the web.
    expect(i18n.t('pos.refusal.tenantZoneUnavailable')).toMatch(/Fawtir support/)
    expect(i18n.t('pos.refusal.tenantZoneUnavailable')).not.toMatch(/administrator|settings/i)
    expect(screen.queryByText(i18n.t('pos.refusal.storageUnavailable'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.refusal.storageUnavailableAfterSend'))).toBeNull()
    expect(calls.filter((call) => call.url === '/api/v1/pos/sales')).toEqual([])
    // till.retry(): the till list is read again.
    await waitFor(() => expect(tillReads()).toBe(before + 1))

    fireEvent.click(await screen.findByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(calls.filter((call) => call.url === '/api/v1/pos/sales')).toHaveLength(1)
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

  // QR E-1: the profile comes only from GET /pos/tills/{id}; the till list never carries it.
  const QR_PROFILE = {
    qrVersion: '1.1',
    invoiceType: '01',
    sellerName: 'Al Noor Trading LLC',
    sellerVatin: 'OM1100012345',
    issueDateZone: 'Asia/Muscat',
    issueTimeZone: 'Asia/Muscat',
    amountScale: 3,
    profileVersion: 'c'.repeat(64),
  }

  async function sellOffline(detail: unknown) {
    const answer = (url: string) => (url === '/api/v1/pos/tills/till-1' ? json(detail) : json([TILL]))
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return answer(url)
      if (url === '/api/v1/pos/sales') throw new TypeError('Failed to fetch')
      return new Response('', { status: 404 })
    })
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    await waitFor(() =>
      expect(calls.some((call) => call.url === '/api/v1/pos/tills/till-1')).toBe(true),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    const done = await screen.findByText('done NZW-T01-INV-2026-000049')
    const [queued] = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')
    return { done, body: queued.body }
  }

  it('offline with the till’s QR profile, the receipt shows the QR the queued sale carries (QR E-1)', async () => {
    const { done, body } = await sellOffline({ ...TILL, qrProfile: QR_PROFILE })
    expect(body.printedQr).toMatchObject({ profileVersion: QR_PROFILE.profileVersion })
    expect(body.printedQr.payload).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(done.getAttribute('data-queued-qr')).toBe(body.printedQr.payload)
  })

  it('offline without a QR profile, the queued sale and its receipt are as before E-1', async () => {
    const { done, body } = await sellOffline({ ...TILL })
    expect('printedQr' in body).toBe(false)
    expect(done.getAttribute('data-queued-qr')).toBe('')
  })

  it('offline with storage that cannot keep the sale: "Not sold", no receipt, and no number until Check again (POS-MEMQ S8)', async () => {
    saleReply = () => {
      throw new TypeError('Failed to fetch')
    }
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /^Card/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Paid/ }))
    const realSet = Storage.prototype.setItem
    const full = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === 'fawtir.pos.queue') {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }
        realSet.call(this, key, value)
      })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
      // Its request went out before the connection dropped, so the refusal does not say nothing was sent (XW-2).
      expect(await screen.findByText(i18n.t('pos.refusal.storageUnavailableAfterSend'))).toBeTruthy()
      expect(await screen.findByText(i18n.t('pos.storage.blocked'))).toBeTruthy()
      expect(screen.queryByText(/^done/)).toBeNull()
      expect(screen.queryByText(/NZW-T01-INV-2026-000049/)).toBeNull()
    } finally {
      full.mockRestore()
    }
    expect(JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')).toEqual([])

    // Storage works again but nothing has proved it: the sell control stays off, online or
    // offline, while the notice shows (DES43 rev 4.7 D.9).
    const finishButton = screen.getByRole('button', { name: 'Finish the sale' }) as HTMLButtonElement
    expect(finishButton.disabled).toBe(true)
    fireEvent.click(finishButton)
    expect(screen.queryByText(/^done/)).toBeNull()

    // Check again proves storage; the next try takes the number that was never printed, once.
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.storage.checkAgain') }))
    await waitFor(() => expect(screen.queryByText(i18n.t('pos.storage.blocked'))).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    const queued = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')
    expect(queued).toHaveLength(1)
    expect(queued[0].body.invoiceNumber).toBe('NZW-T01-INV-2026-000049')
  })
})

describe('POS follow-ups (Abdul, 28 Oct 2026)', () => {
  let calls: { url: string; init?: RequestInit }[]
  let online: boolean

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale(SAMPLE_SALE)
    resetPosQueue()
    // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
    noteQueueSender('u-1')
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
