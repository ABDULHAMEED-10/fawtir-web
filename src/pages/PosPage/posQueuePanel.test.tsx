import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import type { PosSaleRequest, PosTillDto } from '../../api/pos/pos'
import {
  flushQueue,
  noteTillServer,
  queuedFor,
  resetPosQueue,
  submitSale,
} from '../../lib/posQueue'
import type { TillState } from '../../lib/posTill'
import { PosQueuePanel } from './PosQueuePanel'

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
    can: { sell: true, close: true, refund },
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
    const { container } = render(<PosQueuePanel till={READY(true)} />)
    expect(container.innerHTML).toBe('')
  })

  it('a sale waiting for the connection is one quiet line', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-0')
    render(<PosQueuePanel till={READY(true)} />)
    expect(screen.getByText(/1 sale is waiting to be sent/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a refused sale with its number, reason and retry, and retrying files it with the same key', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-1')
    reply = READ_ONLY
    await flushQueue('till-1')
    render(<PosQueuePanel till={READY(false)} />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('1 sale made offline has not been filed')
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

    render(<PosQueuePanel till={READY(true)} />)
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('ask a manager')
    expect(text).not.toMatch(/by hand|new invoice|take it off/i)
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Try again'])
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  it('a refusal that carries figures shows them in its sentence', async () => {
    await submitSale(TILL, BODY, 'pos-sale-key-panel-4')
    reply = () =>
      problem(422, { code: 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL', expected: 0.21, received: 0.5 })
    await flushQueue('till-1')
    render(<PosQueuePanel till={READY(true)} />)
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
    render(<PosQueuePanel till={READY(true)} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('الاشتراك للقراءة فقط')
    expect(screen.getByText('NZW-T01-INV-2026-000013').getAttribute('dir')).toBe('ltr')
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeTruthy()
  })
})
