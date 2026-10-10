import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  ActivityDetailDto,
  ActivityItemDto,
  ActivitySummaryDto,
} from '../../api/compliance/activity'
import {
  ACK_TONE,
  canResubmit,
  customerAckOf,
  flowOf,
  formatDuration,
  isFailure,
  outcomeOf,
  refusalCauseOf,
  refusalKindOf,
  routeOf,
  rowRefusalKind,
  shareOf,
  slaStateOf,
  tabCount,
} from '../../lib/activityLedger'
import { numberingOf, periodFigures, vatInside } from '../../lib/complianceReport'
import { ActivityPage } from './ActivityPage'
import { ActivityEventPage } from './ActivityEventPage'
import { TddResubmitPage } from './TddResubmitPage'
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
    links: {
      document: '/api/v1/invoices/inv-1',
      tdd_xml: '/api/v1/invoices/inv-1/tdd',
      resubmit: null,
    },
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
let summaryReply: ActivitySummaryDto
let detailReply: ActivityDetailDto

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = SUBMITTER
  items = [item()]
  resubmitted = []
  summaryReply = SUMMARY
  detailReply = DETAIL

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.includes('/me/entitlements')) return json(200, who)
    if (url.includes('/tdd/resubmit') && init?.method === 'POST') {
      resubmitted.push(url)
      return json(200, {})
    }
    if (url.includes('/reports/ota.')) {
      return new Response('invoiceUuid,direction\n"a","ISSUED"\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv', 'X-Fawtir-Export-Truncated': 'false' },
      })
    }
    if (url.includes('/compliance/activity/summary')) return json(200, summaryReply)
    if (url.includes('/compliance/activity/a0000000')) return json(200, detailReply)
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
    expect(
      canResubmit(
        item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } }),
      ),
    ).toBe(true)
  })
})

