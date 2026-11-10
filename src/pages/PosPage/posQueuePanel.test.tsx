import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import type { PosSaleRequest, PosTillDto } from '../../api/pos/pos'
import {
  flushQueue,
  noteTillServer,
  queuedFor,
  noteQueueSender,
  resetPosQueue,
  submitSale,
} from '../../lib/posQueue'
import type { TillState } from '../../lib/posTill'
import { memoryVault, setPosVault } from '../../lib/posVault'
import { PosQueuePanel } from './PosQueuePanel'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

// Queue mechanics, not the QR: a consumer sale is queued offline only with its QR (owner
// directive 2026-11-06), so the builder answers with a fixed stand-in here. The real build and
// its refusals are tested in posOfflineQr.test.ts and posOfflineQrIssuance.test.ts.
vi.mock('../../lib/posOfflineQr', () => ({
  offlinePrintedQr: async () => ({ payload: 'AQ==', sellerUuid: 'stand-in', profileVersion: '0'.repeat(64) }),
}))

const wrap = (node: ReactNode) => <MemoryRouter>{node}</MemoryRouter>

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 13 } },
} as unknown as PosTillDto

const READY = (refund: boolean) =>
  ({
    status: 'ready',
    till: TILL,
    branchId: 'b-1',
    branchName: 'Main',
    userId: 'u-1',
    mine: true,
    can: { sell: true, close: true, refund, manage: refund },
    retry: () => {},
  }) as Extract<TillState, { status: 'ready' }>

const BODY: PosSaleRequest = {
  tillId: 'till-1',
  soldAt: '2026-10-30T15:22:46Z',
  queuedOffline: false,
  invoiceNumber: null,
  customer: { kind: 'WALK_IN' },
  draft: { lines: [] } as never,
  lineRefs: [],
  payments: [{ method: 'CASH', amount: 0.21 }],
  tip: null,
}

let reply: () => Response
const posts: string[] = []

const problem = (status: number, body: object) =>
  new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })

