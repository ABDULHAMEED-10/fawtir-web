import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { HomePage } from './HomePage'

let fetchMock: ReturnType<typeof vi.fn>

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Landing page', () => {
  it('draws every section of the frame and asks the API only for the contact details', () => {
    renderHome()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      i18n.t('landing.hero.word'),
    )
    for (const key of [
      'landing.audience.titleEm',
      'landing.overview.titleEm',
      'landing.features.otaEm',
      'landing.showcase.titleEm',
    ]) {
      expect(screen.getByText(i18n.t(key))).toBeTruthy()
    }
    expect(screen.getByText(i18n.t('landing.band.title'))).toBeTruthy()
    expect(
      screen.getByText(i18n.t('landing.footer.rights', { year: new Date().getFullYear() })),
    ).toBeTruthy()
    // The mail links' address is the company contact setting; nothing else is read.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/public/company-contact'])
  })

  // The till's steps moved to the Features page's Point of sale tab (owner, 4 Nov 2026).
  it('keeps the till steps off the home page and shows the four module cards', () => {
    renderHome()

    expect(screen.queryByText(i18n.t('landing.steps.titleEm'))).toBeNull()
    for (const key of ['invoicing', 'bills', 'filing', 'reports']) {
      expect(screen.getByAltText(i18n.t(`landing.features.${key}.alt`))).toBeTruthy()
    }
  })

  it('links sign-up, pricing and the demo request to real places', () => {
    renderHome()

    expect(
      screen.getAllByRole('link', { name: i18n.t('landing.nav.logIn') })[0].getAttribute('href'),
    ).toBe('/login')
    expect(
      screen.getAllByRole('link', { name: i18n.t('landing.nav.signUp') })[0].getAttribute('href'),
    ).toBe('/signup')
    expect(
      screen.getAllByRole('link', { name: i18n.t('landing.nav.pricing') })[0].getAttribute('href'),
    ).toBe('/pricing')
    expect(
      screen.getAllByRole('link', { name: i18n.t('landing.nav.contact') })[0].getAttribute('href'),
    ).toBe('/contact')
    expect(
      screen.getAllByRole('link', { name: i18n.t('landing.cta.demo') })[0].getAttribute('href'),
    ).toContain('mailto:')
  })

  it('reads in Arabic and switches the page to right to left from the nav', async () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }))
    await screen.findByText(i18n.t('landing.band.title'))

    expect(i18n.language).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(screen.getByText('بِع أكثر، وقدِّم أقل')).toBeTruthy()

    await i18n.changeLanguage('en')
    document.documentElement.dir = 'ltr'
  })

  it('folds the links into a menu on a phone, with Contact Us always in the bar', () => {
    renderHome()
    const bar = screen.getByRole('navigation', { name: i18n.t('landing.nav.mobileLabel') })
    const toggle = within(bar).getByRole('button', { name: i18n.t('landing.nav.menu') })
    expect(
      within(bar).getByRole('link', { name: new RegExp(i18n.t('landing.nav.contact')) }),
    ).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(bar).queryByRole('link', { name: i18n.t('landing.nav.pricing') })).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe(i18n.t('landing.nav.closeMenu'))
    for (const key of ['home', 'pricing', 'features', 'partners', 'signUp']) {
      expect(within(bar).getByRole('link', { name: i18n.t(`landing.nav.${key}`) })).toBeTruthy()
    }
    expect(within(bar).getByRole('button', { name: 'العربية' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})
