import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { WaitingDocumentsPage } from './WaitingDocumentsPage'
import { BillsPage } from '../BillsPage'

/**
 * Business Rules AL-7: at 0 left, supplier documents are received, reported to the Tax Authority
 * and held. The company sees that they arrived (supplier, number, date and a count) and cannot
 * open them until the reason is gone.
 */
const session = (permissions: string[]): Entitlements =>
  ({
    userId: 'u-1',
    username: 'owner',
    tenantId: 't-1',
    tenantName: 'Al Bahja Coffee',
    roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
    permissions,
    scopes: [],
    featureFlags: {},
  }) as Entitlements

const ADMIN = session(['invoice.read', 'tenant.plan.read', 'tenant.plan.manage'])
const CLERK = session(['invoice.read'])

const LIST = '/api/v1/inbound-invoices/waiting'
const COUNT = '/api/v1/inbound-invoices/waiting/count'

const ROW = {
  id: '7a0c1f00-0000-4000-8000-000000000001',
  supplierName: 'Muscat Roastery LLC',
  supplierParticipantId: '0248:om1100123456',
  invoiceNumber: 'INV-2401',
  issueDate: '2026-10-03',
  receivedAt: '2026-10-03T05:15:00Z',
  documentType: 'INVOICE',
  reason: 'NO_DOCUMENTS_LEFT',
}

const LEGACY = {
  ...ROW,
  id: '7a0c1f00-0000-4000-8000-000000000002',
  supplierName: null,
  issueDate: null,
  invoiceNumber: null,
  documentType: 'CREDIT_NOTE',
  reason: 'SUBSCRIPTION_ENDED',
}

const BY_REASON = { COMPANY_NOT_ACTIVE: 0, SUBSCRIPTION_ENDED: 1, NO_DOCUMENTS_LEFT: 1 }

