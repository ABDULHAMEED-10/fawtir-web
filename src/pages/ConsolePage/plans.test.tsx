import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import type { CatalogueAdminPlan, PlanHistory, PlanVersion } from '../../lib/console/planCatalogue'
import {
  forgetEntitlements,
  peekEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'
import { ConsolePlansPage } from './PlansPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const PLANS_URL = '/api/v1/platform/plans'
const planUrl = (code: string) => `${PLANS_URL}/${code}`
const historyUrl = (code: string) => `${PLANS_URL}/${code}/history`
const CSRF = 'csrf-token-value'

const ADMIN: Entitlements = {
  userId: 'u-admin',
  username: 'ops.catalogue',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
  ],
  permissions: ['platform.plans.read', 'platform.plans.manage', 'platform.tenants.manage'],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = {
  ...ADMIN,
  userId: 'u-support',
  roles: [{ id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true }],
  permissions: ['platform.plans.read', 'platform.support.read'],
}

const version = (
  planCode: string,
  versionNumber: number,
  extra: Partial<PlanVersion> = {},
): PlanVersion => ({
  id: `v-${planCode}-${versionNumber}`,
  planCode,
  versionNumber,
  effectiveFrom: '2026-10-09T08:00:00Z',
  monthlyPrice: '23.500',
  annualPrice: '235.000',
  invoicesPerMonth: 175,
  peopleIncluded: 3,
  extraPersonPrice: null,
  branchesIncluded: 1,
  extraBranchPrice: '7.250',
  overagePricePerInvoice: null,
  apiAccess: false,
  prioritySupport: false,
  reason: 'Owner decision',
  createdBy: 'u-admin',
  createdAt: '2026-10-09T08:00:00Z',
  ...extra,
})

// Figures unlike the launch catalogue (35 / 80 / 150), so a figure on screen is the backend's.
const STARTER: CatalogueAdminPlan = {
  code: 'STARTER',
  nameEn: 'Starter',
  nameAr: 'المبتدئة',
  descriptionEn: 'For one shop',
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: true,
  recommended: false,
  sortOrder: 10,
  annualFreeMonths: 2,
  trialDays: 14,
  trialDocuments: 25,
  version: 4,
  currentVersion: version('STARTER', 2),
  features: [
    { key: 'peppol', enabled: true },
    { key: 'pos', enabled: true },
    { key: 'webhooks', enabled: false },
    { key: 'futureThing', enabled: true },
  ],
}
const GROWTH: CatalogueAdminPlan = {
  ...STARTER,
  code: 'GROWTH',
  nameEn: 'Growth',
  nameAr: null,
  recommended: true,
  sortOrder: 20,
  version: 1,
  currentVersion: version('GROWTH', 1, {
    monthlyPrice: '61.250',
    invoicesPerMonth: 2400,
    peopleIncluded: 6,
    extraPersonPrice: '4.125',
    branchesIncluded: null,
    apiAccess: true,
    prioritySupport: true,
    overagePricePerInvoice: '0.150',
  }),
}
const LEGACY: CatalogueAdminPlan = {
  ...STARTER,
  code: 'LEGACY_2025',
  nameEn: 'Legacy 2025',
  nameAr: null,
  active: false,
  publicVisible: false,
  sortOrder: 30,
  currentVersion: version('LEGACY_2025', 1),
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    detail: 'Server prose that must not be shown.',
  })

type Handler = (init: RequestInit) => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

/** By URL and method (`PUT /x` or `/x` for any method); an array is a queue whose last repeats. */
function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([key, handler]) => [
      key,
      Array.isArray(handler) ? [...handler] : handler,
    ]),
  )
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const entry = queues[`${init.method ?? 'GET'} ${url}`] ?? queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) throw new Error(`unexpected request to ${init.method ?? 'GET'} ${url}`)
    return handler(init)
  })
}
const callsTo = (url: string, method?: string) =>
  (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>).filter(
    ([called, init]) => called === url && (!method || (init?.method ?? 'GET') === method),
  )
const initOf = (url: string, method: string, index = 0) =>
  callsTo(url, method)[index][1] as RequestInit
