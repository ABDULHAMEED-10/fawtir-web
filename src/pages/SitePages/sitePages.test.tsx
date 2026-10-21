import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import i18n from '../../i18n'
import { ContactPage } from './ContactPage'
import { FeaturesPage } from './FeaturesPage'
import { PricingPage } from './PricingPage'
import { resetSharedRequests } from '../../api'
import type { SignupCataloguePlan } from '../../lib/identity/signupPlans'
import { comparisonGroups, faqAnswerKey, faqParams } from '../PlansPage/comparison'
import { launchFeatures } from '../PlansPage/catalogueView'
import { DEFAULT_SETTINGS, settingsStore } from '../../lib/platformSettings'

let fetchMock: ReturnType<typeof vi.fn>

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

const PUBLIC_PLANS_URL = '/api/v1/public/plans'
const CONTACT_URL = '/api/v1/public/company-contact'
const plansCalls = () =>
  fetchMock.mock.calls.map(([url]) => url).filter((url) => url !== CONTACT_URL)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Unlike the launch figures in lib/plans.ts, so every figure on the page is the server's.
const STARTER: SignupCataloguePlan = {
  code: 'STARTER',
  nameEn: 'Starter',
  nameAr: 'المبتدئة',
  descriptionEn: 'Published description',
  descriptionAr: 'وصف منشور',
  currency: 'OMR',
  priceVersionId: 'pv-s',
  monthlyPrice: '41.250',
  annualPrice: '412.500',
  annualFreeMonths: 2,
  invoicesPerMonth: 250,
  peopleIncluded: 2,
  extraPersonPrice: '3.000',
  branchesIncluded: 1,
  extraBranchPrice: null,
  overagePricePerInvoice: '0.150',
  apiAccess: false,
  prioritySupport: true,
  recommended: false,
  trialDays: 10,
  trialDocuments: 40,
  features: [
    { key: 'invoices', enabled: true },
    { key: 'pos', enabled: true },
  ],
  sortOrder: 1,
}
const GROWTH: SignupCataloguePlan = {
  ...STARTER,
  code: 'GROWTH',
  nameEn: 'Growth',
  nameAr: 'النمو',
  priceVersionId: 'pv-g',
  monthlyPrice: '1250.000',
  annualPrice: '12500.000',
  invoicesPerMonth: 4000,
  branchesIncluded: null,
  recommended: true,
  features: [
    { key: 'invoices', enabled: true },
    { key: 'webhooks', enabled: true },
  ],
  sortOrder: 2,
}
const CATALOGUE = [STARTER, GROWTH]

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  fetchMock = vi.fn().mockImplementation(async () => json(200, CATALOGUE))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Pricing page', () => {
  it('prices every plan from the published catalogue, monthly and yearly', async () => {
    renderPage(<PricingPage />)
    const nav = screen.getByRole('navigation', { name: i18n.t('landing.nav.label') })
    expect(
      within(nav)
        .getByRole('link', { name: i18n.t('landing.nav.pricing') })
        .getAttribute('aria-current'),
    ).toBe('page')

    expect(await screen.findByRole('heading', { level: 2, name: 'Growth' })).toBeTruthy()
    expect(plansCalls()).toEqual([PUBLIC_PLANS_URL])
    expect(screen.getAllByText('41.250').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,250.000').length).toBeGreaterThan(0)
    expect(
      screen.getByText(i18n.t('site.pricing.limits.documents', { documents: '4,000' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('plan.feature.unlimitedBranches'))).toBeTruthy()
    expect(screen.getAllByText('Published description').length).toBe(2)
    expect(screen.getByText(i18n.t('plans.trialNote', { count: 10, documents: 40 }))).toBeTruthy()
    expect(screen.getAllByText(i18n.t('plans.enterprise.price')).length).toBeGreaterThan(0)
    for (const launch of ['35.000', '80.000', '150.000']) {
      expect(screen.queryByText(launch)).toBeNull()
    }

    fireEvent.click(screen.getByRole('radio', { name: /Yearly/ }))
    // Owner, 9 Oct 2026: Yearly shows the published annual price "/year", not a twelfth of it.
    expect(screen.getAllByText('412.500').length).toBeGreaterThan(0)
    expect(screen.getAllByText('12,500.000').length).toBeGreaterThan(0)
    expect(screen.queryByText('34.375')).toBeNull()
    expect(screen.getAllByText(i18n.t('site.pricing.perYear')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(i18n.t('site.pricing.yearlyNoteMonths', { count: 2 })).length).toBe(
      2,
    )
  })

  it('draws the recommended plan as the featured card', async () => {
    renderPage(<PricingPage />)
    const growth = (await screen.findByRole('heading', { level: 2, name: 'Growth' })).closest(
      'article',
    )
    const starter = screen.getByRole('heading', { level: 2, name: 'Starter' }).closest('article')
    expect(growth?.className).toContain('landing-shadow-brand')
    expect(starter?.className).not.toContain('landing-shadow-brand')
  })

  it('compares the same rows as the sign-up plans screen and answers its questions', async () => {
    renderPage(<PricingPage />)
    await screen.findByRole('heading', { level: 2, name: 'Growth' })
    for (const group of comparisonGroups(CATALOGUE)) {
      for (const row of group.rows) {
        expect(screen.getAllByRole('rowheader', { name: i18n.t(row.labelKey) }).length).toBe(1)
      }
    }
    expect(
      screen.getByRole('rowheader', { name: i18n.t('plan.featureName.webhooks') }),
    ).toBeTruthy()
    expect(screen.queryByRole('rowheader', { name: i18n.t('plan.featureName.api') })).toBeNull()
    const question = screen.getByRole('button', { name: i18n.t('plans.faq.q1') })
    fireEvent.click(question)
    expect(question.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(i18n.t('plans.faq.a1', faqParams(CATALOGUE)))).toBeTruthy()
  })

  it('counts the grace days in Arabic by their plural form', () => {
    const params = faqParams(CATALOGUE)
    expect(params.count).toBe(7)
    const arabic = i18n.t('plans.faq.a5', { ...params, lng: 'ar' })
    expect(arabic).toContain('على 7 أيام من المهلة')
    expect(i18n.t('plans.faq.a5', { ...params, count: 14, lng: 'ar' })).toContain('على 14 يومًا من المهلة')
    expect(i18n.t('plans.faq.a5', { ...params, lng: 'en' })).toContain('7 days of grace')
  })

  it('says a bigger plan paid for in the trial ends the trial at once, from the payment date, with no carry-over (R1)', () => {
    const params = faqParams(CATALOGUE)
    const english = i18n.t('plans.faq.a5', { ...params, lng: 'en' })
    expect(english).toContain('during your free trial, the trial ends at once')
    expect(english).toContain('your paid period starts on the day you pay')
    expect(english).toContain('unused trial days are not carried over')
    for (const count of [0, 1, 2, 7, 14, 100]) {
      const arabic = i18n.t('plans.faq.a5', { ...params, count, lng: 'ar' })
      expect(arabic).toContain('تنتهي الفترة التجريبية فورًا')
      expect(arabic).toContain('تبدأ فترتك المدفوعة من يوم الدفع')
      expect(arabic).toContain('لا تُرحَّل أيام التجربة غير المستخدمة')
    }
  })

  it('answers the allowance questions as the server counts it: 80, 90 and 100 percent, received documents, extras bought ahead (F2)', () => {
    const params = faqParams(CATALOGUE)
    expect(params.thresholds).toBe('80, 90, 100')
    const counts = i18n.t('plans.faq.a3', { ...params, lng: 'en' })
    expect(counts).toContain('Supplier invoices, credit notes and debit notes you receive count too')
    expect(counts).toContain('sending it again is free')
    const over = i18n.t('plans.faq.a4', { ...params, lng: 'en' })
    expect(over).toContain('80, 90, 100 percent')
    expect(over).toContain('held')
    expect(over).toContain('by card they are added at once')
    expect(over).toContain('no carry-over and no refund')
    expect(over).toContain('resets each month on your subscription date')
    expect(over).not.toMatch(/overage|per document|next period/)
    expect(i18n.t('plans.faq.a4', { ...params, lng: 'ar' })).toContain('80, 90, 100 بالمئة')
  })

  it('marks the ERP extraction add-on from the catalogue\'s erpAddon, not a web list (ER-1, PL-6)', () => {
    const addon = { currency: 'OMR', monthlyPrice: '20.000', annualPrice: '240.000' }
    const starter: SignupCataloguePlan = { ...STARTER, erpAddon: null }
    const business: SignupCataloguePlan = { ...STARTER, code: 'BUSINESS', erpAddon: null }
    const plus: SignupCataloguePlan = { ...GROWTH, code: 'BUSINESS_PLUS', erpAddon: addon }
    const row = comparisonGroups([starter, business, plus])
      .flatMap((group) => group.rows)
      .find((entry) => entry.key === 'erpExtraction')!
    expect(row.cell(plus)).toMatchObject({ key: 'plan.extraction.priced' })
    // Starter and Business never offer it (ER-1).
    expect(row.cell(starter)).toMatchObject({ key: 'plan.extraction.notOffered' })
    expect(row.cell(business)).toMatchObject({ key: 'plan.extraction.notOffered' })
    // Business Plus offers it; with no price published now (paid extras off) it is a dash, never
    // "Not supported".
    expect(row.cell({ ...plus, erpAddon: null })).toEqual({ kind: 'dash' })
    expect(row.cell({ ...plus, erpAddon: undefined })).toEqual({ kind: 'dash' })
    // A plan the web has no launch copy for is not called unsupported either.
    expect(row.cell({ ...GROWTH, erpAddon: null })).toEqual({ kind: 'dash' })
    // Enterprise: in every quote (PL-7).
    expect(row.cell(null)).toMatchObject({ key: 'plan.extraction.included' })
  })

  it('names the ERP add-on on the Business Plus card only when the catalogue prices it (ER-1, PL-7)', () => {
    const plus: SignupCataloguePlan = {
      ...GROWTH,
      code: 'BUSINESS_PLUS',
      erpAddon: { currency: 'OMR', monthlyPrice: '20.000', annualPrice: '240.000' },
    }
    for (const lng of ['en', 'ar']) {
      const t = i18n.getFixedT(lng)
      const priced = launchFeatures(plus, t)!
      expect(priced).toHaveLength(5)
      expect(priced[4]).toContain('20.000')
      expect(priced[4]).not.toMatch(/\{\{|—/)
      for (const erpAddon of [null, undefined]) {
        const lines = launchFeatures({ ...plus, erpAddon }, t)!
        expect(lines).toHaveLength(4)
        expect(lines.join(' ')).not.toMatch(lng === 'en' ? /add-on/ : /كإضافة/)
      }
    }
    expect(launchFeatures(plus, i18n.getFixedT('en'))![4]).toBe(
      'Automatic ERP extraction as an add-on, OMR 20.000 a month',
    )
    // A plan the app has no card copy for falls back to its catalogue features.
    expect(launchFeatures({ ...GROWTH, code: 'CUSTOM' }, i18n.getFixedT('en'))).toBeNull()
  })

  it('quotes the VAT rate the server sends with the plans, and says no VAT is added at zero', () => {
    const vatCell = (plans: readonly SignupCataloguePlan[]) =>
      comparisonGroups(plans).flatMap((group) => group.rows).find((row) => row.key === 'vat')!.cell(null)
    const noVat = CATALOGUE.map((plan) => ({ ...plan, vatRate: '0.00000' }))
    const params = faqParams(noVat)
    expect(faqAnswerKey(6, params)).toBe('plans.faq.a7NoVat')
    expect(i18n.t(faqAnswerKey(6, params), { ...params, lng: 'en' })).not.toContain('%')
    expect(i18n.t(faqAnswerKey(6, params), { ...params, lng: 'ar' })).not.toContain('%')
    expect(vatCell(noVat)).toMatchObject({ key: 'plans.compare.value.noVat' })

    // The server's rate wins over the console's.
    settingsStore.save('billing', { ...DEFAULT_SETTINGS.billing, vatRate: 0 })
    try {
      const withVat = CATALOGUE.map((plan) => ({ ...plan, vatRate: '0.05000' }))
      expect(faqAnswerKey(6, faqParams(withVat))).toBe('plans.faq.a7')
      expect(faqParams(withVat).rate).toBe(5)
      expect(vatCell(withVat)).toMatchObject({ params: { rate: 5 } })
      // An older server sends no rate: the console's is used.
      expect(faqAnswerKey(6, faqParams(CATALOGUE))).toBe('plans.faq.a7NoVat')
    } finally {
      settingsStore.reset('billing')
    }
    expect(faqParams(CATALOGUE).rate).toBe(5)
  })

  it('reads in Arabic with the published Arabic names', async () => {
    await i18n.changeLanguage('ar')
    renderPage(<PricingPage />)
    expect(await screen.findByRole('heading', { level: 2, name: 'النمو' })).toBeTruthy()
    expect(screen.getAllByText('وصف منشور').length).toBe(2)
  })

  it('offers a retry when the catalogue cannot be read, and never the launch prices', async () => {
    let plansAsked = 0
    fetchMock.mockImplementation(async (url: string) =>
      url === PUBLIC_PLANS_URL && plansAsked++ === 0 ? json(503, {}) : json(200, CATALOGUE),
    )
    renderPage(<PricingPage />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(i18n.t('plans.unavailable'))
    for (const launch of ['35.000', '80.000', '150.000']) {
      expect(screen.queryByText(launch)).toBeNull()
    }
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: i18n.t('plans.retry') }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Growth' })).toBeTruthy()
  })

  it('says so when no plan is published', async () => {
    fetchMock.mockImplementation(async () => json(200, []))
    renderPage(<PricingPage />)
    expect(await screen.findByText(i18n.t('plans.empty'))).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('Features page', () => {
  it('draws the six rows and jumps to one from its tab', () => {
    renderPage(<FeaturesPage />)
    for (const key of ['till', 'invoicing', 'filing', 'stock', 'transactions', 'dashboard']) {
      expect(screen.getByText(i18n.t(`site.features.${key}.em`))).toBeTruthy()
      expect(screen.getByAltText(i18n.t(`site.features.${key}.alt`))).toBeTruthy()
    }
    const stock = screen.getByRole('link', { name: i18n.t('site.features.tabs.stock') })
    expect(stock.getAttribute('href')).toBe('#stock')
    fireEvent.click(stock)
    expect(stock.getAttribute('aria-current')).toBe('true')
    expect(screen.getByText(i18n.t('site.features.parts.leave.title'))).toBeTruthy()
  })
})

describe('Contact page', () => {
  it('prepares the message as an email to the team', () => {
    renderPage(<ContactPage />)
    const location = { href: '' }
    vi.stubGlobal('location', location)

    fireEvent.change(screen.getByLabelText(i18n.t('site.contact.form.name')), {
      target: { value: 'Salim' },
    })
    fireEvent.change(screen.getByLabelText(i18n.t('site.contact.form.email')), {
      target: { value: 'salim@example.om' },
    })
    fireEvent.change(screen.getByLabelText(i18n.t('site.contact.form.message')), {
      target: { value: 'Do you support two branches?' },
    })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('site.contact.form.send') }))

    expect(location.href).toContain('mailto:hello@fawtir.om')
    expect(decodeURIComponent(location.href)).toContain('Do you support two branches?')
    expect(screen.getByRole('status').textContent).toContain('hello@fawtir.om')
    // The form sends nothing to the server: the one read is the contact details.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([CONTACT_URL])
  })
})

describe('Contact page, company contact setting (CS-1)', () => {
  const SETTING = {
    version: 3,
    supportEmail: 'fawtara@insight.om',
    supportPhone: '+968 0000 0000',
    websiteUrl: 'https://www.fawtir.om',
    addressEn: 'Knowledge Oasis, Muscat',
    addressAr: 'واحة المعرفة، مسقط',
    linkedinUrl: 'https://www.linkedin.com/company/fawtir',
    instagramUrl: null,
  }
  const answer = (contact: () => Response) =>
    fetchMock.mockImplementation(async (url: string) =>
      url === CONTACT_URL ? contact() : json(200, CATALOGUE),
    )
  const link = (href: string) => document.querySelector(`a[href="${href}"]`)

  it('shows the email, number and address the console saved, and writes to that email', async () => {
    answer(() => json(200, SETTING))
    renderPage(<ContactPage />)

    expect(await screen.findByText('fawtara@insight.om')).toBeTruthy()
    expect(link('mailto:fawtara@insight.om')).toBeTruthy()
    // The setting's number is shown as given, with no label.
    expect(screen.getByText('+968 0000 0000').getAttribute('href')).toBe('tel:+96800000000')
    expect(screen.getByText('Knowledge Oasis, Muscat')).toBeTruthy()
    expect(screen.queryByText('hello@fawtir.om')).toBeNull()
    expect(screen.queryByText(i18n.t('site.contact.info.address'))).toBeNull()
    // The demo, partner and social links follow the same setting.
    expect(link('mailto:fawtara@insight.om?subject=Fawtir%20demo%20request')).toBeTruthy()
    expect(link('mailto:support@fawtir.om?subject=Fawtir%20partners')).toBeNull()
    expect(screen.getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toBe(
      SETTING.linkedinUrl,
    )
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull()

    const location = { href: '' }
    vi.stubGlobal('location', location)
    fireEvent.change(screen.getByLabelText(i18n.t('site.contact.form.name')), {
      target: { value: 'Salim' },
    })
    fireEvent.change(screen.getByLabelText(i18n.t('site.contact.form.email')), {
      target: { value: 'salim@example.om' },
    })
    fireEvent.change(screen.getByLabelText(i18n.t('site.contact.form.message')), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('site.contact.form.send') }))
    expect(location.href.startsWith('mailto:fawtara@insight.om?subject=')).toBe(true)
  })

  it('a setting without a phone shows no phone line, and keeps its email', async () => {
    answer(() => json(200, { ...SETTING, supportPhone: null }))
    renderPage(<ContactPage />)

    expect(await screen.findByText('fawtara@insight.om')).toBeTruthy()
    expect(screen.queryByText(i18n.t('site.contact.info.questionTitle'))).toBeNull()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
  })

  it('reads the Arabic address in Arabic', async () => {
    await i18n.changeLanguage('ar')
    answer(() => json(200, SETTING))
    renderPage(<ContactPage />)
    expect(await screen.findByText('واحة المعرفة، مسقط')).toBeTruthy()
  })

  it.each([
    ['an older server without the endpoint', () => json(404, { status: 404 })],
    ['no setting saved yet', () => new Response(null, { status: 204 })],
    ['a server error', () => json(500, { status: 500 })],
  ])('keeps the values it showed before on %s', async (_, contact) => {
    answer(contact)
    renderPage(<ContactPage />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(CONTACT_URL, expect.anything()))
    await act(async () => {})

    expect(screen.getByText('hello@fawtir.om')).toBeTruthy()
    // No number without one from the server: the frame's toll-free number is gone, line and all.
    expect(screen.queryByText(/2444/)).toBeNull()
    expect(screen.queryByText(i18n.t('site.contact.info.questionTitle'))).toBeNull()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
    expect(screen.getByText(i18n.t('site.contact.info.address'))).toBeTruthy()
    expect(link('mailto:support@fawtir.om?subject=Fawtir%20demo%20request')).toBeTruthy()
    expect(link('mailto:support@fawtir.om?subject=Fawtir%20partners')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'LinkedIn' })).toBeNull()
  })
})
