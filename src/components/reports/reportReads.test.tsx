import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { ReportsIncomePage } from '../../pages/ReportsIncomePage'
import { ReportsCompliancePage } from '../../pages/ReportsCompliancePage'
import { CASHIER_ROLE, VIEWER_ROLE } from '../../testing/roles'

/** The built-in Sales Manager's reporting: `reports.sales.read` without `reports.read`. */
const SALES_ONLY: Entitlements = {
  ...VIEWER_ROLE,
  username: 'sales_user',
  permissions: ['invoice.read', 'reports.sales.read'],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements

const asked = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  fetchMock = vi.fn(async (url: string) =>
    url === '/api/v1/me/entitlements' ? json(200, who) : json(404, { type: 'about:blank' }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/income" element={<ReportsIncomePage />} />
        <Route path="/reports/compliance" element={<ReportsCompliancePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Lets every read the page and the shell start on arriving go out before counting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('IE3-04: the reports a reader may not read are neither offered nor asked', () => {
  it('a cashier deep-linking a report asks for none of it and sees the notice the 403 drew', async () => {
    who = CASHIER_ROLE
    renderAt('/reports/income')
    expect(await screen.findByText('No access')).toBeTruthy()
    await settle()
    expect(asked('/api/v1/reports')).toEqual([])
    // The Reports group and the compliance entries are gone from the cashier's navigation, which
    // is drawn (Customers is the cashier's), so their absence is not an empty sidebar's.
    expect(await screen.findByRole('link', { name: 'Customers' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Reports/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'TDD & OTA' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Documents' })).toBeNull()
  })

  it('a cashier on the compliance report asks nothing of the activity ledger', async () => {
    who = CASHIER_ROLE
    renderAt('/reports/compliance')
    expect(await screen.findByText('No access')).toBeTruthy()
    await settle()
    expect(asked('/api/v1/compliance/activity')).toEqual([])
  })

  it('a viewer still reads the report and is offered every report', async () => {
    who = VIEWER_ROLE
    renderAt('/reports/income')
    expect(await screen.findByRole('button', { name: /^Reports/ })).toBeTruthy()
    await waitFor(() => expect(asked('/api/v1/reports/volume').length).toBeGreaterThan(0))
    expect(screen.queryByText('No access')).toBeNull()
    expect(screen.getByRole('link', { name: 'Cash flow' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'TDD & OTA' })).toBeTruthy()
  })

  it('a sales-only reader is offered the reports that take reports.sales.read, and no others', async () => {
    who = SALES_ONLY
    renderAt('/reports/income')
    expect(await screen.findByRole('link', { name: 'Lists' })).toBeTruthy()
    await waitFor(() => expect(asked('/api/v1/reports/volume').length).toBeGreaterThan(0))
    expect(screen.queryByRole('link', { name: 'Cash flow' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'VAT & Tax' })).toBeNull()
  })
})
