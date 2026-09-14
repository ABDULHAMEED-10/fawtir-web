import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, peekEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SubscriptionPlan } from '../../lib/subscriptionPlans'
import { ConsolePlansPage } from './PlansPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const PLANS_URL = '/api/v1/platform/plans'
const planUrl = (code: string) => `${PLANS_URL}/${code}`
const CSRF = 'csrf-token-value'

const OPERATOR: Entitlements = {
  userId: 'u-operator',
  username: 'ops.catalogue',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform tenant administrator', systemRole: true }],
  permissions: ['platform.tenants.manage', 'platform.support.read'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}

// Figures deliberately unlike the screens' mock catalogue (19 / 49 / 89 OMR), so a figure on
// screen can only have come from the backend.
const STARTER: SubscriptionPlan = {
  code: 'STARTER',
  name: 'Starter',
  monthlyPrice: 23.5,
  invoicesPerMonth: 175,
  peopleIncluded: 3,
  extraPersonPrice: null,
  branchesIncluded: 1,
  apiAccess: false,
  prioritySupport: false,
  overagePricePerInvoice: null,
  sortOrder: 10,
  active: true,
}
const GROWTH: SubscriptionPlan = {
  code: 'GROWTH',
  name: 'Growth',
  monthlyPrice: 61.25,
  invoicesPerMonth: 2400,
  peopleIncluded: 6,
  extraPersonPrice: 4.125,
  branchesIncluded: null,
  apiAccess: true,
  prioritySupport: true,
  overagePricePerInvoice: 0.15,
  sortOrder: 20,
  active: true,
}
const LEGACY: SubscriptionPlan = { ...STARTER, code: 'LEGACY_2025', name: 'Legacy 2025', sortOrder: 30, active: false }

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string, extra: Record<string, unknown> = {}) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    detail: 'Server prose that must not be shown.',
    ...extra,
  })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([url, handler]) => [url, Array.isArray(handler) ? [...handler] : handler]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const initOf = (url: string, index = 0) => callsTo(url)[index][1] as RequestInit
const bodyOf = (url: string, index = 0) => JSON.parse(initOf(url, index).body as string) as Record<string, unknown>

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderPlans() {
  return render(
    <MemoryRouter initialEntries={['/console/plans']}>
      <Routes>
        <Route path="/console/plans" element={<ConsolePlansPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const reads = (catalogue: Handler | Handler[] = () => json(200, [STARTER, GROWTH, LEGACY])) => ({
  [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
  [PLANS_URL]: catalogue,
})

async function openCatalogue(extra: Record<string, Handler | Handler[]> = {}, catalogue?: Handler | Handler[]) {
  answer({ ...reads(catalogue), ...extra })
  renderPlans()
  await screen.findByRole('heading', { level: 3, name: 'Starter' })
}

const card = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('article') as HTMLElement
const dialog = () => screen.getByRole('dialog')
const input = (name: string) => dialog().querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const type = (name: string, value: string) => fireEvent.change(input(name), { target: { value } })
const saveButton = () =>
  within(dialog()).getByRole('button', { name: i18n.t('console.plans.save') }) as HTMLButtonElement

async function editPlan(name: string) {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('console.plans.editPlan', { name }) }))
  await screen.findByRole('dialog')
}

async function save() {
  await act(async () => {
    fireEvent.click(saveButton())
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Access', () => {
  it('reads the catalogue once for an operator who may manage it', async () => {
    await openCatalogue()

    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
    expect(callsTo(PLANS_URL)).toHaveLength(1)
    expect(initOf(PLANS_URL).method ?? 'GET').toBe('GET')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows no access, and reads nothing, without platform.tenants.manage', async () => {
    answer({
      [ENTITLEMENTS_URL]: () =>
        json(200, { ...OPERATOR, permissions: ['platform.support.read'], scopes: ['platform.support.read'] }),
    })
    renderPlans()

    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(callsTo(PLANS_URL)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: i18n.t('console.plans.add') })).toBeNull()
  })

  it('is not granted by a role name alone', async () => {
    answer({
      [ENTITLEMENTS_URL]: () =>
        json(200, {
          ...OPERATOR,
          roles: [{ id: 'r-9', code: 'PLATFORM_ADMIN', name: 'Super admin', systemRole: true }],
          permissions: ['platform.support.read'],
          scopes: [],
        }),
    })
    renderPlans()

    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(callsTo(PLANS_URL)).toHaveLength(0)
  })

  it('reads a backend 403 as no access, never as an empty catalogue', async () => {
    answer(reads(() => problem(403, 'insufficient-permission')))
    renderPlans()

    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.plans.empty'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('console.plans.add') })).toBeNull()
  })

  it('sends a 401 to sign in and forgets the cached entitlements', async () => {
    answer(reads(() => problem(401, 'unauthenticated')))
    renderPlans()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })
})

