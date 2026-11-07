import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { resetSharedRequests } from '../../api'
import { StockPage } from './StockPage'
import { StockDetailPage } from './StockDetailPage'

const reader = (permissions: string[], extra: Partial<Entitlements> = {}): Entitlements => ({
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
  ...extra,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const BRANCHES = [
  { id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' },
  { id: 'b-seeb', code: 'SEEB', name: 'Seeb', type: 'BRANCH' },
]

const ROW = {
  productId: 'p-beans',
  variantId: 'v-1kg',
  code: 'BEAN-1K',
  name: 'Coffee Beans',
  nameAr: 'حبوب قهوة',
  variantName: '1 kg',
  variantRetired: false,
  productActive: true,
  keepCount: true,
  unitCode: 'KGM',
  onHand: 6,
  reorderLevel: 15,
  state: 'LOW',
  perDay: 3.1,
  daysLeft: 1,
  averageCost: 7.4,
  lastCost: 7.5,
  worth: 44.4,
  sellingPrice: 16.3,
  onOrder: [],
  supplier: { supplierId: 's-1', name: 'Muscat Roastery' },
  lastMovementAt: '2026-10-26T09:00:00Z',
  lastCountedAt: '2026-10-20T06:00:00Z',
  version: 3,
}

const SUMMARY = {
  branchId: 'b-main',
  counted: 5,
  notCounted: 2,
  worth: 8412.6,
  runningLow: 4,
  nothingLeft: 0,
  belowZero: 0,
  needsOrdering: 4,
  sittingStill: 1,
  lastSevenDays: {
    from: '2026-10-22',
    to: '2026-10-28',
    sold: 164,
    received: 48,
    writtenOff: 6,
    corrected: 0,
    returned: 0,
  },
}

const DETAIL = {
  ...ROW,
  daily: [
    { date: '2026-10-27', onHandEnd: 9, sold: 2, received: 0, writtenOff: 0 },
    { date: '2026-10-28', onHandEnd: 6, sold: 3, received: 0, writtenOff: 0 },
  ],
  lastReceipt: null,
  leadDays: 6,
  usualOrderQuantity: 25,
  movements: { content: [], page: 0, size: 20, totalElements: 0 },
  dependsOnIt: null,
}

const MOVEMENTS = {
  content: [
    {
      id: 'm1',
      type: 'WRITE_OFF',
      quantityChange: -1,
      onHandAfter: 6,
      countedQuantity: null,
      unitCost: 7.4,
      averageCostAfter: null,
      source: { type: 'WRITE_OFF', id: 'a-1', number: 'STK-1', link: null },
      supplier: null,
      reasonCode: 'DAMAGED',
      note: null,
      occurredAt: '2026-10-28T08:00:00Z',
      recordedAt: '2026-10-28T08:00:00Z',
      by: { userId: 'u-1', name: 'Yusuf' },
      customerKind: null,
    },
  ],
  page: 0,
  size: 20,
  totalElements: 1,
}

let permissions: string[]
let extra: Partial<Entitlements>
let branchesRefused: boolean
/** What `GET /v1/branches` answers a reader without `branch.read` (B5-C3): only id and name. */
let branchesProjection: unknown[] | null
let summary: typeof SUMMARY
let detail: typeof DETAIL
let movements: { content: unknown[]; page: number; size: number; totalElements: number }

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  permissions = ['stock.read', 'stock.adjust', 'stock.manage']
  extra = {}
  branchesRefused = false
  branchesProjection = null
  summary = SUMMARY
  detail = DETAIL
  movements = MOVEMENTS
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(reader(permissions, extra))
      if (url === '/api/v1/branches') {
        return branchesRefused
          ? json(
              {
                type: 'https://api.fawtir.om/problems/forbidden',
                status: 403,
                detail: 'Missing required permission: branch.read',
              },
              403,
            )
          : json(branchesProjection ?? BRANCHES)
      }
      if (init.method === 'POST' && url === '/api/v1/stock/counts')
        return json({ adjustmentId: 'a', number: 'STK-2026-000123', kind: 'COUNT', lines: [] }, 201)
      if (init.method === 'POST' && url === '/api/v1/stock/write-offs')
        return json(
          { adjustmentId: 'a', number: 'STK-2026-000124', kind: 'WRITE_OFF', lines: [] },
          201,
        )
      if (init.method === 'PUT' && url.startsWith('/api/v1/stock/items/'))
        return json({ ...ROW, reorderLevel: 19, version: 4 })
      if (url.startsWith('/api/v1/stock/summary')) return json(summary)
      if (url.startsWith('/api/v1/stock/items/p-beans/movements')) return json(movements)
      if (url.startsWith('/api/v1/stock/items/p-beans')) return json(detail)
      if (url.includes('status=BELOW_ZERO')) {
        return json({
          branchId: 'b-main',
          page: 0,
          size: 1,
          totalElements: 1,
          content: [{ ...ROW, onHand: -1, state: 'BELOW_ZERO' }],
        })
      }
      if (url.startsWith('/api/v1/stock')) {
        return json({ branchId: 'b-main', page: 0, size: 20, totalElements: 41, content: [ROW] })
      }
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const requests = () =>
  vi.mocked(fetch).mock.calls.map(([url, init]) => ({ url: String(url), init }))

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stock" element={<StockPage />} />
        <Route path="/stock/:id" element={<StockDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Stock list', () => {
  it('reads the working branch’s list and summary, and pages from the server', async () => {
    open('/stock')
    expect(await screen.findByText('Coffee Beans · 1 kg')).toBeTruthy()
    const urls = requests().map((r) => r.url)
    expect(urls).toContain('/api/v1/stock?branchId=b-main&size=20')
    expect(urls).toContain('/api/v1/stock/summary?branchId=b-main')
    // The summary feeds the cards: worth at what you paid, and the last seven days moved.
    expect(screen.getByText('8,412.600')).toBeTruthy()
    expect(screen.getByText('218')).toBeTruthy()
    expect(screen.getByText('Showing 1 of 41')).toBeTruthy()
  })

  it('sends the tab as the server status', async () => {
    open('/stock')
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.click(screen.getAllByRole('button', { name: /Needs ordering/ })[0])
    await waitFor(() =>
      expect(requests().map((r) => r.url)).toContain(
        '/api/v1/stock?branchId=b-main&status=NEEDS_ORDERING&size=20',
      ),
    )
  })

  it('counts the shelves with an idempotency key, in the working branch', async () => {
    open('/stock')
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.click(screen.getByRole('button', { name: 'Count the shelves' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Counted: Coffee Beans · 1 kg'), {
      target: { value: '5' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save the count' }))
    await screen.findByText(/Count STK-2026-000123 saved/)
    const post = requests().find((r) => r.url === '/api/v1/stock/counts')!
    expect(JSON.parse(String(post.init!.body))).toEqual({
      branchId: 'b-main',
      lines: [{ productId: 'p-beans', variantId: 'v-1kg', countedQuantity: 5 }],
    })
    expect((post.init!.headers as Record<string, string>)['Idempotency-Key']).toMatch(
      /^stock-[A-Za-z0-9._:-]{10,}$/,
    )
  })

  it('writes the selection off with a reason', async () => {
    open('/stock')
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Coffee Beans · 1 kg' }))
    fireEvent.click(screen.getByRole('button', { name: 'Write stock off' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('How many: Coffee Beans · 1 kg'), {
      target: { value: '2' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Write off' }))
    await screen.findByText(/Write-off STK-2026-000124 saved/)
    const post = requests().find((r) => r.url === '/api/v1/stock/write-offs')!
    expect(JSON.parse(String(post.init!.body))).toEqual({
      branchId: 'b-main',
      reasonCode: 'DAMAGED',
      lines: [{ productId: 'p-beans', variantId: 'v-1kg', quantity: 2 }],
    })
  })

  it('hides what the session cannot do, and stays open to a read-only reader', async () => {
    permissions = ['stock.read']
    open('/stock')
    await screen.findByText('Coffee Beans · 1 kg')
    expect(screen.queryByRole('button', { name: 'Count the shelves' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record what came in' })).toBeNull()
    // Nothing to do with a ticked row, so no box to tick (retest N-3).
    expect(screen.queryByRole('checkbox', { name: 'Coffee Beans · 1 kg' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Write stock off' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change the reorder level' })).toBeNull()
    // No purchase order without purchase-order.manage: the running-low row opens its movements.
    expect(screen.queryByRole('link', { name: 'Order now' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Movements' })).toBeTruthy()
  })

  it('offers Order now and Order from to whoever may raise a purchase order', async () => {
    permissions = ['stock.read', 'stock.adjust', 'purchase-order.manage']
    open('/stock')
    await screen.findByText('Coffee Beans · 1 kg')
    expect(screen.getByRole('link', { name: 'Order now' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Coffee Beans · 1 kg' }))
    expect(screen.getByRole('link', { name: 'Order from Muscat Roastery' })).toBeTruthy()
  })

  it('counts an item sold below zero under Nothing left, and names it (retest N-4)', async () => {
    summary = { ...SUMMARY, nothingLeft: 0, belowZero: 1 }
    open('/stock')
    expect(await screen.findByText(/Coffee Beans · 1 kg sold below zero/)).toBeTruthy()
    expect(requests().map((r) => r.url)).toContain(
      '/api/v1/stock?branchId=b-main&status=BELOW_ZERO&size=1',
    )
  })

  it('hides the writes when the plan has stock switched off', async () => {
    extra = { planFeaturesEnforced: true, planFeatures: { stock: false } }
    open('/stock')
    await screen.findByText('Coffee Beans · 1 kg')
    expect(screen.queryByRole('button', { name: 'Count the shelves' })).toBeNull()
  })

  it('opens for a View-only reader on the branch the scoped list gives them, from id and name only (B5-C3)', async () => {
    permissions = ['stock.read', 'pos.read']
    extra = { allBranches: false, branchIds: ['b-seeb'] }
    branchesProjection = [{ id: 'b-seeb', name: 'Seeb' }]
    open('/stock')
    expect(await screen.findByText('Coffee Beans · 1 kg')).toBeTruthy()
    const urls = requests().map((r) => r.url)
    expect(urls).toContain('/api/v1/stock?branchId=b-seeb&size=20')
    expect(urls).toContain('/api/v1/stock/summary?branchId=b-seeb')
    expect(screen.queryByText(i18n.t('appAccess.noAccess'))).toBeNull()
    expect(screen.queryByRole('button', { name: 'Count the shelves' })).toBeNull()
  })

  it('has no working branch when the branch list is refused, and reads no stock for a guessed one (B5-C3)', async () => {
    permissions = ['stock.read', 'pos.read']
    extra = { allBranches: false, branchIds: ['b-seeb'] }
    branchesRefused = true
    open('/stock')
    // The refusal is shown as it is; nothing stands in for the branch the server would not name.
    expect(await screen.findByText(i18n.t('appAccess.noAccess'))).toBeTruthy()
    expect(requests().map((r) => r.url)).toContain('/api/v1/branches')
    expect(screen.queryByText('Coffee Beans · 1 kg')).toBeNull()
    expect(requests().some((r) => r.url.startsWith('/api/v1/stock'))).toBe(false)
  })

  it('says so without stock.read, and reads nothing', async () => {
    permissions = []
    open('/stock')
    expect(await screen.findByText(i18n.t('appAccess.noAccess'))).toBeTruthy()
    expect(requests().some((r) => r.url.startsWith('/api/v1/stock'))).toBe(false)
  })
})

describe('Stock item', () => {
  it('reads the item and its movements for the variant, in words', async () => {
    open('/stock/p-beans?variant=v-1kg')
    expect(await screen.findByText('Written off')).toBeTruthy()
    expect(screen.getByText(/Damaged · Yusuf/)).toBeTruthy()
    const urls = requests().map((r) => r.url)
    expect(urls).toContain('/api/v1/stock/items/p-beans?branchId=b-main&variantId=v-1kg')
    expect(urls).toContain(
      '/api/v1/stock/items/p-beans/movements?branchId=b-main&variantId=v-1kg&size=20',
    )
    // 3.1 a day over a 6-day wait is 19, above the level of 15.
    expect(screen.getByText('19 would be safer')).toBeTruthy()
  })

  it('sets the safer level with the row’s version', async () => {
    open('/stock/p-beans?variant=v-1kg')
    fireEvent.click(await screen.findByRole('button', { name: 'Set the level to 19' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save the level' }))
    await screen.findByText('Reorder level saved.')
    const put = requests().find((r) => r.init?.method === 'PUT')!
    expect(put.url).toBe(
      '/api/v1/stock/items/p-beans/reorder-level?branchId=b-main&variantId=v-1kg',
    )
    expect(JSON.parse(String(put.init!.body))).toEqual({ reorderLevel: 19, expectedVersion: 3 })
  })

  it('does not say nothing came in beside a delivery that has not sold yet, nor time it at midnight (E2E F-10)', async () => {
    detail = {
      ...DETAIL,
      perDay: 0,
      daily: [
        { date: '2026-10-27', onHandEnd: 0, sold: 0, received: 0, writtenOff: 0 },
        { date: '2026-10-28', onHandEnd: 20, sold: 0, received: 20, writtenOff: 0 },
      ],
      lastReceipt: {
        receivedOn: '2026-10-28',
        quantity: 20,
        unitCost: 2.5,
        supplierId: 's-1',
        supplierName: 'Muscat Roastery',
      },
    } as unknown as typeof DETAIL
    movements = {
      ...MOVEMENTS,
      content: [
        {
          ...MOVEMENTS.content[0],
          id: 'm2',
          type: 'RECEIPT',
          quantityChange: 20,
          onHandAfter: 20,
          reasonCode: null,
          source: { type: 'DELIVERY', id: 'd-1', number: 'DLV-1', link: null },
          // Recorded against the day it came in: midnight in Muscat; entered at 14:05.
          occurredAt: '2026-10-27T20:00:00Z',
          recordedAt: '2026-10-28T10:05:00Z',
        },
      ],
    }
    open('/stock/p-beans?variant=v-1kg')
    expect(await screen.findByText(/have not sold yet/)).toBeTruthy()
    expect(screen.queryByText(i18n.t('stockItem.live.chartNoteNone'))).toBeNull()
    expect(await screen.findByText('14:05')).toBeTruthy()
    expect(screen.queryByText('00:00')).toBeNull()
  })

  it('hides Change without stock.manage', async () => {
    permissions = ['stock.read']
    open('/stock/p-beans?variant=v-1kg')
    await screen.findByText('Written off')
    // Order more raises a purchase order: not for a reader (retest N-3).
    expect(screen.queryByRole('link', { name: 'Order more' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Correct the count' })).toBeNull()
  })
})
