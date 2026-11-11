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
 * Price rules on the invoice composer (backend PR #796): `POST /v1/price-rules/evaluate`
 * suggests a rule per catalogue line, the line saves it as `priceRuleIds` with the rule's
 * discount, the person can remove it, and `422 PRICE_RULE_NOT_APPLICABLE` is said on the line.
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

const PRODUCT = {
  id: 'p-1',
  code: 'FLT-1',
  name: 'Flat White',
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 1.6,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 0,
}

const RULE_OUTCOME = {
  lineNumber: 1,
  source: 'RULE',
  reason: 'RULE_APPLIED',
  priceRuleIds: ['r-hotels'],
  ruleName: 'Hotel accounts',
  ruleKind: 'CUSTOMER',
  showOnInvoice: true,
  discountType: 'PERCENTAGE',
  discountValue: 12,
  saving: 2.304,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let draftReply: () => Response

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      ((init as RequestInit | undefined)?.method ?? 'GET') === method &&
      String(url).startsWith(prefix),
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  forgetSubscriptionStanding()
  draftReply = () =>
    json(422, {
      type: 'https://api.fawtir.om/problems/validation-failed',
      status: 422,
      code: 'PRICE_RULE_NOT_APPLICABLE',
      line: 1,
      ruleId: 'r-hotels',
      expectedDiscount: null,
    })
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
    if (url.startsWith('/api/v1/products'))
      return json(200, { content: [PRODUCT], page: 0, size: 20, totalElements: 1 })
    if (url === '/api/v1/price-rules/evaluate' && method === 'POST')
      return json(200, { at: '2026-10-29T08:00:00Z', lines: [RULE_OUTCOME] })
    if (url === '/api/v1/invoice-drafts' && method === 'POST') return draftReply()
    return json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
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
          <Route path="/invoices/:id/edit" element={<p>edit page</p>} />
        </Routes>
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
}

async function chooseCustomerAndProduct() {
  fireEvent.click(await screen.findByRole('button', { name: 'Select customer' }))
  fireEvent.click(await screen.findByRole('option', { name: /Sohar Port Logistics/ }))
  fireEvent.click(screen.getByRole('button', { name: /Pick from catalogue/ }))
  fireEvent.click(await screen.findByRole('option', { name: /Flat White/ }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Quantity' }), { target: { value: '12' } })
}

/** The composer is heavy: under a full parallel run one test takes several seconds. */
const SLOW = 30_000

describe('price rules on the invoice composer', () => {
  it('asks /price-rules/evaluate for the lines and puts the rule on the line it suggests', async () => {
    renderComposer()
    await chooseCustomerAndProduct()
    expect(
      await screen.findByText('Price rule: Hotel accounts', {}, { timeout: 3000 }),
    ).toBeTruthy()

    const asked = calls('POST', '/api/v1/price-rules/evaluate')
    expect(bodyOf(asked[asked.length - 1])).toMatchObject({
      branchId: 'b-1',
      customerId: 'c-1',
      channel: 'INVOICE',
      lines: [{ lineNumber: 1, productId: 'p-1', quantity: 12, unitPrice: 1.6, addOn: false }],
    })

    draftReply = () => json(201, { id: 'd-1', version: 0, authoringState: 'DRAFT', lines: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    const line = bodyOf(calls('POST', '/api/v1/invoice-drafts')[0]).draft.lines[0]
    expect(line).toMatchObject({
      priceRuleIds: ['r-hotels'],
      discount: { type: 'PERCENTAGE', value: 12 },
    })
  }, SLOW)

  it('lets the person remove the suggestion, which then saves no rule and no discount', async () => {
    renderComposer()
    await chooseCustomerAndProduct()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }, { timeout: 3000 }))
    expect(screen.queryByText('Price rule: Hotel accounts')).toBeNull()
    // Asked again after a change, the removed rule stays off the line.
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity' }), { target: { value: '13' } })
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(screen.queryByText('Price rule: Hotel accounts')).toBeNull()

    draftReply = () => json(201, { id: 'd-1', version: 0, authoringState: 'DRAFT', lines: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls('POST', '/api/v1/invoice-drafts')).toHaveLength(1))
    const line = bodyOf(calls('POST', '/api/v1/invoice-drafts')[0]).draft.lines[0]
    expect(line.priceRuleIds).toBeUndefined()
    expect(line.discount).toEqual({ type: 'PERCENTAGE', value: 0 })
  }, SLOW)

  it('says on the line when the server finds the rule no longer applies', async () => {
    renderComposer()
    await chooseCustomerAndProduct()
    await screen.findByText('Price rule: Hotel accounts', {}, { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    const errors = await screen.findByTestId('line-1-errors')
    expect(errors.textContent).toContain(
      'This price rule does not apply to this line now. Remove it or change the line.',
    )
    expect(
      screen.getByText('A price rule on a line no longer applies. The line says which.'),
    ).toBeTruthy()
  }, SLOW)
})
