import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { resetSharedRequests } from '../../api'
import { StockPage } from './StockPage'
import { StockOpeningPage } from './StockOpeningPage'

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

const BRANCHES = [{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' }]

const base = {
  variantRetired: false,
  productActive: true,
  keepCount: true,
  opening: null,
  lockedBy: null,
  lockedAt: null,
}

const BEANS = {
  ...base,
  productId: 'p-beans',
  variantId: 'v-1kg',
  code: 'BEAN',
  variantCode: 'BEAN-1K',
  name: 'Coffee Beans',
  nameAr: 'حبوب قهوة',
  variantName: '1 kg',
  unitCode: 'KGM',
  state: 'NOT_SET',
  onHand: null,
}

const CUPS = {
  ...base,
  productId: 'p-cups',
  variantId: null,
  code: 'CUP-500',
  variantCode: null,
  name: 'Takeaway cups',
  nameAr: null,
  variantName: null,
  unitCode: 'H87',
  state: 'NOT_SET',
  onHand: null,
}

const SYRUP = {
  ...base,
  productId: 'p-syrup',
  variantId: null,
  code: 'SYR-VAN',
  variantCode: null,
  name: 'Vanilla syrup',
  nameAr: null,
  variantName: null,
  unitCode: 'H87',
  state: 'LOCKED',
  onHand: 11,
  opening: {
    quantity: 12,
    unitCost: 2.9,
    value: 34.8,
    number: 'OPN-2026-000001',
    setAt: '2026-10-20T06:00:00Z',
    setBy: { userId: 'u-1', name: 'Yusuf' },
  },
  lockedBy: 'SALE',
  lockedAt: '2026-10-21T09:00:00Z',
}

const SUMMARY = {
  branchId: 'b-main',
  counted: 0,
  notCounted: 3,
  worth: 0,
  runningLow: 0,
  nothingLeft: 0,
  belowZero: 0,
  needsOrdering: 0,
  sittingStill: 0,
  lastSevenDays: {
    from: '2026-10-23',
    to: '2026-10-29',
    sold: 0,
    received: 0,
    writtenOff: 0,
    corrected: 0,
    returned: 0,
  },
}

const page = (content: unknown[]) => ({
  branchId: 'b-main',
  page: 0,
  size: 50,
  totalElements: content.length,
  content,
})

let permissions: string[]
let extra: Partial<Entitlements>
let postAnswer: () => Response
let importAnswer: () => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  permissions = ['stock.read', 'stock.adjust', 'stock.manage']
  extra = {}
  postAnswer = () =>
    json(
      {
        adjustmentId: 'a',
        number: 'OPN-2026-000002',
        kind: 'OPENING',
        lines: [{ productId: 'p-beans', variantId: 'v-1kg', onHandAfter: 20, movementId: 'm' }],
      },
      201,
    )
  importAnswer = () =>
    json(
      {
        adjustmentId: 'a',
        number: 'OPN-2026-000003',
        kind: 'OPENING',
        lines: [
          { row: 2, productId: 'p-beans', variantId: 'v-1kg', onHandAfter: 5, movementId: 'm1' },
          { row: 3, productId: 'p-cups', variantId: null, onHandAfter: 9, movementId: 'm2' },
        ],
      },
      201,
    )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(reader(permissions, extra))
      if (url === '/api/v1/branches') return json(BRANCHES)
      if (init.method === 'POST' && url === '/api/v1/stock/opening') return postAnswer()
      if (init.method === 'POST' && url.startsWith('/api/v1/stock/opening/import'))
        return importAnswer()
      if (url.startsWith('/api/v1/stock/opening/import-format'))
        return new Response('code,opening_quantity\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      if (url.startsWith('/api/v1/stock/opening')) {
        const state = new URL(url, 'http://x').searchParams.get('state')
        const rows = [BEANS, CUPS, SYRUP].filter((row) => row.state === state)
        return json(page(rows))
      }
      if (url.startsWith('/api/v1/stock/summary')) return json(SUMMARY)
      if (url.startsWith('/api/v1/stock'))
        return json({ branchId: 'b-main', page: 0, size: 20, totalElements: 0, content: [] })
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const requests = () =>
  vi.mocked(fetch).mock.calls.map(([url, init]) => ({ url: String(url), init }))

const open = (path = '/stock/opening') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stock" element={<StockPage />} />
        <Route path="/stock/opening" element={<StockOpeningPage />} />
        <Route path="/stock/:id" element={<p>Item page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('Opening stock', () => {
  it('reads the working branch’s rows that are not set yet', async () => {
    open()
    expect(await screen.findByText('Coffee Beans · 1 kg')).toBeTruthy()
    const urls = requests().map((r) => r.url)
    expect(urls).toContain('/api/v1/stock/opening?branchId=b-main&state=NOT_SET&size=50')
    expect(urls).toContain('/api/v1/stock/opening?branchId=b-main&state=LOCKED&size=1')
    expect(screen.getByText('BEAN / BEAN-1K').getAttribute('dir')).toBe('ltr')
  })

  it('saves every typed line at once, with an idempotency key kept for a retry', async () => {
    let calls = 0
    postAnswer = () => {
      calls += 1
      // The first answer is lost on the way back; the retry sends the same key.
      return calls === 1
        ? json({ type: 'https://api.fawtir.om/problems/internal-error' }, 503)
        : json(
            {
              adjustmentId: 'a',
              number: 'OPN-2026-000002',
              kind: 'OPENING',
              lines: [
                { productId: 'p-beans', variantId: 'v-1kg', onHandAfter: 20, movementId: 'm' },
                { productId: 'p-cups', variantId: null, onHandAfter: 300, movementId: 'n' },
              ],
            },
            201,
          )
    }
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.change(screen.getByLabelText('Opening quantity: Coffee Beans · 1 kg'), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('Cost each: Coffee Beans · 1 kg'), {
      target: { value: '7.4' },
    })
    fireEvent.change(screen.getByLabelText('Opening quantity: Takeaway cups'), {
      target: { value: '300' },
    })
    // The value follows what is typed.
    expect(screen.getByText('148.000')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save opening stock' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Save opening stock' }))
    await screen.findByText(
      'Opening stock OPN-2026-000002 saved: 2 lines set. The figures are updated.',
    )

    const posts = requests().filter(
      (r) => r.init?.method === 'POST' && r.url === '/api/v1/stock/opening',
    )
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String(posts[1].init!.body))).toEqual({
      branchId: 'b-main',
      items: [
        { productId: 'p-beans', variantId: 'v-1kg', quantity: 20, unitCost: 7.4 },
        { productId: 'p-cups', quantity: 300 },
      ],
    })
    const keyOf = (i: number) =>
      (posts[i].init!.headers as Record<string, string>)['Idempotency-Key']
    expect(keyOf(0)).toMatch(/^stock-[A-Za-z0-9._:-]{10,}$/)
    expect(keyOf(1)).toBe(keyOf(0))
  })

  it('takes a new key when the figures change after a refusal', async () => {
    postAnswer = () => json({ type: 'https://api.fawtir.om/problems/internal-error' }, 503)
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    const field = screen.getByLabelText('Opening quantity: Coffee Beans · 1 kg')
    fireEvent.change(field, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save opening stock' }))
    await screen.findByRole('alert')
    fireEvent.change(field, { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save opening stock' }))
    await waitFor(() =>
      expect(
        requests().filter((r) => r.init?.method === 'POST' && r.url === '/api/v1/stock/opening'),
      ).toHaveLength(2),
    )
    const keys = requests()
      .filter((r) => r.init?.method === 'POST')
      .map((r) => (r.init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys[1]).not.toBe(keys[0])
  })

  it('marks the refused line in words and saves nothing', async () => {
    postAnswer = () =>
      json(
        {
          type: 'https://api.fawtir.om/problems/resource-conflict',
          code: 'STOCK_OPENING_LOCKED',
          errors: [
            {
              row: 2,
              column: null,
              productId: 'p-cups',
              variantId: null,
              code: 'STOCK_OPENING_LOCKED',
              message: 'use a count',
            },
          ],
        },
        409,
      )
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.change(screen.getByLabelText('Opening quantity: Coffee Beans · 1 kg'), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('Opening quantity: Takeaway cups'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save opening stock' }))
    expect(
      await screen.findByText('Nothing was saved. Fix the lines marked in red and save again.'),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('stock.refused.openingLocked'))).toBeTruthy()
    expect(screen.queryByText('use a count')).toBeNull()
  })

  it('refuses a cost without a quantity before sending anything', async () => {
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.change(screen.getByLabelText('Cost each: Coffee Beans · 1 kg'), {
      target: { value: '7' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save opening stock' }))
    expect(
      await screen.findByText('An item has a cost but no quantity. Type its quantity too.'),
    ).toBeTruthy()
    expect(requests().some((r) => r.init?.method === 'POST')).toBe(false)
  })

  it('shows locked rows read only, saying what locked them, with a way to count', async () => {
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.click(screen.getByRole('button', { name: /Locked/ }))
    expect(await screen.findByText('Locked by its first sale: use a count')).toBeTruthy()
    expect(screen.queryByLabelText('Opening quantity: Vanilla syrup')).toBeNull()
    expect(screen.getByText('34.800')).toBeTruthy()
    const count = screen.getByRole('link', { name: 'Count' })
    expect(count.getAttribute('href')).toBe('/stock/p-syrup')
  })

  it('imports a spreadsheet and lists each refused row and column', async () => {
    importAnswer = () =>
      json(
        {
          type: 'https://api.fawtir.om/problems/validation-failed',
          code: 'STOCK_OPENING_INVALID',
          errors: [
            {
              row: 4,
              column: 'opening_quantity',
              productId: null,
              variantId: null,
              code: 'STOCK_QUANTITY_INVALID',
              message: 'bad',
            },
            {
              row: 7,
              column: 'code',
              productId: null,
              variantId: null,
              code: 'STOCK_ITEM_NOT_FOUND',
              message: 'missing',
            },
          ],
        },
        400,
      )
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.click(screen.getByRole('button', { name: 'Import from a spreadsheet' }))
    const dialog = await screen.findByRole('dialog')
    const picker = dialog.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['code,opening_quantity\nBEAN,x\n'], 'opening.csv', {
      type: 'text/csv',
    })
    fireEvent.change(picker, { target: { files: [file] } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    expect(
      await within(dialog).findByText(
        'Nothing was imported. Fix these rows in the file and upload it again.',
      ),
    ).toBeTruthy()
    expect(within(dialog).getByText('opening_quantity')).toBeTruthy()
    expect(within(dialog).getByText('7')).toBeTruthy()
    expect(within(dialog).getByText(i18n.t('stock.refused.itemNotFound'))).toBeTruthy()
    const post = requests().find((r) => r.url.startsWith('/api/v1/stock/opening/import'))!
    expect(post.url).toBe('/api/v1/stock/opening/import?branchId=b-main')
    expect(post.init!.body).toBeInstanceOf(FormData)
    expect((post.init!.body as FormData).get('file')).toBe(file)
    expect((post.init!.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^stock-/)
  })

  it('reports an import that went through with its number and lines', async () => {
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    fireEvent.click(screen.getByRole('button', { name: 'Import from a spreadsheet' }))
    const dialog = await screen.findByRole('dialog')
    const picker = dialog.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(picker, {
      target: { files: [new File(['x'], 'opening.csv', { type: 'text/csv' })] },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    expect(
      await screen.findByText(
        'Opening stock OPN-2026-000003 saved: 2 lines set. The figures are updated.',
      ),
    ).toBeTruthy()
  })

  it('reads but cannot set when the plan has stock switched off', async () => {
    extra = { planFeaturesEnforced: true, planFeatures: { stock: false } }
    open()
    await screen.findByText('Coffee Beans · 1 kg')
    expect(screen.queryByLabelText('Opening quantity: Coffee Beans · 1 kg')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save opening stock' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Import from a spreadsheet' })).toBeNull()
  })

  it('says so without stock.adjust, and reads nothing', async () => {
    permissions = ['stock.read']
    open()
    expect(await screen.findByText(i18n.t('appAccess.noAccess'))).toBeTruthy()
    expect(requests().some((r) => r.url.startsWith('/api/v1/stock/opening'))).toBe(false)
  })

  it('is reached from the Stock page only with stock.adjust and the plan', async () => {
    const first = open('/stock')
    const link = await screen.findByRole('link', { name: 'Opening stock' })
    expect(link.getAttribute('href')).toBe('/stock/opening')
    first.unmount()

    resetSharedRequests()
    forgetEntitlements()
    permissions = ['stock.read']
    const second = open('/stock')
    await screen.findByText(i18n.t('stock.empty'))
    expect(screen.queryByRole('link', { name: 'Opening stock' })).toBeNull()
    second.unmount()

    resetSharedRequests()
    forgetEntitlements()
    permissions = ['stock.read', 'stock.adjust']
    extra = { planFeaturesEnforced: true, planFeatures: { stock: false } }
    open('/stock')
    await screen.findByText(i18n.t('stock.empty'))
    expect(screen.queryByRole('link', { name: 'Opening stock' })).toBeNull()
  })
})
