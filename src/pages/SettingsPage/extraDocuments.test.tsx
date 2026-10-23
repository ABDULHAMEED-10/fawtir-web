import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ExtraDocumentsPage } from './ExtraDocumentsPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements
const READER: Entitlements = { ...MANAGER, permissions: ['tenant.plan.read'] } as Entitlements

const EXTRAS = '/api/v1/settings/plan/extra-documents'
const QUOTE = `${EXTRAS}/quote`
const ORDER = `POST ${EXTRAS}/purchases`
const BILLING = '/api/v1/settings/billing'
const PUBLIC_PLANS = '/api/v1/public/plans'
const PLAN_CHANGES = '/api/v1/settings/plan/changes'

/** A published name unlike the launch one, so a name on screen can only be the catalogue's. */
const CATALOGUE_BUSINESS = {
  code: 'BUSINESS', nameEn: 'Business Growth', nameAr: 'الأعمال للنمو', descriptionEn: null, descriptionAr: null,
  currency: 'OMR', priceVersionId: 'pv-b', monthlyPrice: '80.000', annualPrice: '800.000', annualFreeMonths: 2,
  invoicesPerMonth: 1000, peopleIncluded: 5, extraPersonPrice: null, branchesIncluded: 2, extraBranchPrice: null,
  overagePricePerInvoice: null, apiAccess: false, prioritySupport: false, recommended: false, trialDays: null,
  trialDocuments: null, features: [], sortOrder: 20,
}

const ALLOWANCE = {
  periodStart: '2026-10-01', periodEnd: '2026-10-31', resetsOn: '2026-11-01', planDocuments: 200,
  extraDocuments: 0, totalAllowance: 200, issued: 150, resubmissions: 0, received: 50, receivedHidden: 0,
  used: 200, planUsed: 200, extraUsed: 0, left: 0, warningPercent: 100, issuingAllowed: false,
  extrasExpireOn: '2026-10-31', byBranch: [],
}

function overview(over: Record<string, unknown> = {}) {
  return {
    planCode: 'STARTER', offered: true, unitPrice: '0.150', minPerPurchase: 10, maxPerPurchase: 5000,
    expiresOn: '2026-10-31', allowance: ALLOWANCE, outstanding: null, credits: [], ...over,
  }
}

/** Starter's example: 100 × 0.150 = 15.000, VAT as the server bills it. */
function quote(documents: number, over: Record<string, unknown> = {}) {
  return {
    planCode: 'STARTER', documents, unitPrice: '0.150', netAmount: '15.000', vatRate: '0.05000',
    vatAmount: '0.750', total: '15.750', currency: 'OMR', expiresOn: '2026-10-31', minPerPurchase: 10,
    maxPerPurchase: 5000, nextPlanCode: 'BUSINESS', upgradeSuggested: false, ...over,
  }
}

const BILL = {
  id: 'b-x', number: 'FWT-SUB-2026-000042', planCode: 'STARTER', planName: 'Starter', billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-01', periodEndsOn: '2026-10-31', subtotal: '15.000', vatRate: '0.05000',
  vatAmount: '0.750', total: '15.750', currency: 'OMR', taxDocumentStatus: 'NOT_A_TAX_INVOICE', status: 'OPEN',
  dueOn: '2026-10-11', issuedAt: '2026-10-11T08:00:00Z', paidAt: null, appliedPaidThrough: null, voidReason: null,
  version: 0,
}

function credit(status: string, over: Record<string, unknown> = {}) {
  return {
    id: 'c-1', source: 'PURCHASE', status, documents: 100, unitPrice: '0.150', netAmount: '15.000', billId: 'b-x',
    startsOn: status === 'ACTIVE' ? '2026-10-01' : null, expiresOn: status === 'ACTIVE' ? '2026-10-31' : null,
    createdAt: '2026-10-11T08:00:00Z', activatedAt: status === 'ACTIVE' ? '2026-10-11T08:10:00Z' : null,
    cancelledAt: null, ...over,
  }
}

const PURCHASE = { credit: credit('PENDING'), bill: BILL }

const BILLING_OVERVIEW = {
  bills: [{ bill: BILL, payments: [], card: { available: true, purpose: 'EXTRA_DOCUMENTS', reason: null } }],
  nextBillsCursor: null,
  beneficiary: { legalName: 'Fawtir LLC', bankName: 'Bank Muscat', iban: 'OM810180000001299123456', swiftCode: 'BMUSOMMX' },
  methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true, card: true },
  proofMaximumBytes: 1000000,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

