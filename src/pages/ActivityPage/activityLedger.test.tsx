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
  awaitsAnswer,
  canResubmit,
  customerAckOf,
  flowOf,
  formatDuration,
  isFailure,
  outcomeOf,
  refusalCauseOf,
  refusalKindOf,
  reportStatesOf,
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

/** The resubmit answered as the correction guard answers it (backend PR #519, OD5). */
function holdResubmits() {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/tdd/resubmit') && init?.method === 'POST') {
      resubmitted.push(String(input))
      return json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        title: 'TDD correction held',
        detail: 'The original TDD of this invoice was not reported to the configured C5',
        error: 'TDD_CORRECTION_HELD',
        code: 'TDD_CORRECTION_HELD',
        held_correction_id: '9f0c1e2d-0000-4000-8000-000000000001',
        held_reason: 'C5_DIFFERS',
      })
    }
    return base(input, init)
  })
}

const HELD_SENTENCE = /This correction is on hold for an authorised decision at Fawtir/

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

describe('report states (N5b)', () => {
  const withStates = {
    ...SUMMARY,
    tdd_state: {
      never_submitted: 2,
      awaiting_response: 3,
      authority_rejected: 5,
      internally_stopped: 7,
    },
  }

  it('reads waiting, not sent, stopped and rejected from the server, never from silence', () => {
    expect(reportStatesOf(withStates)).toEqual({
      awaiting: 3,
      notSubmitted: 2,
      stopped: 7,
      rejected: 5,
    })
    expect(tabCount(withStates, 'waiting')).toBe(3)
  })

  it('falls back to the old counts when the server does not send states', () => {
    expect(reportStatesOf(SUMMARY)).toEqual({
      awaiting: SUMMARY.tdd_ack.none,
      notSubmitted: 0,
      stopped: 0,
      rejected: SUMMARY.tdd_ack.re,
    })
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

  // N5: silence means waiting on the OTA only once the report was submitted to it.
  const silent = (over: Partial<NonNullable<ActivityItemDto['tdd_leg']>>) =>
    item({ tdd_leg: { ...item().tdd_leg!, ack: 'NONE', ack_at: null, sla_met: null, ...over } })

  it('neverSubmittedDoesNotShowWaitingForOta', () => {
    expect(outcomeOf(silent({ status: 'PENDING', submitted_at: null }))).toBe('notSent')
  })

  it('does not wait on the OTA when only the invoice went over Peppol (case B)', () => {
    const peppolSent = {
      ...silent({ status: 'PENDING', submitted_at: null }),
      transport_state: 'SENT',
    }
    expect(outcomeOf(peppolSent)).toBe('notSent')
  })

  it('submittedWithoutResponseShowsWaitingForOta', () => {
    expect(outcomeOf(silent({ status: 'SUBMITTED', submitted_at: '2026-09-20T08:02:00Z' }))).toBe(
      'waiting',
    )
  })

  it('authorityResponseStopsWaitingState', () => {
    const answered = (ack: 'AP' | 'AB' | 'RE') =>
      outcomeOf(silent({ status: 'SUBMITTED', submitted_at: '2026-09-20T08:02:00Z', ack }))
    expect(answered('AP')).toBe('accepted')
    expect(answered('AB')).toBe('deliveredUnconfirmed')
    expect(answered('RE')).toBe('rejected')
  })

  it('internalDeadLetterIsNotWaitingForOta', () => {
    expect(outcomeOf(silent({ status: 'DEAD_LETTERED', submitted_at: null }))).toBe('stopped')
    // Dead-lettered after submission is still our watchdog giving up, not the OTA pending.
    expect(
      outcomeOf(silent({ status: 'DEAD_LETTERED', submitted_at: '2026-09-20T08:02:00Z' })),
    ).toBe('stopped')
  })

  it('generationFailureIsNotWaitingForOta', () => {
    expect(outcomeOf(silent({ status: 'GENERATION_FAILED', submitted_at: null }))).toBe('stopped')
  })

  it('reads the Phase 13 ledger row (SENDING, ack NONE, DEAD_LETTERED, never submitted) as stopped', () => {
    const row = item({
      invoice_number: 'INV/2026/4001',
      transport_state: 'SENDING',
      invoice_leg: { ack: 'NONE', ack_at: null, reason: null },
      tdd_leg: {
        variant: 'SUBMIT',
        status: 'DEAD_LETTERED',
        validated_at: '2026-10-10T08:15:11.881075Z',
        sla_deadline: '2026-10-10T08:30:11.881075Z',
        submitted_at: null,
        sla_met: null,
        ack: 'NONE',
        ack_at: null,
        reason: null,
      },
      attention: true,
    })
    expect(outcomeOf(row)).toBe('stopped')
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

  // The backend's SubmissionState: AB is "delivered without confirmation", and final.
  it('never says the customer received an invoice their access point would not confirm', () => {
    const ab = item({ invoice_leg: { ack: 'AB', ack_at: '2026-09-20T08:01:00Z', reason: null } })
    expect(customerAckOf(ab)).toBe('deliveredUnconfirmed')
    expect(i18n.t('activity.ack.deliveredUnconfirmed', { lng: 'en' })).toBe(
      'Delivered, unconfirmed',
    )
    expect(i18n.t('activity.ack.deliveredUnconfirmed', { lng: 'ar' })).toBe('سُلّمت دون تأكيد')
  })

  it('knows which rows still owe the screen an answer', () => {
    const silentInvoice = { ack: 'NONE' as const, ack_at: null, reason: null }
    const silentTdd = { ...item().tdd_leg!, ack: 'NONE' as const, ack_at: null }
    // Nothing owed: both legs answered.
    expect(awaitsAnswer(item())).toBe(false)
    // The customer's MLS, on an invoice queued, on the wire, or AS4-received.
    for (const transport_state of ['QUEUED', 'SENDING', 'SENT']) {
      expect(awaitsAnswer(item({ transport_state, invoice_leg: silentInvoice })), transport_state).toBe(
        true,
      )
    }
    // An outcome, or a customer nobody reaches over Peppol, owes nothing more.
    for (const transport_state of ['UNDELIVERABLE', 'C4_UNREACHABLE', 'DELIVERED']) {
      expect(awaitsAnswer(item({ transport_state, invoice_leg: silentInvoice })), transport_state).toBe(
        false,
      )
    }
    expect(awaitsAnswer(item({ b2c: true, transport_state: 'SENT', invoice_leg: silentInvoice }))).toBe(
      false,
    )
    expect(awaitsAnswer(item({ direction: 'RECEIVED', invoice_leg: silentInvoice }))).toBe(false)
    // The OTA's MLS on a submitted report; not on one never submitted or stopped at Fawtir.
    expect(awaitsAnswer(item({ tdd_leg: silentTdd }))).toBe(true)
    expect(awaitsAnswer(item({ tdd_leg: { ...silentTdd, submitted_at: null } }))).toBe(false)
    expect(awaitsAnswer(item({ tdd_leg: { ...silentTdd, status: 'DEAD_LETTERED' } }))).toBe(false)
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

  it('says AB is delivered without confirmation, in English and Arabic', async () => {
    items = [item({ invoice_leg: { ack: 'AB', ack_at: '2026-09-20T08:01:00Z', reason: null } })]
    const view = renderLedger()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Delivered, unconfirmed')).toBeTruthy()
    expect(within(table).queryByText('Received it')).toBeNull()
    view.unmount()

    await i18n.changeLanguage('ar')
    renderLedger()
    expect(within(await screen.findByRole('table')).getByText('سُلّمت دون تأكيد')).toBeTruthy()
  })

  describe('while a row awaits an answer', () => {
    const listReads = () =>
      calls('/compliance/activity').filter((url) => !url.includes('/compliance/activity/summary'))
    const summaryReads = () => calls('/compliance/activity/summary')
    const silent = () =>
      item({ transport_state: 'SENT', invoice_leg: { ack: 'NONE', ack_at: null, reason: null } })

    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
    afterEach(() => vi.useRealTimers())

    it('re-reads the list alone, quietly, until the answer lands, then stops', async () => {
      items = [silent()]
      renderLedger()
      const table = await screen.findByRole('table')
      expect(within(table).getByText('Not yet')).toBeTruthy()
      expect(listReads()).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(3000)
      expect(listReads()).toHaveLength(2)
      // No loader between reads: the rows stay on screen.
      expect(screen.getByRole('table')).toBeTruthy()

      items = [item()]
      await vi.advanceTimersByTimeAsync(5000)
      expect(listReads()).toHaveLength(3)
      expect(await within(screen.getByRole('table')).findByText('Received it')).toBeTruthy()

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(listReads()).toHaveLength(3)
      // One request per refresh: the summary is not re-read with it.
      expect(summaryReads()).toHaveLength(1)
    })

    it('stops at its cap when no answer comes', async () => {
      items = [silent()]
      renderLedger()
      await screen.findByRole('table')
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(listReads()).toHaveLength(16)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(listReads()).toHaveLength(16)
    })

    it('asks nothing more when every row is answered', async () => {
      renderLedger()
      await screen.findByRole('table')
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(listReads()).toHaveLength(1)
    })

    // Review M1: the quiet rows were keyed by path, so after a visit to another tab they came
    // back over the fresh read of the first one.
    it('shows the fresh read, not old quiet rows, on coming back to a list', async () => {
      const numbered = (invoice_number: string) => ({ ...silent(), invoice_number })
      items = [numbered('INV-FIRST')]
      renderLedger()
      await screen.findByText('INV-FIRST')

      items = [numbered('INV-QUIET')]
      await vi.advanceTimersByTimeAsync(3000)
      expect(await screen.findByText('INV-QUIET')).toBeTruthy()

      items = [numbered('INV-FRESH')]
      fireEvent.click(screen.getByRole('tab', { name: /^Rejected/ }))
      await screen.findByText('INV-FRESH')
      fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
      await waitFor(() => expect(listReads()).toHaveLength(4))
      // Asserted as the loud read lands, before the next quiet read could paper over the defect.
      await vi.advanceTimersByTimeAsync(50)
      expect(listReads()).toHaveLength(4)
      expect(screen.getByText('INV-FRESH')).toBeTruthy()
      expect(screen.queryByText('INV-QUIET')).toBeNull()

      // The watch starts again for the list on screen.
      await vi.advanceTimersByTimeAsync(3000)
      expect(listReads()).toHaveLength(5)
    })
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

  it('says a held correction was not sent, not that the row changed', async () => {
    holdResubmits()
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')

    openRowMenu('INV-0001')
    fireEvent.click(screen.getByRole('menuitem', { name: /Send the report again/ }))
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy()
    expect(resubmitted).toHaveLength(1)
    expect(screen.queryByText(/Reload to see the latest version/)).toBeNull()
    expect(screen.queryByText(/Sent again/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/TDD_CORRECTION_HELD/)
  })

  it('says a sender-standing refusal in words, not that the row changed', async () => {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/tdd/resubmit') && init?.method === 'POST') {
        resubmitted.push(String(input))
        return json(409, {
          type: 'https://api.fawtir.om/problems/resource-conflict',
          title: 'TDD correction held',
          detail: "Your company's Peppol participant is also claimed by another company",
          error: 'SENDER_PARTICIPANT_CLAIM_CONFLICT',
          code: 'SENDER_PARTICIPANT_CLAIM_CONFLICT',
        })
      }
      return base(input, init)
    })
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')

    openRowMenu('INV-0001')
    fireEvent.click(screen.getByRole('menuitem', { name: /Send the report again/ }))
    expect(await screen.findByText(/is under ownership review at Fawtir/)).toBeTruthy()
    expect(resubmitted).toHaveLength(1)
    expect(screen.queryByText(/Reload to see the latest version/)).toBeNull()
    expect(screen.queryByText(HELD_SENTENCE)).toBeNull()
    expect(document.body.textContent).not.toMatch(/SENDER_PARTICIPANT_CLAIM_CONFLICT|also claimed by/)
  })

  it('re-reads the list exactly once per held answer, and never by itself', async () => {
    holdResubmits()
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    const view = renderLedger()
    await screen.findByText('INV-0001')
    const listReads = () => calls('/compliance/activity?').length
    const before = listReads()

    openRowMenu('INV-0001')
    fireEvent.click(screen.getByRole('menuitem', { name: /Send the report again/ }))
    await screen.findByText(HELD_SENTENCE)
    await waitFor(() => expect(listReads()).toBe(before + 1))

    // Neither the re-read's own answer nor a later render asks again.
    await screen.findByText('INV-0001')
    view.rerender(
      <MemoryRouter initialEntries={['/activity']}>
        <Routes>
          <Route path="/activity" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(listReads()).toBe(before + 1)
    expect(resubmitted).toHaveLength(1)
  })

  it('does not re-read the list after a failure that is not a hold', async () => {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/tdd/resubmit') && init?.method === 'POST'
        ? json(500, { type: 'https://api.fawtir.om/problems/internal-error' })
        : base(input, init),
    )
    items = [item({ links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' } })]
    renderLedger()
    await screen.findByText('INV-0001')
    const before = calls('/compliance/activity?').length

    openRowMenu('INV-0001')
    fireEvent.click(screen.getByRole('menuitem', { name: /Send the report again/ }))
    await waitFor(() => expect(calls('/tdd/resubmit')).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls('/compliance/activity?').length).toBe(before)
    expect(screen.queryByText(HELD_SENTENCE)).toBeNull()
  })

  it('says a held correction on its row and offers no resubmission for it', async () => {
    const reason = 'The report signature could not be verified.'
    items = [
      item({
        tdd_leg: { ...item().tdd_leg!, status: 'REJECTED', ack: 'RE', reason, correction_held: true },
        // Even if a link came with the flag, a held row offers no send.
        links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      }),
    ]
    renderLedger()
    expect(
      await screen.findByText(`${reason} Correction held for an authorised decision at Fawtir.`),
    ).toBeTruthy()
    openRowMenu('INV-0001')
    expect(screen.queryByRole('menuitem', { name: /Send the report again/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Put it right/ })).toBeNull()
  })

  it('keeps the held sentence apart from a server reason with no full stop', async () => {
    items = [
      item({
        tdd_leg: {
          ...item().tdd_leg!,
          status: 'REJECTED',
          ack: 'RE',
          reason: 'Signature invalid',
          correction_held: true,
        },
      }),
    ]
    renderLedger()
    expect(
      await screen.findByText(
        'Signature invalid · Correction held for an authorised decision at Fawtir.',
      ),
    ).toBeTruthy()
  })

  it.each([false, undefined])('shows a row as before when correction_held is %s', async (held) => {
    const reason = 'The report signature could not be verified.'
    items = [
      item({
        tdd_leg: { ...item().tdd_leg!, status: 'REJECTED', ack: 'RE', reason, correction_held: held },
        links: { ...item().links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      }),
    ]
    renderLedger()
    expect(await screen.findByText(reason)).toBeTruthy()
    expect(screen.queryByText(/Correction held/)).toBeNull()
    openRowMenu('INV-0001')
    expect(screen.getByRole('menuitem', { name: /Send the report again/ })).toBeTruthy()
  })

  it('words the held mark in Arabic', async () => {
    await i18n.changeLanguage('ar')
    items = [
      item({
        tdd_leg: { ...item().tdd_leg!, status: 'REJECTED', ack: 'RE', reason: 'x', correction_held: true },
      }),
    ]
    renderLedger()
    expect(await screen.findByText(/التصحيح معلّق بانتظار قرار من جهة مخوّلة في فوتر/)).toBeTruthy()
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

  // The Phase 13 row shape: the invoice still in the outbox, its report dead-lettered by our own
  // SLA watchdog, never submitted.
  const stoppedRow = () =>
    item({
      invoice_number: 'INV/2026/4001',
      transport_state: 'SENDING',
      invoice_leg: { ack: 'NONE', ack_at: null, reason: null },
      tdd_leg: {
        ...item().tdd_leg!,
        status: 'DEAD_LETTERED',
        submitted_at: null,
        sla_met: null,
        ack: 'NONE',
        ack_at: null,
      },
      attention: true,
    })

  it('lists a stopped, never-submitted report without "Still waiting" or a sending time (N5)', async () => {
    items = [stoppedRow()]
    renderLedger()
    const row = (await screen.findByText('INV/2026/4001')).closest('tr')!
    expect(within(row).getByText('Stopped at Fawtir')).toBeTruthy()
    expect(within(row).getByText('Not sent')).toBeTruthy()
    expect(within(row).queryByText('Still waiting')).toBeNull()
    expect(within(row).queryByText(/and no answer/)).toBeNull()
    expect(within(row).queryByText('Waiting for the reference')).toBeNull()
    expect(within(row).getByText('no Fawtara reference issued')).toBeTruthy()
    expect(within(row).getAllByText('No TDD UUID yet')).toHaveLength(1)
  })

  it('lists a submitted, unanswered report as still waiting, with its time (N5 control)', async () => {
    items = [
      item({
        invoice_number: 'INV-WAIT',
        tdd_leg: {
          ...item().tdd_leg!,
          status: 'SUBMITTED',
          ack: 'NONE',
          ack_at: null,
          sla_met: null,
        },
      }),
    ]
    renderLedger()
    const row = (await screen.findByText('INV-WAIT')).closest('tr')!
    expect(within(row).getByText('Still waiting')).toBeTruthy()
    expect(within(row).getByText(/and no answer/)).toBeTruthy()
    expect(within(row).queryByText('Not sent')).toBeNull()
  })

  it('says the same in Arabic on the list, with no raw keys (N5)', async () => {
    await i18n.changeLanguage('ar')
    items = [stoppedRow()]
    renderLedger()
    const row = (await screen.findByText('INV/2026/4001')).closest('tr')!
    expect(within(row).getByText('توقف لدى فوتر')).toBeTruthy()
    expect(within(row).getByText('لم يُرسل')).toBeTruthy()
    expect(within(row).queryByText('بالانتظار')).toBeNull()
    expect(row.textContent).not.toMatch(/activity(Detail)?\./)
  })

  // N5b: the Phase 13 window. Twelve reports, all stopped by our own SLA watchdog, none
  // submitted: tdd_ack.none and attention are both 12, yet nothing waits on the OTA and nothing
  // was rejected.
  const PHASE13_SUMMARY: ActivitySummaryDto = {
    ...SUMMARY,
    documents: 12,
    tdd_ack: { ap: 0, ab: 0, re: 0, none: 12 },
    invoice_ack: { ap: 0, ab: 0, re: 0, none: 12 },
    dead_lettered: 12,
    attention: 12,
    sla: { met: 0, missed: 0, pending: 12 },
    median_minutes_to_tdd_ack: null,
    tdd_state: {
      never_submitted: 0,
      awaiting_response: 0,
      authority_rejected: 0,
      internally_stopped: 12,
    },
  }

  it('does not call stopped reports waiting or rejected on the cards and tab (N5b)', async () => {
    summaryReply = PHASE13_SUMMARY
    items = [stoppedRow()]
    renderLedger()
    await screen.findByText('INV/2026/4001')
    // The accepted card's line is one paragraph of mixed text, so it is read as text.
    const page = document.body.textContent ?? ''
    expect(page).toContain('0 still waiting')
    expect(page).toContain('12 not sent')
    expect(page).not.toContain('12 still waiting')
    expect(
      screen.getByText("12 stopped at Fawtir. Until they're fixed, those sales aren't reported."),
    ).toBeTruthy()
    expect(screen.queryByText(/Rejected and not yet corrected/)).toBeNull()
    const waitingTab = screen.getByRole('tab', { name: /^Still waiting/ })
    expect(within(waitingTab).getByText('0')).toBeTruthy()
  })

  it('lists the waiting tab from the server by report state, not by silence (N5b)', async () => {
    summaryReply = PHASE13_SUMMARY
    renderLedger()
    await screen.findByText('INV-0001')
    fireEvent.click(screen.getByRole('tab', { name: /^Still waiting/ }))
    await waitFor(() =>
      expect(calls('/compliance/activity?').at(-1)).toContain('tdd_state=AWAITING_RESPONSE'),
    )
  })

  it('counts submitted, unanswered reports as still waiting (N5b control)', async () => {
    summaryReply = {
      ...PHASE13_SUMMARY,
      attention: 2,
      tdd_ack: { ap: 0, ab: 0, re: 1, none: 11 },
      tdd_state: {
        never_submitted: 1,
        awaiting_response: 9,
        authority_rejected: 1,
        internally_stopped: 1,
      },
    }
    renderLedger()
    await screen.findByText('INV-0001')
    expect(document.body.textContent).toContain('9 still waiting')
    expect(document.body.textContent).toContain('2 not sent')
    expect(
      screen.getByText(
        "1 turned down by the OTA · 1 stopped at Fawtir. Until they're fixed, those sales aren't reported.",
      ),
    ).toBeTruthy()
  })

  it('reports stopped reports as not reported, and none as sent and waiting (N5b)', async () => {
    summaryReply = PHASE13_SUMMARY
    renderLedger()
    await screen.findByText('INV-0001')
    fireEvent.click(screen.getByRole('button', { name: 'Compliance report' }))
    const notReported = (await screen.findByText('Still not reported')).parentElement!
    expect(within(notReported).getByText('12')).toBeTruthy()
    const waiting = screen.getByText('Sent, still waiting for an answer').parentElement!
    expect(within(waiting).getByText('0')).toBeTruthy()
  })

  it('says the same on the Arabic cards, with no raw keys (N5b)', async () => {
    await i18n.changeLanguage('ar')
    summaryReply = PHASE13_SUMMARY
    items = [stoppedRow()]
    renderLedger()
    await screen.findByText('INV/2026/4001')
    expect(document.body.textContent).toContain('0 بالانتظار')
    expect(document.body.textContent).toContain('12 لم تُرسل')
    expect(
      screen.getByText('12 توقفت لدى فوتر. وحتى تُصحَّح لا تُبلَّغ تلك المبيعات.'),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/activity\.kpi\./)
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

  // Phase 13 finding N1: an invoice still in our outbox, its report dead-lettered by our own SLA
  // watchdog, was drawn as signed, sent on both legs and refused by the Tax Authority.
  const OUTBOX_ONLY: ActivityDetailDto = {
    ...DETAIL,
    summary: {
      ...DETAIL.summary,
      transport_state: 'SENDING',
      invoice_leg: { ack: 'NONE', ack_at: null, reason: null },
      fawtara_reference: null,
      tdd_uuid: null,
      tdd_leg: {
        ...DETAIL.summary.tdd_leg!,
        status: 'DEAD_LETTERED',
        submitted_at: null,
        sla_met: null,
        ack: 'NONE',
        ack_at: null,
      },
    },
    tdd_lineage: [
      {
        ...DETAIL.tdd_lineage[1],
        status: 'DEAD_LETTERED',
        submitted_at: null,
        sla_met: null,
        failure_reason: 'SLA breached: deadline passed without C5 acknowledgement (FR-203/204)',
        tdd_uuid: null,
      },
    ],
    mls: [],
    transmissions: [
      {
        id: 't-1',
        channel: 'INVOICE',
        direction: 'OUTBOUND',
        state: 'PENDING',
        attempts: 0,
        last_attempt_at: null,
        last_failure_reason: null,
        sbdh_instance_identifier: null,
        last_mls_code: null,
        created_at: '2026-09-20T08:00:06Z',
      },
    ],
  }

  it('claims no signing, no sending and no refusal for an invoice still in the outbox', async () => {
    detailReply = OUTBOX_ONLY
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(await screen.findByText('Not sent over Peppol yet')).toBeTruthy()
    expect(screen.getByText('Not signed yet')).toBeTruthy()
    expect(screen.getByText('Not sent to Fawtara yet')).toBeTruthy()
    expect(screen.getByText('Stopped at Fawtir, needs attention')).toBeTruthy()
    for (const claim of ['Signed', 'Sent over Peppol', 'Sent to Fawtara', 'Waiting on the OTA']) {
      expect(screen.queryByText(claim)).toBeNull()
    }
    expect(screen.queryByText('What the Tax Authority objected to')).toBeNull()
    expect(screen.queryByText(/SLA breached/)).toBeNull()
  })

  it('heads the record "Stopped at Fawtir", never "Waiting for the OTA" (N5)', async () => {
    detailReply = OUTBOX_ONLY
    renderDetail(`/compliance/activity/${UUID_A}`)
    await screen.findByText('Not sent over Peppol yet')
    expect(screen.queryByText('Waiting for the OTA')).toBeNull()
    expect(screen.queryByText('Still waiting')).toBeNull()
    // The header badge and the journey verdict both say it, so "Stopped at Fawtir" appears twice.
    expect(screen.getAllByText('Stopped at Fawtir').length).toBeGreaterThanOrEqual(2)
  })

  it('heads a never-submitted record "Not sent to Fawtara yet" (N5)', async () => {
    detailReply = {
      ...OUTBOX_ONLY,
      summary: {
        ...OUTBOX_ONLY.summary,
        tdd_leg: { ...OUTBOX_ONLY.summary.tdd_leg!, status: 'PENDING' },
      },
      tdd_lineage: [{ ...OUTBOX_ONLY.tdd_lineage[0], status: 'PENDING', failure_reason: null }],
    }
    renderDetail(`/compliance/activity/${UUID_A}`)
    await screen.findByText('Not sent over Peppol yet')
    expect(screen.queryByText('Waiting for the OTA')).toBeNull()
    // Badge and journey step share the wording.
    expect(screen.getAllByText('Not sent to Fawtara yet').length).toBeGreaterThanOrEqual(2)
  })

  it('says the same in Arabic, with no raw keys', async () => {
    await i18n.changeLanguage('ar')
    detailReply = OUTBOX_ONLY
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(await screen.findByText('لم تُرسل عبر Peppol بعد')).toBeTruthy()
    expect(screen.getByText('لم يُرسل إلى فوترة بعد')).toBeTruthy()
    expect(screen.getByText('توقف لدى فوتر، ويحتاج إلى متابعة')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/activityDetail\./)
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

  it('sends the rest of a group past a held one, says how many went, and re-reads', async () => {
    const reason = 'The report signature could not be verified.'
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/inv-2/tdd/resubmit') && init?.method === 'POST') {
        resubmitted.push(String(input))
        return json(409, {
          type: 'https://api.fawtir.om/problems/resource-conflict',
          code: 'TDD_CORRECTION_HELD',
        })
      }
      return base(input, init)
    })
    detailReply = {
      ...DETAIL,
      tdd_lineage: [{ ...DETAIL.tdd_lineage[1], status: 'REJECTED', failure_reason: reason }],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE', reason },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    items = [
      item({
        invoice_uuid: UUID_B,
        invoice_number: 'INV-0002',
        tdd_leg: { ...item().tdd_leg!, status: 'REJECTED', ack: 'RE', reason },
        links: { ...item().links, resubmit: '/api/v1/invoices/inv-2/tdd/resubmit' },
      }),
    ]
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    const button = await screen.findByRole('button', { name: /^Fix and send/ })
    await waitFor(() => expect(calls('tdd_ack=RE')).toHaveLength(1))
    const detailReads = calls(`/compliance/activity/${UUID_A}`).length

    fireEvent.click(button)
    expect(
      await screen.findByText(
        'Reports sent again: 1. Held for an authorised decision at Fawtir and not sent: 1.',
      ),
    ).toBeTruthy()
    expect(resubmitted).toEqual([
      '/api/v1/invoices/inv-1/tdd/resubmit',
      '/api/v1/invoices/inv-2/tdd/resubmit',
    ])
    expect(screen.queryByText(HELD_SENTENCE)).toBeNull()
    await waitFor(() => expect(calls('tdd_ack=RE')).toHaveLength(2))
    await waitFor(() =>
      expect(calls(`/compliance/activity/${UUID_A}`).length).toBe(detailReads + 1),
    )
    // One re-read of each per send: the answers to the re-reads ask for nothing more.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls('tdd_ack=RE')).toHaveLength(2)
    expect(calls(`/compliance/activity/${UUID_A}`).length).toBe(detailReads + 1)
    expect(resubmitted).toHaveLength(2)
  })

  it('says a held correction on the record and offers no way to put it right', async () => {
    const reason = 'The report signature could not be verified.'
    detailReply = {
      ...DETAIL,
      tdd_lineage: [{ ...DETAIL.tdd_lineage[1], status: 'REJECTED', failure_reason: reason }],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE', reason, correction_held: true },
        links: { ...DETAIL.summary.links, resubmit: null },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(
      await screen.findByText(
        /This correction is held for an authorised decision at Fawtir and is not offered again\./,
      ),
    ).toBeTruthy()
    expect(screen.queryAllByRole('link', { name: /^Put it right/ })).toHaveLength(0)
  })

  it('words the held record in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const reason = 'The report signature could not be verified.'
    detailReply = {
      ...DETAIL,
      tdd_lineage: [{ ...DETAIL.tdd_lineage[1], status: 'REJECTED', failure_reason: reason }],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE', reason, correction_held: true },
        links: { ...DETAIL.summary.links, resubmit: null },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect(
      await screen.findByText(/هذا التصحيح معلّق بانتظار قرار من جهة مخوّلة في فوتر ولا يُعرض للإرسال مرة أخرى\./),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/activityDetail\.correctionHeld/)
  })

  /**
   * A three-invoice group on "Put it right": the record (inv-1) and two same-cause rows. `answer`
   * replies to each row's POST by its invoice id; anything it leaves undefined is accepted.
   */
  function group(answer: (invoice: string) => Response | undefined) {
    const reason = 'The report signature could not be verified.'
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const hit = /\/(inv-\d)\/tdd\/resubmit$/.exec(String(input))
      if (hit && init?.method === 'POST') {
        resubmitted.push(String(input))
        return answer(hit[1]) ?? json(202, {})
      }
      return base(input, init)
    })
    detailReply = {
      ...DETAIL,
      tdd_lineage: [{ ...DETAIL.tdd_lineage[1], status: 'REJECTED', failure_reason: reason }],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE', reason },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    items = [2, 3].map((n) =>
      item({
        invoice_uuid: `a0000000-0000-0000-0000-00000000000${n}`,
        invoice_number: `INV-000${n}`,
        tdd_leg: { ...item().tdd_leg!, status: 'REJECTED', ack: 'RE', reason },
        links: { ...item().links, resubmit: `/api/v1/invoices/inv-${n}/tdd/resubmit` },
      }),
    )
  }

  const HELD_409 = () =>
    json(409, { type: 'https://api.fawtir.om/problems/resource-conflict', code: 'TDD_CORRECTION_HELD' })

  async function openGroup() {
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    const button = await screen.findByRole('button', { name: /^Fix and send/ })
    await waitFor(() => expect(calls('tdd_ack=RE')).toHaveLength(1))
    return { button, detailReads: calls(`/compliance/activity/${UUID_A}`).length }
  }

  it('keeps the counts when the group stops on a failure that is not a hold', async () => {
    group((invoice) =>
      invoice === 'inv-2' ? json(500, { type: 'https://api.fawtir.om/problems/internal-error' }) : undefined,
    )
    const { button, detailReads } = await openGroup()

    fireEvent.click(button)
    expect(
      await screen.findByText(
        /^Reports sent again: 1\. Held for an authorised decision at Fawtir: 0\. The rest were not sent: /,
      ),
    ).toBeTruthy()
    // It stopped at the failure: the third row was not tried.
    expect(resubmitted).toEqual([
      '/api/v1/invoices/inv-1/tdd/resubmit',
      '/api/v1/invoices/inv-2/tdd/resubmit',
    ])
    await waitFor(() => expect(calls('tdd_ack=RE')).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls('tdd_ack=RE')).toHaveLength(2)
    expect(calls(`/compliance/activity/${UUID_A}`).length).toBe(detailReads + 1)
  })

  it('keeps the counts on screen when the re-read of the record fails', async () => {
    group((invoice) => (invoice === 'inv-2' ? HELD_409() : undefined))
    const { button } = await openGroup()
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes(`/compliance/activity/${UUID_A}`) && init?.method !== 'POST'
        ? json(500, { type: 'https://api.fawtir.om/problems/internal-error' })
        : base(input, init),
    )

    fireEvent.click(button)
    const partly = 'Reports sent again: 2. Held for an authorised decision at Fawtir and not sent: 1.'
    expect(await screen.findByText(partly)).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Fix and send/ })).toBeNull())
    expect(screen.getByText(partly)).toBeTruthy()
  })

  it('says nothing went when every invoice of the group is held', async () => {
    group(() => HELD_409())
    const { button } = await openGroup()

    fireEvent.click(button)
    expect(
      await screen.findByText(
        'Nothing was sent. Reports held for an authorised decision at Fawtir: 3.',
      ),
    ).toBeTruthy()
    expect(resubmitted).toHaveLength(3)
    expect(screen.queryByText(HELD_SENTENCE)).toBeNull()
  })

  it('posts the group once however fast the button is pressed', async () => {
    group(() => undefined)
    const { button } = await openGroup()

    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(resubmitted).toHaveLength(3))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(resubmitted).toEqual([
      '/api/v1/invoices/inv-1/tdd/resubmit',
      '/api/v1/invoices/inv-2/tdd/resubmit',
      '/api/v1/invoices/inv-3/tdd/resubmit',
    ])
  })

  const STANDING_409 = (code: string) =>
    json(409, { type: 'https://api.fawtir.om/problems/resource-conflict', code, error: code })

  it('sends the rest of a group past a standing refusal and says why those were not sent', async () => {
    group((invoice) =>
      invoice === 'inv-2' ? STANDING_409('SENDER_PARTICIPANT_NOT_REGISTERED') : undefined,
    )
    const { button, detailReads } = await openGroup()

    fireEvent.click(button)
    expect(
      await screen.findByText(
        /^Reports sent again: 2\. Held for an authorised decision at Fawtir: 0\. Not sent: 1\. Your company's Peppol participant is not verified/,
      ),
    ).toBeTruthy()
    // The refusal did not stop the group: the third row was still tried.
    expect(resubmitted).toEqual([
      '/api/v1/invoices/inv-1/tdd/resubmit',
      '/api/v1/invoices/inv-2/tdd/resubmit',
      '/api/v1/invoices/inv-3/tdd/resubmit',
    ])
    expect(screen.queryByText(/Reload to see the latest version/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/SENDER_PARTICIPANT_NOT_REGISTERED/)
    await waitFor(() =>
      expect(calls(`/compliance/activity/${UUID_A}`).length).toBe(detailReads + 1),
    )
  })

  it('counts the eligible hold with the holds, and a standing refusal apart', async () => {
    group((invoice) =>
      invoice === 'inv-1'
        ? STANDING_409('SENDER_NOT_REGISTERED_HISTORICAL_ELIGIBLE')
        : STANDING_409('SENDER_PARTICIPANT_NOT_REGISTERED'),
    )
    const { button } = await openGroup()

    fireEvent.click(button)
    expect(
      await screen.findByText(
        /^Reports sent again: 0\. Held for an authorised decision at Fawtir: 1\. Not sent: 2\./,
      ),
    ).toBeTruthy()
    expect(resubmitted).toHaveLength(3)
    // The standing sentence is said once, not once per row.
    expect(document.body.textContent!.match(/is not verified, so corrections/g)).toHaveLength(1)
  })

  it('words the eligible hold on its own when it is the only row', async () => {
    const reason = 'The report signature could not be verified.'
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/tdd/resubmit') && init?.method === 'POST') {
        resubmitted.push(String(input))
        return STANDING_409('SENDER_NOT_REGISTERED_HISTORICAL_ELIGIBLE')
      }
      return base(input, init)
    })
    detailReply = {
      ...DETAIL,
      tdd_lineage: [{ ...DETAIL.tdd_lineage[1], status: 'REJECTED', failure_reason: reason }],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE', reason },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}/resubmit`)
    fireEvent.click(await screen.findByRole('button', { name: /^Fix and send/ }))
    expect(
      await screen.findByText(/held for a decision at Fawtir, pending guidance from the Tax Authority/),
    ).toBeTruthy()
    expect(resubmitted).toEqual(['/api/v1/invoices/inv-1/tdd/resubmit'])
  })

  it('shows the record as before when correction_held is absent', async () => {
    const reason = 'The report signature could not be verified.'
    detailReply = {
      ...DETAIL,
      tdd_lineage: [{ ...DETAIL.tdd_lineage[1], status: 'REJECTED', failure_reason: reason }],
      summary: {
        ...DETAIL.summary,
        tdd_leg: { ...DETAIL.summary.tdd_leg!, ack: 'RE', reason },
        links: { ...DETAIL.summary.links, resubmit: '/api/v1/invoices/inv-1/tdd/resubmit' },
      },
    }
    renderDetail(`/compliance/activity/${UUID_A}`)
    expect((await screen.findAllByRole('link', { name: /^Put it right/ })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/correction is held/)).toBeNull()
  })

  it('stays on the fix and says so when the correction is held', async () => {
    holdResubmits()
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
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy()
    expect(resubmitted).toEqual(['/api/v1/invoices/inv-1/tdd/resubmit'])
    // The sentence now shows while the record is re-read too; the page comes back with it.
    expect(await screen.findByRole('button', { name: /^Fix and send/ })).toBeTruthy()
    expect(screen.getByText(HELD_SENTENCE)).toBeTruthy()
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
