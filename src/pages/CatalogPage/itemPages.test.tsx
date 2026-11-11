import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ItemSellsPage } from './ItemSellsPage'
import { ItemUsedPage } from './ItemUsedPage'
import { ItemChangesPage } from './ItemChangesPage'
import { productUsagePath, productSalesPath } from '../../api/catalog/insights'

const PRODUCT = {
  id: 'p-flat',
  code: 'FLT-1',
  name: 'Flat White',
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 1.333,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 1,
  kindId: 'k-milk',
  sizes: [{ id: 's-r', name: 'Regular', nameAr: null, priceDelta: 0, sortOrder: 0 }],
  addOns: [],
}

const GROUPS = {
  groups: [
    {
      id: 'g-drinks',
      name: 'Brewed drinks',
      nameAr: null,
      sortOrder: 0,
      version: 0,
      kinds: [
        {
          id: 'k-milk',
          groupId: 'g-drinks',
          name: 'Milk coffee',
          nameAr: null,
          sortOrder: 0,
          version: 0,
        },
      ],
    },
  ],
}

const figures = (units: number) => ({ units, revenue: units * 1.333, sales: units })

const SALES = {
  productId: 'p-flat',
  from: '2025-10-29',
  to: '2026-10-28',
  interval: 'DAY',
  branchId: null,
  currency: 'OMR',
  total: figures(30),
  averagePrice: 1.333,
  returnedUnits: 0,
  returnedRevenue: 0,
  till: figures(24),
  invoice: figures(6),
  // Monday 5 Oct sold most; Saturday 10 Oct least.
  series: [
    { start: '2026-10-05', units: 20, revenue: 26.66, sales: 18, tillUnits: 16, invoiceUnits: 4 },
    { start: '2026-10-10', units: 10, revenue: 13.33, sales: 9, tillUnits: 8, invoiceUnits: 2 },
  ],
  variants: [
    { variantId: 'v-r', code: 'FLT-1-R', name: 'Regular', units: 21, revenue: 28 },
    { variantId: 'v-l', code: 'FLT-1-L', name: 'Large', units: 9, revenue: 15 },
  ],
  addOns: [{ addOnId: 'a-1', name: 'Extra shot', quantity: 10, revenue: 3 }],
}

const usageRow = (kind: string, number: string | null, extra: Record<string, unknown> = {}) => ({
  kind,
  documentId: `doc-${number ?? kind}`,
  number,
  date: '2026-10-20',
  state: 'ISSUED',
  customerId: null,
  customerName: 'Nizwa Souq Café',
  branchId: null,
  quantity: 2,
  lineValue: 2.666,
  currency: 'OMR',
  ...extra,
})

const COUNTS = { INVOICE: 2, QUOTATION: 1, TILL_SALE: 3 }