const bodyOf = (url: string, method: string, index = 0) =>
  JSON.parse(initOf(url, method, index).body as string) as Record<string, unknown>
const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

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

const reads = (
  catalogue: Handler | Handler[] = () => json(200, [STARTER, GROWTH, LEGACY]),
  who: Entitlements = ADMIN,
) => ({
  [ENTITLEMENTS_URL]: () => json(200, who),
  [`GET ${PLANS_URL}`]: catalogue,
})

async function openCatalogue(
  extra: Record<string, Handler | Handler[]> = {},
  catalogue?: Handler | Handler[],
  who: Entitlements = ADMIN,
) {
  answer({ ...reads(catalogue, who), ...extra })
  renderPlans()
  await screen.findByRole('heading', { level: 3, name: 'Starter' })
}

const card = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('article') as HTMLElement
const dialog = () => screen.getByRole('dialog')
const input = (name: string) => dialog().querySelector<HTMLInputElement>(`input[name="${name}"]`)
const type = (name: string, value: string) => fireEvent.change(input(name)!, { target: { value } })
const toggle = (label: string) => within(dialog()).getByRole('switch', { name: label })
const saveButton = () =>
  within(dialog()).queryByRole('button', {
    name: i18n.t('console.plans.save'),
  }) as HTMLButtonElement | null

async function editPlan(name: string) {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('console.plans.editPlan', { name }) }))
  await screen.findByRole('dialog')
}

async function save() {
  await act(async () => {
    fireEvent.click(saveButton()!)
  })
}

