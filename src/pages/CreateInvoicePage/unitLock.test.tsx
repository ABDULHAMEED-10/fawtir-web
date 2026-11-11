import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api/inflight'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { stockLineWarningTexts, unitLockHint } from '../../lib/stockLineWarnings'
import { CreateInvoicePage } from './CreateInvoicePage'

const WRITER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'customer.read', 'product.read', 'branch.read'],
  scopes: [],
  featureFlags: {},
}

const product = (overrides: Record<string, unknown>) => ({
  id: 'p-1',
  code: 'GRD-1',
  name: 'Hand grinder',
  description: null,
  defaultUnitCode: 'H87',
  defaultUnitPrice: 24,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  active: true,
  version: 0,
  ...overrides,
})

let products: unknown[]

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  forgetSubscriptionStanding()
  products = [
    product({ keepCount: true }),
    product({ id: 'p-2', code: 'SVC-1', name: 'Barista lesson', keepCount: false }),
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, WRITER)
      if (url === '/api/v1/branches')
        return json(200, [
          { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
        ])
      if (url.startsWith('/api/v1/products'))
        return json(200, { content: products, page: 0, size: 20, totalElements: products.length })
      if (url === '/api/v1/company-profile/industrial-classification')
        return json(200, { code: '561001' })
      return json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderComposer() {
  return render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter initialEntries={['/invoices/new']}>
        <Routes>
          <Route path="/invoices/new" element={<CreateInvoicePage />} />
        </Routes>
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
}

async function pick(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: /Pick from catalogue/ }))
  fireEvent.click(await screen.findByRole('option', { name }))
}

const unitField = () => screen.getByRole('button', { name: 'Unit' }) as HTMLButtonElement

describe('the unit of a line whose product is counted', () => {
  it('is fixed to the product unit, with the hint naming it', async () => {
    renderComposer()
    await pick(/Hand grinder/)
    expect(unitField().disabled).toBe(true)
    expect(unitField().textContent).toContain('Piece')
    expect(screen.getByText('Counted in pieces, so the unit is fixed')).toBeTruthy()
  })

  it('stays editable on a typed line and on an uncounted product, and unlocks on re-pick', async () => {
    renderComposer()
    await screen.findByRole('button', { name: /Pick from catalogue/ })
    expect(unitField().disabled).toBe(false)
    await pick(/Hand grinder/)
    expect(unitField().disabled).toBe(true)
    await pick(/Barista lesson/)
    expect(unitField().disabled).toBe(false)
    expect(screen.queryByText(/so the unit is fixed/)).toBeNull()
  })
})

describe('the words for stock line warnings', () => {
  it('names each stock code by line and leaves other warnings to their own list', async () => {
    const t = i18n.t.bind(i18n)
    expect(
      stockLineWarningTexts(t, [
        { line: 2, code: 'STOCK_UNIT_MISMATCH' },
        { line: 3, code: 'STOCK_VARIANT_UNKNOWN' },
        { line: 1, code: 'ZR_NOT_ON_LIST' },
      ]),
    ).toEqual([
      'Line 2: it is in a different unit from the one the item is counted in, so no stock moved.',
      'Line 3: the item is counted by size or option and this line names none of them, so no stock moved.',
    ])
    expect(stockLineWarningTexts(t, null)).toEqual([])
  })

  it('names the unit in Arabic by its Arabic name', async () => {
    await i18n.changeLanguage('ar')
    expect(unitLockHint(i18n.t.bind(i18n), 'H87', 'ar')).toBe(
      'يُعدّ المخزون بوحدة «قطعة»، لذا الوحدة ثابتة',
    )
    expect(
      stockLineWarningTexts(i18n.t.bind(i18n), [{ line: 1, code: 'STOCK_UNIT_MISMATCH' }])[0],
    ).toContain('السطر 1')
  })
})

describe('a catalogue product that names neither goods nor service (A-12)', () => {
  const pressed = () =>
    screen
      .getAllByRole('button', { pressed: true })
      .map((button) => button.textContent)
      .filter((text) => text === 'Goods' || text === 'Service')

  it('leaves the line unchosen, even when its unit reads as a service unit', async () => {
    products = [
      product({
        id: 'p-3',
        code: 'STD-5',
        name: 'Office chair',
        defaultUnitCode: 'HUR',
        classificationGoodsOrService: null,
      }),
    ]
    renderComposer()
    await pick(/Office chair/)
    expect(pressed()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Service' }))
    expect(pressed()).toEqual(['Service'])
  })

  it('takes the product’s own classification when it has one', async () => {
    products = [product({ classificationGoodsOrService: 'S', name: 'Barista lesson', code: 'SVC-1' })]
    renderComposer()
    await pick(/Barista lesson/)
    expect(pressed()).toEqual(['Service'])
  })
})

describe('issuing a line that is neither goods nor service (A-12)', () => {
  it('asks for the choice before issue', async () => {
    const { problemsBeforeIssue } = await import('../../lib/invoiceDraft')
    const problems = problemsBeforeIssue({
      customerType: 'business',
      lines: [{ itemType: null }],
    } as unknown as Parameters<typeof problemsBeforeIssue>[0])
    expect(problems).toEqual([{ field: 'itemType', line: 0, key: 'invoiceDraft.problem.itemType' }])
    expect(i18n.t('invoiceDraft.problem.itemType')).toBe('Choose whether this line is goods or a service.')
  })
})
