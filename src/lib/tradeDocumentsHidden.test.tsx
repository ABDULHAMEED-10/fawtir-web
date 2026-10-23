import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import { resetSharedRequests } from '../api'
import { forgetEntitlements, type Entitlements } from './identity/entitlements'
import { AppShell } from '../layouts/AppShell/AppShell'
import { DemoModule } from '../components/feedback/DemoModule'
import { USED_DOCUMENTS } from './catalogItem'
import { CLOSING_BLOCKERS } from './settingsRecords'

/**
 * R6 (owner, 23 Oct 2026): quotations, order forms and delivery notes showed another company's
 * sample records inside a real session. They are hidden until connected to the real API: no nav
 * entry, no link into them, and their routes show "not available yet" instead of the samples.
 */

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'customer.read', 'supplier.read', 'product.read'],
  scopes: [],
  featureFlags: {},
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const SAMPLE = 'Muscat Grand Hotel LLC sample quotation'

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
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('trade documents are hidden until connected (R6)', () => {
  it('has no Trade documents entry in the sidebar, and the rest of it is still there', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell>
          <p>page</p>
        </AppShell>
      </MemoryRouter>,
    )
    await screen.findByText('page')
    expect((await screen.findAllByText(i18n.t('dashboard.nav.income'))).length).toBeGreaterThan(0)
    expect(screen.queryByText(i18n.t('dashboard.nav.tradeDocuments'))).toBeNull()
    expect(screen.queryByText(i18n.t('dashboard.nav.tradeDocumentChildren.quotations'))).toBeNull()
    expect(screen.queryByText(i18n.t('dashboard.nav.tradeDocumentChildren.orderForms'))).toBeNull()
    expect(
      screen.queryByText(i18n.t('dashboard.nav.tradeDocumentChildren.deliveryNotes')),
    ).toBeNull()
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.filter((href) => href.startsWith('/trade-documents'))).toEqual([])
  })

  it.each([undefined, 'true'])(
    'shows "not available yet", never the sample records, with demos %s',
    async (demos) => {
      vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', demos)
      render(
        <MemoryRouter>
          <DemoModule module="tradeDocuments">
            <p>{SAMPLE}</p>
          </DemoModule>
        </MemoryRouter>,
      )
      expect(screen.queryByText(SAMPLE)).toBeNull()
      expect(screen.queryByText(i18n.t('demoModule.ribbon'))).toBeNull()
      expect(
        await screen.findByRole('heading', {
          name: i18n.t('moduleUnavailable.tradeDocuments.title'),
        }),
      ).toBeTruthy()
    },
  )

  it('still shows other prototypes (POS) under the sample-data ribbon', () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', undefined)
    render(
      <MemoryRouter>
        <DemoModule module="pos">
          <p>{SAMPLE}</p>
        </DemoModule>
      </MemoryRouter>,
    )
    expect(screen.getByText(SAMPLE)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(i18n.t('demoModule.ribbon'))
  })

  it('leaves no link into quotations from the catalogue and closing prototypes', () => {
    expect(
      USED_DOCUMENTS.map((row) => row.to).filter((to) => to?.startsWith('/trade-documents')),
    ).toEqual([])
    const open = CLOSING_BLOCKERS.find((blocker) => blocker.id === 'openQuotations')
    expect(open?.to).toBeUndefined()
    expect(open?.actionKey).toBeUndefined()
  })
})
