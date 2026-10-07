import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import type { Entitlements } from '../../lib/identity/entitlements'
import { SessionContext } from '../../lib/session/session'
import { DashboardHeader } from './KpiSection'

const SESSION: Entitlements = {
  userId: 'u-1',
  username: 'saji.khan',
  tenantId: 't-1',
  tenantName: 'Sohar Marine Supplies',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

function renderHeader(session: Entitlements | null) {
  return render(
    <SessionContext.Provider value={session}>
      <DashboardHeader />
    </SessionContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('DashboardHeader greeting', () => {
  it('greets the signed-in user, never the demo user', () => {
    renderHeader(SESSION)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, saji.khan')
    expect(document.body.textContent).not.toContain('Hafidh')
  })

  it('greets nobody by name before the session has answered', () => {
    renderHeader(null)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning')
  })

  it('greets in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderHeader(SESSION)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('صباح الخير، saji.khan')
  })
})