describe('the deadline', () => {
  const now = new Date('2026-09-20T08:30:00Z')

  it('is pending inside the window and missed once it passes with nothing sent', () => {
    expect(slaStateOf(item(), now)).toBe('met')
    expect(slaStateOf(item({ tdd_leg: { ...item().tdd_leg!, sla_met: false } }), now)).toBe(
      'missed',
    )

    // Null while nothing has been submitted: inside its window a document has broken nothing.
    const open = item({
      tdd_leg: {
        ...item().tdd_leg!,
        sla_met: null,
        submitted_at: null,
        sla_deadline: '2026-09-20T09:00:00Z',
      },
    })
    expect(slaStateOf(open, now)).toBe('pending')

    const late = item({
      tdd_leg: {
        ...item().tdd_leg!,
        sla_met: null,
        submitted_at: null,
        sla_deadline: '2026-09-20T08:15:00Z',
      },
    })
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

describe('one row, as the frame reads it', () => {
  it('reads the four outcomes off the TDD leg, and superseded only from the server', () => {
    expect(outcomeOf(item())).toBe('accepted')
    expect(outcomeOf(item({ tdd_leg: { ...item().tdd_leg!, ack: 'RE' } }))).toBe('rejected')
    // Silence is "Still waiting", never a rejection.
    expect(outcomeOf(item({ tdd_leg: { ...item().tdd_leg!, ack: 'NONE' } }))).toBe('waiting')
    expect(outcomeOf(item({ tdd_leg: { ...item().tdd_leg!, status: 'SUPERSEDED' } }))).toBe(
      'superseded',
    )
    expect(outcomeOf(item({ tdd_leg: null }))).toBe('notOwed')
  })

  it('gives "delivered, unconfirmed" (AB) its own state, never accepted', () => {
    expect(outcomeOf(item({ tdd_leg: { ...item().tdd_leg!, ack: 'AB' } }))).toBe(
      'deliveredUnconfirmed',
    )
  })

  it('names the flow and what the customer did', () => {
    expect(flowOf(item())).toBe('b2bDomestic')
    expect(flowOf(item({ b2c: true }))).toBe('b2c')
    expect(flowOf(item({ tdd_leg: { ...item().tdd_leg!, variant: 'EXPORT' } }))).toBe('export')
    expect(customerAckOf(item())).toBe('received')
    expect(customerAckOf(item({ b2c: true }))).toBe('noCustomer')
    // An export off Peppol is reported under TDD scope INP; 997770000099 is the only published
    // stand-in ID (997770000097 is not in PINT-OM).
    expect(customerAckOf(item({ tdd_scope: 'INP' }))).toBe('notOnPeppol')
    expect(flowOf(item({ tdd_scope: 'INP' }))).toBe('export')
    expect(routeOf(item({ tdd_scope: 'INP' }))).toEqual({
      key: 'activity.route.exportScope',
      values: { scope: 'INP' },
    })
    expect(
      customerAckOf(item({ b2c: false, scenario: { flow: 7, stand_in_id: '997770000099' } })),
    ).toBe('notOnPeppol')
    expect(customerAckOf(item({ invoice_leg: { ack: 'NONE', ack_at: null, reason: null } }))).toBe(
      'waiting',
    )
  })

  it('says a document a supplier sent us was received by us', () => {
    expect(customerAckOf(item({ direction: 'RECEIVED' }))).toBe('youReceived')
    // Reported by us as the receiver, never "flow 1" as if we sent it.
    expect(
      routeOf(item({ direction: 'RECEIVED', scenario: { flow: 1, stand_in_id: null } })).key,
    ).toBe('activity.route.received')
  })

  it('tells an error in the invoice from an error in the report', () => {
    expect(refusalCauseOf(null, 'The customer has no Peppol ID on their record.')).toBe(
      'buyerPeppolId',
    )
    expect(refusalCauseOf(null, "The total doesn't equal the lines added up, out by 0.400.")).toBe(
      'totals',
    )
    expect(refusalCauseOf('OTA-E-1122', null)).toBe('taxCategory')
    expect(refusalCauseOf(null, 'The report signature could not be verified.')).toBe('report')
    expect(refusalCauseOf(null, 'Something else')).toBe('unknown')
    expect(refusalKindOf('totals')).toBe('invoice')
    expect(refusalKindOf('report')).toBe('report')
    expect(refusalKindOf('unknown')).toBe('unknown')
    // The server's own word wins once it sends one.
    expect(refusalKindOf('totals', 'REPORT')).toBe('report')
    expect(
      rowRefusalKind(item({ tdd_leg: { ...item().tdd_leg!, ack: 'RE', reason: 'No Peppol ID' } })),
    ).toBe('invoice')
    expect(rowRefusalKind(item())).toBeNull()
  })

  it('counts each tab from the summary', () => {
    expect(tabCount(SUMMARY, 'all')).toBe(100)
    // The Accepted tab lists AP, so it counts AP only: AB is not an acceptance.
    expect(tabCount(SUMMARY, 'accepted')).toBe(60)
    expect(tabCount(SUMMARY, 'rejected')).toBe(5)
    expect(tabCount(SUMMARY, 'waiting')).toBe(25)
    expect(tabCount(SUMMARY, 'attention')).toBe(6)
    // Not on the wire yet: zero, not a guess.
    expect(tabCount(SUMMARY, 'superseded')).toBe(0)
  })

  it('prints durations the way the frame does', () => {
    expect(formatDuration(47)).toBe('47s')
    expect(formatDuration(134)).toBe('2m 14s')
    expect(formatDuration(13200)).toBe('3h 40m')
  })
})

const openRowMenu = (number: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${number}` }))

describe('the ledger screen', () => {
  it('keeps the two legs in their own columns', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    // The Authority's leg and the buyer's are different parties: two columns, never one status.
    const table = screen.getByRole('table')
    expect(within(table).getByText('What the OTA said')).toBeTruthy()
    expect(within(table).getByText('Customer')).toBeTruthy()
    expect(within(table).getByText('Received it')).toBeTruthy()
  })

  it('draws the frame: its cards, its tabs and its columns', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    // The design's wording is back (product owner, 27 Sep 2026): the frame is the layout.
    expect(screen.getByText('Accepted by the OTA')).toBeTruthy()
    expect(screen.getByText('Waiting on you')).toBeTruthy()
    for (const tab of [
      'All',
      'Needs attention',
      'Accepted',
      'Rejected',
      'Still waiting',
      'Superseded',
    ]) {
      expect(screen.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeTruthy()
    }
    expect(screen.getByText('TDD and Fawtara reference')).toBeTruthy()
  })

  it('shows what is merely waiting apart from what failed', async () => {
    items = [
      item({ tdd_leg: { ...item().tdd_leg!, ack: 'NONE', ack_at: null, sla_met: null } }),
      item({
        invoice_uuid: UUID_B,
        invoice_number: 'INV-0002',
        tdd_leg: { ...item().tdd_leg!, ack: 'RE', reason: 'Schema' },
      }),
    ]
    renderLedger()
    await screen.findByText('INV-0001')

    const table = screen.getByRole('table')
    expect(within(table).getByText('Still waiting')).toBeTruthy()
    expect(within(table).getByText('Rejected')).toBeTruthy()
    expect(within(table).getByText('Schema')).toBeTruthy()
  })

  it('resubmits through the href the row carries', async () => {
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')

    openRowMenu('INV-0001')
    fireEvent.click(screen.getByRole('menuitem', { name: /Send the report again/ }))
    await waitFor(() => expect(resubmitted).toHaveLength(1))
    // The /api the catalogue states and the /api the client adds must not both be sent.
    expect(resubmitted[0]).toBe('/api/v1/invoices/inv-1/tdd/resubmit')
  })

  it('offers no resubmission on silence, even where a link might be expected', async () => {
    items = [item({ tdd_leg: { ...item().tdd_leg!, ack: 'NONE', ack_at: null, sla_met: null } })]
    renderLedger()
    await screen.findByText('INV-0001')
    openRowMenu('INV-0001')
    expect(screen.queryByRole('menuitem', { name: /Send the report again/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Put it right/ })).toBeNull()
  })

  it('offers no resubmission to someone who may not submit', async () => {
    who = READER
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')
    openRowMenu('INV-0001')
    expect(screen.queryByRole('menuitem', { name: /Send the report again/ })).toBeNull()
  })

  it('offers no plain resend when the invoice itself was refused', async () => {
    items = [
      item({
        tdd_leg: { ...item().tdd_leg!, ack: 'RE', reason: "The total doesn't equal the lines." },
        links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      }),
    ]
    renderLedger()
    await screen.findByText('INV-0001')
    openRowMenu('INV-0001')
    expect(screen.getByRole('menuitem', { name: /Put it right/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Send the report again/ })).toBeNull()
  })

  it('labels a received document as reported by us as receiver', async () => {
    items = [item({ direction: 'RECEIVED', scenario: { flow: 1, stand_in_id: null } })]
    renderLedger()
    await screen.findByText('INV-0001')
    expect(screen.getByText('Received, reported by us as receiver (role 02)')).toBeTruthy()
    expect(screen.queryByText(/flow 1/)).toBeNull()
  })

  it('makes the figures follow the Direction filter', async () => {
    render(
      <MemoryRouter initialEntries={['/activity?dir=RECEIVED']}>
        <Routes>
          <Route path="/activity" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('INV-0001')
    expect(calls('/compliance/activity/summary').at(-1)).toContain('direction=RECEIVED')
  })

  it('lists only live reports under Rejected: a replaced one belongs to Superseded', async () => {
    items = [
      item({ tdd_leg: { ...item().tdd_leg!, ack: 'RE', reason: 'Schema' } }),
      item({
        invoice_uuid: UUID_B,
        invoice_number: 'INV-0002',
        tdd_leg: { ...item().tdd_leg!, ack: 'RE', status: 'SUPERSEDED' },
      }),
    ]
    render(
      <MemoryRouter initialEntries={['/activity?tab=rejected']}>
        <Routes>
          <Route path="/activity" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('INV-0001')
    expect(screen.queryByText('INV-0002')).toBeNull()
  })

  it('asks the server for the tab rather than filtering a page', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    fireEvent.click(screen.getByRole('tab', { name: /^Rejected/ }))
    await waitFor(() => expect(calls('/compliance/activity?').at(-1)).toContain('tdd_ack=RE'))
    fireEvent.click(screen.getByRole('tab', { name: /^Accepted/ }))
    await waitFor(() => expect(calls('/compliance/activity?').at(-1)).toContain('tdd_ack=AP'))
    fireEvent.click(screen.getByRole('tab', { name: /^Superseded/ }))
    await waitFor(() =>
      expect(calls('/compliance/activity?').at(-1)).toContain('tdd_status=SUPERSEDED'),
    )
  })

  it('exports the LEDGER, not the summary, carrying the filters on screen', async () => {
    renderLedger()
    await screen.findByText('INV-0001')
    fireEvent.click(screen.getByRole('tab', { name: /^Rejected/ }))
    await waitFor(() => expect(calls('/compliance/activity?').at(-1)).toContain('tdd_ack=RE'))

    // The frame's "Compliance report" dialog: its Excel format is the ledger, one row per document.
    fireEvent.click(screen.getByRole('button', { name: 'Compliance report' }))
    fireEvent.click(await screen.findByRole('button', { name: /Build Report/ }))

    // /reports/ota is the per-document ledger. /reports/compliance is four counts and a median -
    // a file of that proves nothing about individual documents.
    await waitFor(() => {
      const asked = decodeURIComponent(calls('/reports/ota').at(-1) ?? '')
      expect(asked).toContain('/reports/ota.xlsx')
      expect(asked).toContain('tdd_ack=RE')
      expect(asked).toMatch(/[?&]from=\d{4}-\d{2}-\d{2}/)
    })
    expect(calls('/reports/compliance')).toHaveLength(0)
  })

  it('always asks the summary for a window, because it answers 400 without one', async () => {
    renderLedger()
    await screen.findByText('INV-0001')

    // The controller binds from and to as optional request parameters and then refuses the call
    // that omits them, so the signature cannot be trusted and only a real call reveals it.
    const summary = calls('/compliance/activity/summary').at(-1) ?? ''
    expect(summary).toMatch(/[?&]from=\d{4}-\d{2}-\d{2}/)
    expect(summary).toMatch(/[?&]to=\d{4}-\d{2}-\d{2}/)
  })

  it('shows the empty frame when the ledger holds nothing at all', async () => {
    items = []
    summaryReply = { ...SUMMARY, documents: 0 }
    renderLedger()
    expect(await screen.findByText('Nothing reported yet')).toBeTruthy()
    // The "connected and ready" banner printed a sample company's identity; it is gone.
    expect(screen.queryByText("You're connected to the Tax Authority and ready to report")).toBeNull()
    expect(document.body.textContent).not.toContain('OM1100392000')
    expect(screen.queryByRole('button', { name: 'Compliance report' })).toBeNull()
  })
})

const DETAIL: ActivityDetailDto = {
  invoice_uuid: UUID_A,
  summary: item({
    invoice_number: 'INV-1993',
    counterparty: 'Barka Beach Resort',
    fawtara_reference: 'OM-2026-0083907',
    tdd_uuid: '6c25-b840-1f97-5b02',
  }),
  tdd_lineage: [
    {
      id: 'o-1',
      variant: 'B2B',
      status: 'SUPERSEDED',
      validated_at: '2026-09-08T07:20:04Z',
      sla_deadline: null,
      submitted_at: '2026-09-08T07:20:07Z',
      sla_met: true,
      failure_reason: 'The tax category did not match the rate.',
      transmission_id: null,
      tdd_uuid: '6c25-b840-1f97-4ae3',
      error_code: 'OTA-E-1122',
    },
    {
      id: 'o-2',
      variant: 'B2B',
      status: 'ACKNOWLEDGED',
      validated_at: '2026-09-09T04:41:10Z',
      sla_deadline: null,
      submitted_at: '2026-09-09T04:41:12Z',
      sla_met: true,
      failure_reason: null,
      transmission_id: null,
      tdd_uuid: '6c25-b840-1f97-5b02',
    },
  ],
  mls: [
    {
      channel: 'INVOICE',
      ack: 'AP',
      received_at: '2026-09-09T10:02:31Z',
      sender: null,
      sbdh_instance_identifier: null,
      reason: null,
    },
  ],
  transmissions: [],
}

describe("one document's record", () => {
  const renderDetail = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/compliance/activity/:id" element={<ActivityEventPage />} />
          <Route path="/compliance/activity/:id/resubmit" element={<TddResubmitPage />} />
        </Routes>
      </MemoryRouter>,
    )

  it('reads the record from the ledger and tells both journeys', async () => {
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'INV-1993' })).toBeTruthy()
    expect(calls(`/compliance/activity/${UUID_A}`).length).toBeGreaterThan(0)
    expect(screen.getByText('To the Tax Authority')).toBeTruthy()
    expect(screen.getByText('Accepted on attempt 2')).toBeTruthy()
    expect(screen.getByText('The tax category did not match the rate.')).toBeTruthy()
    expect(screen.getAllByText('OM-2026-0083907').length).toBeGreaterThan(0)
    // Accepted, and no link from the server: nothing to resend.
    expect(screen.getByRole('button', { name: 'Nothing to resend' })).toBeTruthy()
  })

  it('tells a received document as arriving from the supplier, with its route and profile', async () => {
    detailReply = {
      ...DETAIL,
      tdd_lineage: [DETAIL.tdd_lineage[1]],
      mls: [],
      summary: {
        ...DETAIL.summary,
        direction: 'RECEIVED',
        counterparty: 'Muscat Roastery Co',
        received_at: '2026-09-20T08:00:00Z',
        counterparty_participant_id: '0248:OM1100581904',
        customization_id: 'urn:peppol:pint:selfbilling-1@om-1',
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(await screen.findByText('From Muscat Roastery Co')).toBeTruthy()
    expect(screen.getByText('Receipt reported, via Fawtara')).toBeTruthy()
    expect(screen.getByText('Arrived over Peppol')).toBeTruthy()
    expect(screen.getByText('Validated')).toBeTruthy()
    expect(screen.queryByText('Signed')).toBeNull()
    expect(screen.getByText('0248:OM1100581904')).toBeTruthy()
    expect(screen.getByText('PINT-OM self-billing 1.0.1')).toBeTruthy()
    // The company profile is not answered here, so our own ID stays off the record.
    expect(screen.getAllByText('Not on the record yet').length).toBe(1)
  })

  it('fills our participant ID from the company VAT number', async () => {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/v1/company-profile')
        ? json(200, { taxNumber: 'OM1100392000' })
        : base(input, init),
    )
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(await screen.findByText('0248:OM1100392000')).toBeTruthy()
    expect(screen.getByText('PINT-OM billing 1.0.1')).toBeTruthy()
  })

  it('sends the fix through the link the record carries', async () => {
    // An error in the report itself: the one case a plain resend puts right.
    detailReply = {
      ...DETAIL,
      tdd_lineage: [
        {
          ...DETAIL.tdd_lineage[1],
          status: 'REJECTED',
          failure_reason: 'The report signature could not be verified.',
        },
      ],
      summary: {
        ...DETAIL.summary,
        tdd_leg: {
          ...DETAIL.summary.tdd_leg!,
          ack: 'RE',
          reason: 'The report signature could not be verified.',
        },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    fireEvent.click(await screen.findByRole('button', { name: /^Fix and send/ }))
    await waitFor(() => expect(resubmitted).toEqual(['/api/v1/invoices/inv-1/tdd/resubmit']))
  })

  it('offers the fix only to someone who may submit', async () => {
    who = READER
    detailReply = {
      ...DETAIL,
      summary: {
        ...DETAIL.summary,
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/x/tdd/resubmit' },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    // The record's refusal is a tax category: an error in the invoice itself.
    await screen.findByText(/right with a credit note and a new invoice/)
    expect(screen.queryByRole('button', { name: /^Fix and send/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Issue a credit note/ })).toBeNull()
  })

  it('puts an invoice error right with a credit note, never a resend', async () => {
    detailReply = {
      ...DETAIL,
      tdd_lineage: [
        {
          ...DETAIL.tdd_lineage[1],
          status: 'REJECTED',
          failure_reason: "The total doesn't equal the lines added up, out by 0.400.",
        },
      ],
      summary: {
        ...DETAIL.summary,
        invoice_number: 'INV-2039',
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE' },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    const link = await screen.findByRole('link', { name: /Issue a credit note/ })
    expect(link.getAttribute('href')).toBe(`/income/credit-notes/new?invoice=${UUID_A}`)
    expect(screen.queryByRole('button', { name: /^Fix and send/ })).toBeNull()
    // Only the fix for the actual cause: no Peppol ID form for a totals error.
    expect(screen.queryByLabelText(/Their Peppol participant ID/)).toBeNull()
    expect(screen.getByRole('button', { name: /Save the fix/ })).toHaveProperty('disabled', true)
    expect(resubmitted).toEqual([])
  })

  it('shows the Peppol ID form for a missing buyer ID, and cannot save it yet', async () => {
    detailReply = {
      ...DETAIL,
      tdd_lineage: [
        {
          ...DETAIL.tdd_lineage[1],
          status: 'REJECTED',
          failure_reason: 'The customer has no Peppol ID on their record.',
        },
      ],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE' },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    const input = await screen.findByLabelText(/Their Peppol participant ID/)
    fireEvent.change(input, { target: { value: '0248:OM1100558840' } })
    expect(screen.getByRole('button', { name: /Save the fix/ })).toHaveProperty('disabled', true)
  })
})

describe('the compliance report', () => {
  it('reports what was sent and whether it was in time, and nothing about tax', async () => {
    renderCompliance()
    // 70 of 100 documents acknowledged on the TDD leg.
    // (the quarter rows repeat the share, so it is found more than once)
    expect((await screen.findAllByText('70%')).length).toBeGreaterThan(0)
    // 70 of 75 decided deadlines were met; the 25 pending are not counted against it.
    expect(screen.getByText('93.3%')).toBeTruthy()
    // The median, 3.4 minutes, as the frame's clock.
    expect(screen.getByText('3m 24s')).toBeTruthy()
    expect(screen.queryByText(/Accepted by the OTA/)).toBeNull()
  })

  it('lists silence beside the rest rather than hiding it, and never asks without a window', async () => {
    renderCompliance()
    await screen.findByText('3m 24s')
    // Silence is its own part of "What happened to what you sent", never folded into failure.
    expect(screen.getAllByText('No acknowledgement yet').length).toBeGreaterThan(0)
    // One summary per trailing month plus the window and the one before it, each with a window:
    // the summary answers 400 without one.
    const summaries = calls('/compliance/activity/summary')
    expect(summaries.length).toBeGreaterThanOrEqual(14)
    for (const url of summaries) {
      expect(url).toMatch(/[?&]from=\d{4}-\d{2}-\d{2}/)
      expect(url).toMatch(/[?&]to=\d{4}-\d{2}-\d{2}/)
    }
    // The reasons card reads the rejected documents of the window.
    expect(calls('/compliance/activity?').some((url) => url.includes('tdd_ack=RE'))).toBe(true)
  })
})

describe('the compliance report figures', () => {
  it('reads VAT inside a VAT-inclusive total, leaving unreported invoices out', () => {
    // 5% of 52,418.900 would be 2,620.945; the VAT inside it is 2,496.138.
    expect(vatInside(52_418.9)).toBe(2496.138)
    // Less INV-1974 (761.040 inclusive, 36.240 VAT), never reported.
    expect(periodFigures('quarter').vat).toBe(2459.898)
    // A period whose unreported invoices are not known says so rather than guessing.
    expect(periodFigures('year').vat).toBeNull()
  })

  it('works numbering gaps out from the numbers, and claims nothing without them', () => {
    expect(numberingOf(['INV-0003', 'INV-0001', 'INV-0002'])).toEqual({
      from: 'INV-0001',
      to: 'INV-0003',
      gaps: [],
    })
    expect(numberingOf(['INV-10', 'INV-13', null])).toEqual({
      from: 'INV-10',
      to: 'INV-13',
      gaps: ['INV-11', 'INV-12'],
    })
    expect(numberingOf([])).toBeNull()
  })
})
