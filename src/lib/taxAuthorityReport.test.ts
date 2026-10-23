import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import type { ActivityDetailDto, ActivityItemDto, TddLegDto } from '../api/compliance/activity'
import type { InvoiceDispatchDto } from '../api/invoices/detail'
import {
  REPORT_UNAVAILABLE,
  REPORT_WATCH_WINDOW_MS,
  findIssuedReport,
  issuedReportNotes,
  provesIssued,
  provesReceived,
  recentEnoughToWatch,
  refreshIssuedReport,
  tddReportIsPending,
  tddReportStateOf,
  transportMessageIds,
} from './taxAuthorityReport'
import { receiptLegNote, replyIsPending, replyNote } from './billDetail'

const lookup = (bundle: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle)

const leg = (overrides: Partial<TddLegDto> = {}): TddLegDto => ({
  variant: 'SUBMIT',
  status: 'SUBMITTED',
  validated_at: '2026-10-19T08:00:00Z',
  sla_deadline: '2026-10-19T08:15:00Z',
  submitted_at: '2026-10-19T08:01:00Z',
  sla_met: null,
  ack: 'NONE',
  ack_at: null,
  reason: null,
  delivered_at: null,
  transport_state: 'PENDING',
  correction_held: false,
  ...overrides,
})

const item = (
  tdd: TddLegDto | null,
  overrides: Partial<ActivityItemDto> = {},
): ActivityItemDto => ({
  invoice_uuid: 'u-1',
  direction: 'ISSUED',
  document_kind: 'STANDARD_INVOICE',
  document_type_code: null,
  invoice_number: 'INV-2026-0042',
  counterparty: '0248:OM1100999001',
  occurred_at: '2026-10-19T08:00:00Z',
  validated_at: '2026-10-19T08:00:00Z',
  b2c: false,
  transport_state: 'SENT',
  invoice_leg: { ack: 'NONE', ack_at: null, reason: null },
  tdd_leg: tdd,
  attention: false,
  links: { document: '/api/v1/invoices/s-1', tdd_xml: '/api/v1/invoices/s-1/tdd', resubmit: null },
  ...overrides,
})

/**
 * The backend's TddReportState precedence (JdbcActivityReadAdapter `flagged.tdd_state` at
 * 69c878d73), case by case.
 */
describe('tddReportStateOf mirrors the server', () => {
  it('reads no leg as not raised', () => {
    expect(tddReportStateOf(null)).toBe('NOT_RAISED')
  })

  it("lets C5's MLS decide first, whatever the status says", () => {
    expect(tddReportStateOf(leg({ ack: 'RE', status: 'DEAD_LETTERED' }))).toBe('AUTHORITY_REJECTED')
    expect(tddReportStateOf(leg({ ack: 'AP', status: 'GENERATION_FAILED' }))).toBe('ANSWERED')
    expect(tddReportStateOf(leg({ ack: 'AB' }))).toBe('ANSWERED')
  })

  it('reads a generation failure as stopped at Fawtir', () => {
    expect(tddReportStateOf(leg({ status: 'GENERATION_FAILED', transport_state: null }))).toBe(
      'INTERNALLY_STOPPED',
    )
  })

  // Inbound audit 2026-10-13 F4: the SLA watchdog parks the ledger and leaves the transport
  // retrying, so a DEAD_LETTERED leg with a live transport row is not stopped.
  it.each(['PENDING', 'SENDING', 'SENT_AWAITING_MDN', 'MDN_FAILED', 'RETRY_SCHEDULED'])(
    'keeps a dead-lettered leg whose transport is %s as still on its way',
    (transport) => {
      expect(tddReportStateOf(leg({ status: 'DEAD_LETTERED', transport_state: transport }))).toBe(
        'NEVER_SUBMITTED',
      )
    },
  )

  it.each(['DEAD_LETTERED', 'DELIVERED', null])(
    'reads a dead-lettered leg whose transport is %s as stopped',
    (transport) => {
      expect(
        tddReportStateOf(
          leg({ status: 'DEAD_LETTERED', transport_state: transport, delivered_at: null }),
        ),
      ).toBe('INTERNALLY_STOPPED')
    },
  )

  // F3: submitted_at is written when the TDD is queued, so it never says C5 has the report.
  it('tests delivery, not submitted_at', () => {
    expect(
      tddReportStateOf(leg({ submitted_at: '2026-10-19T08:01:00Z', delivered_at: null })),
    ).toBe('NEVER_SUBMITTED')
    expect(
      tddReportStateOf(leg({ delivered_at: '2026-10-19T08:02:00Z', transport_state: 'DELIVERED' })),
    ).toBe('AWAITING_RESPONSE')
  })

  it('keeps re-reading only while the server may still move the report', () => {
    expect(tddReportIsPending(null)).toBe(true)
    expect(tddReportIsPending(leg())).toBe(true)
    expect(tddReportIsPending(leg({ delivered_at: '2026-10-19T08:02:00Z' }))).toBe(true)
    expect(tddReportIsPending(leg({ ack: 'AP' }))).toBe(false)
    expect(tddReportIsPending(leg({ ack: 'AB' }))).toBe(false)
    expect(tddReportIsPending(leg({ ack: 'RE' }))).toBe(false)
    expect(tddReportIsPending(leg({ status: 'GENERATION_FAILED' }))).toBe(false)
  })
})