function problem(status: number, slug: string) {
  return json(status, { type: `https://api.fawtir.om/problems/${slug}`, title: slug, status, detail: 'English detail' })
}

let me: Entitlements
let answers: Record<string, (url: string, init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  me = MANAGER
  answers = {
    [EXTRAS]: () => json(200, overview()),
    [QUOTE]: (url) => json(200, quote(Number(new URL(url, 'http://x').searchParams.get('documents')))),
    [BILLING]: () => json(200, BILLING_OVERVIEW),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, me)
    const method = init?.method ?? 'GET'
    const path = String(url).split('?')[0]
    const answer = answers[method === 'GET' ? path : `${method} ${path}`]
    return answer ? answer(String(url), init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/plan/extra-documents']}>
      <Routes>
        <Route path="/settings/plan/extra-documents" element={<ExtraDocumentsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function calls(key: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const method = init?.method ?? 'GET'
    const path = String(url).split('?')[0]
    return (method === 'GET' ? path : `${method} ${path}`) === key
  })
}

function countField() {
  return screen.findByLabelText(i18n.t('extraDocuments.buy.count')) as Promise<HTMLInputElement>
}

describe('Settings › Buy extra documents: the price (EX-1, EX-2)', () => {
  it('shows the server quote for the number chosen: rate × number, VAT and total at three decimals', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const field = await countField()
    await user.clear(field)
    await user.type(field, '100')
    expect(await screen.findByText('15.750')).toBeTruthy()
    expect(screen.getByText('15.000')).toBeTruthy()
    expect(screen.getByText('0.750')).toBeTruthy()
    expect(screen.getByText(/100 extra documents/)).toBeTruthy()
    const asked = calls(QUOTE).map(([url]) => String(url))
    expect(asked.at(-1)).toBe(`${QUOTE}?documents=100`)
  })

  it('takes any number only within the console limits, and asks no price outside them', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const field = await countField()
    await waitFor(() => expect(calls(QUOTE).length).toBe(1))
    await user.clear(field)
    await user.type(field, '6000')
    const hint = screen.getByText(i18n.t('extraDocuments.buy.limits', { min: '10', max: '5,000' }))
    expect(hint.getAttribute('role')).toBe('alert')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(calls(QUOTE).length).toBe(1)
    expect(
      (screen.getByRole('button', { name: i18n.t('extraDocuments.buy.submit') }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('says when this month\'s extras would cost more than the next plan up (EX-6)', async () => {
    answers[QUOTE] = () => json(200, quote(10, { upgradeSuggested: true }))
    renderPage()
    expect(await screen.findByText(/would cost more than moving up/)).toBeTruthy()
  })

  it('names the plan up as the catalogue publishes it, never by its code', async () => {
    answers[QUOTE] = () => json(200, quote(10, { upgradeSuggested: true }))
    answers[PUBLIC_PLANS] = () => json(200, [CATALOGUE_BUSINESS])
    renderPage()
    expect(await screen.findByText(/moving up to the Business Growth plan/)).toBeTruthy()
    expect(screen.queryByText(/BUSINESS/)).toBeNull()
  })

  it('names a launch plan in words while the catalogue cannot be read', async () => {
    answers[QUOTE] = () => json(200, quote(10, { upgradeSuggested: true }))
    renderPage()
    expect(await screen.findByText(/moving up to the Business plan/)).toBeTruthy()
    expect(screen.queryByText(/BUSINESS/)).toBeNull()
  })

  it('says the customer can move up themselves while self-service upgrades are on (Plan v4 §10)', async () => {
    answers[QUOTE] = () => json(200, quote(10, { upgradeSuggested: true }))
    answers[PUBLIC_PLANS] = () => json(200, [CATALOGUE_BUSINESS])
    answers[PLAN_CHANGES] = () => json(200, { available: true, pending: null, history: [] })
    renderPage()
    expect(
      await screen.findByText(
        i18n.t('extraDocuments.quote.upgradeSelfService', { plan: 'Business Growth' }),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Contact Fawtir/)).toBeNull()
  })

  it('keeps "Contact Fawtir" while self-service upgrades are off', async () => {
    answers[QUOTE] = () => json(200, quote(10, { upgradeSuggested: true }))
    answers[PUBLIC_PLANS] = () => json(200, [CATALOGUE_BUSINESS])
    answers[PLAN_CHANGES] = () => json(200, { available: false, pending: null, history: [] })
    renderPage()
    expect(
      await screen.findByText(i18n.t('extraDocuments.quote.upgrade', { plan: 'Business Growth' })),
    ).toBeTruthy()
  })

  it('names the plan up in Arabic from the catalogue', async () => {
    await i18n.changeLanguage('ar')
    answers[QUOTE] = () => json(200, quote(10, { upgradeSuggested: true }))
    answers[PUBLIC_PLANS] = () => json(200, [CATALOGUE_BUSINESS])
    renderPage()
    expect(
      await screen.findByText(i18n.t('extraDocuments.quote.upgrade', { plan: 'الأعمال للنمو' })),
    ).toBeTruthy()
  })
})

describe('Settings › Buy extra documents: ordering and paying (EX-3, EX-7)', () => {
  it('orders once on a double click and then offers the bill with the usual ways to pay', async () => {
    const user = userEvent.setup({ delay: null })
    let ordered = false
    answers[ORDER] = () => {
      ordered = true
      return json(201, PURCHASE)
    }
    answers[EXTRAS] = () => json(200, overview(ordered ? { outstanding: PURCHASE, credits: [PURCHASE.credit] } : {}))
    renderPage()
    const submit = await screen.findByRole('button', { name: i18n.t('extraDocuments.buy.submit') })
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false))
    await user.dblClick(submit)
    await screen.findByText(i18n.t('extraDocuments.order.title'))
    expect(calls(ORDER)).toHaveLength(1)
    expect(JSON.parse(String(calls(ORDER)[0][1]?.body))).toEqual({ documents: 10 })
    expect(await screen.findByRole('radio', { name: new RegExp(i18n.t('billing.method.CARD.title')) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: new RegExp(i18n.t('billing.method.BANK_TRANSFER.title')) })).toBeTruthy()
    expect(screen.getByText('FWT-SUB-2026-000042')).toBeTruthy()
  })

  it('says the documents are added once the order is paid', async () => {
    answers[EXTRAS] = () => json(200, overview({ outstanding: null, credits: [credit('ACTIVE')] }))
    renderPage()
    expect(await screen.findByText(i18n.t('extraDocuments.history.status.ACTIVE'))).toBeTruthy()
  })

  it('sends someone with an unpaid subscription to pay it first, in our words', async () => {
    const user = userEvent.setup({ delay: null })
    answers[ORDER] = () => problem(409, 'subscription-state-conflict')
    renderPage()
    const submit = await screen.findByRole('button', { name: i18n.t('extraDocuments.buy.submit') })
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false))
    await user.click(submit)
    const alert = await screen.findByText(i18n.t('extraDocuments.refusal.subscription-state-conflict'))
    expect(within(alert).getByRole('link', { name: i18n.t('extraDocuments.refusal.payFirstLink') }).getAttribute('href'))
      .toBe('/settings/bills')
    expect(screen.queryByText('English detail')).toBeNull()
  })
})

