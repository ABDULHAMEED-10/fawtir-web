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
  it('draws every section of the frame and asks the API for nothing', () => {
    renderHome()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      i18n.t('landing.hero.word'),
    )
    for (const key of [
      'landing.overview.titleEm',
      'landing.features.titleEm',
      'landing.steps.titleEm',
      'landing.counter.titleEm',
      'landing.showcase.titleEm',
    ]) {
      expect(screen.getByText(i18n.t(key))).toBeTruthy()
    }
    expect(screen.getByText(i18n.t('landing.band.title'))).toBeTruthy()
    expect(
      screen.getByText(i18n.t('landing.footer.rights', { year: new Date().getFullYear() })),
    ).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('switches the step shown when a step is chosen', () => {
    renderHome()

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe(
      i18n.t('landing.steps.tabs.sale'),
    )
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('landing.steps.tabs.cleared') }))

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe(
      i18n.t('landing.steps.tabs.cleared'),
    )
    expect(screen.getByText(i18n.t('landing.steps.cleared.body'))).toBeTruthy()
  })

  it('links sign-up, pricing and the demo request to real places', () => {
    renderHome()

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
