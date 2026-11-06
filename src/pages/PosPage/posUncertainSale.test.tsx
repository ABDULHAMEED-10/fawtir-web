import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  forgetTabMemory,
  holdUncertainSale,
  restoreUncertainSale,
  type NewHold,
  resetOpenSale,
  setSaleDiscount,
  setSaleLines,
  startNewSale,
  useFinishedSale,
  useOpenSale,
  useUncertainSale,
} from '../../lib/posSale'
import { noteQueueSender, resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { memoryVault, setPosVault } from '../../lib/posVault'

// Stage B E-01: once a sale's request went out with no definite answer, the till offers only the
// same sale again, under the same key, or today's sales; the basket and payment cannot change.

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
  scopes: [],
  featureFlags: {},
}

// No QR profile on the till's detail: a walk-in sale cannot be kept offline, so an unknown outcome
// leaves the sale held on the screen rather than queued.
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
  openShift: { shiftId: 'sh-1', cashier: { userId: 'u-1', name: 'Maryam' }, openedAt: '2026-10-28T03:00:00Z' },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const SOLD = {
  saleId: 's-1',
  invoiceNumber: 'NZW-T01-INV-2026-000049',
  receipt: { qr: { status: 'PENDING' } },
  filing: { dispatchState: 'QUEUED', acceptedAt: null },
  warnings: [],
}

/** The till as the server answers it; a test may give it a new shift. */
let tillNow: typeof TILL | (Omit<typeof TILL, 'openShift'> & { openShift: null })
let posts: { key: string; body: string }[]
let replies: (() => Response)[]

function Done() {
  const done = useFinishedSale()
  return <p>done {done?.sale?.invoiceNumber ?? done?.queuedNumber}</p>
}

function Lines() {
  const { lines, saleDiscount } = useOpenSale()
  return <p>{`lines ${lines.length} discount ${saleDiscount.value}`}</p>
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  forgetEntitlements()
  window.localStorage.clear()
  window.sessionStorage.clear()
  // IndexedDB as the vault: its key outlives the tab's memory, as on a device.
  setPosVault(memoryVault(true))
  tillNow = TILL
  posts = []
  replies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url === '/api/v1/pos/tills/till-1') return json(tillNow)
      if (url.startsWith('/api/v1/pos/tills')) return json([tillNow])
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        posts.push({ key: (init.headers as Record<string, string>)['Idempotency-Key'], body: String(init.body) })
        return (replies.shift() ?? (() => json(SOLD, 201)))()
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  setPosVault(null)
})

const renderPayment = () =>
  render(
    <MemoryRouter initialEntries={['/pos/payment']}>
      <Routes>
        <Route path="/pos/payment" element={<><PosPaymentPage /><Lines /></>} />
        <Route path="/pos/done" element={<Done />} />
        <Route path="/pos/today" element={<p>today’s sales</p>} />
      </Routes>
    </MemoryRouter>,
  )

const retry = () => screen.getByRole('button', { name: i18n.t('pos.pay.uncertain.retry') }) as HTMLButtonElement