const HISTORY = {
  content: [
    {
      id: 'h-1',
      occurredAt: '2026-10-20T09:12:00Z',
      action: 'ProductUpdated',
      categories: ['PRICE'],
      actorId: 'u-1',
      actorType: 'USER',
      actorName: 'Hafidh Saif',
      changes: [
        { field: 'defaultUnitPrice', branchId: null, branchName: null, from: '1.238', to: '1.333' },
      ],
    },
    {
      id: 'h-2',
      occurredAt: '2026-10-10T09:12:00Z',
      action: 'ProductUpdated',
      categories: ['TAX'],
      actorId: 'u-1',
      actorType: 'USER',
      actorName: 'Yusuf Al Balushi',
      changes: [
        { field: 'defaultTaxCategory', branchId: null, branchName: null, from: 'Z', to: 'S' },
      ],
    },
  ],
  page: 0,
  size: 20,
  hasMore: false,
  productCreatedAt: '2026-03-14T10:02:00Z',
  productCreatedBy: 'u-1',
  productCreatedByName: 'Hafidh Saif',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const calls = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') {
        return json({
          userId: 'u',
          username: 'o',
          tenantId: 't',
          roles: [],
          permissions: ['product.read'],
          scopes: [],
          featureFlags: {},
        })
      }
      if (url === '/api/v1/branches') return json([])
      if (url === '/api/v1/catalog/groups') return json(GROUPS)
      if (url === '/api/v1/products/p-flat') return json(PRODUCT)
      if (url.startsWith('/api/v1/products/p-flat/sales')) return json(SALES)
      if (url.startsWith('/api/v1/products/p-flat/history')) return json(HISTORY)
      if (url.startsWith('/api/v1/products/p-flat/usage')) {
        const kinds = new URL(url, 'http://x').searchParams.getAll('kind')
        const rows = [
          usageRow('INVOICE', 'INV-2038'),
          usageRow('QUOTATION', 'QT-0121'),
          usageRow('INVOICE', null, { state: 'DRAFT' }),
          usageRow('TILL_SALE', 'POS-1', { quantity: 1, lineValue: 1.333, date: '2026-10-01' }),
          usageRow('TILL_SALE', 'POS-2', { quantity: 3, lineValue: 3.999, date: '2026-10-03' }),
          usageRow('TILL_SALE', 'POS-3', { quantity: 2, lineValue: 2.666, date: '2026-10-02' }),
        ].filter((row) => kinds.length === 0 || kinds.includes(row.kind))
        return json({
          content: rows,
          page: 0,
          size: 20,
          totalElements: rows.length,
          counts: COUNTS,
        })
      }
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/catalog/:id/sells" element={<ItemSellsPage />} />
        <Route path="/catalog/:id/used" element={<ItemUsedPage />} />
        <Route path="/catalog/:id/changes" element={<ItemChangesPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('How it sells on /products/{id}/sales', () => {
  it('reads the year day by day and draws the API figures, rolled up', async () => {
    open('/catalog/p-flat/sells')
    expect(await screen.findByText(i18n.t('itemSells.soldEach.month'))).toBeTruthy()
    expect(screen.getAllByText('Flat White').length).toBeGreaterThan(0)
    const sales = calls().find((url) => url.startsWith('/api/v1/products/p-flat/sales'))!
    const query = new URL(sales, 'http://x').searchParams
    expect(query.get('interval')).toBe('DAY')
    expect(query.get('from')).toBeTruthy()
    expect(query.get('to')).toBeTruthy()
    // The group and kind are named from the catalogue groups.
    expect(screen.getByText(/Brewed drinks › Milk coffee · FLT-1/)).toBeTruthy()
    // Till and invoice: 24 and 6 of 30.
    expect(screen.getByText('24 · 80%')).toBeTruthy()
    expect(screen.getByText('6 · 20%')).toBeTruthy()
    // Busiest Monday, quietest of the weekdays with sales.
    const busiest = screen.getByText(i18n.t('itemSells.busiestDay')).parentElement!
    expect(busiest.textContent).toContain('Monday')
    // The most popular size, worked out from `variants`.
    expect(screen.getByText(/Regular is 70%/)).toBeTruthy()
    // The latest changes come from the history.
    expect(calls()).toContain('/api/v1/products/p-flat/history?size=4')
    expect(screen.getAllByText(i18n.t('itemHistory.action.ProductUpdated')).length).toBeGreaterThan(
      0,
    )
  })

  it('prints the rial sign, never "OMR", in the add-on note', async () => {
    open('/catalog/p-flat/sells')
    const note = (await screen.findByText(/from extra shot alone/)).closest('p, div')!
    expect(note.querySelector('svg')).toBeTruthy()
    const page = document.body.cloneNode(true) as HTMLElement
    page.querySelectorAll('.sr-only').forEach((node) => node.remove())
    expect(page.textContent).not.toMatch(/OMR/)
  })

  it('asks for a shorter window when the period changes', async () => {
    open('/catalog/p-flat/sells')
    await screen.findByText(i18n.t('itemSells.soldEach.month'))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('itemSells.yearly') }))
    fireEvent.click(screen.getByRole('option', { name: i18n.t('itemSells.monthly') }))
    expect(await screen.findByText(i18n.t('itemSells.soldEach.day'))).toBeTruthy()
    expect(productSalesPath('p-flat', { interval: 'DAY' })).toBe(
      '/v1/products/p-flat/sales?interval=DAY',
    )
  })
})

describe('Where it has been used on /products/{id}/usage', () => {
  it('lists the documents and rolls the till rows it read into one line', async () => {
    open('/catalog/p-flat/used')
    expect(await screen.findByText('INV-2038')).toBeTruthy()
    // The documents: every kind but the till, counted by the server.
    expect(calls()).toContain(
      '/api/v1/products/p-flat/usage?kind=INVOICE&kind=CREDIT_NOTE&kind=DEBIT_NOTE&kind=QUOTATION&kind=ORDER_FORM&kind=DELIVERY_NOTE&kind=PERIODIC&size=20',
    )
    expect(calls()).toContain('/api/v1/products/p-flat/usage?kind=TILL_SALE&size=100')
    // Three till sales, 1 + 3 + 2 units and 1.333 + 3.999 + 2.666.
    const till = screen
      .getByText(i18n.t('itemUsed.receiptsRolledUp', { count: '3' }))
      .closest('tr')!
    expect(within(till).getByText('6')).toBeTruthy()
    expect(within(till).getByText('7.998')).toBeTruthy()
    // A draft has no number yet.
    expect(screen.getByText(i18n.t('itemUsed.noNumber'))).toBeTruthy()
    expect(screen.getByRole('link', { name: 'INV-2038' }).getAttribute('href')).toBe(
      '/invoices/doc-INV-2038',
    )
  })

  it('lists the till sales one by one on their own tab', async () => {
    open('/catalog/p-flat/used')
    await screen.findByText('INV-2038')
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${i18n.t('itemUsed.tab.tillReceipts')}`) }),
    )
    expect(await screen.findByText('POS-2')).toBeTruthy()
    expect(calls()).toContain(
      productUsagePath('p-flat', { kinds: ['TILL_SALE'], size: 20 }).replace('/v1', '/api/v1'),
    )
  })
})

describe('Changes on /products/{id}/history', () => {
  it('shows each change from and to, with money at three decimals and codes in words', async () => {
    open('/catalog/p-flat/changes')
    expect(await screen.findByText('Hafidh Saif')).toBeTruthy()
    expect(calls()).toContain('/api/v1/products/p-flat/history?size=20')
    expect(await screen.findByText('1.238')).toBeTruthy()
    expect(screen.getByText('1.333')).toBeTruthy()
    expect(screen.getByText(i18n.t('catalogReal.category.Z'))).toBeTruthy()
    // Older items begin at their creation, from the product row.
    expect(screen.getByText(i18n.t('itemChanges.recordedFromNow'))).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${i18n.t('itemChanges.tab.tax')}`) }),
    )
    expect(screen.queryByText('1.238')).toBeNull()
    expect(screen.getByText(i18n.t('catalogReal.category.Z'))).toBeTruthy()
  })
})
