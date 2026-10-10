import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { DemoModule } from './DemoModule'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'

const SAMPLE = 'Al Bahja Coffee prototype till'

function renderGate(module: 'pos' | 'console') {
  return render(
    <MemoryRouter>
      <DemoModule module={module}>
        <p>{SAMPLE}</p>
      </DemoModule>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/v1/me/entitlements'
        ? new Response(JSON.stringify({ userId: 'u', username: 'u', tenantId: 't', roles: [], permissions: [], scopes: [], featureFlags: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: 404 }),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})


describe('a prototype route', () => {
  it('shows the prototype under the sample-data ribbon by default', () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', undefined)
    renderGate('pos')
    expect(screen.getByText(SAMPLE)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(i18n.t('demoModule.ribbon'))
  })

  it('never shows the prototype without the ribbon', () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', 'true')
    renderGate('console')
    expect(screen.getByText(SAMPLE)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(i18n.t('demoModule.ribbon'))
  })

  it('is the honest "not available yet" page when a build hides prototypes', async () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', 'false')
    renderGate('pos')
    expect(screen.queryByText(SAMPLE)).toBeNull()
    expect(await screen.findByRole('heading', { name: i18n.t('moduleUnavailable.pos.title') })).toBeTruthy()
  })

  it('hides console prototypes the same way', () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', 'false')
    renderGate('console')
    expect(screen.queryByText(SAMPLE)).toBeNull()
  })
})