describe('what the invoice page says about its report', () => {
  const keys = (tdd: TddLegDto | null, overrides: Partial<ActivityItemDto> = {}) =>
    issuedReportNotes(item(tdd, overrides)).map((note) =>
      note.key.replace('invoiceDispatch.taxReport.', ''),
    )

  it('tells pending apart from delivered and from answered', () => {
    expect(keys(null)).toEqual(['notRaised'])
    expect(keys(leg())).toEqual(['notDelivered'])
    expect(keys(leg({ delivered_at: '2026-10-19T08:02:00Z' }))).toEqual(['awaiting'])
    expect(keys(leg({ ack: 'AP', status: 'ACCEPTED' }))).toEqual(['accepted'])
    // AB is final but is never counted as accepted.
    expect(keys(leg({ ack: 'AB', status: 'DELIVERED_UNCONFIRMED' }))).toEqual([
      'deliveredUnconfirmed',
    ])
    expect(keys(leg({ status: 'GENERATION_FAILED', transport_state: null }))).toEqual(['stopped'])
  })

  it('offers a resubmission only as the server link says, and never as a button here', () => {
    const rejected = leg({ ack: 'RE', status: 'REJECTED', delivered_at: '2026-10-19T08:02:00Z' })
    expect(keys(rejected)).toEqual(['rejected'])
    expect(
      keys(rejected, {
        links: { document: 'd', tdd_xml: null, resubmit: '/api/v1/invoices/s-1/tdd/resubmit' },
      }),
    ).toEqual(['rejected', 'resubmitInActivity'])
    expect(keys({ ...rejected, correction_held: true })).toEqual(['rejected', 'correctionHeld'])
  })

  it('says the deadline from sla_met only, and not on a report Fawtir stopped', () => {
    expect(keys(leg({ sla_met: false }))).toEqual(['notDelivered', 'deadlinePassed'])
    expect(keys(leg({ sla_met: false, delivered_at: '2026-10-19T09:00:00Z' }))).toEqual([
      'awaiting',
      'deliveredLate',
    ])
    expect(keys(leg({ sla_met: null }))).toEqual(['notDelivered'])
    expect(keys(leg({ sla_met: false, status: 'GENERATION_FAILED' }))).toEqual(['stopped'])
  })

  it('never reads a Disregard as the acceptance of the invoice report', () => {
    const disregard = leg({ variant: 'DISREGARD', status: 'DISREGARD_SUBMITTED' })
    expect(keys(disregard)).toEqual(['withdrawing'])
    expect(keys({ ...disregard, ack: 'AP' })).toEqual(['withdrawn'])
    expect(keys({ ...disregard, ack: 'RE' })).toEqual(['withdrawalRejected'])
  })

  it('has every sentence in English and Arabic, with no code or em dash on screen', () => {
    const sentences = Object.keys(en.invoiceDispatch.taxReport)
    expect(Object.keys(ar.invoiceDispatch.taxReport).sort()).toEqual([...sentences].sort())
    for (const key of sentences) {
      const english = lookup(en, `invoiceDispatch.taxReport.${key}`) as string
      const arabic = lookup(ar, `invoiceDispatch.taxReport.${key}`) as string
      expect(english, key).not.toMatch(/[A-Z]{2,}_|—/)
      expect(arabic.replace(/Peppol/g, ''), key).not.toMatch(/[A-Za-z]|—/)
    }
    // A transport fact, not a tax verdict: nothing claims the OTA judged the invoice.
    expect(JSON.stringify(en.invoiceDispatch.taxReport)).not.toMatch(/approved|cleared|compliant/i)
    expect(REPORT_UNAVAILABLE.key).toBe('invoiceDispatch.taxReport.unavailable')
  })
})