beforeEach(async () => {
  window.localStorage.clear()
  resetPosQueue()
  // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
  noteQueueSender('u-1')
  posts.length = 0
  await i18n.changeLanguage('en')
  reply = () => {
    throw new TypeError('Failed to fetch')
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/v1/pos/sales' && init?.method === 'POST') {
        posts.push(new Headers(init.headers).get('Idempotency-Key') ?? '')
        return reply()
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const READ_ONLY = () =>
  problem(409, {
    type: 'https://api.fawtir.om/problems/subscription-restricted',
    code: 'SUBSCRIPTION_SUSPENDED',
  })

describe('the queue on the till and Today (H-1)', () => {
  it('draws nothing while there is nothing to tell', () => {
    const { container } = render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(container.innerHTML).toBe('')
  })

  it('a sale waiting for the connection is one quiet line', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-0')
    render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(screen.getByText(/1 sale is waiting to be sent/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says what a waiting sale waits for: the connection when offline, the stuck sale when not', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-w1')
    await submitSale(TILL, BODY, 'pos-sale-key-panel-w2')
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const first = render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(screen.getByText(/2 sales are waiting to be sent.*connection is back/)).toBeTruthy()
    first.unmount()
    offline.mockRestore()

    reply = READ_ONLY
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(screen.getByText(/1 later sale is waiting behind it/)).toBeTruthy()
    expect(screen.queryByText(/connection is back/)).toBeNull()
  })

  it('shows a refused sale with its number, reason and retry, and retrying files it with the same key', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-1')
    reply = READ_ONLY
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(true)} />))

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('1 sale could not be filed')
    expect(alert.textContent).toContain('NZW-T01-INV-2026-000013')
    expect(alert.textContent).toContain('The subscription is read-only')
    expect(alert.textContent).toContain('0.210')
    expect(screen.queryByRole('button', { name: /take it off/ })).toBeNull()

    reply = () =>
      new Response(JSON.stringify({ saleId: 's-1', invoiceNumber: 'NZW-T01-INV-2026-000013' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(queuedFor('till-1')).toEqual([]))
    expect(posts.filter((key) => key === 'pos-sale-key-panel-1').length).toBe(3) // offline, refused, filed
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('nothing removes a sale: a final refusal stays open, tells a manager what to do, and offers no new invoice', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-2')
    reply = () => problem(422, { code: 'SIMPLIFIED_INVOICE_LIMIT' })
    noteTillServer(TILL)
    await flushQueue('till-1')

    render(wrap(<PosQueuePanel till={READY(true)} />))
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('Correct it if you can')
    expect(text).not.toMatch(/by hand|new invoice|take it off/i)
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Try again'])
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  it('never shows the sealed buyer ID on a refused sale, to a manager or anyone else', async () => {
    setPosVault(memoryVault(true))
    try {
      const civilId = '98765432'
      await submitSale(
        TILL,
        {
          ...BODY,
          customer: {
            kind: 'CONSUMER',
            consumer: {
              name: 'Salim Al Harthy',
              contact: '+968 9123 4567',
              identifierScheme: 'CID',
              identifierValue: civilId,
            },
          },
        },
        'pos-sale-key-panel-sealed',
      )
      reply = () => problem(422, { code: 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL' })
      await flushQueue('till-1')
      expect(queuedFor('till-1')[0]).toMatchObject({ final: true, sealed: true })
      const { container } = render(wrap(<PosQueuePanel till={READY(true)} />))
      fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.queue.correct') }))
      expect(container.innerHTML).not.toContain(civilId)
      expect(window.localStorage.getItem('fawtir.pos.queue')).not.toContain(civilId)
    } finally {
      setPosVault(null)
    }
  })

  it('someone who cannot manage tills sees that a sale could not be filed, and asks a manager', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-5')
    reply = READ_ONLY
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(false)} />))
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('1 sale could not be filed')
    expect(text).toContain('Ask a manager')
    expect(text).not.toContain('read-only')
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('on a server without the skip it says later sales must wait, and offers no set aside', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-6')
    reply = () => problem(422, { code: 'SIMPLIFIED_INVOICE_LIMIT' })
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(screen.getByRole('alert').textContent).toContain('cannot be filed until')
    expect(screen.queryByRole('button', { name: /Set aside/ })).toBeNull()
  })

  it('a manager corrects the payments and sends again: same key, same number', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-7')
    reply = () =>
      problem(422, { code: 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL', expected: 0.21, received: 0.5 })
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(true)} />))
    fireEvent.click(screen.getByRole('button', { name: 'Correct the payment' }))
    fireEvent.change(screen.getByLabelText('Cash'), { target: { value: '0.21' } })
    let sent: PosSaleRequest | null = null
    reply = () =>
      new Response(JSON.stringify({ saleId: 's-1', invoiceNumber: 'NZW-T01-INV-2026-000013' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    const fetcher = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }))
    await waitFor(() => expect(queuedFor('till-1')).toEqual([]))
    const last = fetcher.mock.calls.filter((call) => String(call[0]) === '/api/v1/pos/sales').pop()!
    sent = JSON.parse(String((last[1] as RequestInit).body)) as PosSaleRequest
    expect(sent.invoiceNumber).toBe('NZW-T01-INV-2026-000013')
    expect(sent.payments[0]).toMatchObject({ amount: 0.21 })
    expect(posts[posts.length - 1]).toBe('pos-sale-key-panel-7')
  })

  // Q-27 (owner P0-3; replaces the set-aside flow test). A till saying `openNumbers: true`, from a
  // forged answer or an #831 backend, no longer opens the set-aside UI or asks for the server's list.
  it('a till saying openNumbers offers no set aside and never asks for the open numbers (N-R8b)', async () => {
    const skipping = { ...TILL, openNumbers: true } as PosTillDto
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        urls.push(url)
        if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
          posts.push(new Headers(init.headers).get('Idempotency-Key') ?? '')
          return reply()
        }
        return new Response('', { status: 404 })
      }),
    )
    await submitSale(skipping, BODY, 'pos-sale-key-panel-8')
    await submitSale(skipping, BODY, 'pos-sale-key-panel-9')
    reply = () => problem(422, { code: 'SIMPLIFIED_INVOICE_LIMIT' })
    noteTillServer(skipping)
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={{ ...READY(true), till: skipping }} />))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set aside' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.queue.orderHint'))).toBeTruthy()
    expect(urls.some((url) => url.includes('/pos/open-numbers'))).toBe(false)
    // Strict order: the second sale was never sent past the refused first.
    expect(posts.length).toBeGreaterThan(0)
    expect(posts.every((key) => key === 'pos-sale-key-panel-8')).toBe(true)
    expect(queuedFor('till-1').map((entry) => entry.key)).toEqual([
      'pos-sale-key-panel-8',
      'pos-sale-key-panel-9',
    ])
    expect(queuedFor('till-1').every((entry) => entry.setAside === undefined)).toBe(true)
  })

  // NF7R / A8-G6: an earlier build's set-aside flag is this device's word only. It reads as a device
  // note, never as the server's "Set aside: <reason>", and the marker Try again leaves keeps it.
  it('a legacy set-aside entry reads as a device note, and still does after Try again (N-R2h)', async () => {
    const number = 'NZW-T01-INV-2026-000013'
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        {
          key: 'pos-sale-key-panel-legacy',
          tillId: 'till-1',
          number,
          body: { ...BODY, queuedOffline: true, invoiceNumber: number },
          refusal: 'SIMPLIFIED_INVOICE_LIMIT',
          final: true,
          setAside: true,
          madeBy: { userId: 'u-1', name: 'Maryam' },
        },
      ]),
    )
    // The panel draws the queue as last synced; this read takes the stored copy.
    expect(queuedFor('till-1')).toHaveLength(1)
    render(wrap(<PosQueuePanel till={READY(true)} />))

    const note = i18n.t('pos.queue.setAsideSeenNote')
    expect(screen.getByText(note)).toBeTruthy()
    expect(screen.queryByText(/Still not filed/)).toBeNull()

    reply = () => problem(409, { code: 'POS_TILL_NUMBER_REPEATED' })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(posts).toEqual(['pos-sale-key-panel-legacy']))
    await waitFor(() => expect(queuedFor('till-1')[0].refusal).toBe('POS_TILL_NUMBER_REPEATED'))
    const [entry] = queuedFor('till-1')
    expect(entry.setAside).toBeUndefined()
    expect(entry.setAsideSeen).toBe(true)
    expect(await screen.findByText(note)).toBeTruthy()
    expect(screen.queryByText(/Still not filed/)).toBeNull()
  })

  it('a refusal that carries figures shows them in its sentence', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-4')
    reply = () =>
      problem(422, { code: 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL', expected: 0.21, received: 0.5 })
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(true)} />))
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('0.500')
    expect(text).toContain('0.210')
    expect(text).not.toContain('{{')
  })

  // NOT RUN (static only). Backend 8f04050ab (HS Slice B): a full invoice held for lines that state
  // neither goods nor services. It stays listed and says what it is held for, and never points the
  // cashier at the item's HS code for this sale, which would not clear it.
  it('a sale held for undeclared lines stays listed, names the lines and says it will not clear by itself', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-gs')
    reply = () =>
      problem(422, {
        code: 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
        lines: [1, 2],
        invoiceNumber: 'NZW-T01-INV-2026-000013',
        state: 'PENDING_VALIDATION',
      })
    await flushQueue('till-1')
    render(wrap(<PosQueuePanel till={READY(true)} />))
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain(i18n.t('pos.queue.reason.POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED'))
    expect(text).toContain(i18n.t('pos.queue.goodsOrServiceLines', { lines: '1, 2' }))
    expect(text).toContain(i18n.t('pos.queue.goodsOrServiceHint'))
    expect(text).not.toContain(i18n.t('pos.queue.hsCodeHint'))
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  // Backend dbcd51ae9 (HS-B-TILL-STALL): a held line that cites an item and states nothing itself is
  // cured by classifying the item; any other held line keeps the old hint.
  describe('which hint a held undeclared line gets (HS-STALL-WEB-HINT)', () => {
    const line = (lineNumber: number, extra: Record<string, unknown> = {}) => ({
      lineNumber,
      description: `Line ${lineNumber}`,
      unitCode: 'C62',
      quantity: 1,
      unitPrice: 0.1,
      ...extra,
    })
    async function heldWith(lines: object[], key: string) {
      await submitSale(TILL, { ...BODY, draft: { lines } as never }, key)
      reply = () =>
        problem(422, {
          code: 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
          lines: [1, 2],
          invoiceNumber: 'NZW-T01-INV-2026-000013',
          state: 'PENDING_VALIDATION',
        })
      await flushQueue('till-1')
      render(wrap(<PosQueuePanel till={READY(true)} />))
      return screen.getByRole('alert').textContent ?? ''
    }

    it('lines citing an item and stating nothing say to classify the item, then Try again', async () => {
      const text = await heldWith(
        [
          line(1, { productId: 'p-1', productCode: 'P-1' }),
          line(2, {
            productId: 'p-2',
            productCode: 'P-2',
            classification: { goodsOrService: null, hsCode: null, serviceTypeCode: null },
          }),
        ],
        'pos-sale-key-panel-gs-item',
      )
      expect(text).toContain(i18n.t('pos.queue.goodsOrServiceItemHint'))
      expect(text).toMatch(/goods or a service in the catalogue/)
      // HS-W1: an item marked as goods with no HS code would meet the HS-code hold next.
      expect(text).toMatch(/item marked as goods its HS code/)
      expect(text).toMatch(/then press Try again/)
      expect(text).not.toContain(i18n.t('pos.queue.goodsOrServiceHint'))
      expect(text).toContain(i18n.t('pos.queue.goodsOrServiceLines', { lines: '1, 2' }))
      expect(queuedFor('till-1')).toHaveLength(1)
    })

    it('a typed line with no item keeps the old hint', async () => {
      const text = await heldWith(
        [line(1, { productId: 'p-1', productCode: 'P-1' }), line(2)],
        'pos-sale-key-panel-gs-typed',
      )
      expect(text).toContain(i18n.t('pos.queue.goodsOrServiceHint'))
      expect(text).not.toContain(i18n.t('pos.queue.goodsOrServiceItemHint'))
    })

    it('a line stating something of its own keeps the old hint', async () => {
      const text = await heldWith(
        [
          line(1, { productId: 'p-1', productCode: 'P-1' }),
          line(2, { productId: 'p-2', productCode: 'P-2', classification: { serviceTypeCode: 'X' } }),
        ],
        'pos-sale-key-panel-gs-own',
      )
      expect(text).toContain(i18n.t('pos.queue.goodsOrServiceHint'))
      expect(text).not.toContain(i18n.t('pos.queue.goodsOrServiceItemHint'))
    })

    it('a held line this device does not have keeps the old hint', async () => {
      const text = await heldWith(
        [line(1, { productId: 'p-1', productCode: 'P-1' })],
        'pos-sale-key-panel-gs-missing',
      )
      expect(text).toContain(i18n.t('pos.queue.goodsOrServiceHint'))
      expect(text).not.toContain(i18n.t('pos.queue.goodsOrServiceItemHint'))
    })

    it('has the item hint in Arabic too', () => {
      expect(i18n.exists('pos.queue.goodsOrServiceItemHint', { lng: 'ar', fallbackLng: false })).toBe(true)
    })
  })

  it('says it in Arabic too, with the number left to right', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-3')
    reply = READ_ONLY
    await flushQueue('till-1')
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    render(wrap(<PosQueuePanel till={READY(true)} />))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('الاشتراك للقراءة فقط')
    expect(screen.getByText('NZW-T01-INV-2026-000013').getAttribute('dir')).toBe('ltr')
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeTruthy()
  })
})

