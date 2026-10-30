import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api/inflight'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { CreateInvoicePage } from './CreateInvoicePage'

/**
 * Price rules and the line's item (E2E 30 Oct 2026): M-1, a new item never keeps the old rule's
 * discount; M-2, an item with sizes asks about the size it sells.
 *
 * Which discount survives a change of item: one the person typed stays (and no rule replaces it);
 * a rule's and the old product's own go with the old item, and the new product's own takes over.
 */

const WRITER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'customer.read', 'product.read', 'branch.read'],
  scopes: [],
  featureFlags: {},
}

const product = (id: string, name: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: id.toUpperCase(),
  name,
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 2,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 0,
  variants: [],
  ...patch,
})

const size = (id: string, label: string, branchPrice: number) => ({
  id,
  sizeId: `s-${id}`,
  size: label,
  optionId: null,
  option: null,
  code: id.toUpperCase(),
  name: label,
  price: branchPrice,
  priceOverride: null,
  branchPrice,
  onSale: true,
})

const WATER = product('water', 'Water')
const TEA = product('tea', 'Tea')
const BEANS = product('beans', 'Beans', { defaultDiscount: { type: 'PERCENTAGE', value: 5 } })
const SIZES = [size('v-small', 'Small', 1), size('v-large', 'Large', 1.5)]
const LATTE = product('latte', 'Latte', { defaultUnitPrice: 1, variants: SIZES })
// A server that left the sizes off the list: read when picked.
const MOCHA = product('mocha', 'Mocha', { defaultUnitPrice: 1, variants: null })

const CUSTOMER = {
  id: 'c-1',
  type: 'BUSINESS',
  displayName: 'Sohar Port Logistics',
  profile: {
    details: { vatRegistrationNumber: 'OM1100999001' },
    contact: null,
    deliveryPreferences: { sendingMethod: 'PEPPOL' },
    invoiceAddress: null,
  },
  peppolDelivery: 'ACTIVE',
  invoiceEligible: true,
  missingInvoiceFields: [],
  status: 'ACTIVE',
  updatedAt: '2026-09-10T08:00:00Z',
}

const RULE = {
  source: 'RULE',
  reason: 'RULE_APPLIED',
  priceRuleIds: ['r-10'],
  ruleName: 'Ten off',
  ruleKind: 'TIERED',
  showOnInvoice: true,
  discountType: 'PERCENTAGE',
  discountValue: 10,
  saving: 0.2,
}

const NONE = (reason: string) => ({
  source: 'NONE',
  reason,
  priceRuleIds: [],
  ruleName: null,
  ruleKind: null,
  showOnInvoice: null,
  discountType: null,
  discountValue: null,
  saving: 0,
})

/** As the server: no size named on an item with sizes reads as changed by hand. */
function evaluate(line: {
  lineNumber: number
  productId: string | null
  variantId: string | null
}) {
  const answer = (() => {
    if (line.productId === 'water') return RULE
    if (line.productId === 'latte' || line.productId === 'mocha') {
      if (line.variantId === 'v-small') return RULE
      return NONE(line.variantId ? 'NO_RULE' : 'PRICE_CHANGED_BY_HAND')
    }
    return NONE('NO_RULE')
  })()
  return { lineNumber: line.lineNumber, ...answer }
}

