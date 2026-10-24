import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import type { Entitlements } from '../../lib/identity/entitlements'
import { ConsoleSidebar } from './ConsoleSidebar'

/** Tenants and Billing each stand for a section of tabbed pages (owner, 24 Oct 2026). */
const operator = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'op',
  tenantId: 't-platform',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

function renderSidebar(permissions: string[], path = '/console') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleSidebar userName="op" entitlements={operator(permissions)} />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('Console sidebar (owner, 24 Oct 2026)', () => {
  it('keeps the everyday pages as links of their own, grouped, with Settings at the foot', () => {
    renderSidebar([
      'platform.tenants.manage',
      'platform.billing.read',
      'platform.plans.read',
      'platform.smp.operations.review',
    ])
    for (const [name, href] of [
      ['Tenants', '/console/tenants'],
      ['Verification', '/console/onboarding'],
      ['Enterprise', '/console/enterprise'],
      ['Disconnections', '/console/disconnections'],
      ['Subscription payments', '/console/billing/payments'],
      ['Refund cases', '/console/billing/refunds'],
      ['Plans and rates', '/console/plans'],
      ['Settings', '/console/settings'],
    ]) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href)
    }
    for (const gone of ['Companies without an Owner', 'Billing settings', 'Seller', 'Operators']) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull()
    }
  })

  it('carries no "Soon" tags', () => {
    renderSidebar(['platform.tenants.manage'])
    expect(screen.getByRole('link', { name: 'Submission queue' })).toBeTruthy()
    expect(screen.queryByText('Soon')).toBeNull()
  })

  it('lights Tenants on its Without an Owner tab, and the page own link rather than Settings', () => {
    const view = renderSidebar(
      ['platform.tenants.manage', 'platform.plans.read'],
      '/console/owners',
    )
    expect(screen.getByRole('link', { name: 'Tenants' }).getAttribute('aria-current')).toBe('page')
    view.unmount()
    renderSidebar(['platform.tenants.manage', 'platform.plans.read'], '/console/plans')
    expect(screen.getByRole('link', { name: 'Plans and rates' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBeNull()
  })

  it('opens ERP extraction in one click, lit only on that section', () => {
    const view = renderSidebar(
      ['platform.tenants.manage'],
      '/console/settings/values?section=addons',
    )
    const erp = screen.getByRole('link', { name: 'ERP extraction' })
    expect(erp.getAttribute('href')).toBe('/console/settings/values?section=addons')
    expect(erp.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBeNull()
    view.unmount()
    renderSidebar(['platform.tenants.manage'], '/console/settings/values?section=notices')
    expect(
      screen.getByRole('link', { name: 'ERP extraction' }).getAttribute('aria-current'),
    ).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
  })
})
