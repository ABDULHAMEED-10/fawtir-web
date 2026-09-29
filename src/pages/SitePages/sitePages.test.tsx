import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import i18n from '../../i18n'
import { ContactPage } from './ContactPage'
import { FeaturesPage } from './FeaturesPage'
import { PricingPage } from './PricingPage'

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
  it('shows the three plans monthly, and ten months when yearly is chosen', () => {
    renderPage(<PricingPage />)
    const nav = screen.getByRole('navigation', { name: i18n.t('landing.nav.label') })
    expect(
      within(nav)
        .getByRole('link', { name: i18n.t('landing.nav.pricing') })
        .getAttribute('aria-current'),
    ).toBe('page')

    for (const figure of ['49.000', '89.000', '149.000']) {
      expect(screen.getAllByText(figure).length).toBeGreaterThan(0)
    }
    fireEvent.click(screen.getByRole('radio', { name: /Yearly/ }))
    expect(screen.getByText('490.000')).toBeTruthy()
    expect(screen.getByText('890.000')).toBeTruthy()
    expect(screen.getByText('1,490.000')).toBeTruthy()
    expect(document.body.textContent).not.toContain('OMR 4')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('compares every row and opens a question', () => {
    renderPage(<PricingPage />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(
      screen.getByRole('rowheader', { name: i18n.t('site.pricing.compare.rows.named') }),
    ).toBeTruthy()
    const question = screen.getByRole('button', { name: i18n.t('site.faq.items.cafe.q') })
    fireEvent.click(question)
    expect(question.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(i18n.t('site.faq.items.cafe.a'))).toBeTruthy()
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