// NOT RUN (batch 43, static only). Owner round 5, P3b: the maker kept on the device decides only which
// session sends an entry by itself; anyone else sends it by an explicit Send for.
describe("a sale someone else made on this till (owner round 5, P3b)", () => {
  const filed = () =>
    new Response(JSON.stringify({ saleId: 's-1', invoiceNumber: 'NZW-T01-INV-2026-000013' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  const SALIM = { userId: 'u-2', name: 'Salim' }

  it('is never sent by this session, is listed apart, and goes only by Send for its maker', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-other-1', [], undefined, SALIM)
    expect(queuedFor('till-1')[0].madeBy).toEqual(SALIM)
    reply = filed
    const tried = posts.length
    await flushQueue('till-1')
    expect(posts.length).toBe(tried)

    render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(screen.queryByText(/is waiting to be sent/)).toBeNull()
    expect(screen.getByText(/is not sent by itself/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send for Salim' }))
    await waitFor(() => expect(queuedFor('till-1')).toEqual([]))
    expect(posts.slice(tried)).toEqual(['pos-sale-key-other-1'])
  })

  it('the maker is kept on the device only: it is never in the body that is sent', async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''))
        throw new TypeError('Failed to fetch')
      }),
    )
    await submitSale(TILL, BODY, 'pos-sale-key-other-2', [], undefined, SALIM)
    await flushQueue('till-1', { sender: 'u-2' })
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body).not.toContain('madeBy')
      expect(body).not.toContain('u-2')
      expect(body).not.toContain('Salim')
    }
  })

  it('an entry queued before makers were kept goes by neither session, only by its explicit action', async () => {
    window.localStorage.setItem(
      'fawtir.pos.queue',
      JSON.stringify([
        {
          key: 'pos-sale-key-old',
          tillId: 'till-1',
          number: 'NZW-T01-INV-2026-000013',
          body: { ...BODY, queuedOffline: true, invoiceNumber: 'NZW-T01-INV-2026-000013' },
          refusal: null,
        },
      ]),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: 'fawtir.pos.queue' }))
    reply = filed
    await flushQueue('till-1', { sender: 'u-1' })
    await flushQueue('till-1', { sender: 'u-2' })
    expect(posts).toEqual([])

    render(wrap(<PosQueuePanel till={READY(true)} />))
    fireEvent.click(screen.getByRole('button', { name: 'Send (who made it was not recorded)' }))
    await waitFor(() => expect(queuedFor('till-1')).toEqual([]))
    expect(posts).toEqual(['pos-sale-key-old'])
  })

  it("a manager sees a colleague's refused sale with Send for, not Try again", async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-other-3', [], undefined, SALIM)
    reply = READ_ONLY
    await flushQueue('till-1', { explicitKey: 'pos-sale-key-other-3' })
    render(wrap(<PosQueuePanel till={READY(true)} />))
    expect(screen.getByRole('alert').textContent).toContain('The subscription is read-only')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send for Salim' })).toBeTruthy()
    expect(screen.getByText(/Sending it files it with you as the sender/)).toBeTruthy()
  })
})

describe('a queued sale too large to send (K30)', () => {
  it('shows it kept on its number as too large, with the hint, and Try again only', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-large')
    reply = () =>
      new Response(
        JSON.stringify({
          type: 'https://api.fawtir.om/problems/payload-too-large',
          title: 'Payload Too Large',
          status: 413,
        }),
        { status: 413, headers: { 'Content-Type': 'application/problem+json' } },
      )
    noteTillServer(TILL)
    await flushQueue('till-1')

    render(wrap(<PosQueuePanel till={READY(true)} />))
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('NZW-T01-INV-2026-000013')
    expect(text).toContain(i18n.t('pos.queue.reason.tooLarge'))
    expect(text).toContain(i18n.t('pos.queue.tooLargeHint'))
    expect(text).not.toContain(i18n.t('pos.queue.finalHint'))
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Try again'])
    expect(queuedFor('till-1')).toHaveLength(1)
  })
})
