import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillRowDto, BillSummaryDto } from '../../api/expenditure/bills'
import { BillsPage } from './BillsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/bills/summary'
const ORIGINAL = '22222222-2222-2222-2222-222222222222'
const VIEW = i18n.t('billsPage.rowMenu.view', { lng: 'en' })

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.approve', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}

const TABS: BillSummaryDto['tabs'] = {
  needsAttention: 0,
  all: 3,
  awaitingApproval: 0,
  approved: 1,
  onHold: 2,
  paid: 0,
  truncated: false,
}

function summary(tabs: BillSummaryDto['tabs']): BillSummaryDto {
  return {
    currencyCode: 'OMR',
    openCount: 1,
    openTotal: 100,
    overdueCount: 0,
    dueThisWeekCount: 0,
    dueThisWeekTotal: 0,
    readyToPayCount: 0,
    readyToPayTotal: 0,
    disputedCount: 0,
    disputedTotal: 0,
    excludedFromTotals: 0,
    needsAttention: { draft: 0, new: 0, mismatch: 0, awaitingApproval: 0, total: 0, truncated: false },
    tabs,
  }
}

function heldCopy(id: string, resolution: 'CONFIRMED_DUPLICATE' | null): BillRowDto {
  return {
    id,
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '380',
    supplierBillNumber: `QMS-${id}`,
    issueDate: '2026-09-01',
    dueDate: null,
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 100,
    vatAmount: 4.762,
    paidAmount: 0,
    outstandingAmount: 100,
    purchaseOrderReference: null,
    workflowState: 'ON_HOLD',
    readiness: { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false },
    match: null,
    hold: {
      reason: `Possible duplicate of bill ${ORIGINAL}: the same Peppol supplier sent it again.`,
      openedAt: '2026-10-28T08:00:00Z',
      duplicateOfBillId: ORIGINAL,
      duplicateResolution: resolution,
    },
    duplicateHold: {
      duplicateOfBillId: ORIGINAL,
      duplicateOfBillNumber: `QMS-${id}`,
      resolution,
      sameDocumentUuid: false,
    },
    paymentRunReference: null,
    paidOnTheSpot: false,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let tabs: BillSummaryDto['tabs']
let rows: BillRowDto[]

const listCalls = () =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/v1/bills?'))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  tabs = { ...TABS, heldDuplicate: 2 }
  rows = [heldCopy('1', null), heldCopy('2', 'CONFIRMED_DUPLICATE')]
  fetchMock = vi.fn(async (url: string) => {
    if (url === ENTITLEMENTS_URL) return json(200, ADMIN)
    if (url === SUMMARY_URL) return json(200, summary(tabs))
    if (url.startsWith('/api/v1/bills?'))
      return json(200, { items: rows, page: 0, pageSize: 10, count: rows.length, total: rows.length, truncated: false })
    if (url.startsWith('/api/v1/inbound-invoices/waiting/count')) return json(200, { total: 0 })
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderBills(path = '/expenditure/bills') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/bills" element={<BillsPage />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('held duplicates on the Bills list', () => {
  it('offers no Duplicates tab when the server does not count them', async () => {
    tabs = TABS
    renderBills()
    await screen.findByRole('button', { name: /On hold/ })
    expect(screen.queryByRole('button', { name: /Duplicates/ })).toBeNull()
  })

  it('lists them under their own tab, read by the server filter', async () => {
    renderBills()
    const tab = await screen.findByRole('button', { name: /Duplicates/ })
    expect(within(tab).getByText('2')).toBeTruthy()
    fireEvent.click(tab)
    await waitFor(() =>
      expect(listCalls()).toContain('/api/v1/bills?filter=HELD_DUPLICATE&page=0&page_size=10'),
    )
  })

  it('shows each one for what it is, never the English reason, and offers no plain release', async () => {
    renderBills('/expenditure/bills?tab=heldDuplicate')
    expect((await screen.findAllByText('Possible duplicate')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Duplicate').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Possible duplicate of bill/)).toBeNull()
    const review = screen.getAllByRole('link', { name: 'Compare and decide' })
    expect(review).toHaveLength(1)
    expect(review[0].getAttribute('href')).toBe('/expenditure/bills/1')

    const menus = screen.getAllByRole('button', { name: 'Bill actions' })
    expect(menus).toHaveLength(2)
    for (const menu of menus) {
      fireEvent.click(menu)
      expect(await screen.findByRole('menuitem', { name: VIEW })).toBeTruthy()
      expect(screen.queryByRole('menuitem', { name: 'Release' })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: 'Put on hold' })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: 'Reject' })).toBeNull()
      fireEvent.keyDown(document, { key: 'Escape' })
    }
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderBills('/expenditure/bills?tab=heldDuplicate')
    expect(await screen.findByRole('button', { name: /الفواتير المكررة/ })).toBeTruthy()
    expect((await screen.findAllByText('مكررة محتملة')).length).toBeGreaterThan(0)
  })
})
