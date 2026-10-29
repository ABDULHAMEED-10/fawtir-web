import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { blankRuleForm, ruleRequest } from '../../lib/catalogRules'
import { PriceRulesPage } from './PriceRulesPage'
import { NewRulePage } from './NewRulePage'
import { tomorrowInMuscat } from './priceRuleAccess'

/**
 * Catalog › Price rules on `/v1/price-rules` (backend PRs #795, #796, #799, #800): a new rule is
 * created off with an Idempotency-Key, a change names the version it read, going live below cost
 * asks first and then sends `acknowledgeBelowCost: true`, "Pause it" sends `{enabled: false,
 * pauseUntil}`, and the options the first version lacks are drawn but cannot be chosen.
 */

const who = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const RULE = {
  id: 'r-1',
  name: 'Wholesale beans',
  kind: 'VOLUME',
  enabled: true,
  archived: false,
  archivedAt: null,
  validFrom: '2026-08-01',
  validTo: null,
  priority: 100,
  targets: [{ type: 'GROUP', id: 'g-beans', productId: null }],
  countedAs: 'ACROSS_TARGETS',
  countPer: 'INVOICE',
  tiers: [
    { fromQty: 1, toQty: 9, priceEach: 9.5, percentOff: null },
    { fromQty: 10, toQty: null, priceEach: 8, percentOff: null },
  ],
  extrasOnly: false,
  windows: [],
  customers: null,
  offer: null,
  branchIds: [],
  atTheTill: true,
  showOnInvoice: true,
  stacks: false,
  version: 3,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  runningNow: true,
  used: 88,
  givenAway: 612.4,
  broughtIn: 4118,
  pausedUntil: null,
  belowCostAcknowledged: null,
  belowCost: null,
}

const BELOW = [
  {
    productId: 'p-beans',
    variantId: null,
    branchId: 'b-main',
    averageCost: 8.4,
    price: 8,
    lossEach: 0.4,
    fromQtys: [10],
  },
]

const REPORT = {
  from: '2026-07-31',
  to: '2026-10-28',
  branchId: null,
  currency: 'OMR',
  rules: [],
  totals: {
    rules: 1,
    runningNow: 1,
    used: 88,
    givenAway: 612.4,
    broughtIn: 4118,
    taxableSales: 17000,
    shareOfSalesPercent: 3.6,
  },
}