async function sendIntoUnknown(status: number) {
  replies.push(() => new Response('', { status }))
  const view = renderPayment()
  fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
  expect(await screen.findByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
  return view
}

describe('a sale whose outcome is unknown (E-01)', () => {
  it.each([502, 503, 504])('after an uncoded %i, nothing but the same sale again or today’s sales', async (status) => {
    await sendIntoUnknown(status)
    expect(screen.getByText(i18n.t('pos.refusal.offlineQrUnavailableAfterSend'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Finish the sale' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Take .* in cash/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Card/ })).toBeNull()
    expect(screen.getByRole('link', { name: i18n.t('pos.pay.uncertain.checkToday') })).toBeTruthy()
  })

  it.each([
    ['emptied', () => setSaleLines([])],
    ['discounted', () => setSaleDiscount({ type: 'PERCENTAGE', value: '50' })],
    ['started afresh', () => startNewSale()],
  ])('the basket cannot be %s while it is held', async (_how, change) => {
    await sendIntoUnknown(503)
    const before = screen.getByText(/^lines /).textContent
    act(() => change())
    expect(screen.getByText(/^lines /).textContent).toBe(before)
    expect(before).toContain(`lines ${SAMPLE_SALE.length}`)
  })

  it('sends the same sale again under the same key and with the same body, then shows its receipt', async () => {
    await sendIntoUnknown(503)
    fireEvent.click(retry())
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts).toHaveLength(2)
    expect(posts[1].key).toBe(posts[0].key)
    expect(posts[1].body).toBe(posts[0].body)
  })

  it('stays held while the answer is still unknown, and keeps the key', async () => {
    await sendIntoUnknown(504)
    replies.push(() => new Response('', { status: 502 }))
    fireEvent.click(retry())
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
    expect(posts[1].key).toBe(posts[0].key)
  })

  it('a coded refusal of the same key settles it: the sale may be changed again', async () => {
    await sendIntoUnknown(503)
    replies.push(() => json({ type: 'about:blank', status: 409, code: 'POS_TILL_NOT_OPEN' }, 409))
    fireEvent.click(retry())
    expect(await screen.findByRole('button', { name: 'Finish the sale' })).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.title'))).toBeNull()
    act(() => setSaleLines([]))
    expect(screen.getByText(/^lines /).textContent).toContain('lines 0')
  })

  it('Check today’s sales goes to the day’s list', async () => {
    await sendIntoUnknown(503)
    fireEvent.click(screen.getByRole('link', { name: i18n.t('pos.pay.uncertain.checkToday') }))
    expect(await screen.findByText('today’s sales')).toBeTruthy()
  })
})

// RB-1 STUCK-QR (owner Option 1), TEMPORARY: the server's 422 is definite; nothing was charged,
// numbered or printed, and the cart stays as it was.
describe('a sale the server cannot issue with a QR (STUCK-QR)', () => {
  it('says so, keeps the cart, and does not hold the sale', async () => {
    replies.push(() =>
      json({ type: 'about:blank', status: 422, code: 'POS_SALE_QR_UNAVAILABLE_FOR_BUYER' }, 422),
    )
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'))).toBeTruthy()
    expect(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER')).toMatch(/Nothing was charged, numbered or printed/)
    expect(screen.getByRole('button', { name: 'Finish the sale' })).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.title'))).toBeNull()
    expect(screen.getByText(/^lines /).textContent).toContain(`lines ${SAMPLE_SALE.length}`)
    expect(window.localStorage.getItem('fawtir.pos.queue') ?? '[]').toBe('[]')
  })

  it('has the wording in both languages', () => {
    const key = 'pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'
    expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
    expect(i18n.t(key, { lng: 'ar' })).not.toBe(i18n.t(key, { lng: 'en' }))
  })
})


const HELD = 'fawtir.pos.heldSale.t-1.till-1'
const heldNames = () =>
  Object.keys(window.sessionStorage).filter(
    (key) => key.startsWith('fawtir.pos.heldSale.') || key.startsWith('fawtir.pos.uncertainSale.'),
  )
/** The stored hold once sealing has answered. */
const sealedEntry = async () => {
  await vi.waitFor(() => expect(JSON.parse(window.sessionStorage.getItem(HELD) ?? '{}').sealed).toBeTruthy())
  return window.sessionStorage.getItem(HELD)!
}
const reload = (view: { unmount: () => void }) => {
  view.unmount()
  act(() => forgetTabMemory())
}

function HeldProbe({ tillId = 'till-1' }: { tillId?: string }) {
  const held = useUncertainSale(tillId)
  const { lines } = useOpenSale()
  return <p>{`held ${held?.key ?? 'none'} lines ${lines.length}`}</p>
}

// Review E01R-1: the hold lived only in the tab's memory, so a reload, a re-login or a restored tab
// lost it with the basket, and the next Finish minted a new key for a sale that may be recorded.
describe('a held sale after a reload (E01R-1)', () => {
  it('comes back locked with its basket, and is sent again under the same key and body', async () => {
    const view = await sendIntoUnknown(503)
    await sealedEntry()
    reload(view)
    renderPayment()
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
    await vi.waitFor(() => expect(retry().disabled).toBe(false))
    expect(screen.getByText(/^lines /).textContent).toContain(`lines ${SAMPLE_SALE.length}`)
    expect(screen.queryByRole('button', { name: 'Finish the sale' })).toBeNull()
    act(() => setSaleLines([]))
    expect(screen.getByText(/^lines /).textContent).toContain(`lines ${SAMPLE_SALE.length}`)
    // The next person on the till sees whose sale it is (RBW2-6).
    expect(screen.getByText(i18n.t('pos.pay.uncertain.rungBy', { name: 'Maryam' }))).toBeTruthy()
    fireEvent.click(retry())
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts).toHaveLength(2)
    expect(posts[1].key).toBe(posts[0].key)
    expect(posts[1].body).toBe(posts[0].body)
    expect(heldNames()).toEqual([])
  })

  it('says a reload would forget it when it cannot be stored', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      await sendIntoUnknown(503)
      expect(screen.getByText(i18n.t('pos.pay.uncertain.unsaved'))).toBeTruthy()
    } finally {
      vi.mocked(Storage.prototype.setItem).mockRestore()
    }
  })

  it('shows no such banner when the hold is sealed', async () => {
    await sendIntoUnknown(503)
    await sealedEntry()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.unsaved'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.lockOnly'))).toBeNull()
  })
})