describe('proving which record is this invoice', () => {
  const dispatch = (buyer: string | null, tax: string | null): InvoiceDispatchDto => {
    const transportLeg = (messageId: string) => ({
      messageId,
      state: 'TRANSMITTED' as const,
      attempts: 1,
      lastAttemptAt: '2026-10-19T08:00:00Z',
      nextAttemptAt: null,
    })
    return {
      state: 'SENT',
      reasonCode: null,
      attempts: 0,
      nextAttemptAt: null,
      dispatchedAt: '2026-10-19T08:00:00Z',
      sendable: false,
      buyerDelivery: 'PEPPOL',
      buyerEmailReleasable: false,
      transport: {
        buyer: buyer ? transportLeg(buyer) : null,
        taxAuthority: tax ? transportLeg(tax) : null,
      },
    }
  }
  const detail = (
    uuid: string,
    transmissionIds: string[],
    direction: 'ISSUED' | 'RECEIVED' = 'ISSUED',
  ): ActivityDetailDto => ({
    invoice_uuid: uuid,
    summary: item(leg(), { invoice_uuid: uuid, direction }),
    tdd_lineage: [],
    mls: [],
    transmissions: transmissionIds.map((id) => ({
      id,
      channel: 'INVOICE',
      direction: 'OUTBOUND',
      state: 'DELIVERED',
      attempts: 1,
      last_attempt_at: null,
      last_failure_reason: null,
      sbdh_instance_identifier: null,
      last_mls_code: null,
      created_at: '2026-10-19T08:00:00Z',
    })),
  })

  it('names the transport rows the dispatch reports, and none before one exists', () => {
    expect(transportMessageIds(dispatch('m-1', 'm-2'))).toEqual(['m-1', 'm-2'])
    expect(transportMessageIds(dispatch(null, 'm-2'))).toEqual(['m-2'])
    expect(transportMessageIds({ ...dispatch(null, null), transport: null })).toEqual([])
    expect(transportMessageIds(null)).toEqual([])
  })

  it('accepts a record only when it holds one of those rows, on the issued side', () => {
    expect(provesIssued(detail('u-1', ['m-9', 'm-2']), ['m-1', 'm-2'])).toBe(true)
    expect(provesIssued(detail('u-1', ['m-9']), ['m-1', 'm-2'])).toBe(false)
    expect(provesIssued(detail('u-1', ['m-2'], 'RECEIVED'), ['m-2'])).toBe(false)
  })

  it('accepts a received record only when it links to this delivery', () => {
    const received = detail('u-1', [], 'RECEIVED')
    received.summary.links.document = '/api/v1/inbound-invoices/d-1'
    expect(provesReceived(received, 'd-1')).toBe(true)
    expect(provesReceived(received, 'd-2')).toBe(false)
    expect(
      provesReceived({ ...received, summary: { ...received.summary, direction: 'ISSUED' } }, 'd-1'),
    ).toBe(false)
  })

  describe('over the wire', () => {
    let fetchMock: ReturnType<typeof vi.fn>
    let details: Record<string, ActivityDetailDto>
    let listItems: ActivityItemDto[]
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    const urls = () => fetchMock.mock.calls.map(([url]) => String(url))

    beforeEach(() => {
      details = {}
      listItems = []
      fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        expect(init?.method ?? 'GET').toBe('GET')
        expect(new Headers(init?.headers).has('Authorization')).toBe(false)
        if (url.startsWith('/api/v1/compliance/activity?'))
          return json({ items: listItems, page: 0, page_size: 5, has_more: false })
        const uuid = url.slice('/api/v1/compliance/activity/'.length)
        return json(details[uuid])
      })
      vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => vi.unstubAllGlobals())

    it('asks the ledger by number on the issued side only, five rows at most', async () => {
      await findIssuedReport('INV/2026 0042', ['m-1'])
      expect(urls()).toEqual([
        '/api/v1/compliance/activity?direction=ISSUED&invoice_number=INV%2F2026+0042&page=0&page_size=5',
      ])
    })

    it('finds the record behind a number reused in another year', async () => {
      listItems = [item(leg(), { invoice_uuid: 'u-2025' }), item(leg(), { invoice_uuid: 'u-2026' })]
      details = { 'u-2025': detail('u-2025', ['m-old']), 'u-2026': detail('u-2026', ['m-2']) }
      const found = await findIssuedReport('INV-2026-0042', ['m-1', 'm-2'])
      expect(found).toMatchObject({ kind: 'found', invoiceUuid: 'u-2026' })
      expect(urls().slice(1)).toEqual([
        '/api/v1/compliance/activity/u-2025',
        '/api/v1/compliance/activity/u-2026',
      ])
    })

    it('answers unproven rather than guess, and skips rows that are not this number', async () => {
      listItems = [
        item(leg(), { invoice_uuid: 'u-x', invoice_number: 'INV-2026-00421' }),
        item(leg(), { invoice_uuid: 'u-y' }),
      ]
      details = { 'u-y': detail('u-y', ['m-other']) }
      expect(await findIssuedReport('INV-2026-0042', ['m-1'])).toEqual({ kind: 'unproven' })
      expect(urls()).not.toContain('/api/v1/compliance/activity/u-x')
    })

    it('proves the record again on every re-read', async () => {
      details = { 'u-1': detail('u-1', ['m-2']) }
      expect(await refreshIssuedReport('u-1', ['m-2'])).toMatchObject({ kind: 'found' })
      expect(await refreshIssuedReport('u-1', ['m-3'])).toEqual({ kind: 'unproven' })
    })
  })
})

