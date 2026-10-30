import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api/inflight'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { describeApiFailure } from '../../lib/apiFailure'
import { toDraftRequest, blankDraftForm, type DraftLine } from '../../lib/invoiceDraft'
import { lineFromBundleLine } from '../../lib/productLine'
import { ApiError } from '../../api'
import { CreateInvoicePage } from './CreateInvoicePage'

/** A bundle in the invoice picker (E2E 30 Oct 2026, H-2, step 33e): 2.000 as 1.280 at 5% + 0.720 at 0%. */

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
  code: 'PKG-1',
  name: 'Breakfast',
  description: null,
  defaultUnitCode: 'C62',
  defaultUnitPrice: 2,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  active: true,
  version: 0,
  itemKind: 'BUNDLE',
  ...overrides,
})

const part = (id: string, name: string, unitPrice: number, category: string, rate: number) => ({
  productId: id,
  variantId: null,
  productCode: id.toUpperCase(),
  description: `Breakfast: ${name}`,
  unitCode: 'C62',
  quantity: 1,
  unitPrice,
  discount: { type: 'PERCENTAGE', value: 0 },
  taxCategory: {
    code: category,
    en16931Category: category,
    rate,
    exemptionReason: null,
    exemptionReasonCode: category === 'Z' ? 'VATZR-OM-01' : null,
  },
  classification: { goodsOrService: 'G', hsCode: '090111000000', serviceTypeCode: null },
  bundleId: 'p-1',
})

let answer: unknown

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  forgetSubscriptionStanding()
  answer = {
    bundleId: 'p-1',
    split: true,
    splitBecause: 'VAT_TREATMENTS_DIFFER',
    lines: [part('coffee', 'Coffee', 1.28, 'S', 5), part('beans', 'Beans', 0.72, 'Z', 0)],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, WRITER)
      if (url === '/api/v1/branches')
        return json(200, [
          { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
        ])
      if (url.startsWith('/api/v1/bundles/p-1/invoice-lines')) return json(200, answer)
      if (url.startsWith('/api/v1/products'))
        return json(200, { content: [product({})], page: 0, size: 20, totalElements: 1 })
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

async function pickBundle() {
  render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter initialEntries={['/invoices/new']}>
        <Routes>
          <Route path="/invoices/new" element={<CreateInvoicePage />} />
        </Routes>
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /Pick from catalogue/ }))
  fireEvent.click(await screen.findByRole('option', { name: /Breakfast/ }))
}

const descriptions = () =>
  screen.getAllByLabelText('Description').map((input) => (input as HTMLInputElement).value)

describe('a bundle picked on an invoice line', () => {
  it('becomes one line per part when its parts differ in VAT', async () => {
    await pickBundle()
    await waitFor(() => expect(descriptions()).toEqual(['Breakfast: Coffee', 'Breakfast: Beans']))
    expect(screen.getAllByText(/one part of a bundle/).length).toBe(2)
  })

  it('stays one line when they share a VAT treatment', async () => {
    answer = { bundleId: 'p-1', split: false, splitBecause: null, lines: [] }
    await pickBundle()
    await waitFor(() => expect(descriptions()).toEqual(['Breakfast']))
    expect(screen.queryByText(/one part of a bundle/)).toBeNull()
  })

  it('sends each part with its own VAT, price and bundleId', () => {
    const lines = (answer as { lines: never[] }).lines.map((line, index): DraftLine => ({
      id: `l-${index}`,
      ...lineFromBundleLine(SEEDED_REFERENCE.taxCategories, line),
      exemptionReason: '',
      quantity: '1',
    }))
    const request = toDraftRequest(
      SEEDED_REFERENCE,
      { ...blankDraftForm(SEEDED_REFERENCE.taxCategories), customerType: 'business', lines },
      true,
    )
    expect(
      request.lines.map((line) => [
        line.productId,
        line.bundleId,
        line.unitPrice,
        line.taxCategory.en16931Category,
        line.taxCategory.exemptionReasonCode,
      ]),
    ).toEqual([
      ['coffee', 'p-1', 1.28, 'S', null],
      ['beans', 'p-1', 0.72, 'Z', 'VATZR-OM-01'],
    ])
  })

  it('words a bundle still on one line at issue', () => {
    const error = new ApiError({
      status: 422,
      problemType: 'validation-failed',
      code: 'BUNDLE_SPLIT_REQUIRED',
    })
    expect(describeApiFailure(error).key).toBe('invoiceDraft.bundleSplitRequired')
  })
})