// RBW2-1: the hold was keyed by till and shift, so a hold made before the shift was read, or a
// take-over under a new shift, was not found again and the sale could be rung a second time.
describe('a held sale is its till’s, whatever shift reads it (RBW2-1)', () => {
  it.each([
    ['made with no open shift', null],
    ['taken over under another shift', 'sh-1'],
  ])('%s: restored under a new shift with the same key', async (_, madeUnder) => {
    const view = await sendIntoUnknown(503)
    await sealedEntry()
    if (madeUnder === null) {
      // As if the hold had been made before the till's shift was read.
      const entry = JSON.parse(window.sessionStorage.getItem(HELD)!)
      window.sessionStorage.setItem(HELD, JSON.stringify({ ...entry, shiftId: null }))
    }
    reload(view)
    tillNow = { ...TILL, openShift: { ...TILL.openShift, shiftId: 'sh-2' } }
    renderPayment()
    await vi.waitFor(() => expect(retry().disabled).toBe(false))
    fireEvent.click(retry())
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts.map((post) => post.key)).toEqual([posts[0].key, posts[0].key])
  })

  it('moves the first release’s entry, kept by till and shift in clear, and seals it', async () => {
    const view = await sendIntoUnknown(503)
    await sealedEntry()
    reload(view)
    // What b2fb881a stored: the request in clear, under the till and the shift.
    const body = JSON.parse(posts[0].body)
    window.sessionStorage.clear()
    window.sessionStorage.setItem(
      'fawtir.pos.uncertainSale.till-1.sh-1',
      JSON.stringify({
        held: {
          tillId: 'till-1',
          shiftId: 'sh-1',
          key: posts[0].key,
          request: body,
          printed: { taxable: 5.38, vat: 0.269, total: 5.649 },
          maker: { userId: 'u-1', name: 'Maryam' },
          receipt: { lines: [], totals: {}, tip: 0, change: 0, company: null, payments: [] },
        },
        basket: { lines: SAMPLE_SALE, saleDiscount: { type: 'PERCENTAGE', value: '0' }, company: null, startedAt: null },
      }),
    )
    tillNow = { ...TILL, openShift: { ...TILL.openShift, shiftId: 'sh-2' } }
    renderPayment()
    await vi.waitFor(() => expect(retry().disabled).toBe(false))
    expect(window.sessionStorage.getItem('fawtir.pos.uncertainSale.till-1.sh-1')).toBeNull()
    expect(await sealedEntry()).not.toContain('Maryam')
    fireEvent.click(retry())
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].key).toBe(posts[0].key)
    expect(posts[1].body).toBe(posts[0].body)
  })
})

