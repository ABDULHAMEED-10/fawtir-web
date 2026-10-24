import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { CONSOLE_ITEMS } from '../../../lib/consoleNav'
import { CONSOLE_SECTIONS } from '../../../lib/console/consoleSections'
import { ConsoleEnterpriseTermsPage } from './ConsoleEnterpriseTermsPage'
import { ConsoleEnterprisePage } from './ConsoleEnterprisePage'
import { EnterpriseTermsLink } from './EnterpriseTermsLink'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const TENANT = '11111111-1111-4111-8111-111111111111'
const TERMS = `/api/v1/platform/companies/${TENANT}/enterprise-terms`
const QUOTE = `${TERMS}/quote`
const COUNTING = `/api/v1/platform/companies/${TENANT}/received-document-counting`
const OVERVIEW = `/api/v1/platform/companies/${TENANT}/overview`
const LIST = '/api/v1/platform/enterprise-terms'

const ADMIN: Entitlements = {
  userId: 'u-admin',
  username: 'tenant.admin',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform', systemRole: true }],
  permissions: ['platform.billing.read', 'platform.billing.manage'],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = {
  ...ADMIN,
  userId: 'u-support',
  roles: [{ id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Support', systemRole: true }],
  permissions: ['platform.billing.read'],
}

const NONE = {
  tenantId: TENANT,
  state: 'TERMS_NOT_SET',
  version: 0,
  plan: null,
  inForce: null,
  pending: null,
  nextBill: null,
  history: [],
}

const PLAN = {
  code: 'ENT_111111111111',
  nameEn: 'Enterprise',
  nameAr: 'المؤسسات',
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: false,
  recommended: false,
  sortOrder: 10000,
  annualFreeMonths: 2,
  trialDays: null,
  trialDocuments: null,
  version: 3,
  currentVersion: {
    id: 'v-2',
    planCode: 'ENT_111111111111',
    versionNumber: 2,
    effectiveFrom: '2026-10-15T09:00:00Z',
    monthlyPrice: '450.000',
    annualPrice: '4500.000',
    invoicesPerMonth: 5000,
    peopleIncluded: 25,
    extraPersonPrice: null,
    branchesIncluded: 10,
    extraBranchPrice: null,
    overagePricePerInvoice: '0.040',
    apiAccess: true,
    prioritySupport: false,
    reason: 'Renewal',
    createdBy: 'u-other',
    createdAt: '2026-10-15T09:00:00Z',
  },
  features: [{ key: 'peppol', enabled: true, compliance: true }],
}

const SET = {
  ...NONE,
  state: 'BILLING_STARTED',
  version: 3,
  plan: PLAN,
  inForce: {
    planCode: PLAN.code,
    planVersionId: 'v-1',
    planVersionNumber: 1,
    billingCycle: 'MONTHLY',
  },
  pending: {
    planCode: PLAN.code,
    planVersionId: 'v-2',
    planVersionNumber: 2,
    billingCycle: 'MONTHLY',
    effectiveOn: '2026-11-10',
  },
  nextBill: {
    billingCycle: 'MONTHLY',
    amountExclVat: '450.000',
    vatRate: '0.05',
    vatAmount: '22.500',
    amountInclVat: '472.500',
    currency: 'OMR',
  },
  history: [
    {
      id: 'h-2',
      tenantId: TENANT,
      planCode: PLAN.code,
      planVersionId: 'v-2',
      kind: 'CHANGED',
      applyFrom: 'NEXT_RENEWAL',
      effectiveOn: '2026-11-10',
      billingCycle: 'MONTHLY',
      contractReference: 'FWT-ENT-14',
      reason: 'Renewal negotiated',
      createdBy: 'u-other',
      createdByName: 'Nasser Al Habsi',
      createdAt: '2026-10-15T09:00:00Z',
    },
    {
      id: 'h-1',
      tenantId: TENANT,
      planCode: PLAN.code,
      planVersionId: 'v-1',
      kind: 'SET',
      applyFrom: 'BEFORE_FIRST_BILL',
      effectiveOn: '2026-09-10',
      billingCycle: 'MONTHLY',
      contractReference: null,
      reason: 'Contract signed',
      createdBy: 'u-admin',
      createdAt: '2026-09-10T06:00:00Z',
    },
  ],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  who = ADMIN
  answers = {
    [TERMS]: () => json(200, NONE),
    [`POST ${QUOTE}`]: (init) => {
      const body = JSON.parse(String(init?.body))
      return json(200, {
        billingCycle: body.billingCycle,
        amountExclVat: '300.000',
        vatRate: '0.05',
        vatAmount: '15.000',
        amountInclVat: '315.000',
        currency: 'OMR',
      })
    },
    [`PUT ${TERMS}`]: () => json(200, SET),
    [COUNTING]: () => json(404, { type: 'about:blank' }),
    [OVERVIEW]: () => json(404, { type: 'about:blank' }),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const T = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`console.enterpriseTerms.${key}`, options)

function renderTerms() {
  return render(
    <MemoryRouter initialEntries={[`/console/tenants/${TENANT}/enterprise-terms`]}>
      <Routes>
        <Route
          path="/console/tenants/:id/enterprise-terms"
          element={<ConsoleEnterpriseTermsPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call ? { init: call[1] as RequestInit, body: JSON.parse(String(call[1]?.body)) } : null
}

// A required field's label ends in its mark ("Monthly price*").
const field = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`), {
    selector: 'input',
  }) as HTMLInputElement

describe('Console › Enterprise terms', () => {
  it('sets first terms: annual follows monthly x 10, the quote is shown, then saved with If-Match 0', async () => {
    const user = userEvent.setup()
    renderTerms()
    await screen.findByText(T('state.TERMS_NOT_SET'))
    expect(screen.getByText(T('subtitle.TERMS_NOT_SET'))).toBeTruthy()

    await user.type(field(i18n.t('console.plans.field.monthlyPrice')), '300')
    expect(field(T('form.annualPrice')).value).toBe('3000.000')
    await user.type(field(i18n.t('console.plans.field.invoicesPerMonth')), '4000')
    await user.type(field(i18n.t('console.plans.field.peopleIncluded')), '20')
    await user.type(field(T('form.contractReference')), 'FWT-ENT-14')
    await user.click(screen.getByRole('button', { name: T('form.save') }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(sent('POST', QUOTE)?.body).toMatchObject({
      monthlyPrice: '300.000',
      annualPrice: '3000.000',
    })
    expect(sent('POST', QUOTE)?.body).not.toHaveProperty('reason')
    expect(dialog.getByText(T('quote.subtotal'))).toBeTruthy()
    expect(dialog.getByText('15.000')).toBeTruthy()
    expect(dialog.getByText('315.000')).toBeTruthy()

    // The reason is required before anything is written.
    await user.click(dialog.getByRole('button', { name: T('confirm.confirm') }))
    expect(sent('PUT', TERMS)).toBeNull()
    await user.type(
      dialog.getByLabelText(new RegExp(`^${T('confirm.reason')}`), { selector: 'input' }),
      'Contract signed',
    )
    await user.click(dialog.getByRole('button', { name: T('confirm.confirm') }))

    await screen.findByText(T('saved'))
    const put = sent('PUT', TERMS)!
    expect((put.init.headers as Record<string, string>)['If-Match']).toBe('"0"')
    expect(put.body).toMatchObject({
      monthlyPrice: '300.000',
      annualPrice: '3000.000',
      invoicesPerMonth: 4000,
      peopleIncluded: 20,
      billingCycle: 'MONTHLY',
      contractReference: 'FWT-ENT-14',
      erpAddonMonthlyPrice: null,
      reason: 'Contract signed',
    })
    // The answer is shown: the state, the change waiting for the renewal, and the history.
    expect(screen.getByText(T('state.BILLING_STARTED'))).toBeTruthy()
  }, 30_000)

  it('checks the figures before asking for a quote', async () => {
    const user = userEvent.setup()
    renderTerms()
    await screen.findByText(T('state.TERMS_NOT_SET'))
    await user.type(field(i18n.t('console.plans.field.monthlyPrice')), '10.0001')
    await user.click(screen.getByRole('button', { name: T('form.save') }))
    expect(await screen.findByText(i18n.t('console.plans.validation.money'))).toBeTruthy()
    expect(screen.getAllByText(i18n.t('validation.required')).length).toBeGreaterThanOrEqual(2)
    expect(sent('POST', QUOTE)).toBeNull()
  })

  it('shows set terms: in force, waiting for the renewal, the next bill and every save', async () => {
    answers[TERMS] = () => json(200, SET)
    renderTerms()
    await screen.findByText(T('state.BILLING_STARTED'))
    expect(field(i18n.t('console.plans.field.monthlyPrice')).value).toBe('450.000')
    // No add-on price on this version: not offered as a paid add-on.
    expect(field(T('form.erpAddonPrice')).value).toBe('')
    expect(screen.getByText(/Version 2, billed monthly, from 10 Nov 2026/)).toBeTruthy()
    expect(screen.getByText('472.500')).toBeTruthy()
    const history = within(
      screen.getByRole('heading', { name: T('history.title') }).closest('section')!,
    )
    expect(history.getByText(T('history.kind.CHANGED'))).toBeTruthy()
    expect(history.getByText(/From the renewal on 10 Nov 2026/)).toBeTruthy()
    expect(history.getByText(/Contract FWT-ENT-14/)).toBeTruthy()
    expect(
      history.getByText(
        `${i18n.t('console.plans.history.by')} ${i18n.t('console.plans.history.you')}`,
      ),
    ).toBeTruthy()
    // Another operator's save is named by the server (OP-3), not shown as an id.
    expect(history.getByText('Nasser Al Habsi')).toBeTruthy()
    expect(history.queryByText('u-other')).toBeNull()
  })

  it('shows the id only when the server cannot name who saved', async () => {
    answers[TERMS] = () =>
      json(200, { ...SET, history: [{ ...SET.history[0], createdByName: null }] })
    renderTerms()
    await screen.findByText(T('state.BILLING_STARTED'))
    expect(screen.getByText('u-other')).toBeTruthy()
  })

  it('offers a reload, not a retry, when someone else saved first', async () => {
    const user = userEvent.setup()
    answers[TERMS] = () => json(200, SET)
    answers[`PUT ${TERMS}`] = () =>
      json(409, { type: 'https://fawtir.om/problems/enterprise-terms-version-conflict' })
    renderTerms()
    await screen.findByText(T('state.BILLING_STARTED'))
    await user.clear(field(i18n.t('console.plans.field.peopleIncluded')))
    await user.type(field(i18n.t('console.plans.field.peopleIncluded')), '30')
    await user.click(screen.getByRole('button', { name: T('form.save') }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(
      dialog.getByLabelText(new RegExp(`^${T('confirm.reason')}`), { selector: 'input' }),
      'More people',
    )
    await user.click(dialog.getByRole('button', { name: T('confirm.confirm') }))
    expect(await dialog.findByText(T('refusal.conflict'))).toBeTruthy()
    expect((sent('PUT', TERMS)!.init.headers as Record<string, string>)['If-Match']).toBe('"3"')
    expect(dialog.queryByRole('button', { name: T('confirm.confirm') })).toBeNull()
    await user.click(dialog.getByRole('button', { name: T('reload') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) => url === TERMS && (init?.method ?? 'GET') === 'GET',
        ).length,
      ).toBe(2),
    )
  })

  it('is read only without the manage permission', async () => {
    who = SUPPORT
    answers[TERMS] = () => json(200, SET)
    renderTerms()
    await screen.findByText(T('state.BILLING_STARTED'))
    expect(screen.getByText(T('form.readOnly'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T('form.save') })).toBeNull()
    expect(field(i18n.t('console.plans.field.monthlyPrice')).closest('fieldset')!.disabled).toBe(
      true,
    )
  })
})

describe('Console › Enterprise companies', () => {
  it('lists the companies waiting for terms first, and opens their terms', async () => {
    const user = userEvent.setup()
    answers[`${LIST}?state=TERMS_NOT_SET&size=200`] = () =>
      json(200, [
        {
          tenantId: TENANT,
          legalName: 'Nizwa Date Traders SAOC',
          state: 'TERMS_NOT_SET',
          since: '2026-10-16T07:20:00Z',
        },
      ])
    answers[`${LIST}?size=200`] = () => json(200, [])
    render(
      <MemoryRouter initialEntries={['/console/enterprise']}>
        <Routes>
          <Route path="/console/enterprise" element={<ConsoleEnterprisePage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('Nizwa Date Traders SAOC')
    expect(
      screen.getByRole('link', { name: i18n.t('console.enterprise.open') }).getAttribute('href'),
    ).toBe(`/console/tenants/${TENANT}/enterprise-terms`)
    await user.click(screen.getByRole('button', { name: i18n.t('console.enterprise.tab.ALL') }))
    expect(await screen.findByText(i18n.t('console.enterprise.empty.ALL'))).toBeTruthy()
  })

  it('is a Tenants tab for billing readers only', () => {
    // Owner, 24 Oct 2026: Enterprise is a tab of Tenants, not a link of its own.
    expect(CONSOLE_ITEMS.map((item) => item.to)).not.toContain('/console/enterprise')
    expect(
      CONSOLE_SECTIONS.tenants.tabs.find((tab) => tab.to === '/console/enterprise')?.requires,
    ).toBe('platform.billing.read')
  })

  it('links the tenant page to the terms only for billing readers', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <EnterpriseTermsLink tenantId={TENANT} />
      </MemoryRouter>,
    )
    expect((await screen.findByRole('link', { name: T('open') })).getAttribute('href')).toBe(
      `/console/tenants/${TENANT}/enterprise-terms`,
    )
    unmount()
    forgetEntitlements()
    resetSharedRequests()
    who = { ...ADMIN, permissions: ['platform.tenants.manage'] }
    render(
      <MemoryRouter>
        <EnterpriseTermsLink tenantId={TENANT} />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === ENTITLEMENTS_URL).length).toBe(2),
    )
    expect(screen.queryByRole('link', { name: T('open') })).toBeNull()
  })
})