describe("a received bill's receipt report and reply", () => {
  const day = (iso: string) => iso.slice(0, 10)
  const received = (tdd: TddLegDto | null, overrides: Partial<ActivityItemDto> = {}) =>
    receiptLegNote(item(tdd, { direction: 'RECEIVED', invoice_uuid: 'u-r', ...overrides }), day)

  it('reads the report by the same state, links to the record and ticks only an AP', () => {
    expect(received(leg({ ack: 'AP', ack_at: '2026-10-19T08:03:00Z' }))).toEqual({
      key: 'billDetail.compliance.receipt.accepted',
      values: { date: '2026-10-19' },
      ok: true,
      link: '/compliance/activity/u-r',
    })
    expect(received(leg({ ack: 'AB' }))).toMatchObject({
      key: 'billDetail.compliance.receipt.deliveredUnconfirmed',
      ok: false,
    })
    expect(received(leg()).key).toBe('billDetail.compliance.receipt.notSubmitted')
    expect(received(leg({ sla_met: false })).key).toBe(
      'billDetail.compliance.receipt.notSubmittedLate',
    )
    expect(received(leg({ delivered_at: '2026-10-19T08:02:00Z' })).key).toBe(
      'billDetail.compliance.receipt.submitted',
    )
    expect(received(null).key).toBe('billDetail.compliance.receipt.notRaised')
    expect(received(leg({ status: 'GENERATION_FAILED' })).key).toBe(
      'billDetail.compliance.receipt.stopped',
    )
  })

  it('words a refusal by what the server offers next', () => {
    const rejected = leg({ ack: 'RE', status: 'REJECTED' })
    expect(received(rejected).key).toBe('billDetail.compliance.receipt.rejected')
    expect(
      received(rejected, {
        links: {
          document: 'd',
          tdd_xml: null,
          resubmit: '/api/v1/inbound-invoices/d-1/tdd/resubmit',
        },
      }).key,
    ).toBe('billDetail.compliance.receipt.rejectedResubmit')
    expect(received({ ...rejected, correction_held: true }).key).toBe(
      'billDetail.compliance.receipt.rejectedHeld',
    )
  })

  it('says a decided reply is not a sent one, and silence is not a failure', () => {
    const key = (ack: 'AP' | 'AB' | 'RE' | 'NONE' | null, transport: string | null) =>
      replyNote(ack, transport).key.replace('billDetail.compliance.reply.', '')
    expect(key(null, null)).toBe('none')
    expect(key('NONE', null)).toBe('none')
    expect(key('AB', null)).toBe('notQueued')
    expect(key('AB', 'PENDING')).toBe('notDeliveredYet')
    expect(key('AB', 'SENT_AWAITING_MDN')).toBe('notDeliveredYet')
    expect(key('AB', 'MDN_FAILED')).toBe('failed')
    expect(key('AB', 'RETRY_SCHEDULED')).toBe('retrying')
    expect(key('AB', 'DEAD_LETTERED')).toBe('failed')
    expect(key('AB', 'SOMETHING_NEW')).toBe('unknown')
    expect(replyNote('AP', 'DELIVERED')).toEqual({
      key: 'billDetail.compliance.reply.AP',
      ok: true,
    })
    expect(replyNote('AB', 'DELIVERED')).toEqual({
      key: 'billDetail.compliance.reply.AB',
      ok: true,
    })
    expect(replyNote('RE', 'DELIVERED')).toEqual({
      key: 'billDetail.compliance.reply.RE',
      ok: false,
    })
    expect(replyNote(null, null).ok).toBe(false)
  })

  it('re-reads a reply only while it is on its way', () => {
    expect(replyIsPending('AB', 'PENDING')).toBe(true)
    expect(replyIsPending('AB', 'RETRY_SCHEDULED')).toBe(true)
    expect(replyIsPending('AB', 'DELIVERED')).toBe(false)
    expect(replyIsPending('AB', 'DEAD_LETTERED')).toBe(false)
    expect(replyIsPending('AB', 'MDN_FAILED')).toBe(false)
    expect(replyIsPending(null, null)).toBe(false)
    expect(replyIsPending('NONE', 'PENDING')).toBe(false)
  })

  it('has every line in English and Arabic', () => {
    for (const group of ['reply', 'receipt'] as const) {
      const keys = Object.keys(en.billDetail.compliance[group])
      expect(Object.keys(ar.billDetail.compliance[group]).sort(), group).toEqual([...keys].sort())
      for (const key of keys) {
        const arabic = lookup(ar, `billDetail.compliance.${group}.${key}`) as string
        expect(arabic.replace(/\{\{\w+\}\}/g, ''), key).not.toMatch(/[A-Za-z]|—/)
      }
    }
    expect(ar.billDetail.compliance.failedOnArrival).not.toMatch(/[A-Za-z]/)
  })
})

describe('recentEnoughToWatch', () => {
  const at = (iso: string) => new Date(iso).getTime()

  it('watches inside a day of validation and not after', () => {
    const fresh = item(leg({ validated_at: '2026-10-19T08:00:00Z' }))
    expect(recentEnoughToWatch(fresh, at('2026-10-19T09:00:00Z'))).toBe(true)
    expect(recentEnoughToWatch(fresh, at('2026-10-20T07:59:00Z'))).toBe(true)
    expect(recentEnoughToWatch(fresh, at('2026-10-20T08:00:00Z'))).toBe(false)
    expect(REPORT_WATCH_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('falls back to the row when no report exists, and never watches an undated row', () => {
    expect(recentEnoughToWatch(item(null), at('2026-10-19T09:00:00Z'))).toBe(true)
    expect(
      recentEnoughToWatch(
        item(null, { validated_at: null, occurred_at: '' }),
        at('2026-10-19T09:00:00Z'),
      ),
    ).toBe(false)
  })
})