// RBW2-2: the stored hold carried the buyer, the contact, card and slip details and people's names
// in clear in sessionStorage. They are sealed as the queue's buyer is.
describe('what a held sale keeps in clear (RBW2-2)', () => {
  const SECRETS = {
    buyer: 'Salim Al-Harthy',
    id: '12345678',
    contact: '+96899001122',
    approval: 'APPR-778899',
    reference: 'REF-445566',
    rrn: 'RRN-998877',
    last4: '4242',
    cashier: 'Maryam Al-Busaidi',
  }
  const hold = (): NewHold => ({
    tenantId: 't-1',
    tillId: 'till-1',
    shiftId: 'sh-1',
    tillLabel: 'Till 1',
    key: 'pos-sale-key-rbw22',
    send: {
      request: {
        tillId: 'till-1',
        soldAt: '2026-11-06T10:00:00Z',
        queuedOffline: false,
        invoiceNumber: null,
        customer: {
          kind: 'CONSUMER',
          consumer: {
            name: SECRETS.buyer,
            identifier: { scheme: 'CID', value: SECRETS.id },
            contact: { mobilePhone: SECRETS.contact },
          },
        } as never,
        draft: { lines: [] } as never,
        lineRefs: [],
        payments: [
          {
            method: 'CARD',
            amount: 5.649,
            approvalCode: SECRETS.approval,
            reference: SECRETS.reference,
            slip: { rrn: SECRETS.rrn, last4: SECRETS.last4, cardType: 'VISA' },
          } as never,
        ],
        tip: null,
      },
      slipPhotos: [{ name: 'slip.jpg' } as never],
      printed: { taxable: 5.38, vat: 0.269, total: 5.649 },
      maker: { userId: 'u-1', name: SECRETS.cashier },
      receipt: {
        lines: [],
        totals: {} as never,
        tip: 0,
        change: 0,
        company: null,
        buyer: { name: SECRETS.buyer, identifierScheme: 'CID', identifierValue: SECRETS.id },
        payments: [{ method: 'CARD', amount: 5.649, approvalCode: SECRETS.approval }],
      },
    },
  })

  it('stores no ID, contact, card, slip or name in clear, and gives the same body back', async () => {
    const made = hold()
    act(() => holdUncertainSale(made))
    const stored = await sealedEntry()
    for (const secret of Object.values(SECRETS)) expect(stored).not.toContain(secret)
    act(() => forgetTabMemory())
    let opened: ReturnType<typeof useUncertainSale> = null
    function Opened() {
      opened = useUncertainSale('till-1')
      return null
    }
    render(<><HeldProbe /><Opened /></>)
    act(() => restoreUncertainSale('t-1', 'till-1', 'Till 1'))
    // Locked at once, before the sealed sale is opened.
    expect(screen.getByText(/^held /).textContent).toContain('held pos-sale-key-rbw22')
    await vi.waitFor(() =>
      expect(screen.getByText(/^held /).textContent).toBe(`held pos-sale-key-rbw22 lines ${SAMPLE_SALE.length}`),
    )
    await vi.waitFor(() => expect(opened?.send).toBeTruthy())
    expect(JSON.stringify(opened!.send!.request)).toBe(JSON.stringify(made.send.request))
    expect(opened!.hadSlips).toBe(true)
  })

  it('keeps only the key and the lock where the device cannot seal, and says so', async () => {
    setPosVault(memoryVault(false))
    const view = await sendIntoUnknown(503)
    await vi.waitFor(() => expect(screen.getByText(i18n.t('pos.pay.uncertain.lockOnly'))).toBeTruthy())
    const stored = window.sessionStorage.getItem(HELD)!
    expect(JSON.parse(stored)).toMatchObject({ key: posts[0].key, sealed: null })
    expect(stored).not.toContain('Maryam')
    expect(stored).not.toContain('payments')
    reload(view)
    renderPayment()
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.lockOnly'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('pos.pay.uncertain.retry') })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Finish the sale' })).toBeNull()
    // Once Today has been checked, the cashier may unlock the till.
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pay.uncertain.checkedToday') }))
    expect(await screen.findByRole('button', { name: 'Finish the sale' })).toBeTruthy()
    expect(heldNames()).toEqual([])
  })
})

// RBW2-3: only a coded 4xx refuses the sale itself; a coded 5xx, a 408 or a 429 says nothing about
// the first send, and a 401 or 403 refuses the session (E01R-3).
describe('a retry refused for the session, not the sale (E01R-3, RBW2-3)', () => {
  it.each([
    [401, 'AUTH_SESSION_EXPIRED'],
    [403, 'BRANCH_SCOPE_DENIED'],
    [408, 'REQUEST_TIMEOUT'],
    [429, 'TOO_MANY_REQUESTS'],
    [503, 'POS_SALES_UNAVAILABLE'],
  ])('a coded %i keeps the sale held under its key', async (status, code) => {
    await sendIntoUnknown(503)
    replies.push(() => json({ type: 'about:blank', status, code }, status))
    fireEvent.click(retry())
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].key).toBe(posts[0].key)
    // A 401 also sends the reader to sign in (DA-16), so the hold is read where the next screen
    // reads it: in this tab's memory and stored for the till.
    await new Promise((resolve) => setTimeout(resolve, 50))
    render(<HeldProbe />)
    expect(screen.getByText(/^held /).textContent).toBe(`held ${posts[0].key} lines ${SAMPLE_SALE.length}`)
    act(() => setSaleLines([]))
    expect(screen.getByText(/^held /).textContent).toBe(`held ${posts[0].key} lines ${SAMPLE_SALE.length}`)
    expect(heldNames()).toEqual([HELD])
  })

  it('has the banner wording in both languages', () => {
    for (const key of [
      'pos.pay.uncertain.unsaved',
      'pos.pay.uncertain.lockOnly',
      'pos.pay.uncertain.otherTill',
      'pos.pay.uncertain.reattachSlip',
      'pos.close.heldSale',
    ]) {
      expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
      expect(i18n.t(key, { lng: 'ar' })).not.toBe(i18n.t(key, { lng: 'en' }))
    }
  })
})