let fetchMock: ReturnType<typeof vi.fn>
let loaded: unknown

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const posts = (prefix: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => (init as RequestInit)?.method === 'POST' && String(url) === prefix)
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  forgetSubscriptionStanding()
  loaded = null
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, WRITER)
    if (url === '/api/v1/company-profile/industrial-classification')
      return json(200, { code: '561001' })
    if (url === '/api/v1/branches')
      return json(200, [
        { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
      ])
    if (url.startsWith('/api/v1/customers?'))
      return json(200, { content: [CUSTOMER], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    if (url === '/api/v1/customers/c-1') return json(200, CUSTOMER)
    if (url === '/api/v1/products/mocha') return json(200, { ...MOCHA, variants: SIZES })
    if (url === '/api/v1/products/latte') return json(200, LATTE)
    if (url === '/api/v1/products/water') return json(200, WATER)
    if (url.startsWith('/api/v1/products'))
      return json(200, {
        content: [WATER, TEA, BEANS, LATTE, MOCHA],
        page: 0,
        size: 20,
        totalElements: 5,
      })
    if (url === '/api/v1/price-rules/evaluate' && method === 'POST') {
      const body = JSON.parse(init?.body as string)
      return json(200, { at: '2026-10-30T08:00:00Z', lines: body.lines.map(evaluate) })
    }
    if (url === '/api/v1/invoice-drafts' && method === 'POST')
      return json(201, { id: 'd-1', version: 0, authoringState: 'DRAFT', lines: [] })
    if (url === '/api/v1/invoice-drafts/d-1' && method === 'GET') return json(200, loaded)
    return json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAt(path = '/invoices/new') {
  return render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/invoices/new" element={<CreateInvoicePage />} />
          <Route path="/invoices/:id/edit" element={<CreateInvoicePage />} />
        </Routes>
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
}

async function chooseCustomer() {
  fireEvent.click(await screen.findByRole('button', { name: 'Select customer' }))
  fireEvent.click(await screen.findByRole('option', { name: /Sohar Port Logistics/ }))
}

async function pick(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: /Pick from catalogue/ }))
  fireEvent.click(await screen.findByRole('option', { name }))
}

const discount = () => (screen.getByLabelText('Discount') as HTMLInputElement).value
const lastAsked = () => posts('/api/v1/price-rules/evaluate').at(-1).lines[0]
const SLOW = 30_000

describe('changing the item on a line (M-1)', () => {
  it(
    'drops the old rule and its discount, and sends no rule',
    async () => {
      renderAt()
      await chooseCustomer()
      await pick(/Water/)
      await screen.findByText('Price rule: Ten off', {}, { timeout: 3000 })
      expect(discount()).toBe('10')

      await pick(/Tea/)
      await waitFor(() => expect(screen.queryByText('Price rule: Ten off')).toBeNull())
      expect(discount()).toBe('0')
      await waitFor(() => expect(lastAsked().productId).toBe('tea'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(discount()).toBe('0')

      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
      await waitFor(() => expect(posts('/api/v1/invoice-drafts')).toHaveLength(1))
      const sent = posts('/api/v1/invoice-drafts')[0].draft.lines[0]
      expect(sent.discount).toEqual({ type: 'PERCENTAGE', value: 0 })
      expect(sent.priceRuleIds).toBeUndefined()
    },
    SLOW,
  )

  it(
    "puts the new product's own discount in place of the old rule's",
    async () => {
      renderAt()
      await pick(/Water/)
      await screen.findByText('Price rule: Ten off', {}, { timeout: 3000 })
      await pick(/Beans/)
      await waitFor(() => expect(discount()).toBe('5'))
    },
    SLOW,
  )

  it(
    "does not keep the old product's own discount",
    async () => {
      renderAt()
      await pick(/Beans/)
      await waitFor(() => expect(discount()).toBe('5'))
      await pick(/Tea/)
      await waitFor(() => expect(discount()).toBe('0'))
    },
    SLOW,
  )

  it(
    'keeps a discount the person typed, and no rule replaces it',
    async () => {
      renderAt()
      await pick(/Tea/)
      fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '7' } })
      await pick(/Water/)
      await waitFor(() => expect(lastAsked().productId).toBe('water'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(discount()).toBe('7')
      expect(screen.queryByText('Price rule: Ten off')).toBeNull()
    },
    SLOW,
  )

  it(
    'counts a typed zero as nothing typed: the new item gets its rule',
    async () => {
      renderAt()
      await pick(/Tea/)
      fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '0' } })
      await pick(/Water/)
      await screen.findByText('Price rule: Ten off', {}, { timeout: 3000 })
      expect(discount()).toBe('10')
    },
    SLOW,
  )
})

