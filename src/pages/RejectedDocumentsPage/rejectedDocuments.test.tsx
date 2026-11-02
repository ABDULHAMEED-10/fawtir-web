import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { rejectedDocumentsPath } from '../../api/expenditure/rejectedDocuments'
import { rejectedTypeKey, rejectionDelivery } from '../../lib/rejectedDocuments'
import { formatInstant } from '../../lib/format'
import { RejectedDocumentsPage } from './RejectedDocumentsPage'
import { BillsPage } from '../BillsPage'

// Batch 39 EXP: supplier documents refused on arrival with MLS RE. Written NOT RUN (static batch).

const session = (permissions: string[], allBranches?: boolean): Entitlements =>
  ({
    userId: 'u-1',
    username: 'owner',
    tenantId: 't-1',
    tenantName: 'Al Bahja Coffee',
    roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
    permissions,
    scopes: [],
    featureFlags: {},
    ...(allBranches === undefined ? {} : { allBranches }),
  }) as Entitlements

const LIST = '/api/v1/inbound-invoices/rejected'
const PAGE0 = `${LIST}?page=0&page_size=25`
const BANNER = `${LIST}?page=0&page_size=1`

const ROW = {
  messageId: '9b1d0000-0000-4000-8000-000000000001',
  senderParticipantId: '0248:om1100123456',
  documentType: 'INVOICE',
  selfBilling: false,
  receivedAt: '2026-10-03T05:15:00Z',
  rejectedAt: '2026-10-03T05:15:02Z',
  mlsCode: 'RE',
  mlsTransportState: 'DELIVERED',
  mlsDeliveredAt: '2026-10-03T05:16:00Z',
}

const STILL_SENDING = {
  ...ROW,
  messageId: '9b1d0000-0000-4000-8000-000000000002',
  documentType: 'CREDIT_NOTE',
  selfBilling: true,
  mlsTransportState: 'RETRY_SCHEDULED',
  mlsDeliveredAt: null,
}