describe('Catalogue', () => {
  it('shows a loading state until the catalogue arrives', async () => {
    let release: (response: Response) => void = () => {}
    answer(reads(() => new Promise<Response>((resolve) => (release = resolve))))
    renderPlans()

    expect(await screen.findByText(i18n.t('console.plans.loading'))).toBeTruthy()
    await act(async () => release(json(200, [STARTER])))
    expect(await screen.findByRole('heading', { level: 3, name: 'Starter' })).toBeTruthy()
  })

  it('shows the backend figures, in the backend order, and none of the mock ones', async () => {
    await openCatalogue({}, () => json(200, [LEGACY, GROWTH, STARTER]))

    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(names).toEqual(['Starter', 'Growth', 'Legacy 2025'])
    expect(within(card('Starter')).getByText('23.500')).toBeTruthy()
    expect(within(card('Growth')).getByText('61.250')).toBeTruthy()
    for (const mock of ['19.000', '49.000', '89.000']) expect(document.body.textContent).not.toContain(mock)
  })

  it('marks plans that are no longer offered', async () => {
    await openCatalogue()

    expect(within(card('Starter')).getByText(i18n.t('console.plans.active'))).toBeTruthy()
    expect(within(card('Legacy 2025')).getByText(i18n.t('console.plans.inactive'))).toBeTruthy()
    expect(within(card('Legacy 2025')).getByText('LEGACY_2025')).toBeTruthy()
  })

  it('uses the singular for one person and one branch', async () => {
    await openCatalogue({}, () => json(200, [{ ...STARTER, peopleIncluded: 1 }]))

    expect(card('Starter').textContent).toContain('1 person')
    expect(card('Starter').textContent).toContain('1 branch')
    expect(card('Starter').textContent).not.toContain('1 people')
  })

  it('reads each null as the backend defines it', async () => {
    await openCatalogue()

    const starter = card('Starter').textContent ?? ''
    expect(starter).toContain(i18n.t('plan.feature.people', { count: 3 }))
    expect(starter).toContain(i18n.t('plan.feature.branches', { count: 1 }))
    expect(starter).toContain(i18n.t('plan.feature.noApi'))
    expect(starter).toContain(i18n.t('plan.feature.noOverage'))
    expect(starter).not.toContain(i18n.t('plan.feature.prioritySupport'))

    const growth = card('Growth').textContent ?? ''
    expect(growth).toContain('2,400')
    expect(growth).toContain(i18n.t('plan.feature.unlimitedBranches'))
    expect(growth).toContain(i18n.t('plan.feature.api'))
    expect(growth).toContain(i18n.t('plan.feature.prioritySupport'))
    expect(growth).toContain('4.125')
    expect(growth).toContain('0.150')
  })

  it('says so when the catalogue is empty', async () => {
    answer(reads(() => json(200, [])))
    renderPlans()

    expect(await screen.findByText(i18n.t('console.plans.empty'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('console.plans.add') })).toBeTruthy()
  })

  it.each([
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
    ['rate limiting', () => problem(429, 'rate-limited'), 'identityErrors.rateLimited'],
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch')
      },
      'identityErrors.network',
    ],
  ])('offers a retry after %s, and retries once', async (_label, failure, key) => {
    answer(reads([failure, () => json(200, [STARTER])]))
    renderPlans()

    expect(await screen.findByText(i18n.t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.access.retry') }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Starter' })).toBeTruthy()
    expect(callsTo(PLANS_URL)).toHaveLength(2)
  })

  it('reads in Arabic, right to left, with the plan data as the backend holds it', async () => {
    await i18n.changeLanguage('ar')
    await openCatalogue({}, () =>
      json(200, [{ ...STARTER, peopleIncluded: 1 }, { ...GROWTH, branchesIncluded: 5 }, { ...LEGACY, peopleIncluded: 12 }]),
    )

    expect(screen.getByRole('heading', { level: 1, name: i18n.t('console.plans.title') })).toBeTruthy()
    expect(within(card('Growth')).getByText(i18n.t('console.plans.active'))).toBeTruthy()
    // Arabic has six plural forms; a missing one falls back to English ("5 branches").
    expect(card('Starter').textContent).toContain('شخص واحد')
    expect(card('Starter').textContent).toContain('فرع واحد')
    expect(card('Growth').textContent).toContain('6 أشخاص')
    expect(card('Growth').textContent).toContain('5 فروع')
    expect(card('Legacy 2025').textContent).toContain('12 شخصًا')
    expect(document.querySelector('main')?.textContent ?? '').not.toMatch(/branch|people|person/)
    expect(i18n.t('console.plans.title')).not.toBe('Plans and rates')
  })
})

