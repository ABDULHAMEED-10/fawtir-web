import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ActivityItemDto, ActivitySummaryDto } from '../../api/compliance/activity'
import { ACK_TONE, canResubmit, isFailure, shareOf, slaStateOf } from '../../lib/activityLedger'
import { ActivityPage } from './ActivityPage'
import { ReportsCompliancePage } from '../ReportsCompliancePage'

const UUID_A = 'a0000000-0000-0000-0000-000000000001'
const UUID_B = 'a0000000-0000-0000-0000-000000000002'

const SUBMITTER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.submit', 'reports.read'],
  scopes: [],
  featureFlags: {},
}

const READER: Entitlements = { ...SUBMITTER, permissions: ['invoice.read', 'reports.read'] }

function item(over: Partial<ActivityItemDto> = {}): ActivityItemDto {
  return {
    invoice_uuid: UUID_A,
    direction: 'ISSUED',
    document_kind: 'INVOICE',
    document_type_code: '380',
    invoice_number: 'INV-0001',
    counterparty: 'Al Bahja Coffee',
    occurred_at: '2026-09-20T08:00:00Z',
    validated_at: '2026-09-20T08:00:05Z',
    b2c: false,
    transport_state: 'SENT',
    invoice_leg: { ack: 'AP', ack_at: '2026-09-20T08:01:00Z', reason: null },
    tdd_leg: {
      variant: 'B2B',
      status: 'SUBMITTED',
      validated_at: '2026-09-20T08:00:05Z',
      sla_deadline: '2026-09-20T08:15:05Z',
      submitted_at: '2026-09-20T08:02:00Z',
      sla_met: true,
      ack: 'AP',
      ack_at: '2026-09-20T08:03:00Z',
      reason: null,
    },
    attention: false,
    links: { document: '/api/v1/invoices/inv-1', tdd_xml: '/api/v1/invoices/inv-1/tdd', resubmit: null },
    ...over,
  }
}