describe('Settings › Buy extra documents: who and which plans', () => {
  it('offers nothing to buy on a plan with no per-document rate', async () => {
    answers[EXTRAS] = () => json(200, overview({ offered: false, unitPrice: null }))
    renderPage()
    expect(await screen.findByText(i18n.t('extraDocuments.notOffered'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('extraDocuments.buy.submit') })).toBeNull()
  })

  it('shows the allowance but no order form to someone who may only read the plan', async () => {
    me = READER
    renderPage()
    expect(await screen.findByText(i18n.t('extraDocuments.noPermission'))).toBeTruthy()
    expect(screen.getByText(i18n.t('extraDocuments.month.none'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('extraDocuments.buy.submit') })).toBeNull()
  })
})

describe('Settings › Buy extra documents: Arabic', () => {
  it('has every message in both languages, and the Arabic is Arabic and calls the bill مطالبة', () => {
    type Tree = { [key: string]: string | Tree }
    const flat = (tree: Tree, prefix = ''): Record<string, string> =>
      Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key
        return typeof value === 'string' ? { ...all, [path]: value } : { ...all, ...flat(value, path) }
      }, {})
    // Arabic carries more plural forms than English; compare the keys without them.
    const base = (keys: string[]) => [...new Set(keys.map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')))].sort()
    const english = flat((en as unknown as { extraDocuments: Tree }).extraDocuments)
    const arabic = flat((ar as unknown as { extraDocuments: Tree }).extraDocuments)
    expect(base(Object.keys(arabic))).toEqual(base(Object.keys(english)))
    for (const [key, text] of Object.entries(arabic)) {
      expect(text.trim(), key).not.toBe('')
      expect(text, key).toMatch(/[؀-ۿ]/)
    }
    expect(arabic['buy.howAdded']).toMatch(/مطالبة/)
  })
})
