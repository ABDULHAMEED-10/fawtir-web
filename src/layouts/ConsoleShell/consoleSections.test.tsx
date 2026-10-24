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

describe('Console sidebar sections', () => {
  it('shows one Tenants link and one Billing link instead of six', () => {
    renderSidebar([
      'platform.tenants.manage',
      'platform.billing.read',
      'platform.smp.operations.review',
    ])
    expect(screen.getByRole('link', { name: 'Tenants' }).getAttribute('href')).toBe(
      '/console/tenants',
    )
    expect(screen.getByRole('link', { name: 'Billing' }).getAttribute('href')).toBe(
      '/console/billing/payments',
    )
    for (const gone of [
      'Enterprise',
      'Companies without an Owner',
      'Disconnections',
      'Refund cases',
    ]) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull()
    }
  })

  it('leads to the first tab the operator may open', () => {
    renderSidebar(['platform.smp.operations.review'])
    expect(screen.getByRole('link', { name: 'Tenants' }).getAttribute('href')).toBe(
      '/console/disconnections',
    )
    expect(screen.queryByRole('link', { name: 'Billing' })).toBeNull()
  })

  it('stays lit on every tab of its section', () => {
    renderSidebar(['platform.tenants.manage', 'platform.billing.read'], '/console/billing/refunds')
    expect(screen.getByRole('link', { name: 'Billing' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Tenants' }).getAttribute('aria-current')).toBeNull()
  })
})