const SUMMARY: ActivitySummaryDto = {
  from: null,
  to: null,
  documents: 100,
  tdd_ack: { ap: 60, ab: 10, re: 5, none: 25 },
  invoice_ack: { ap: 80, ab: 5, re: 2, none: 13 },
  dead_lettered: 1,
  attention: 6,
  sla: { met: 70, missed: 5, pending: 25 },
  median_minutes_to_tdd_ack: 3.4,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let items: ActivityItemDto[]
let resubmitted: string[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = SUBMITTER
  items = [item()]
  resubmitted = []

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.includes('/me/entitlements')) return json(200, who)
    if (url.includes('/tdd/resubmit') && init?.method === 'POST') {
      resubmitted.push(url)
      return json(200, {})
    }
    if (url.includes('/compliance/activity/summary')) return json(200, SUMMARY)
    if (url.includes('/compliance/activity')) {
      return json(200, { items, page: 0, page_size: 25, has_more: false })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const calls = (fragment: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes(fragment))

const renderLedger = () =>
  render(
    <MemoryRouter initialEntries={['/activity']}>
      <Routes>
        <Route path="/activity" element={<ActivityPage />} />
      </Routes>
    </MemoryRouter>,
  )

const renderCompliance = () =>
  render(
    <MemoryRouter initialEntries={['/reports/compliance']}>
      <Routes>
        <Route path="/reports/compliance" element={<ReportsCompliancePage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('what an acknowledgement means', () => {
  it('treats silence as silence, not as a failure', () => {
    // SPOG v1.0.0 §6.2 forbids resending "solely because no MLS has been received", so NONE
    // must not read as a problem anywhere downstream.
    expect(isFailure('NONE')).toBe(false)
    expect(isFailure('RE')).toBe(true)
    expect(isFailure('AP')).toBe(false)
    expect(isFailure('AB')).toBe(false)
    expect(ACK_TONE.NONE).toBe('silent')
    expect(ACK_TONE.RE).toBe('rejected')
  })

  it('offers a resubmission only where the server put a link', () => {
    // Never derived from the ack: a screen that can see silence must not be the thing that
    // decides a resend is warranted.
    expect(canResubmit(item())).toBe(false)
    expect(canResubmit(item({ tdd_leg: { ...item().tdd_leg!, ack: 'NONE' } }))).toBe(false)
    expect(canResubmit(item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } }))).toBe(true)
  })
})

describe('the deadline', () => {
  const now = new Date('2026-09-20T08:30:00Z')

  it('is pending inside the window and missed once it passes with nothing sent', () => {
    expect(slaStateOf(item(), now)).toBe('met')
    expect(slaStateOf(item({ tdd_leg: { ...item().tdd_leg!, sla_met: false } }), now)).toBe('missed')

    // Null while nothing has been submitted: inside its window a document has broken nothing.
    const open = item({ tdd_leg: { ...item().tdd_leg!, sla_met: null, submitted_at: null, sla_deadline: '2026-09-20T09:00:00Z' } })
    expect(slaStateOf(open, now)).toBe('pending')

    const late = item({ tdd_leg: { ...item().tdd_leg!, sla_met: null, submitted_at: null, sla_deadline: '2026-09-20T08:15:00Z' } })
    expect(slaStateOf(late, now)).toBe('missed')

    expect(slaStateOf(item({ tdd_leg: null }), now)).toBe('none')
  })
})

describe('shares', () => {
  it('keeps zero at zero rather than dividing by nothing', () => {
    // The wire carries no rates on purpose; an empty window must read as 0%, not NaN or 100%.
    expect(shareOf(0, 0)).toBe(0)
    expect(shareOf(5, 0)).toBe(0)
    expect(shareOf(70, 75)).toBe(93)
  })
})

describe('the ledger screen', () => {
  it('keeps the two legs in their own columns', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    // Different parties acknowledging different things: one merged status would lose which spoke.
    expect(screen.getByText("Buyer's Access Point")).toBeTruthy()
    expect(screen.getByText('Tax Authority endpoint')).toBeTruthy()
  })

  it('never reports a tax verdict', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    // The OTA has no channel back to a service provider, so no screen may say it accepted or
    // said anything. The prototype's wording is gone and a note says what the acks actually are.
    expect(screen.queryByText(/Accepted by the OTA/)).toBeNull()
    expect(screen.queryByText(/What the OTA said/)).toBeNull()
    expect(screen.getByText(/transport acknowledgements, not tax decisions/)).toBeTruthy()
  })

  it('shows what is merely waiting apart from what failed', async () => {
    items = [
      item({ tdd_leg: { ...item().tdd_leg!, ack: 'NONE', ack_at: null, sla_met: null } }),
      item({ invoice_uuid: UUID_B, invoice_number: 'INV-0002', tdd_leg: { ...item().tdd_leg!, ack: 'RE', reason: 'Schema' } }),
    ]
    renderLedger()
    await screen.findByText('INV-0001')

    // "Rejected or failed" is also a tab, so the row chips are read from the table.
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('No acknowledgement yet').length).toBeGreaterThan(0)
    expect(within(table).getByText('Rejected or failed')).toBeTruthy()
    expect(within(table).getByText('Schema')).toBeTruthy()
    // Silence is spelled out as not-a-failure where the count is shown.
    expect(screen.getByText(/Nothing has gone wrong/)).toBeTruthy()
  })

  it('resubmits through the href the row carries', async () => {
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')

    fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }))
    await waitFor(() => expect(resubmitted).toHaveLength(1))
    // The /api the catalogue states and the /api the client adds must not both be sent.
    expect(resubmitted[0]).toBe('/api/v1/invoices/inv-1/tdd/resubmit')
  })

  it('offers no resubmission to someone who may not submit', async () => {
    who = READER
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')
    expect(screen.queryByRole('button', { name: 'Resubmit' })).toBeNull()
  })

  it('asks the server for the tab rather than filtering a page', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    fireEvent.click(screen.getByRole('tab', { name: 'Rejected or failed' }))
    await waitFor(() => expect(calls('/compliance/activity?').at(-1)).toContain('tdd_ack=RE'))
  })
})

describe('the compliance report', () => {
  it('reports what was sent and whether it was in time, and nothing about tax', async () => {
    renderCompliance()
    // 70 of 75 decided deadlines were met; the 25 pending are not counted against it.
    expect(await screen.findByText('93%')).toBeTruthy()
    expect(screen.getByText('70%')).toBeTruthy()
    expect(screen.getByText('3 min')).toBeTruthy()
    expect(screen.getByText(/1 gave up after retries/)).toBeTruthy()
    expect(screen.queryByText(/Accepted by the OTA/)).toBeNull()
  })

  it('lists silence beside the rest rather than hiding it', async () => {
    renderCompliance()
    await screen.findByText('93%')
    // Both charts list it — the tax-authority leg and the buyer's — because in a healthy window
    // it is most of the rows and folding it into a failure bucket would misreport the period.
    expect(screen.getAllByText('No acknowledgement yet')).toHaveLength(2)
    expect(screen.getAllByText('Rejected or failed')).toHaveLength(2)
  })
})