beforeEach(async () => {
  resetSharedRequests()
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
  it('reads the catalogue once for an operator who may read it', async () => {
    await openCatalogue()
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
    expect(callsTo(PLANS_URL, 'GET')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows no access, and reads nothing, without platform.plans.read', async () => {
    answer({
      [ENTITLEMENTS_URL]: () =>
        json(200, { ...ADMIN, permissions: ['platform.tenants.manage', 'platform.support.read'] }),
    })
    renderPlans()
    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(callsTo(PLANS_URL)).toHaveLength(0)
  })

  it('is not granted by a role name alone', async () => {
    answer({
      [ENTITLEMENTS_URL]: () =>
        json(200, {
          ...ADMIN,
          roles: [{ id: 'r-9', code: 'PLATFORM_TENANT_ADMIN', name: 'Admin', systemRole: true }],
          permissions: ['platform.support.read'],
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

  it("shows each plan's current version, in the backend order, with its state", async () => {
    await openCatalogue({}, () => json(200, [LEGACY, GROWTH, STARTER]))
    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(names).toEqual(['Starter', 'Growth', 'Legacy 2025'])
    expect(card('Growth').textContent).toContain('61.250')
    expect(within(card('Growth')).getByText(i18n.t('console.plans.recommendedPill'))).toBeTruthy()
    expect(within(card('Legacy 2025')).getByText(i18n.t('console.plans.inactive'))).toBeTruthy()
    expect(within(card('Legacy 2025')).getByText(i18n.t('console.plans.hiddenPill'))).toBeTruthy()
    expect(card('Starter').textContent).toContain(
      i18n.t('console.plans.versionLine', { version: 2 }),
    )
    expect(document.body.textContent).not.toMatch(/\b(35|80|150)\.000\b/)
  })

  it('says so when the catalogue is empty', async () => {
    answer(reads(() => json(200, [])))
    renderPlans()
    expect(await screen.findByText(i18n.t('console.plans.empty'))).toBeTruthy()
  })

  it('names plans in Arabic as published, and keeps the English name where none is', async () => {
    await i18n.changeLanguage('ar')
    answer(reads())
    renderPlans()
    expect(await screen.findByRole('heading', { level: 3, name: 'المبتدئة' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Growth' })).toBeTruthy()
  })
})

describe('Read-only operators', () => {
  it('can view every plan and its history but has no way to change one', async () => {
    await openCatalogue(
      {
        [`GET ${historyUrl('STARTER')}`]: () =>
          json(200, { code: 'STARTER', versions: [], events: [] }),
      },
      undefined,
      SUPPORT,
    )
    expect(screen.getByText(i18n.t('console.plans.readOnly'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.plans.add') })).toBeNull()
    expect(
      screen.queryByRole('button', { name: i18n.t('console.plans.editPlan', { name: 'Starter' }) }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('console.plans.viewPlan', { name: 'Starter' }) }),
    )
    await screen.findByRole('dialog')
    expect(saveButton()).toBeNull()
    expect(input('monthlyPrice')!.readOnly).toBe(true)
    expect(input('nameAr')!.readOnly).toBe(true)
    expect((toggle(i18n.t('console.plans.field.recommended')) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(input('reason')).toBeNull()
    expect(callsTo(planUrl('STARTER'), 'PUT')).toHaveLength(0)
  })
})

describe('Editing a plan', () => {
  it('fills every field from the plan, fixes its code, and locks compliance on', async () => {
    await openCatalogue()
    await editPlan('Starter')
    expect(input('code')!.readOnly).toBe(true)
    expect(input('nameEn')!.value).toBe('Starter')
    expect(input('nameAr')!.value).toBe('المبتدئة')
    expect(input('descriptionEn')!.value).toBe('For one shop')
    expect(input('monthlyPrice')!.value).toBe('23.500')
    expect(input('extraBranchPrice')!.value).toBe('7.250')
    expect(input('annualFreeMonths')!.value).toBe('2')
    expect(input('trialDays')).toBeNull()
    expect(
      toggle(i18n.t('console.plans.field.trial', { days: 14 })).getAttribute('aria-checked'),
    ).toBe('true')
    expect(input('trialDocuments')!.value).toBe('25')
    const peppol = toggle(i18n.t('plan.featureName.peppol')) as HTMLButtonElement
    expect(peppol.getAttribute('aria-checked')).toBe('true')
    expect(peppol.disabled).toBe(true)
    expect(toggle(i18n.t('plan.featureName.pos')).getAttribute('aria-checked')).toBe('true')
    expect(toggle(i18n.t('plan.featureName.webhooks')).getAttribute('aria-checked')).toBe('false')
    // Nothing that publishes new terms has changed, so no reason is asked.
    expect(input('reason')).toBeNull()
  })

  it('saves a descriptive change in place with If-Match and CSRF, and no reason', async () => {
    const stored = { ...STARTER, nameAr: 'البداية', publicVisible: false, version: 5 }
    await openCatalogue({ [`PUT ${planUrl('STARTER')}`]: () => json(200, stored) })
    await editPlan('Starter')
    type('nameAr', 'البداية')
    fireEvent.click(toggle(i18n.t('console.plans.field.publicVisible')))
    fireEvent.click(toggle(i18n.t('plan.featureName.webhooks')))
    expect(input('reason')).toBeNull()
    await save()

    expect(callsTo(planUrl('STARTER'), 'PUT')).toHaveLength(1)
    const init = initOf(planUrl('STARTER'), 'PUT')
    expect(headerOf(init, 'If-Match')).toBe('"4"')
    expect(headerOf(init, 'X-CSRF-Token')).toBe(CSRF)
    const body = bodyOf(planUrl('STARTER'), 'PUT')
    expect(body).toMatchObject({
      nameEn: 'Starter',
      nameAr: 'البداية',
      descriptionEn: 'For one shop',
      descriptionAr: null,
      publicVisible: false,
      recommended: false,
      active: true,
      annualFreeMonths: 2,
      trialDays: 14,
      trialDocuments: 25,
      monthlyPrice: '23.500',
      extraBranchPrice: '7.250',
      extraPersonPrice: null,
      branchesIncluded: 1,
    })
    expect(body).not.toHaveProperty('code')
    expect(body).not.toHaveProperty('reason')
    const features = body.features as Array<{ key: string; enabled: boolean }>
    expect(features).toContainEqual({ key: 'webhooks', enabled: true })
    expect(features).toContainEqual({ key: 'peppol', enabled: true })
    // A key this app has no switch for goes back as it was read.
    expect(features).toContainEqual({ key: 'futureThing', enabled: true })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.getByText(i18n.t('console.plans.saved', { name: 'Starter' })).getAttribute('role'),
    ).toBe('status')
    expect(within(card('Starter')).getByText(i18n.t('console.plans.hiddenPill'))).toBeTruthy()
    expect(callsTo(PLANS_URL, 'GET')).toHaveLength(1)
  })

  it('requires a reason when a price or limit changes, and sends it with the new terms', async () => {
    const stored = {
      ...STARTER,
      version: 5,
      currentVersion: version('STARTER', 3, { monthlyPrice: '25.000', reason: 'Costs rose' }),
    }
    await openCatalogue({ [`PUT ${planUrl('STARTER')}`]: () => json(200, stored) })
    await editPlan('Starter')
    type('monthlyPrice', '25')
    expect(input('reason')).toBeTruthy()
    await save()

    expect(
      within(dialog()).getByText(i18n.t('console.plans.validation.reasonRequired')),
    ).toBeTruthy()
    expect(callsTo(planUrl('STARTER'), 'PUT')).toHaveLength(0)

    type('reason', 'Costs rose')
    await save()
    expect(bodyOf(planUrl('STARTER'), 'PUT')).toMatchObject({
      monthlyPrice: '25.000',
      reason: 'Costs rose',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(card('Starter').textContent).toContain('25.000')
    expect(card('Starter').textContent).toContain(
      i18n.t('console.plans.versionLine', { version: 3 }),
    )
  })

  it('counts the annual free months as a term change', async () => {
    await openCatalogue()
    await editPlan('Starter')
    type('annualFreeMonths', '3')
    expect(input('reason')).toBeTruthy()
    type('annualFreeMonths', '12')
    await save()
    expect(within(dialog()).getByText(i18n.t('console.plans.validation.freeMonths'))).toBeTruthy()
  })

  it('offers a reload instead of overwriting a plan someone else saved meanwhile', async () => {
    await openCatalogue({
      [`PUT ${planUrl('STARTER')}`]: () => problem(412, 'plan-catalogue-version-conflict'),
      [`GET ${PLANS_URL}`]: [
        () => json(200, [STARTER, GROWTH, LEGACY]),
        () => json(200, [{ ...STARTER, nameEn: 'Starter (new)', version: 9 }, GROWTH, LEGACY]),
      ],
    })
    await editPlan('Starter')
    type('nameEn', 'Starter mine')
    await save()

    const alert = within(dialog()).getByRole('alert')
    expect(alert.textContent).toContain(i18n.t('console.plans.conflict'))
    expect(document.body.textContent).not.toContain('Server prose')
    expect(saveButton()!.disabled).toBe(true)

    fireEvent.click(within(alert).getByRole('button', { name: i18n.t('console.plans.reload') }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Starter (new)' })).toBeTruthy()
    expect(screen.getByText(i18n.t('console.plans.reloaded'))).toBeTruthy()
    expect(callsTo(PLANS_URL, 'GET')).toHaveLength(2)
    expect(callsTo(planUrl('STARTER'), 'PUT')).toHaveLength(1)
  })

  it('reads a 409 on an edit as the same conflict', async () => {
    await openCatalogue({
      [`PUT ${planUrl('STARTER')}`]: () => problem(409, 'plan-catalogue-version-conflict'),
    })
    await editPlan('Starter')
    type('nameEn', 'Starter mine')
    await save()
    expect(within(dialog()).getByText(i18n.t('console.plans.conflict'))).toBeTruthy()
  })

  it('sends one request however often save is pressed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    await openCatalogue({
      [`PUT ${planUrl('STARTER')}`]: () => new Promise<Response>((resolve) => (release = resolve)),
    })
    await editPlan('Starter')
    type('nameEn', 'Starter two')
    await save()
    fireEvent.submit(dialog().querySelector('form')!)
    fireEvent.submit(dialog().querySelector('form')!)
    expect(callsTo(planUrl('STARTER'), 'PUT')).toHaveLength(1)
    await act(async () => release(json(200, { ...STARTER, nameEn: 'Starter two', version: 5 })))
  })
})

describe('Adding a plan', () => {
  async function openAdd(extra: Record<string, Handler | Handler[]> = {}) {
    await openCatalogue(extra)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.plans.add') }))
    await screen.findByRole('dialog')
  }

  function fillNew() {
    type('code', 'PRO_2026')
    type('nameEn', 'Pro')
    type('monthlyPrice', '99.5')
    type('invoicesPerMonth', '5000')
    type('peopleIncluded', '15')
  }

  it('creates with POST, every field explicit, compliance on, and a required reason', async () => {
    const stored: CatalogueAdminPlan = {
      ...STARTER,
      code: 'PRO_2026',
      nameEn: 'Pro',
      nameAr: null,
      sortOrder: 0,
      version: 0,
      currentVersion: version('PRO_2026', 1, { monthlyPrice: '99.500' }),
    }
    await openAdd({ [`POST ${PLANS_URL}`]: () => json(201, stored) })
    fillNew()
    await save()
    expect(
      within(dialog()).getByText(i18n.t('console.plans.validation.reasonRequired')),
    ).toBeTruthy()

    type('reason', 'New tier for groups')
    await save()
    const body = bodyOf(PLANS_URL, 'POST')
    expect(body).toMatchObject({
      code: 'PRO_2026',
      nameEn: 'Pro',
      nameAr: null,
      monthlyPrice: '99.500',
      invoicesPerMonth: 5000,
      peopleIncluded: 15,
      extraPersonPrice: null,
      branchesIncluded: null,
      extraBranchPrice: null,
      overagePricePerInvoice: null,
      annualFreeMonths: 2,
      trialDays: null,
      trialDocuments: null,
      publicVisible: true,
      recommended: false,
      active: true,
      reason: 'New tier for groups',
    })
    expect(body.features).toContainEqual({ key: 'invoices', enabled: true })
    expect(body.features).toContainEqual({ key: 'api', enabled: false })
    expect(initOf(PLANS_URL, 'POST').headers).toBeTruthy()
    expect(headerOf(initOf(PLANS_URL, 'POST'), 'If-Match')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { level: 3, name: 'Pro' })).toBeTruthy()
  })

  it('marks the code as taken when the server answers 409', async () => {
    await openAdd({ [`POST ${PLANS_URL}`]: () => problem(409, 'resource-conflict') })
    fillNew()
    type('reason', 'New tier')
    await save()
    expect(within(dialog()).getByText(i18n.t('console.plans.validation.codeTaken'))).toBeTruthy()
  })

  it('refuses a code already in the catalogue before sending anything', async () => {
    await openAdd()
    fillNew()
    type('code', 'GROWTH')
    type('reason', 'x')
    await save()
    expect(within(dialog()).getByText(i18n.t('console.plans.validation.codeTaken'))).toBeTruthy()
    expect(callsTo(PLANS_URL, 'POST')).toHaveLength(0)
  })
})

describe('History', () => {
  const HISTORY: PlanHistory = {
    code: 'STARTER',
    versions: [
      version('STARTER', 1, {
        monthlyPrice: '19.000',
        annualPrice: '190.000',
        reason: 'V176 seed',
        createdBy: null,
      }),
      version('STARTER', 2, { reason: 'Owner decision 2026-10-09', createdBy: 'u-someone' }),
    ],
    events: [
      {
        id: 'e-1',
        planCode: 'STARTER',
        kind: 'CREATED',
        versionId: 'v-STARTER-1',
        changes: {},
        actorId: null,
        occurredAt: '2026-01-01T08:00:00Z',
      },
      {
        id: 'e-2',
        planCode: 'STARTER',
        kind: 'VISIBILITY_CHANGED',
        versionId: null,
        changes: { publicVisible: { before: true, after: false } },
        actorId: 'u-admin',
        occurredAt: '2026-10-09T09:00:00Z',
      },
    ],
  }

  it('lists versions and changes newest first, with reason and who, and changes nothing', async () => {
    await openCatalogue({ [`GET ${historyUrl('STARTER')}`]: () => json(200, HISTORY) })
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('console.plans.historyOf', { name: 'Starter' }) }),
    )
    const panel = await screen.findByRole('dialog')
    await within(panel).findByText(i18n.t('console.plans.history.version', { version: 2 }), {
      exact: false,
    })

    const versions = within(panel)
      .getAllByText(/^Version \d/)
      .map((node) => node.textContent)
    expect(versions[0]).toContain('Version 2')
    expect(versions[1]).toContain('Version 1')
    expect(panel.textContent).toContain('Owner decision 2026-10-09')
    expect(panel.textContent).toContain('V176 seed')
    expect(panel.textContent).toContain('u-someone')
    expect(panel.textContent).toContain(i18n.t('console.plans.history.system'))

    const kinds = within(panel)
      .getAllByText(
        new RegExp(
          `^(${i18n.t('console.plans.history.kind.CREATED')}|${i18n.t('console.plans.history.kind.VISIBILITY_CHANGED')})$`,
        ),
      )
      .map((node) => node.textContent)
    expect(kinds).toEqual([
      i18n.t('console.plans.history.kind.VISIBILITY_CHANGED'),
      i18n.t('console.plans.history.kind.CREATED'),
    ])
    expect(panel.textContent).toContain(i18n.t('console.plans.field.publicVisible'))
    expect(panel.textContent).toContain(i18n.t('console.plans.history.you'))
    expect(within(panel).queryByRole('button', { name: i18n.t('console.plans.save') })).toBeNull()
    expect(
      (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>).filter(
        ([, init]) => (init?.method ?? 'GET') !== 'GET',
      ),
    ).toHaveLength(0)
  })

  it('offers a retry when the history cannot be read', async () => {
    await openCatalogue({
      [`GET ${historyUrl('STARTER')}`]: [() => json(503, {}), () => json(200, HISTORY)],
    })
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('console.plans.historyOf', { name: 'Starter' }) }),
    )
    const panel = await screen.findByRole('dialog')
    const retry = await within(panel).findByRole('button', { name: i18n.t('console.access.retry') })
    fireEvent.click(retry)
    expect(await within(panel).findByText('V176 seed', { exact: false })).toBeTruthy()
  })
})

describe('Trial switch (TR-1: always 14 days)', () => {
  const trialSwitch = () => toggle(i18n.t('console.plans.field.trial', { days: 14 }))

  it('switches the trial off and sends no trial, with no reason asked', async () => {
    await openCatalogue({
      [`PUT ${planUrl('STARTER')}`]: () =>
        json(200, { ...STARTER, trialDays: null, trialDocuments: null }),
    })
    await editPlan('Starter')
    fireEvent.click(trialSwitch())
    type('trialDocuments', '')
    expect(input('reason')).toBeNull()
    await save()
    const body = bodyOf(planUrl('STARTER'), 'PUT')
    expect(body.trialDays).toBeNull()
    expect(body.trialDocuments).toBeNull()
    expect(body).not.toHaveProperty('trialEnabled')
  })

  it('switches the trial on at 14 days, never another length', async () => {
    const noTrial = { ...STARTER, trialDays: null, trialDocuments: null }
    await openCatalogue(
      { [`PUT ${planUrl('STARTER')}`]: () => json(200, { ...STARTER, trialDays: 14 }) },
      () => json(200, [noTrial]),
    )
    await editPlan('Starter')
    expect(trialSwitch().getAttribute('aria-checked')).toBe('false')
    fireEvent.click(trialSwitch())
    await save()
    expect(bodyOf(planUrl('STARTER'), 'PUT').trialDays).toBe(14)
  })

  it('refuses a trial allowance with the trial off, before sending', async () => {
    await openCatalogue()
    await editPlan('Starter')
    fireEvent.click(trialSwitch())
    await save()
    expect(callsTo(planUrl('STARTER'), 'PUT')).toHaveLength(0)
    expect(
      within(dialog()).getByText(i18n.t('console.plans.validation.trialDocumentsNeedTrial')),
    ).toBeTruthy()
  })
})

describe('Count received documents', () => {
  const countingUrl = (code: string) => `${PLANS_URL}/${code}/received-document-counting`
  const COUNTING = {
    planCode: 'STARTER',
    version: 1,
    countsReceived: true,
    history: [
      {
        id: 'c-1',
        planCode: 'STARTER',
        version: 1,
        countsReceived: true,
        reason: 'Launch default',
        createdBy: 'u-other',
        createdAt: '2026-10-15T08:00:00Z',
      },
    ],
  }
  const openCounting = async () => {
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('console.plans.counting.openFor', { name: 'Starter' }),
      }),
    )
    await within(dialog()).findByText(i18n.t('console.plans.counting.onBody'))
  }
  const countingSwitch = () =>
    within(dialog()).getByRole('switch', { name: i18n.t('console.plans.counting.switch') })
  const saveCounting = async () => {
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole('button', { name: i18n.t('console.plans.counting.save') }),
      )
    })
  }

  it('shows the switch and its history, and saves with If-Match and a reason', async () => {
    const after = {
      ...COUNTING,
      version: 2,
      countsReceived: false,
      history: [
        { ...COUNTING.history[0], id: 'c-2', version: 2, countsReceived: false, reason: 'Owner' },
        ...COUNTING.history,
      ],
    }
    await openCatalogue({
      [`GET ${countingUrl('STARTER')}`]: () => json(200, COUNTING),
      [`PUT ${countingUrl('STARTER')}`]: () => json(200, after),
    })
    await openCounting()
    expect(within(dialog()).getByText(i18n.t('console.plans.counting.applies'))).toBeTruthy()
    expect(within(dialog()).getByText(/Launch default/)).toBeTruthy()

    fireEvent.click(countingSwitch())
    await saveCounting()
    // No reason: nothing is sent.
    expect(callsTo(countingUrl('STARTER'), 'PUT')).toHaveLength(0)
    expect(
      within(dialog()).getByText(i18n.t('console.plans.counting.reasonRequired')),
    ).toBeTruthy()

    type('reason', ' Owner ')
    await saveCounting()
    expect(callsTo(countingUrl('STARTER'), 'PUT')).toHaveLength(1)
    const init = initOf(countingUrl('STARTER'), 'PUT')
    expect(headerOf(init, 'If-Match')).toBe('"1"')
    expect(bodyOf(countingUrl('STARTER'), 'PUT')).toEqual({ countsReceived: false, reason: 'Owner' })
    expect(await within(dialog()).findByText(i18n.t('console.plans.counting.saved'))).toBeTruthy()
    expect(within(dialog()).getByText(i18n.t('console.plans.counting.offBody'))).toBeTruthy()
  })

  it('sends nothing when the switch was not moved', async () => {
    await openCatalogue({ [`GET ${countingUrl('STARTER')}`]: () => json(200, COUNTING) })
    await openCounting()
    type('reason', 'No change')
    await saveCounting()
    expect(callsTo(countingUrl('STARTER'), 'PUT')).toHaveLength(0)
    expect(within(dialog()).getByText(i18n.t('console.plans.counting.unchanged'))).toBeTruthy()
  })

  it('reloads on a version conflict and says why', async () => {
    const newer = { ...COUNTING, version: 2, countsReceived: false }
    await openCatalogue({
      [`GET ${countingUrl('STARTER')}`]: [() => json(200, COUNTING), () => json(200, newer)],
      [`PUT ${countingUrl('STARTER')}`]: () => problem(409, 'received-counting-version-conflict'),
    })
    await openCounting()
    fireEvent.click(countingSwitch())
    type('reason', 'Owner')
    await saveCounting()
    expect(
      await within(dialog()).findByText(i18n.t('console.plans.counting.refusal.conflict')),
    ).toBeTruthy()
    expect(await within(dialog()).findByText(i18n.t('console.plans.counting.offBody'))).toBeTruthy()
    expect(callsTo(countingUrl('STARTER'), 'GET')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('is read-only for an operator who may only read plans', async () => {
    await openCatalogue(
      { [`GET ${countingUrl('STARTER')}`]: () => json(200, { ...COUNTING, history: [] }) },
      undefined,
      SUPPORT,
    )
    await openCounting()
    expect(within(dialog()).queryByRole('switch')).toBeNull()
    expect(
      within(dialog()).queryByRole('button', { name: i18n.t('console.plans.counting.save') }),
    ).toBeNull()
    expect(within(dialog()).getByText(i18n.t('console.plans.counting.noHistory'))).toBeTruthy()
  })
})