const pageOf = (items: unknown[], total = items.length, page = 0, pageSize = 25) => ({
  items,
  page,
  pageSize,
  count: items.length,
  total,
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
  me = session(['invoice.read'])
  answers = {
    [PAGE0]: () => json(200, pageOf([ROW, STILL_SENDING])),
    [BANNER]: () => json(200, pageOf([ROW], 2, 0, 1)),
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
        <Route path="/expenditure/bills/rejected" element={<RejectedDocumentsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the rejection is worded from its own transport row', () => {
  it('keeps the decision apart from the delivery', () => {
    const at = (state: string | null, deliveredAt: string | null = null) =>
      rejectionDelivery({ mlsTransportState: state, mlsDeliveredAt: deliveredAt }).key
    expect(at(null)).toBe('rejectedDocuments.delivery.notQueued')
    expect(at('PENDING')).toBe('rejectedDocuments.delivery.sending')
    expect(at('SENDING')).toBe('rejectedDocuments.delivery.sending')
    expect(at('RETRY_SCHEDULED')).toBe('rejectedDocuments.delivery.sending')
    expect(at('SENT_AWAITING_MDN')).toBe('rejectedDocuments.delivery.awaitingReceipt')
    expect(at('DELIVERED', '2026-10-03T05:16:00Z')).toBe('rejectedDocuments.delivery.delivered')
    expect(at('DELIVERED')).toBe('rejectedDocuments.delivery.deliveredUndated')
    expect(at('MDN_FAILED')).toBe('rejectedDocuments.delivery.failed')
    expect(at('DEAD_LETTERED')).toBe('rejectedDocuments.delivery.failed')
    expect(at('INBOUND_RECEIVED')).toBe('rejectedDocuments.delivery.unknown')
    expect(at('A_STATE_ADDED_LATER')).toBe('rejectedDocuments.delivery.unknown')
  })

  it('names a self-billed document as one', () => {
    expect(rejectedTypeKey({ documentType: 'CREDIT_NOTE', selfBilling: true })).toBe(
      'rejectedDocuments.type.selfBilled.CREDIT_NOTE',
    )
    expect(rejectedTypeKey({ documentType: 'INVOICE', selfBilling: false })).toBe(
      'rejectedDocuments.type.plain.INVOICE',
    )
  })

  it('asks with the parameter the controller reads (page_size, not pageSize)', () => {
    expect(rejectedDocumentsPath(2)).toBe('/v1/inbound-invoices/rejected?page=2&page_size=25')
  })
})

describe('Rejected by Fawtir', () => {
  it('lists who sent each one, when, and whether the rejection reached them; nothing opens or pays', async () => {
    renderAt('/expenditure/bills/rejected')

    expect(
      await screen.findByRole('heading', {
        name: i18n.t('rejectedDocuments.countTitle', { count: 2, n: '2' }),
      }),
    ).toBeTruthy()
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('0248:om1100123456')).toHaveLength(2)
    expect(within(table).getByText(i18n.t('rejectedDocuments.type.plain.INVOICE'))).toBeTruthy()
    expect(
      within(table).getByText(i18n.t('rejectedDocuments.type.selfBilled.CREDIT_NOTE')),
    ).toBeTruthy()
    const delivery = within(table).getAllByTestId('rejected-delivery').map((cell) => cell.textContent)
    expect(delivery).toEqual([
      i18n.t('rejectedDocuments.delivery.delivered', {
        date: formatInstant('2026-10-03T05:16:00Z', 'en'),
      }),
      i18n.t('rejectedDocuments.delivery.sending'),
    ])
    // Not bills: no link into a document, and no pay, approve or hold.
    expect(within(table).queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('button').filter((b) => /pay|approve|hold/i.test(b.textContent ?? ''))).toHaveLength(0)
    expect(screen.queryByText('RETRY_SCHEDULED')).toBeNull()
  })

  it('reads the server page by page', async () => {
    answers[PAGE0] = () => json(200, pageOf([ROW], 30))
    answers[`${LIST}?page=1&page_size=25`] = () =>
      json(200, pageOf([{ ...ROW, messageId: 'second', senderParticipantId: '0248:om9' }], 30, 1))
    renderAt('/expenditure/bills/rejected')

    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(await screen.findByText('0248:om9')).toBeTruthy()
  })

  it('says nothing was rejected when nothing was', async () => {
    answers[PAGE0] = () => json(200, pageOf([]))
    renderAt('/expenditure/bills/rejected')
    expect(await screen.findByText(i18n.t('rejectedDocuments.noneTitle'))).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('reads a branch-limited refusal (403) as no access, never as an empty list', async () => {
    answers[PAGE0] = () =>
      json(403, { type: 'about:blank', status: 403, code: 'branch-scope-company-report' })
    renderAt('/expenditure/bills/rejected')
    expect(await screen.findByText(i18n.t('appAccess.noAccess'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('rejectedDocuments.noneTitle'))).toBeNull()
  })

  it('is in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/expenditure/bills/rejected')
    expect(
      await screen.findByRole('heading', { level: 1, name: i18n.t('rejectedDocuments.title') }),
    ).toBeTruthy()
    expect(i18n.t('rejectedDocuments.title')).not.toBe('rejectedDocuments.title')
  })
})

describe('the count on the Bills list', () => {
  it('says how many were rejected and opens the list', async () => {
    renderAt('/expenditure/bills')
    const open = await screen.findByRole('link', { name: i18n.t('rejectedDocuments.banner.open') })
    expect(open.getAttribute('href')).toBe('/expenditure/bills/rejected')
  })

  it('is not read at all for a branch-limited person, who would be refused it', async () => {
    me = session(['invoice.read'], false)
    renderAt('/expenditure/bills')
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/v1/me/entitlements')).toBe(true),
    )
    await screen.findByRole('heading', { level: 1 })
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith(LIST))).toBe(false)
    expect(screen.queryByTestId('rejected-documents-banner')).toBeNull()
  })

  it('draws nothing when none were rejected, or on a server before batch 39 (404)', async () => {
    answers[BANNER] = () => json(200, pageOf([], 0, 0, 1))
    const { unmount } = renderAt('/expenditure/bills')
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === BANNER)).toBe(true),
    )
    expect(screen.queryByTestId('rejected-documents-banner')).toBeNull()
    unmount()

    resetSharedRequests()
    delete answers[BANNER]
    renderAt('/expenditure/bills')
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((call) => String(call[0]) === BANNER).length).toBe(2),
    )
    expect(screen.queryByTestId('rejected-documents-banner')).toBeNull()
  })
})