const pageOf = (items: unknown[], total = items.length, page = 0) => ({
  items,
  page,
  pageSize: 25,
  count: items.length,
  total,
  byReason: BY_REASON,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let me: Entitlements
let answers: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  me = ADMIN
  answers = {
    [`${LIST}?page=0&page_size=25`]: () => json(200, pageOf([ROW, LEGACY])),
    [COUNT]: () => json(200, { total: 2, byReason: BY_REASON }),
  }
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, me)
    const answer = answers[url]
    return answer ? answer() : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/bills" element={<BillsPage />} />
        <Route path="/expenditure/bills/waiting" element={<WaitingDocumentsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AL-7: the waiting list of held supplier documents', () => {
  it('shows who sent each one, its number, dates and a count, and never links to it', async () => {
    renderAt('/expenditure/bills/waiting')

    expect(
      await screen.findByRole('heading', {
        name: i18n.t('waitingDocuments.countTitle', { count: 2, n: '2' }),
      }),
    ).toBeTruthy()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Muscat Roastery LLC')).toBeTruthy()
    expect(within(table).getAllByText('0248:om1100123456')).toHaveLength(2)
    expect(within(table).getByText('INV-2401')).toBeTruthy()
    expect(within(table).getByText('3 Oct 2026')).toBeTruthy()
    // A document from before V310 states no supplier name or issue date: said, not left blank.
    expect(within(table).getAllByText(i18n.t('waitingDocuments.notStated')).length).toBe(3)
    expect(within(table).getByText(i18n.t('waitingDocuments.type.CREDIT_NOTE'))).toBeTruthy()
    // Words, not the server's codes.
    expect(screen.queryByText('NO_DOCUMENTS_LEFT')).toBeNull()
    // The document answers 404 until it is released, so nothing in the table opens it.
    expect(within(table).queryAllByRole('link')).toHaveLength(0)
  })

  it('reads the server page by page, oldest first, with its own page size', async () => {
    answers[`${LIST}?page=0&page_size=25`] = () => json(200, pageOf([ROW], 30))
    answers[`${LIST}?page=1&page_size=25`] = () =>
      json(200, pageOf([{ ...ROW, id: 'second-page', invoiceNumber: 'INV-2499' }], 30, 1))
    renderAt('/expenditure/bills/waiting')

    await screen.findByText('INV-2401')
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(await screen.findByText('INV-2499')).toBeTruthy()
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls).toContain(`${LIST}?page=1&page_size=25`)
  })

  it('says what opens each reason and, to someone who may act, where', async () => {
    renderAt('/expenditure/bills/waiting')

    expect(
      await screen.findByText(i18n.t('waitingDocuments.explain.NO_DOCUMENTS_LEFT'), {
        exact: false,
      }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: i18n.t('waitingDocuments.wayOut.NO_DOCUMENTS_LEFT') })
        .getAttribute('href'),
    ).toBe('/settings/plan')
    expect(
      screen
        .getByRole('link', { name: i18n.t('waitingDocuments.wayOut.SUBSCRIPTION_ENDED') })
        .getAttribute('href'),
    ).toBe('/settings/bills')
  })

  it('tells someone without the plan permission who can act, instead of a link to "no access"', async () => {
    me = CLERK
    renderAt('/expenditure/bills/waiting')

    await screen.findByText(i18n.t('waitingDocuments.explain.NO_DOCUMENTS_LEFT'), { exact: false })
    expect(
      screen.queryByRole('link', { name: i18n.t('waitingDocuments.wayOut.NO_DOCUMENTS_LEFT') }),
    ).toBeNull()
    expect(
      screen.getAllByText(i18n.t('waitingDocuments.askAdministrator'), { exact: false }).length,
    ).toBe(2)
  })

  it('offers no way out for a company Fawtir has not activated', async () => {
    answers[`${LIST}?page=0&page_size=25`] = () =>
      json(200, {
        ...pageOf([{ ...ROW, reason: 'COMPANY_NOT_ACTIVE' }]),
        byReason: { COMPANY_NOT_ACTIVE: 1, SUBSCRIPTION_ENDED: 0, NO_DOCUMENTS_LEFT: 0 },
      })
    renderAt('/expenditure/bills/waiting')

    expect(
      await screen.findByText(i18n.t('waitingDocuments.explain.COMPANY_NOT_ACTIVE'), {
        exact: false,
      }),
    ).toBeTruthy()
    expect(
      screen.queryByText(i18n.t('waitingDocuments.askAdministrator'), { exact: false }),
    ).toBeNull()
    expect(
      screen.queryByText(i18n.t('waitingDocuments.explain.NO_DOCUMENTS_LEFT'), { exact: false }),
    ).toBeNull()
  })

  it('says nothing is waiting when nothing is', async () => {
    answers[`${LIST}?page=0&page_size=25`] = () =>
      json(200, {
        ...pageOf([]),
        byReason: { COMPANY_NOT_ACTIVE: 0, SUBSCRIPTION_ENDED: 0, NO_DOCUMENTS_LEFT: 0 },
      })
    renderAt('/expenditure/bills/waiting')

    expect(await screen.findByText(i18n.t('waitingDocuments.noneTitle'))).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('reads a refused list as no access, never as an empty one', async () => {
    answers[`${LIST}?page=0&page_size=25`] = () => json(403, { type: 'about:blank', status: 403 })
    renderAt('/expenditure/bills/waiting')

    expect(await screen.findByText(i18n.t('appAccess.noAccess'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('waitingDocuments.noneTitle'))).toBeNull()
  })

  it('is in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/expenditure/bills/waiting')
    expect(
      await screen.findByRole('heading', { level: 1, name: i18n.t('waitingDocuments.title') }),
    ).toBeTruthy()
    expect(i18n.t('waitingDocuments.title')).not.toBe('waitingDocuments.title')
    expect(screen.getByText(i18n.t('waitingDocuments.reason.NO_DOCUMENTS_LEFT'))).toBeTruthy()
  })
})

describe('AL-7: the count on the Bills list', () => {
  it('says how many are waiting and opens the list', async () => {
    renderAt('/expenditure/bills')

    const open = await screen.findByRole('link', { name: i18n.t('waitingDocuments.banner.open') })
    expect(open.getAttribute('href')).toBe('/expenditure/bills/waiting')
    expect(
      screen.getByText(i18n.t('waitingDocuments.banner.title', { count: 2, n: '2' })),
    ).toBeTruthy()
  })

  it('draws nothing while nothing waits, or when the count cannot be read', async () => {
    answers[COUNT] = () =>
      json(200, {
        total: 0,
        byReason: { COMPANY_NOT_ACTIVE: 0, SUBSCRIPTION_ENDED: 0, NO_DOCUMENTS_LEFT: 0 },
      })
    const { unmount } = renderAt('/expenditure/bills')
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === COUNT)).toBe(true),
    )
    expect(screen.queryByRole('link', { name: i18n.t('waitingDocuments.banner.open') })).toBeNull()
    unmount()

    resetSharedRequests()
    answers[COUNT] = () => json(500, { type: 'about:blank', status: 500 })
    renderAt('/expenditure/bills')
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((call) => String(call[0]) === COUNT).length).toBe(2),
    )
    expect(screen.queryByRole('link', { name: i18n.t('waitingDocuments.banner.open') })).toBeNull()
  })
})
