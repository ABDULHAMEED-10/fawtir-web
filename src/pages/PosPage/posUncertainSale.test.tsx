import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  forgetTabMemory,
  holdUncertainSale,
  restoreUncertainSale,
  settleHeldKey,
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
let lookups: { url: string; method: string | undefined }[]
let lookupReplies: (() => Response | Promise<Response>)[]

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
  lookups = []
  lookupReplies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.includes('/sales/by-key/')) {
        lookups.push({ url, method: init?.method })
        return (lookupReplies.shift() ?? (() => Promise.reject(new TypeError('Failed to fetch'))))()
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
  vi.useRealTimers()
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
const checkServer = () =>
  screen.getByRole('button', { name: i18n.t('pos.pay.uncertain.checkServer') }) as HTMLButtonElement

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
    // RW6-5: the cash taken is handed back; "nothing was charged" is kept for when nothing was.
    expect(
      await screen.findByText(
        `${i18n.t('pos.refusal.qrUnavailableTaken')} ${i18n.t('pos.refusal.qrGiveBack.cash')}`,
      ),
    ).toBeTruthy()
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
    const removedWhileLocked: boolean[] = []
    const remove = Storage.prototype.removeItem
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, name: string) {
      if (name.startsWith('fawtir.pos.uncertainSale.')) removedWhileLocked.push(this.getItem(HELD) !== null)
      remove.call(this, name)
    })
    renderPayment()
    await vi.waitFor(() => expect(retry().disabled).toBe(false))
    spy.mockRestore()
    expect(window.sessionStorage.getItem('fawtir.pos.uncertainSale.till-1.sh-1')).toBeNull()
    // RBW3-4: the old entry went only once the new lock was in place.
    expect(removedWhileLocked).toEqual([true])
    expect(await sealedEntry()).not.toContain('Maryam')
    fireEvent.click(retry())
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].key).toBe(posts[0].key)
    expect(posts[1].body).toBe(posts[0].body)
  })

  it('keeps the first release’s entry when the new lock cannot be written (RBW3-4)', () => {
    const legacy = JSON.stringify({
      held: {
        tillId: 'till-1',
        shiftId: 'sh-1',
        key: 'legacy-key',
        request: { tillId: 'till-1', soldAt: '2026-11-06T10:00:00Z' },
        printed: { taxable: 5.38, vat: 0.269, total: 5.649 },
        maker: null,
        receipt: { lines: [], totals: {}, tip: 0, change: 0, company: null, payments: [] },
      },
      basket: { lines: SAMPLE_SALE, saleDiscount: { type: 'PERCENTAGE', value: '0' }, company: null, startedAt: null },
    })
    window.sessionStorage.setItem('fawtir.pos.uncertainSale.till-1.sh-1', legacy)
    const set = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
      if (name.startsWith('fawtir.pos.heldSale.')) throw new DOMException('full', 'QuotaExceededError')
      set.call(this, name, value)
    })
    try {
      render(<HeldProbe />)
      act(() => restoreUncertainSale('t-1', 'till-1', 'Till 1'))
      expect(screen.getByText(/^held /).textContent).toContain('held legacy-key')
      expect(window.sessionStorage.getItem('fawtir.pos.uncertainSale.till-1.sh-1')).toBe(legacy)
    } finally {
      spy.mockRestore()
    }
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
    // 01:30 on 6 Nov in Muscat but still 5 Nov in UTC: the summary must give the business day.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T21:30:00Z'))
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
    // RBW3-1, RBW3-1b: the sale's total, day and time are shown in clear, to find it on Today.
    expect(screen.getByText('This sale: OMR 5.649, rung on 6 Nov 2026 at 01:30.')).toBeTruthy()
    expect(screen.queryByText(/OMR\s+OMR/)).toBeNull()
    expect(JSON.parse(window.sessionStorage.getItem(HELD)!).summary).toMatchObject({
      total: 5.649,
      currency: 'OMR',
      soldAt: JSON.parse(posts[0].body).soldAt,
    })
    // Owner decision 5: no unlock on the cashier's word; the server is asked, and only on a press.
    expect(screen.queryByRole('button', { name: /I checked Today/ })).toBeNull()
    expect(checkServer().disabled).toBe(false)
    expect(lookups).toEqual([])
    expect(heldNames()).toEqual([HELD])
  })
})

