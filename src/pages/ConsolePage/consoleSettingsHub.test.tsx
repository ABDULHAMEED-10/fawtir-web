import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { CONSOLE_ITEMS } from '../../lib/consoleNav'
import { ConsoleSettingsHubPage } from './ConsoleSettingsHubPage'

/** Console › Settings: every console setting in one place, like the tenant hub (owner, 24 Oct). */
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'

const ADMIN: Entitlements = {
  userId: 'u-admin',
  username: 'super.admin',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
  ],
  permissions: [
    'platform.tenants.manage',
    'platform.operators.manage',
    'admin.users.manage',
    'platform.support',
    'platform.billing.read',
    'platform.billing.manage',
    'platform.plans.read',
    'platform.plans.manage',
  ],
  scopes: [],
  featureFlags: {},
}

let who: Entitlements

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === ENTITLEMENTS_URL
        ? new Response(JSON.stringify(who), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response(null, { status: 404 }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/settings" element={<ConsoleSettingsHubPage />} />
        <Route path="/console/settings/values" element={<p>platform values</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** A hub card, looked for in the page itself (the sidebar has a Plans and rates link too). */
const card = (title: string) =>
  within(screen.getByRole('main')).queryByRole('link', { name: new RegExp(`^${title}`) })

describe('Console › Settings', () => {
  it('groups every setting under its tab, each card leading to its page', async () => {
    renderAt('/console/settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    for (const group of ['Plans', 'Billing', 'Fawtir company', 'Platform', 'Records']) {
      expect(screen.getByRole('heading', { level: 2, name: group })).toBeTruthy()
    }
    expect(card('Plans and rates')?.getAttribute('href')).toBe('/console/plans')
    expect(card('Billing rules')?.getAttribute('href')).toBe('/console/billing/settings')
    expect(card('Fawtir company details')?.getAttribute('href')).toBe('/console/settings/company')
    expect(card('Operators')?.getAttribute('href')).toBe('/console/operators')
    expect(card('Validation policies')?.getAttribute('href')).toBe('/console/policies')
    expect(card('Branch access check')?.getAttribute('href')).toBe('/console/branch-access')
    expect(card('Audit log')?.getAttribute('href')).toBe('/console/audit')
    // Owner, 24 Oct 2026: a value the API already sets leads to the page that sets it.
    expect(card('Counting rules')?.getAttribute('href')).toBe('/console/plans')
    expect(card('Add-ons')?.getAttribute('href')).toBe('/console/plans')
    expect(card('Payments')?.getAttribute('href')).toBe('/console/billing/settings')
    expect(card('Notices')?.getAttribute('href')).toBe('/console/billing/settings')
    expect(card('ERP extraction')?.getAttribute('href')).toBe(
      '/console/settings/values?section=addons',
    )
    expect(card('Promotions')?.getAttribute('href')).toBe(
      '/console/settings/values?section=promotional',
    )
  })

  it('says which cards change things here and which only read', async () => {
    who = {
      ...ADMIN,
      permissions: ADMIN.permissions.filter((code) => code !== 'platform.plans.manage'),
    }
    renderAt('/console/settings')
    const plans = await within(await screen.findByRole('main')).findByRole('link', {
      name: /^Plans and rates/,
    })
    expect(within(plans).getByText('View only')).toBeTruthy()
    expect(within(card('Billing rules')!).getByText('Manage')).toBeTruthy()
    // Owner, 24 Oct 2026: no card carries a "Coming soon" tag.
    expect(screen.queryByText('Coming soon')).toBeNull()
    // A value the API sets is never "Coming soon".
    expect(within(card('Trial and lifecycle')!).getByText('Manage')).toBeTruthy()
  })

  it('shows a card only when its page would open for this operator', async () => {
    who = { ...ADMIN, permissions: ['platform.support'] }
    renderAt('/console/settings')
    expect(await screen.findByRole('link', { name: /^Validation policies/ })).toBeTruthy()
    expect(card('Plans and rates')).toBeNull()
    expect(card('Billing rules')).toBeNull()
    expect(card('Fawtir company details')).toBeNull()
    expect(card('Operators')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Fawtir company' })).toBeNull()
  })

  it('narrows to one group from its tab', async () => {
    renderAt('/console/settings?tab=company')
    expect(await screen.findByRole('link', { name: /^Fawtir company details/ })).toBeTruthy()
    expect(card('Plans and rates')).toBeNull()
    expect(screen.getByRole('link', { name: 'Fawtir company' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('still opens a section bookmarked before the hub', async () => {
    renderAt('/console/settings?section=notices')
    expect(await screen.findByText('platform values')).toBeTruthy()
  })

  it('is in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/console/settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'الإعدادات' })).toBeTruthy()
    expect(card('الخطط والأسعار')).toBeTruthy()
  })

  it('leaves the settings screens out of the sidebar, which opens them from Settings', () => {
    const inSidebar = CONSOLE_ITEMS.map((item) => item.to)
    for (const to of [
      '/console/billing/settings',
      '/console/billing/accounts',
      '/console/billing/seller',
      '/console/company-contact',
      '/console/operators',
      '/console/policies',
      '/console/audit',
      '/console/branch-access',
      '/console/settings',
    ]) {
      expect(inSidebar).not.toContain(to)
    }
  })
})