describe('an item with sizes (M-2)', () => {
  it(
    'asks about the size, gets the rule, and sends the size by its code',
    async () => {
      renderAt()
      await chooseCustomer()
      await pick(/Latte/)
      await screen.findByText('Price rule: Ten off', {}, { timeout: 3000 })
      expect(lastAsked()).toMatchObject({ productId: 'latte', variantId: 'v-small', unitPrice: 1 })
      expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Latte · Small')

      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
      await waitFor(() => expect(posts('/api/v1/invoice-drafts')).toHaveLength(1))
      const sent = posts('/api/v1/invoice-drafts')[0].draft.lines[0]
      expect(sent).toMatchObject({
        productId: 'latte',
        productCode: 'V-SMALL',
        unitPrice: 1,
        priceRuleIds: ['r-10'],
        discount: { type: 'PERCENTAGE', value: 10 },
      })
      // The server knows a line's size by its code; the id is the screen's.
      expect(sent.variantId).toBeUndefined()
    },
    SLOW,
  )

  it(
    'asks again when the size changes, and the old size’s rule goes',
    async () => {
      renderAt()
      await pick(/Latte/)
      await screen.findByText('Price rule: Ten off', {}, { timeout: 3000 })
      fireEvent.click(screen.getByRole('button', { name: 'Size' }))
      fireEvent.click(await screen.findByRole('option', { name: /Large/ }))
      await waitFor(() => expect(lastAsked().variantId).toBe('v-large'))
      expect(lastAsked().unitPrice).toBe(1.5)
      await waitFor(() => expect(screen.queryByText('Price rule: Ten off')).toBeNull())
      expect(discount()).toBe('0')
      expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Latte · Large')
    },
    SLOW,
  )

  it(
    'leaves a description the person wrote when the size changes',
    async () => {
      renderAt()
      await pick(/Latte/)
      fireEvent.change(await screen.findByLabelText('Description'), {
        target: { value: 'Morning order' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Size' }))
      fireEvent.click(await screen.findByRole('option', { name: /Large/ }))
      await waitFor(() => expect(lastAsked().variantId).toBe('v-large'))
      expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Morning order')
    },
    SLOW,
  )

  it(
    'reads the sizes when the list left them off, and asks only then',
    async () => {
      renderAt()
      await pick(/Mocha/)
      await screen.findByText('Price rule: Ten off', {}, { timeout: 3000 })
      const asked = posts('/api/v1/price-rules/evaluate')
      expect(asked.every((body) => body.lines[0].variantId === 'v-small')).toBe(true)
    },
    SLOW,
  )

  it(
    'shows no size field on an item without sizes',
    async () => {
      renderAt()
      await pick(/Tea/)
      await waitFor(() => expect(lastAsked().productId).toBe('tea'))
      expect(screen.queryByRole('button', { name: 'Size' })).toBeNull()
    },
    SLOW,
  )

  const stored = (patch: Record<string, unknown>) => ({
    id: 'd-1',
    version: 3,
    authoringState: 'DRAFT',
    customerId: null,
    branchId: 'b-1',
    currency: 'OMR',
    invoiceNumber: null,
    details: {
      deliveryDate: null,
      subject: null,
      purchaseOrderReference: null,
      customerVisibleNote: null,
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      transactionType: 'FULL_TAX',
    },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: [
      {
        lineNumber: 1,
        productId: 'latte',
        productCode: 'V-SMALL',
        description: 'Latte · Small',
        unitCode: 'EA',
        quantity: 1,
        unitPrice: 1,
        discountType: 'PERCENTAGE',
        discountValue: 0,
        taxCategoryCode: 'S5',
        en16931Category: 'S',
        taxRate: 5,
        exemptionReason: null,
        ...patch,
      },
    ],
  })

  it(
    'finds a reopened draft line’s size by its code and keeps its rule',
    async () => {
      loaded = stored({ discountValue: 10, priceRuleIds: ['r-10'] })
      renderAt('/invoices/d-1/edit')
      await waitFor(() => expect(posts('/api/v1/price-rules/evaluate').length).toBeGreaterThan(0))
      expect(lastAsked()).toMatchObject({ productId: 'latte', variantId: 'v-small' })
      await screen.findByText(/Price rule/, {}, { timeout: 3000 })
      expect(discount()).toBe('10')
    },
    SLOW,
  )

  it(
    'never changes the price of a reopened line that names no size',
    async () => {
      loaded = stored({ productCode: 'LATTE', unitPrice: 1.25, description: 'Latte' })
      renderAt('/invoices/d-1/edit')
      await screen.findByRole('button', { name: 'Size' })
      expect(lastAskedOrNull()).toMatchObject({ variantId: null })
      expect((screen.getByLabelText(/Price/) as HTMLInputElement).value).toBe('1.250')
    },
    SLOW,
  )
})

function lastAskedOrNull() {
  return posts('/api/v1/price-rules/evaluate').at(-1)?.lines[0] ?? { variantId: null }
}
