import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import type { PosSaleRequest, PosTillDto } from '../../api/pos/pos'
import {
  flushQueue,
  markQueuedSaleSetAside,
  noteTillServer,
  queuedFor,
  resetPosQueue,
  submitSale,
} from '../../lib/posQueue'
import type { TillState } from '../../lib/posTill'
import { memoryVault, setPosVault } from '../../lib/posVault'
import { PosQueuePanel } from './PosQueuePanel'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

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
    await submitSale(TILL, BODY, 'pos-sale-key-panel-legacy')
    reply = () => problem(422, { code: 'SIMPLIFIED_INVOICE_LIMIT' })
    await flushQueue('till-1')
    // An earlier build's record, as it would have written it.
    markQueuedSaleSetAside('pos-sale-key-panel-legacy')
    render(wrap(<PosQueuePanel till={READY(true)} />))

    const note = i18n.t('pos.queue.setAsideSeenNote')
    expect(screen.getByText(note)).toBeTruthy()
    expect(screen.queryByText(/Still not filed/)).toBeNull()

    const before = posts.length
    reply = () => problem(409, { code: 'POS_TILL_NUMBER_REPEATED' })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(posts.slice(before)).toEqual(['pos-sale-key-panel-legacy']))
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