describe('Editing a plan', () => {
  it('fills the editor from the plan and fixes its code', async () => {
    await openCatalogue()
    await editPlan('Growth')

    expect(input('code').value).toBe('GROWTH')
    expect(input('code').readOnly).toBe(true)
    expect(input('monthlyPrice').value).toBe('61.250')
    expect(input('branchesIncluded').value).toBe('')
    expect(input('extraPersonPrice').value).toBe('4.125')
  })

  it('sends the whole plan once, with CSRF, keeping every field it did not touch', async () => {
    const stored = { ...GROWTH, monthlyPrice: 64 }
    await openCatalogue({ [planUrl('GROWTH')]: () => json(200, stored) })
    await editPlan('Growth')
    type('monthlyPrice', '64.000')
    await save()

    expect(callsTo(planUrl('GROWTH'))).toHaveLength(1)
    const init = initOf(planUrl('GROWTH'))
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    expect(bodyOf(planUrl('GROWTH'))).toEqual({
      name: 'Growth',
      monthlyPrice: 64,
      invoicesPerMonth: 2400,
      peopleIncluded: 6,
      extraPersonPrice: 4.125,
      branchesIncluded: null,
      apiAccess: true,
      prioritySupport: true,
      overagePricePerInvoice: 0.15,
      sortOrder: 20,
      active: true,
    })
  })

  it('shows the stored plan in place, without reading the catalogue again', async () => {
    await openCatalogue({ [planUrl('STARTER')]: () => json(200, { ...STARTER, name: 'Starter 2026', sortOrder: 40 }) })
    await editPlan('Starter')
    type('name', 'Starter 2026')
    type('sortOrder', '40')
    await save()

    expect(await screen.findByText(i18n.t('console.plans.saved', { name: 'Starter 2026' }))).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(names).toEqual(['Growth', 'Legacy 2025', 'Starter 2026'])
    expect(callsTo(PLANS_URL)).toHaveLength(1)
  })

  it('clears a limit by sending null, which the backend reads as unlimited or not offered', async () => {
    await openCatalogue({ [planUrl('STARTER')]: () => json(200, { ...STARTER, branchesIncluded: null }) })
    await editPlan('Starter')
    type('branchesIncluded', '  ')
    await save()

    const body = bodyOf(planUrl('STARTER'))
    expect(body.branchesIncluded).toBeNull()
    expect(body.extraPersonPrice).toBeNull()
    expect(body.overagePricePerInvoice).toBeNull()
    await waitFor(() => expect(card('Starter').textContent).toContain(i18n.t('plan.feature.unlimitedBranches')))
  })

  it('sends one request however often save is pressed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await openCatalogue({ [planUrl('STARTER')]: () => new Promise<Response>((resolve) => (release = resolve)) })
    await editPlan('Starter')
    await save()
    const saving = within(dialog()).getByRole('button', { name: i18n.t('console.plans.saving') }) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    fireEvent.click(saving)
    // A disabled button stops a click, not Enter: submit the form directly as a second Enter would.
    await act(async () => {
      fireEvent.submit(dialog().querySelector('form')!)
    })

    expect(callsTo(planUrl('STARTER'))).toHaveLength(1)
    await act(async () => release(json(200, STARTER)))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(callsTo(planUrl('STARTER'))).toHaveLength(1)
  })

  it.each([
    ['a negative price', 'monthlyPrice', '-1', 'console.plans.validation.money'],
    ['four decimals', 'monthlyPrice', '1.2345', 'console.plans.validation.money'],
    ['zero invoices', 'invoicesPerMonth', '0', 'console.plans.validation.atLeastOne'],
    ['a fractional people count', 'peopleIncluded', '2.5', 'console.plans.validation.whole'],
    ['zero branches', 'branchesIncluded', '0', 'console.plans.validation.atLeastOne'],
    ['an empty name', 'name', '   ', 'validation.required'],
  ])('refuses %s before sending anything', async (_label, field, value, key) => {
    await openCatalogue()
    await editPlan('Starter')
    type(field, value)
    await save()

    expect(within(dialog()).getByText(i18n.t(key))).toBeTruthy()
    expect(input(field).getAttribute('aria-invalid')).toBe('true')
    expect(callsTo(planUrl('STARTER'))).toHaveLength(0)
  })

  it('marks the field a backend validation error names, without its English text', async () => {
    await openCatalogue({
      [planUrl('STARTER')]: () =>
        problem(400, 'validation-failed', { errors: [{ field: 'name', message: 'must not be blank' }] }),
    })
    await editPlan('Starter')
    await save()

    expect(await within(dialog()).findByText(i18n.t('console.plans.validation.server'))).toBeTruthy()
    expect(input('name').getAttribute('aria-invalid')).toBe('true')
    expect(document.body.textContent).not.toContain('must not be blank')
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it.each([
    ['a plan invariant (400 without a field)', () => problem(400, 'validation-failed'), 'identityErrors.validation'],
    ['a refused permission (403)', () => problem(403, 'insufficient-permission'), 'console.access.missingPermission'],
    ['rate limiting (429)', () => problem(429, 'rate-limited'), 'identityErrors.rateLimited'],
    ['a server fault (500)', () => problem(500, 'internal-error'), 'identityErrors.service'],
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch')
      },
      'identityErrors.network',
    ],
  ])('keeps the editor open and explains %s', async (_label, failure, key) => {
    await openCatalogue({ [planUrl('STARTER')]: failure })
    await editPlan('Starter')
    await save()

    expect(await within(dialog()).findByText(i18n.t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(saveButton().disabled).toBe(false)
    expect(card('Starter').textContent).toContain('23.500')
  })

  it('leaves for sign in when the session ends mid-edit', async () => {
    await openCatalogue({ [planUrl('STARTER')]: () => problem(401, 'unauthenticated') })
    await editPlan('Starter')
    await save()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(peekEntitlements()).toBeNull()
  })

  it('discards the draft on cancel without sending it', async () => {
    await openCatalogue()
    await editPlan('Starter')
    type('monthlyPrice', '99')
    fireEvent.click(within(dialog()).getByRole('button', { name: i18n.t('common.cancel') }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(card('Starter').textContent).toContain('23.500')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('Adding a plan', () => {
  const PREMIUM: SubscriptionPlan = {
    code: 'PREMIUM_2027',
    name: 'Premium 2027',
    monthlyPrice: 120,
    invoicesPerMonth: 5000,
    peopleIncluded: 20,
    extraPersonPrice: null,
    branchesIncluded: null,
    apiAccess: true,
    prioritySupport: true,
    overagePricePerInvoice: null,
    sortOrder: 0,
    active: false,
  }

  async function fillNewPlan() {
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.plans.add') }))
    await screen.findByRole('dialog')
    type('code', 'PREMIUM_2027')
    type('name', 'Premium 2027')
    type('monthlyPrice', '120')
    type('invoicesPerMonth', '5000')
    type('peopleIncluded', '20')
    fireEvent.click(within(dialog()).getByRole('switch', { name: i18n.t('console.plans.field.apiAccess') }))
    fireEvent.click(within(dialog()).getByRole('switch', { name: i18n.t('console.plans.field.prioritySupport') }))
    fireEvent.click(within(dialog()).getByRole('switch', { name: i18n.t('console.plans.field.active') }))
  }

  it('puts the new plan under its own code, every optional field explicit', async () => {
    await openCatalogue({ [planUrl('PREMIUM_2027')]: () => json(200, PREMIUM) })
    await fillNewPlan()
    await save()

    expect(callsTo(planUrl('PREMIUM_2027'))).toHaveLength(1)
    expect(bodyOf(planUrl('PREMIUM_2027'))).toEqual({
      name: 'Premium 2027',
      monthlyPrice: 120,
      invoicesPerMonth: 5000,
      peopleIncluded: 20,
      extraPersonPrice: null,
      branchesIncluded: null,
      apiAccess: true,
      prioritySupport: true,
      overagePricePerInvoice: null,
      sortOrder: 0,
      active: false,
    })
    expect(await screen.findByRole('heading', { level: 3, name: 'Premium 2027' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 })[0].textContent).toBe('Premium 2027')
    expect(callsTo(PLANS_URL)).toHaveLength(1)
  })

  it('will not overwrite an existing plan by adding one with its code', async () => {
    await openCatalogue()
    await fillNewPlan()
    type('code', 'GROWTH')
    await save()

    expect(within(dialog()).getByText(i18n.t('console.plans.validation.codeTaken'))).toBeTruthy()
    expect(callsTo(planUrl('GROWTH'))).toHaveLength(0)
  })

  it.each(['premium', 'P', '1PLAN', 'PLAN-2027', 'A'.repeat(31)])('refuses the code %s', async (code) => {
    await openCatalogue()
    await fillNewPlan()
    type('code', code)
    await save()

    expect(within(dialog()).getByText(i18n.t('console.plans.validation.code'))).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
