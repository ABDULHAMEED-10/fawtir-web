import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { ReportsIncomePage } from '../../pages/ReportsIncomePage'
import { ReportsCompliancePage } from '../../pages/ReportsCompliancePage'
import { ReportsVatPage } from '../../pages/ReportsVatPage'
import { ReportsExpenditurePage } from '../../pages/ReportsExpenditurePage'
import { ReportsCashFlowPage } from '../../pages/ReportsCashFlowPage'
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
        <Route path="/reports/vat-tax" element={<ReportsVatPage />} />
        <Route path="/reports/expenditure" element={<ReportsExpenditurePage />} />
        <Route path="/reports/cash-flow" element={<ReportsCashFlowPage />} />
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

describe('review W-03: the Export button only for a reader the export admits', () => {
  const exportButton = () => screen.queryByRole('button', { name: 'Export as PDF' })

  it('draws no Export button for a cashier, whom /reports/volume.csv would refuse', async () => {
    who = CASHIER_ROLE
    renderAt('/reports/income')
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(exportButton()).toBeNull()
  })

  it('offers a sales-only reader the income files, which take reports.sales.read too', async () => {
    who = SALES_ONLY
    renderAt('/reports/income')
    await screen.findByRole('link', { name: 'Lists' })
    fireEvent.click(exportButton()!)
    expect(await screen.findByRole('menuitem', { name: /CSV/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Excel/ })).toBeTruthy()
  })
})

describe('review R2-03: the reports.read pages draw Export only for a reader of reports.read', () => {
  const exportButton = () => screen.queryByRole('button', { name: 'Export as PDF' })
  const pages = ['/reports/vat-tax', '/reports/expenditure', '/reports/cash-flow']

  it.each(pages)('%s: a sales-only reader sees the notice, asks nothing and is offered no Export', async (path) => {
    who = SALES_ONLY
    renderAt(path)
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(exportButton()).toBeNull()
    await settle()
    expect(asked('/api/v1/reports')).toEqual([])
  })

  it.each(pages)('%s: a viewer is offered the files', async (path) => {
    who = VIEWER_ROLE
    renderAt(path)
    fireEvent.click(await screen.findByRole('button', { name: 'Export as PDF' }))
    expect(await screen.findByRole('menuitem', { name: /CSV/ })).toBeTruthy()
  })
})

describe('review R2-02: a report page follows the session the shell recovers', () => {
  const exportButton = () => screen.queryByRole('button', { name: 'Export as PDF' })
  const entitlementCalls = () => asked('/api/v1/me/entitlements').length

  /** The first `failures` session answers are a 503; the ones after answer `who`. */
  function failSession(failures: number) {
    let failed = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url !== '/api/v1/me/entitlements') return json(404, { type: 'about:blank' })
      if (failed < failures) {
        failed += 1
        return json(503, { type: 'https://api.fawtir.om/problems/internal-error' })
      }
      return json(200, who)
    })
  }

  it('asks nothing and offers no Export while the session answer has failed', async () => {
    who = VIEWER_ROLE
    failSession(1)
    renderAt('/reports/vat-tax')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    await settle()
    expect(asked('/api/v1/reports')).toEqual([])
    expect(exportButton()).toBeNull()
  })

  it('a reader the retried answer admits gets the report and its Export back', async () => {
    who = VIEWER_ROLE
    failSession(1)
    renderAt('/reports/vat-tax')
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(asked('/api/v1/reports/vat').length).toBeGreaterThan(0))
    expect(screen.queryByText('No access')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Export as PDF' }))
    expect(await screen.findByRole('menuitem', { name: /CSV/ })).toBeTruthy()
  })

  it('a reader the retried answer does not admit stays on the notice, asking nothing', async () => {
    who = SALES_ONLY
    failSession(1)
    renderAt('/reports/vat-tax')
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No access')).toBeTruthy()
    await settle()
    expect(asked('/api/v1/reports')).toEqual([])
    expect(exportButton()).toBeNull()
  })

  it('keeps refusing through repeated failures, asking once per click', async () => {
    who = VIEWER_ROLE
    failSession(Number.POSITIVE_INFINITY)
    renderAt('/reports/vat-tax')
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    await settle()
    expect(entitlementCalls()).toBe(3)
    expect(asked('/api/v1/reports')).toEqual([])
    expect(exportButton()).toBeNull()
    expect(screen.queryByText('No access')).toBeNull()
  })
})