// RESEND-AUTH (owner decision 5, backend 98c0066cb): a lock-only hold has no body to send again,
// so the server decides its key. Only a server answer releases the hold.
describe('a lock-only hold decided by the server (RESEND-AUTH)', () => {
  async function lockOnlyHold() {
    setPosVault(memoryVault(false))
    const view = await sendIntoUnknown(503)
    await vi.waitFor(() => expect(screen.getByText(i18n.t('pos.pay.uncertain.lockOnly'))).toBeTruthy())
    reload(view)
    renderPayment()
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.lockOnly'))).toBeTruthy()
    return posts[0].key
  }
  const RECORDED = {
    status: 'RECORDED',
    sale: { ...SOLD, replayed: true, tillId: 'till-1', totals: { total: 5.649 } },
    abandonedAt: null,
  }

  it('RECORDED: shows the sale by its number and total and releases the hold onto it', async () => {
    const key = await lockOnlyHold()
    lookupReplies.push(() => json(RECORDED))
    fireEvent.click(checkServer())
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.recordedTitle'))).toBeTruthy()
    expect(
      screen.getByText(
        i18n.t('pos.pay.uncertain.recorded', { invoice: 'NZW-T01-INV-2026-000049', amount: 'OMR 5.649' }),
      ),
    ).toBeTruthy()
    // RA-3: the till and key of the hold's own lock entry, by POST.
    expect(lookups).toEqual([{ url: `/api/v1/pos/tills/till-1/sales/by-key/${key}`, method: 'POST' }])
    expect(heldNames()).toEqual([])
    expect(posts).toHaveLength(1)
  })

  it('NOT_RECORDED: releases the hold, says to check the terminal, and rings again only under a new key', async () => {
    const key = await lockOnlyHold()
    lookupReplies.push(() => json({ status: 'NOT_RECORDED', sale: null, abandonedAt: '2026-11-06T10:00:00Z' }))
    fireEvent.click(checkServer())
    const said = await screen.findByText(i18n.t('pos.pay.uncertain.notRecorded'))
    expect(said.getAttribute('role')).toBe('alert')
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.title'))).toBeNull()
    expect(said.textContent).toBe(
      'The server has no record of this sale. Before charging again, check the card terminal or slip: if the customer was charged, refund it or keep the approval for the new sale.',
    )
    expect(heldNames()).toEqual([])
    expect(posts).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pay.uncertain.ringAgain') }))
    cleanup()
    act(() => setSaleLines(SAMPLE_SALE))
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts).toHaveLength(2)
    expect(posts[1].key).not.toBe(key)
  })

  it('IN_PROGRESS: keeps the hold, says it is still being saved, and asks again after Retry-After', async () => {
    await lockOnlyHold()
    lookupReplies.push(
      () =>
        new Response(JSON.stringify({ status: 'IN_PROGRESS', sale: null, abandonedAt: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '1' },
        }),
      () => json(RECORDED),
    )
    fireEvent.click(checkServer())
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.stillSaving'))).toBeTruthy()
    expect(heldNames()).toEqual([HELD])
    expect(checkServer().disabled).toBe(true)
    expect(lookups).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 600))
    // Not before the server's Retry-After.
    expect(lookups).toHaveLength(1)
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.recordedTitle'), {}, { timeout: 3000 })).toBeTruthy()
    expect(lookups).toHaveLength(2)
    expect(heldNames()).toEqual([])
  })

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 500', () => json({ type: 'about:blank', status: 500 }, 500)],
    ['a 404 POS_TILL_NOT_FOUND', () => json({ type: 'about:blank', status: 404, code: 'POS_TILL_NOT_FOUND' }, 404)],
    ['a 403', () => json({ type: 'about:blank', status: 403, code: 'BRANCH_SCOPE_DENIED' }, 403)],
    ['an unknown status', () => json({ status: 'MAYBE', sale: null, abandonedAt: null })],
    ['RECORDED without its sale', () => json({ status: 'RECORDED', sale: null, abandonedAt: null })],
  ])('after %s, the hold stays: nothing is released without a server answer', async (_case, answer) => {
    await lockOnlyHold()
    lookupReplies.push(answer as () => Response)
    fireEvent.click(checkServer())
    const said = await screen.findByText(i18n.t('pos.pay.uncertain.checkFailed'))
    expect(said.getAttribute('role')).toBe('alert')
    expect(heldNames()).toEqual([HELD])
    expect(screen.getByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Finish the sale' })).toBeNull()
    expect(checkServer().disabled).toBe(false)
    expect(lookups).toHaveLength(1)
  })

  it('RA-1: a key the till queue holds is never sent to the lookup', async () => {
    const key = await lockOnlyHold()
    cleanup()
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        { key, tillId: 'till-1', number: 'NZW-T01-INV-2026-000049', body: JSON.parse(posts[0].body), refusal: null },
      ]),
    )
    renderPayment()
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.queuedKey'))).toBeTruthy()
    expect(checkServer().disabled).toBe(true)
    fireEvent.click(checkServer())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lookups).toEqual([])
    expect(heldNames()).toEqual([HELD])
  })

  it('a sealed hold is sent again in full as before; the lookup is not offered or asked', async () => {
    const view = await sendIntoUnknown(503)
    await sealedEntry()
    reload(view)
    renderPayment()
    await vi.waitFor(() => expect(retry().disabled).toBe(false))
    expect(screen.queryByRole('button', { name: i18n.t('pos.pay.uncertain.checkServer') })).toBeNull()
    fireEvent.click(retry())
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(lookups).toEqual([])
  })

  it('a resend refused POS_SALE_KEY_ABANDONED is said, never sent again under that key, and Finish takes a new key', async () => {
    await sendIntoUnknown(503)
    replies.push(() => json({ type: 'about:blank', status: 409, code: 'POS_SALE_KEY_ABANDONED' }, 409))
    fireEvent.click(retry())
    expect(await screen.findByText(i18n.t('pos.refusal.POS_SALE_KEY_ABANDONED'))).toBeTruthy()
    expect(i18n.t('pos.refusal.POS_SALE_KEY_ABANDONED')).toMatch(/check the card terminal or slip/)
    expect(heldNames()).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(posts).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts).toHaveLength(3)
    expect(posts[2].key).not.toBe(posts[0].key)
  })

  it('an answer for another key releases nothing', async () => {
    await sendIntoUnknown(503)
    act(() => settleHeldKey('pos-sale-key-some-other-sale'))
    expect(heldNames()).toEqual([HELD])
    expect(screen.getByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
    act(() => settleHeldKey(posts[0].key))
    expect(heldNames()).toEqual([])
  })

  it('has its wording in both languages', () => {
    for (const key of [
      'pos.pay.uncertain.checkServer',
      'pos.pay.uncertain.checking',
      'pos.pay.uncertain.stillSaving',
      'pos.pay.uncertain.checkFailed',
      'pos.pay.uncertain.queuedKey',
      'pos.pay.uncertain.recordedTitle',
      'pos.pay.uncertain.recorded',
      'pos.pay.uncertain.notRecordedTitle',
      'pos.pay.uncertain.notRecorded',
      'pos.pay.uncertain.ringAgain',
      'pos.refusal.POS_SALE_KEY_ABANDONED',
    ]) {
      expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
      expect(i18n.t(key, { lng: 'ar' })).not.toBe(i18n.t(key, { lng: 'en' }))
    }
    expect(i18n.exists('pos.pay.uncertain.checkedToday')).toBe(false)
    expect(i18n.exists('pos.pay.uncertain.openTodayFirst')).toBe(false)
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
    // RBW3-2: both say a sale is recorded under the key.
    [404, 'POS_TILL_NOT_FOUND'],
    [409, 'POS_SALE_KEY_REUSED'],
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
