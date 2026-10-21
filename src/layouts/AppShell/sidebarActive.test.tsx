import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { AppShell } from './AppShell'

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['product.read'],
  scopes: [],
  featureFlags: {},
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/v1/me/entitlements' ? json(OWNER) : new Response('', { status: 404 }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The sidebar lights the page you are on, never its parent too (owner, 21 Oct 2026). */
describe('the sidebar under Catalogue', () => {
  it.each([
    ['/catalog/bundles', 'Bundles'],
    ['/catalog', 'All Items'],
    ['/catalog/rules/new', 'Price Rules'],
  ])('on %s lights only %s', async (path, label) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppShell>
          <p>page</p>
        </AppShell>
      </MemoryRouter>,
    )
    await screen.findByText('page')
    const lit = (await screen.findAllByRole('link')).filter(
      (link) => link.getAttribute('aria-current') === 'page',
    )
    expect(lit.map((link) => link.textContent?.trim())).toEqual([label])
  })
})