let fetchMock: ReturnType<typeof vi.fn>
let permissions: string[]
let writeReplies: Response[]

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      ((init as RequestInit | undefined)?.method ?? 'GET') === method &&
      String(url).startsWith(prefix),
  )
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  permissions = ['product.read', 'product.manage', 'customer.read']
  writeReplies = []
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(who(permissions))
    if (url === '/api/v1/branches')
      return json([{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE', city: null }])
    if (url === '/api/v1/catalog/groups')
      return json({
        groups: [
          { id: 'g-beans', name: 'Beans', nameAr: null, sortOrder: 0, version: 0, kinds: [] },
        ],
      })
    if (url.startsWith('/api/v1/price-rules/report')) return json(REPORT)
    if (method !== 'GET' && url.startsWith('/api/v1/price-rules')) {
      return writeReplies.shift() ?? json({ ...RULE, version: 4, belowCost: [] })
    }
    if (url.startsWith('/api/v1/price-rules/r-1')) return json(RULE)
    if (url.startsWith('/api/v1/price-rules')) return json({ items: [RULE], from: '', to: '' })
    if (url.startsWith('/api/v1/products/')) return json({ id: 'p-beans', name: 'Coffee beans' })
    return json({ type: 'about:blank' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/catalog/rules" element={<PriceRulesPage />} />
        <Route path="/catalog/rules/new" element={<NewRulePage />} />
        <Route path="/catalog/rules/:ruleId/edit" element={<NewRulePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a new price rule', () => {
  it("is created off, with an Idempotency-Key and the kind's own fields, stacks false", async () => {
    renderAt('/catalog/rules/new?copy=r-1')
    expect(await screen.findByDisplayValue('Wholesale beans (copy)')).toBeTruthy()
    writeReplies = [json({ ...RULE, id: 'r-2', enabled: false, version: 0, belowCost: [] }, 201)]
    fireEvent.click(screen.getByRole('button', { name: 'Save without switching on' }))
    await waitFor(() => expect(calls('POST', '/api/v1/price-rules')).toHaveLength(1))
    const [post] = calls('POST', '/api/v1/price-rules')
    expect(String(post[0])).toBe('/api/v1/price-rules')
    expect((post[1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^price-rule-[0-9a-f-]{36}$/),
    })
    const body = bodyOf(post)
    expect(body).toMatchObject({
      name: 'Wholesale beans (copy)',
      kind: 'VOLUME',
      targets: [{ type: 'GROUP', id: 'g-beans' }],
      countedAs: 'ACROSS_TARGETS',
      countPer: 'INVOICE',
      tiers: [
        { fromQty: 1, toQty: 9, priceEach: 9.5, percentOff: null },
        { fromQty: 10, toQty: null, priceEach: 8, percentOff: null },
      ],
      extrasOnly: false,
      atTheTill: true,
      showOnInvoice: true,
      stacks: false,
      priority: 100,
    })
    expect(body).not.toHaveProperty('offer')
    expect(body).not.toHaveProperty('windows')
    expect(body).not.toHaveProperty('acknowledgeBelowCost')
  })

  it('draws "Buy one, get something", per month or year and stacking as Coming later, not choosable', async () => {
    renderAt('/catalog/rules/new')
    const buyOne = (await screen.findByRole('button', {
      name: /Buy one, get something/,
    })) as HTMLButtonElement
    expect(buyOne.disabled).toBe(true)
    expect(buyOne.textContent).toContain('Coming later')
    const stacks = screen.getByRole('switch', {
      name: 'Let it stack with other rules',
    }) as HTMLButtonElement
    expect(stacks.disabled).toBe(true)
    // Whatever is on the form, the body never asks for what the first version refuses.
    const request = ruleRequest({
      ...blankRuleForm('2026-10-29'),
      name: 'X',
      targets: [{ type: 'ALL', id: null, label: '' }],
    })
    expect(request.stacks).toBe(false)
    expect(request.countPer).toBe('INVOICE')
    expect(request.kind).toBe('VOLUME')
  })
})

describe('changing a price rule', () => {
  it('sends the version it read', async () => {
    renderAt('/catalog/rules/r-1/edit')
    const name = await screen.findByDisplayValue('Wholesale beans')
    fireEvent.change(name, { target: { value: 'Wholesale beans 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/price-rules/r-1')).toHaveLength(1))
    const [put] = calls('PUT', '/api/v1/price-rules/r-1')
    expect(String(put[0])).toBe('/api/v1/price-rules/r-1?expectedVersion=3')
    expect(bodyOf(put)).toMatchObject({ name: 'Wholesale beans 2026', stacks: false })
  })

  it('shows what sells below cost and goes live only when told to, with acknowledgeBelowCost', async () => {
    renderAt('/catalog/rules/r-1/edit')
    const name = await screen.findByDisplayValue('Wholesale beans')
    fireEvent.change(name, { target: { value: 'Wholesale beans cheap' } })
    writeReplies = [
      json(
        {
          type: 'https://api.fawtir.om/problems/validation-failed',
          status: 422,
          code: 'PRICE_RULE_BELOW_COST',
          items: BELOW,
        },
        422,
      ),
      json({
        ...RULE,
        version: 4,
        belowCost: BELOW,
        belowCostAcknowledged: { by: 'u-1', at: '2026-10-29T08:00:00Z' },
      }),
    ]
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('This sells below what it cost you')).toBeTruthy()
    expect(await within(dialog).findByText('Coffee beans')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go live anyway' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/price-rules/r-1')).toHaveLength(2))
    const [first, second] = calls('PUT', '/api/v1/price-rules/r-1')
    expect(bodyOf(first)).not.toHaveProperty('acknowledgeBelowCost')
    expect(bodyOf(second)).toMatchObject({
      name: 'Wholesale beans cheap',
      acknowledgeBelowCost: true,
    })
  })
})

describe('the rule list', () => {
  it('shows the figures and pauses a rule until a date', async () => {
    renderAt('/catalog/rules')
    expect(await screen.findByText('Wholesale beans')).toBeTruthy()
    expect(screen.getByText('88 times')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'This rule' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Pause it until a date/ }))
    const dialog = await screen.findByRole('dialog')
    writeReplies = [
      json({ ...RULE, enabled: false, pausedUntil: tomorrowInMuscat(), version: 4, belowCost: [] }),
    ]
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause it' }))
    await waitFor(() => expect(calls('POST', '/api/v1/price-rules/r-1/switch')).toHaveLength(1))
    const [post] = calls('POST', '/api/v1/price-rules/r-1/switch')
    expect(String(post[0])).toBe('/api/v1/price-rules/r-1/switch?expectedVersion=3')
    expect(bodyOf(post)).toEqual({ enabled: false, pauseUntil: tomorrowInMuscat() })
  })

  it('offers no change to someone who may only read the rules', async () => {
    permissions = ['product.read']
    renderAt('/catalog/rules')
    expect(await screen.findByText('Wholesale beans')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /New rule/ })).toBeNull()
    expect(
      (screen.getByRole('switch', { name: 'Wholesale beans' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('words a read-only subscription refusal as the subscription, not a conflict', async () => {
    renderAt('/catalog/rules')
    expect(await screen.findByText('Wholesale beans')).toBeTruthy()
    writeReplies = [
      json(
        {
          type: 'https://api.fawtir.om/problems/subscription-restricted',
          status: 409,
          code: 'SUBSCRIPTION_SUSPENDED',
          action: 'CHANGE_PRICE_RULES',
        },
        409,
      ),
    ]
    fireEvent.click(screen.getByRole('switch', { name: 'Wholesale beans' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(i18n.t('apiErrors.subscriptionRestricted.suspended'))
  })
})