// RBW2-4: the hold was the tab's, so a sale held on till A was shown, and could be sent, on till B.
describe('a held sale stays with its till (RBW2-4)', () => {
  it('is not shown or sent on another till, which warns about it instead', async () => {
    act(() =>
      holdUncertainSale({
        tenantId: 't-1',
        tillId: 'till-A',
        shiftId: 'sh-A',
        tillLabel: 'Till A',
        key: 'pos-sale-key-till-a',
        send: {
          request: { tillId: 'till-A' } as never,
          slipPhotos: [],
          printed: { taxable: 1, vat: 0.05, total: 1.05 },
          maker: null,
          receipt: { lines: [], totals: {} as never, tip: 0, change: 0, company: null, payments: [] },
        },
      }),
    )
    // Read for till 1 before anything puts till A's hold aside: it is not till 1's.
    const probe = render(<HeldProbe />)
    expect(screen.getByText(/^held /).textContent).toContain('held none')
    probe.unmount()
    renderPayment()
    // Till A's basket went aside with its hold; till 1 rings its own.
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.otherTill', { till: 'Till A' }))).toBeTruthy()
    expect(screen.getByText(/^lines /).textContent).toBe('lines 0 discount 0')
    act(() => setSaleLines(SAMPLE_SALE))
    expect(await screen.findByRole('button', { name: /Take 5.649 in cash/ })).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.title'))).toBeNull()
    expect(screen.getByText(i18n.t('pos.pay.uncertain.otherTill', { till: 'Till A' }))).toBeTruthy()
    // Till 1 sells its own basket; nothing of till A's is sent.
    fireEvent.click(screen.getByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts.map((post) => post.key)).not.toContain('pos-sale-key-till-a')
    // Back on till A, its hold is there as it was.
    render(<HeldProbe tillId="till-A" />)
    act(() => restoreUncertainSale('t-1', 'till-A', 'Till A'))
    expect(screen.getByText(/^held pos-sale-key-till-a/)).toBeTruthy()
  })
})

// RBW2-5: slip photos are never stored, so a restored hold says to attach them again.
describe('a restored hold that had a slip photo (RBW2-5)', () => {
  it('tells the cashier to attach the slip photo again once the sale is confirmed', async () => {
    const view = await sendIntoUnknown(503)
    await sealedEntry()
    const entry = JSON.parse(window.sessionStorage.getItem(HELD)!)
    window.sessionStorage.setItem(HELD, JSON.stringify({ ...entry, hadSlips: true }))
    reload(view)
    renderPayment()
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.reattachSlip'))).toBeTruthy()
  })
})

// RBW2-1: keyed by tenant and till, so a tab signed in to another company never finds this hold.
describe('a held sale stays with its company (RBW2-1)', () => {
  it('is not restored for another tenant’s till of the same id', async () => {
    act(() =>
      holdUncertainSale({
        tenantId: 't-2',
        tillId: 'till-1',
        shiftId: 'sh-9',
        tillLabel: 'Till 1',
        key: 'pos-sale-key-other-company',
        send: {
          request: { tillId: 'till-1' } as never,
          slipPhotos: [],
          printed: { taxable: 1, vat: 0.05, total: 1.05 },
          maker: null,
          receipt: { lines: [], totals: {} as never, tip: 0, change: 0, company: null, payments: [] },
        },
      }),
    )
    act(() => forgetTabMemory())
    render(<HeldProbe />)
    act(() => restoreUncertainSale('t-1', 'till-1', 'Till 1'))
    expect(screen.getByText(/^held /).textContent).toBe('held none lines 0')
    act(() => restoreUncertainSale('t-2', 'till-1', 'Till 1'))
    expect(screen.getByText(/^held /).textContent).toContain('held pos-sale-key-other-company')
  })
})
