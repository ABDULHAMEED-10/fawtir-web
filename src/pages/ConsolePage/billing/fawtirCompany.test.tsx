import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { ConsoleFawtirCompanyPage } from './ConsoleFawtirCompanyPage'

/** Console › Settings › Fawtir company details: three screens, one page (owner, 24 Oct 2026). */
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'

const MANAGER: Entitlements = {
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
  permissions: ['platform.billing.read', 'platform.billing.manage'],
  scopes: [],
  featureFlags: {},
}

let who: Entitlements
let asked: string[]

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  asked = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(String(url))
      return url === ENTITLEMENTS_URL
        ? new Response(JSON.stringify(who), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response(null, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/console/settings/company']}>
      <Routes>
        <Route path="/console/settings/company" element={<ConsoleFawtirCompanyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Fawtir company details', () => {
  it('holds the seller, the bank account and the contact details under one Settings title', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Fawtir company details' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    for (const key of [
      'console.seller.title',
      'console.bankAccounts.title',
      'console.companyContact.title',
    ]) {
      expect(await screen.findByRole('heading', { level: 3, name: i18n.t(key) })).toBeTruthy()
    }
  })

  it('leaves the seller out for an operator whose role cannot open it, as its own page does', async () => {
    who = { ...MANAGER, permissions: ['platform.billing.read'] }
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 3, name: i18n.t('console.bankAccounts.title') }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('heading', { level: 3, name: i18n.t('console.seller.title') }),
    ).toBeNull()
    expect(asked.some((url) => url.includes('/seller'))).toBe(false)
  })
})
