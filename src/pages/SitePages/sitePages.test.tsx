import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import i18n from '../../i18n'
import { ContactPage } from './ContactPage'
import { FeaturesPage } from './FeaturesPage'
import { PricingPage } from './PricingPage'
import { CATALOGUE, annualMonthly } from '../../lib/plans'
import { GROUPS, faqParams } from '../PlansPage/PlanComparison'

let fetchMock: ReturnType<typeof vi.fn>

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Pricing page', () => {
  it('prices every plan from the app catalogue, monthly and yearly', () => {
    renderPage(<PricingPage />)
    const nav = screen.getByRole('navigation', { name: i18n.t('landing.nav.label') })
    expect(
      within(nav)
        .getByRole('link', { name: i18n.t('landing.nav.pricing') })
        .getAttribute('aria-current'),
    ).toBe('page')

    for (const plan of CATALOGUE) {
      expect(screen.getAllByText(plan.monthly.toFixed(3)).length).toBeGreaterThan(0)
      expect(
        screen.getByText(
          i18n.t('site.pricing.limits.documents', {
            documents: plan.documents.toLocaleString('en-US'),
          }),
        ),
      ).toBeTruthy()
    }
    expect(screen.getAllByText(i18n.t('plans.enterprise.price')).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('radio', { name: /Yearly/ }))
    for (const plan of CATALOGUE) {
      expect(screen.getAllByText(annualMonthly(plan).toFixed(3)).length).toBeGreaterThan(0)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('compares the same rows as the sign-up plans screen and answers its questions', () => {
    renderPage(<PricingPage />)
    for (const group of GROUPS) {
      for (const row of group.rows) {
        expect(screen.getAllByRole('rowheader', { name: i18n.t(row.labelKey) }).length).toBe(1)
      }
    }
    const question = screen.getByRole('button', { name: i18n.t('plans.faq.q1') })
    fireEvent.click(question)
    expect(question.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(i18n.t('plans.faq.a1', faqParams()))).toBeTruthy()
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
