import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import i18n from '../../i18n'
import { ContactPage } from './ContactPage'
import { FeaturesPage } from './FeaturesPage'
import { PricingPage } from './PricingPage'
import { resetSharedRequests } from '../../api'
import type { SignupCataloguePlan } from '../../lib/identity/signupPlans'
import { comparisonGroups, faqAnswerKey, faqParams } from '../PlansPage/comparison'
import { DEFAULT_SETTINGS, settingsStore } from '../../lib/platformSettings'

let fetchMock: ReturnType<typeof vi.fn>

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

const PUBLIC_PLANS_URL = '/api/v1/public/plans'
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
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([PUBLIC_PLANS_URL])
    expect(screen.getAllByText('41.250').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,250.000').length).toBeGreaterThan(0)
    expect(
      screen.getByText(i18n.t('site.pricing.limits.documents', { documents: '4,000' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('plan.feature.unlimitedBranches'))).toBeTruthy()
    expect(screen.getAllByText('Published description').length).toBe(2)
    expect(screen.getByText(i18n.t('plans.trialNote', { days: 10, documents: 40 }))).toBeTruthy()
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

  it('says no VAT is added when the console rate is zero, and quotes the rate otherwise', () => {
    const vatRow = comparisonGroups(CATALOGUE)
      .flatMap((group) => group.rows)
      .find((row) => row.key === 'vat')!
    expect(faqAnswerKey(6, faqParams(CATALOGUE))).toBe('plans.faq.a7')
    expect(vatRow.cell(null)).toMatchObject({ params: { rate: 5 } })
    settingsStore.save('billing', { ...DEFAULT_SETTINGS.billing, vatRate: 0 })
    try {
      const params = faqParams(CATALOGUE)
      expect(faqAnswerKey(6, params)).toBe('plans.faq.a7NoVat')
      expect(i18n.t(faqAnswerKey(6, params), { ...params, lng: 'en' })).not.toContain('%')
      expect(i18n.t(faqAnswerKey(6, params), { ...params, lng: 'ar' })).not.toContain('%')
      expect(vatRow.cell(null)).toMatchObject({ key: expect.stringContaining('noVat') })
    } finally {
      settingsStore.reset('billing')
    }
  })

  it('reads in Arabic with the published Arabic names', async () => {
    await i18n.changeLanguage('ar')
    renderPage(<PricingPage />)
    expect(await screen.findByRole('heading', { level: 2, name: 'النمو' })).toBeTruthy()
    expect(screen.getAllByText('وصف منشور').length).toBe(2)
  })

  it('offers a retry when the catalogue cannot be read, and never the launch prices', async () => {
    fetchMock
      .mockImplementationOnce(async () => json(503, {}))
      .mockImplementation(async () => json(200, CATALOGUE))
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
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
