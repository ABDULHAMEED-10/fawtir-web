import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { resetSharedRequests } from '../../../api'
import { RECONCILIATION_LABELS } from '../../../api/erp/reporting'
import { ErpDocumentsPage } from './ErpDocumentsPage'
import { ErpDocumentDetailPage } from './ErpDocumentDetailPage'
import { ErpAttentionPage } from './ErpAttentionPage'
import { ErpRunsPage } from './ErpRunsPage'
import { ErpRunDetailPage } from './ErpRunDetailPage'
import { ConnectionRunsPage } from '../connections/ConnectionRunsPage'
import { ConnectionRecordsPage } from '../connections/ConnectionRecordsPage'

const RUN_ID = '0b9d7a0e-1f2c-4d5e-8a9b-1c2d3e4f5a6b'
const RECORD_ID = '5f1e2d3c-4b5a-4968-8776-655443322110'
const CONNECTION_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'

const READER: Entitlements = {
  userId: 'u-1',
  username: 'reader',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: ['invoice.read'],
  scopes: [],
  featureFlags: {},
}
const ADMIN: Entitlements = { ...READER, permissions: ['invoice.read', 'erp.connection.read'] }
const NO_READ: Entitlements = { ...READER, permissions: ['invoice.submit'] }

const COUNTERS = { discovered: 5, accepted: 3, rejected: 1, duplicate: 1, unsettled: 0 }
const DOWNSTREAM = {
  queued: 0,
  sending: 0,
  sent: 1,
  delivered: 1,
  delivered_unconfirmed: 0,
  undeliverable: 1,
  c4_unreachable: 0,
  without_invoice: 0,
  total: 3,
  delivery_failed: 0,
  off_network: 1,
}

const run = (over: Record<string, unknown> = {}) => ({
  run_id: RUN_ID,
  source_kind: 'MANAGED_PULL',
  connection_id: CONNECTION_ID,
  state: 'COMPLETED',
  created_by: null,
  created_at: '2026-10-01T05:00:00Z',
  started_at: '2026-10-01T05:00:01Z',
  completed_at: '2026-10-01T05:00:09Z',
  failure_reason: null,
  counters: COUNTERS,
  ...over,
})

const doc = (over: Record<string, unknown> = {}) => ({
  record_id: RECORD_ID,
  source_kind: 'BRIDGE_UPLOAD',
  connection_id: null,
  run_id: RUN_ID,
  external_document_id: 'SO-1001',
  external_version: null,
  processing_state: 'ACCEPTED',
  reason_code: null,
  stage: null,
  failure_class: null,
  retryable: false,
  attempt_count: 1,
  invoice: {
    submission_id: 'invc_1',
    invoice_uuid: '7a2935a9-1cce-5260-bf9a-57f156f66867',
    invoice_number: 'INV-77',
    missing: false,
  },
  delivery_state: 'SENT',
  display_status: 'SENT',
  received_at: '2026-10-01T06:00:00Z',
  settled_at: '2026-10-01T06:00:02Z',
  updated_at: '2026-10-01T06:10:00Z',
  ...over,
})

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items,
  page: 0,
  page_size: 20,
  has_more: false,
  ...over,
})

const SUMMARY = {
  received: 6,
  accepted: 3,
  rejected: 1,
  duplicate: 1,
  waiting_for_mapping: 1,
  retryable: 0,
  processing: 0,
  downstream: DOWNSTREAM,
  events: { replays: 2, conflicts: 1, completeness: 'AUDIT_EVIDENCE_LOWER_BOUND' },
}

const detail = (over: Record<string, unknown> = {}) => ({
  document: doc(),
  max_attempts: 5,
  delivery: {
    route: 'PEPPOL_NETWORK',
    state: 'SENT',
    failure_reason: null,
    received_at: '2026-10-01T06:00:02Z',
    validated_at: '2026-10-01T06:00:02Z',
    sent_at: '2026-10-01T06:01:00Z',
    delivered_at: null,
  },
  tax_report: null,
  recipient_response: { applicable: true, code: 'NONE', received_at: null, responses: 0 },
  timeline: {
    items: [
      {
        at: '2026-10-01T06:00:00Z',
        type: 'SOURCE_RECEIVED',
        origin: 'SOURCE_LEDGER',
        code: null,
        actor_type: null,
      },
      {
        at: '2026-10-01T06:00:02Z',
        type: 'SOURCE_ACCEPTED',
        origin: 'AUDIT_TRAIL',
        code: null,
        actor_type: 'USER',
      },
      {
        at: '2026-10-01T06:01:00Z',
        type: 'DELIVERY_STATE',
        origin: 'INVOICE_LEDGER',
        code: 'SENT',
        actor_type: null,
      },
    ],
    truncated: false,
  },
  validation_findings: { items: [], truncated: false },
  ...over,
})

type Call = { url: string; method: string }
let who: Entitlements
let calls: Call[]
let routes: Record<string, () => Response>

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number) {
  return new Response(
    JSON.stringify({
      type: 'https://fawtir.om/problems/x',
      status,
      detail: 'SERVER-PROSE-MARKER java.lang.IllegalStateException at com.fawtir.Secret',
      correlationId: 'corr-555',
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

const path = (url: string) => new URL(url, 'http://x').pathname
const query = (url: string) => new URL(url, 'http://x').searchParams
const reportCalls = () => calls.filter((call) => call.url.includes('/api/v1/erp/'))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  // 10:00 in Muscat on 4 October 2026.
  vi.setSystemTime(new Date('2026-10-04T06:00:00Z'))
  who = READER
  calls = []
  routes = {
    '/api/v1/erp/extraction/runs': () =>
      json(
        200,
        page([run(), run({ run_id: 'r-2', source_kind: 'BRIDGE_UPLOAD', connection_id: null })]),
      ),
    [`/api/v1/erp/extraction/runs/${RUN_ID}`]: () =>
      json(200, { run: run(), downstream: DOWNSTREAM }),
    '/api/v1/erp/source-documents': () => json(200, page([doc()])),
    '/api/v1/erp/source-documents/summary': () => json(200, SUMMARY),
    '/api/v1/erp/source-documents/reconciliation': () =>
      json(200, { ...page([]), unevaluated_labels: ['RESPONSE_PENDING'] }),
    [`/api/v1/erp/source-documents/${RECORD_ID}`]: () => json(200, detail()),
    '/api/v1/erp/connections': () =>
      json(200, {
        connections: [{ id: CONNECTION_ID, name: 'Head office Odoo' }],
        total: 1,
        includesArchived: true,
      }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      calls.push({ url, method: init?.method ?? 'GET' })
      if (url.startsWith('/api/v1/me/entitlements')) return json(200, who)
      const answer = routes[path(url)]
      return answer ? answer() : json(404)
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/settings/erp/documents" element={<ErpDocumentsPage />} />
        <Route path="/settings/erp/documents/:recordId" element={<ErpDocumentDetailPage />} />
        <Route path="/settings/erp/attention" element={<ErpAttentionPage />} />
        <Route path="/settings/erp/runs" element={<ErpRunsPage />} />
        <Route path="/settings/erp/runs/:runId" element={<ErpRunDetailPage />} />
        <Route path="/settings/erp/connections/:id/runs" element={<ConnectionRunsPage />} />
        <Route path="/settings/erp/connections/:id/runs/:runId" element={<ConnectionRunsPage />} />
        <Route path="/settings/erp/connections/:id/records" element={<ConnectionRecordsPage />} />
        <Route
          path="/settings/erp/connections/:id/records/:recordId"
          element={<ConnectionRecordsPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function chooseOption(label: string, option: string) {
  fireEvent.click(await screen.findByRole('button', { name: label }))
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('the read gate', () => {
  it('asks nothing of the reports without invoice.read and says why', async () => {
    who = NO_READ
    renderAt('/settings/erp/documents')
    expect(await screen.findByText(/doesn't have access/i)).toBeTruthy()
    expect(reportCalls()).toEqual([])
  })

  it('shows the server refusal as no access, never as an empty list', async () => {
    routes['/api/v1/erp/source-documents'] = () => problem(403)
    renderAt('/settings/erp/documents')
    expect(await screen.findByText(/doesn't have access/i)).toBeTruthy()
    expect(screen.queryByText('No documents were received in this period.')).toBeNull()
  })
})

describe('source documents', () => {
  it('reads one list and one summary over the default window, as business-zone instants', async () => {
    renderAt('/settings/erp/documents')
    expect(await screen.findByText('SO-1001')).toBeTruthy()
    const lists = reportCalls().filter((call) => path(call.url) === '/api/v1/erp/source-documents')
    const summaries = reportCalls().filter((call) => path(call.url).endsWith('/summary'))
    expect(lists).toHaveLength(1)
    expect(summaries).toHaveLength(1)
    // 30 days ending today in Muscat, both included: 5 Sep 00:00 to 5 Oct 00:00 local time.
    expect(query(lists[0].url).get('from')).toBe('2026-09-04T20:00:00.000Z')
    expect(query(lists[0].url).get('to')).toBe('2026-10-04T20:00:00.000Z')
    expect(query(lists[0].url).get('page_size')).toBe('20')
    expect(query(summaries[0].url).get('from')).toBe('2026-09-04T20:00:00.000Z')
    // Nothing per row: no detail, no connection lookup for a reader without connection rights.
    expect(reportCalls().filter((call) => path(call.url).includes(RECORD_ID))).toEqual([])
    expect(calls.some((call) => path(call.url) === '/api/v1/erp/connections')).toBe(false)
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
  })

  it('shows the six server buckets and the replay and conflict floor', async () => {
    renderAt('/settings/erp/documents')
    expect(await screen.findByText('Waiting for mapping')).toBeTruthy()
    expect(screen.getByText(/at least 2 resends/)).toBeTruthy()
    expect(screen.getByText('Outside the Peppol network')).toBeTruthy()
  })

  it('shows a channel without a connection as not applicable, and never invents one', async () => {
    renderAt('/settings/erp/documents')
    const row = (await screen.findByText('SO-1001')).closest('tr')!
    expect(within(row).getByText('Not applicable')).toBeTruthy()
    expect(within(row).getByText('Upload')).toBeTruthy()
  })

  it('names connections from one list read when the reader may see connections', async () => {
    who = ADMIN
    routes['/api/v1/erp/source-documents'] = () =>
      json(200, page([doc({ source_kind: 'MANAGED_PULL', connection_id: CONNECTION_ID })]))
    renderAt('/settings/erp/documents')
    expect(await screen.findByText('Head office Odoo', { selector: 'span' })).toBeTruthy()
    expect(calls.filter((call) => path(call.url) === '/api/v1/erp/connections')).toHaveLength(1)
  })

  it('sends nothing for a window the server would refuse, and says what is wrong', async () => {
    renderAt('/settings/erp/documents?from=2026-10-05&to=2026-10-01')
    expect(await screen.findByText('The start date must not be after the end date.')).toBeTruthy()
    expect(reportCalls()).toEqual([])
  })

  it('refuses a window longer than the server allows before asking', async () => {
    renderAt('/settings/erp/documents?from=2025-01-01&to=2026-10-01')
    expect(await screen.findByText(/at most 367 days/)).toBeTruthy()
    expect(reportCalls()).toEqual([])
  })

  it('sends a filter as the server names it and goes back to the first page', async () => {
    renderAt('/settings/erp/documents?page=3')
    await screen.findByText('SO-1001')
    await chooseOption('Channel', 'API push')
    await waitFor(() => {
      const last = reportCalls()
        .filter((call) => path(call.url) === '/api/v1/erp/source-documents')
        .at(-1)!
      expect(query(last.url).get('source_kind')).toBe('API_PUSH')
      expect(query(last.url).get('page')).toBeNull()
    })
  })

  it('pages by has_more, asking for the next zero-based page', async () => {
    routes['/api/v1/erp/source-documents'] = () => json(200, page([doc()], { has_more: true }))
    renderAt('/settings/erp/documents')
    await screen.findByText('SO-1001')
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => {
      const last = reportCalls()
        .filter((call) => path(call.url) === '/api/v1/erp/source-documents')
        .at(-1)!
      expect(query(last.url).get('page')).toBe('1')
    })
  })

  it('tells an empty period apart from an empty filter', async () => {
    routes['/api/v1/erp/source-documents'] = () => json(200, page([]))
    renderAt('/settings/erp/documents')
    expect(await screen.findByText('No documents were received in this period.')).toBeTruthy()
  })

  it('offers the first page instead of an empty table past the end', async () => {
    routes['/api/v1/erp/source-documents'] = () => json(200, page([], { page: 4 }))
    renderAt('/settings/erp/documents?page=5')
    expect(await screen.findByText('Go to the first page')).toBeTruthy()
  })

  it('shows a failed read with a retry and the reference, never the server text', async () => {
    routes['/api/v1/erp/source-documents'] = () => problem(500)
    renderAt('/settings/erp/documents')
    expect(await screen.findByText(/corr-555/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/SERVER-PROSE-MARKER|IllegalStateException/)
  })
})

describe('a source document', () => {
  it('keeps every dimension separate and the badge labelled as a summary', async () => {
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByRole('heading', { name: 'SO-1001' })).toBeTruthy()
    expect(screen.getByText('Overall')).toBeTruthy()
    expect(screen.getByText('Peppol network')).toBeTruthy()
    expect(screen.getByText('No answer recorded')).toBeTruthy()
    expect(screen.getByText(/This is not a refusal/)).toBeTruthy()
    expect(screen.getByText('No tax report obligation has been recorded yet.')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in compliance activity' }).getAttribute('href'),
    ).toBe('/compliance/activity/7a2935a9-1cce-5260-bf9a-57f156f66867')
    expect(screen.getByRole('link', { name: 'Open the run' }).getAttribute('href')).toBe(
      `/settings/erp/runs/${RUN_ID}`,
    )
  })

  it('does not read an off-network invoice state as a delivery failure', async () => {
    routes[`/api/v1/erp/source-documents/${RECORD_ID}`] = () =>
      json(
        200,
        detail({
          document: doc({ display_status: 'OFF_NETWORK', delivery_state: 'UNDELIVERABLE' }),
          delivery: {
            route: 'OUTSIDE_PEPPOL',
            state: 'UNDELIVERABLE',
            failure_reason: null,
            received_at: null,
            validated_at: null,
            sent_at: null,
            delivered_at: null,
          },
          recipient_response: { applicable: false, code: 'NONE', received_at: null, responses: 0 },
        }),
      )
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(
      await screen.findByText(/describes a network leg the invoice does not have/),
    ).toBeTruthy()
    expect(screen.getByText('Outside Peppol')).toBeTruthy()
    expect(screen.queryByText('Delivery failed')).toBeNull()
    expect(screen.getByText(/did not travel the Peppol network/)).toBeTruthy()
  })

  it('shows a tax report that needs attention beside a delivered invoice', async () => {
    routes[`/api/v1/erp/source-documents/${RECORD_ID}`] = () =>
      json(
        200,
        detail({
          document: doc({ display_status: 'DELIVERED', delivery_state: 'DELIVERED' }),
          tax_report: {
            variant: 'SUBMIT',
            status: 'REJECTED',
            validated_at: null,
            sla_deadline: null,
            submitted_at: null,
            sla_met: false,
            obligations: 1,
          },
        }),
      )
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByText('Refused as a message')).toBeTruthy()
    expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0)
  })

  it('renders the timeline in the server order, and reverses it only on request', async () => {
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    const list = await screen.findByRole('list', { name: 'Timeline' })
    const order = () =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent ?? '')
    expect(order()[0]).toMatch(/^Received/)
    expect(order()[2]).toMatch(/^Delivery · Sent/)
    fireEvent.click(screen.getByRole('button', { name: 'Show newest first' }))
    expect(order()[0]).toMatch(/^Delivery · Sent/)
  })

  it('says when older audit events are not shown, and names an unknown event by its code', async () => {
    routes[`/api/v1/erp/source-documents/${RECORD_ID}`] = () =>
      json(
        200,
        detail({
          timeline: {
            items: [
              {
                at: '2026-10-01T06:00:00Z',
                type: 'SOMETHING_NEW',
                origin: 'AUDIT_TRAIL',
                code: null,
                actor_type: null,
              },
              {
                at: '2026-10-01T06:00:01Z',
                type: 'RECOVERY',
                origin: 'AUDIT_TRAIL',
                code: 'RELEASED',
                actor_type: 'SYSTEM',
              },
              {
                at: '2026-10-01T06:00:02Z',
                type: 'CONFLICT',
                origin: 'AUDIT_TRAIL',
                code: null,
                actor_type: 'API_KEY',
              },
            ],
            truncated: true,
          },
        }),
      )
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByText(/Only the newest 200 are read/)).toBeTruthy()
    expect(screen.getByText('SOMETHING_NEW')).toBeTruthy()
    expect(screen.getByText(/released for another attempt/)).toBeTruthy()
    expect(screen.getByText('Different content refused')).toBeTruthy()
  })

  it('shows findings by layer, rule and field, escaped, with the truncation note', async () => {
    const hostile = '<img src=x onerror=alert(1)>'
    routes[`/api/v1/erp/source-documents/${RECORD_ID}`] = () =>
      json(
        200,
        detail({
          document: doc({
            processing_state: 'REJECTED',
            reason_code: 'INVOICE_VALIDATION_FAILED',
            display_status: 'REJECTED',
            invoice: null,
            delivery_state: null,
          }),
          delivery: null,
          recipient_response: null,
          validation_findings: {
            items: [
              {
                layer: 'L2_ARITHMETIC',
                rule_id: 'BR-CO-15',
                field_path: 'BT-112',
                explanation: 'The totals do not add up.',
              },
              {
                layer: 'L5_PINT_OM',
                rule_id: `R-${'9'.repeat(120)}`,
                field_path: hostile,
                explanation: hostile,
              },
            ],
            truncated: true,
          },
        }),
      )
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByText('BR-CO-15')).toBeTruthy()
    expect(screen.getByText('The totals do not add up.')).toBeTruthy()
    expect(screen.getByText(/Only the first 50 findings were kept/)).toBeTruthy()
    expect(screen.getAllByText(hostile)).toHaveLength(2)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(screen.getByText('No invoice was created from this document.')).toBeTruthy()
  })

  it('says so when a rejected document kept no findings', async () => {
    routes[`/api/v1/erp/source-documents/${RECORD_ID}`] = () =>
      json(
        200,
        detail({
          document: doc({
            processing_state: 'REJECTED',
            display_status: 'REJECTED',
            invoice: null,
          }),
          delivery: null,
          recipient_response: null,
        }),
      )
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByText('No findings were kept for this document.')).toBeTruthy()
  })

  it('offers no replay, recovery or any other action, because the backend has none', async () => {
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    await screen.findByRole('heading', { name: 'SO-1001' })
    expect(screen.queryByRole('button', { name: /replay|retry|recover|resend/i })).toBeNull()
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
  })
})

describe('needs attention', () => {
  it('names every server label in words, and an unknown one by its code', async () => {
    routes['/api/v1/erp/source-documents/reconciliation'] = () =>
      json(200, {
        ...page([
          {
            ...doc(),
            delivery_route: 'PEPPOL_NETWORK',
            tax_report_status: 'PENDING',
            recipient_response_code: 'NONE',
            findings: [...RECONCILIATION_LABELS, 'BRAND_NEW_LABEL'].map((label) => ({
              label,
              since: '2026-10-01T07:00:00Z',
            })),
          },
        ]),
        unevaluated_labels: [],
      })
    renderAt('/settings/erp/attention')
    const row = (await screen.findByText('SO-1001')).closest('tr')!
    for (const words of [
      'Waiting for recovery',
      'Waiting for mapping',
      'Failed, will retry',
      'Accepted without an invoice',
      'Transport has not acknowledged',
      'No answer from the recipient',
      'Delivery failed',
      'Tax report needs attention',
      'BRAND_NEW_LABEL',
    ]) {
      expect(within(row).getByText(words)).toBeTruthy()
    }
  })

  it('repeats that RESPONSE_PENDING was not evaluated instead of timing it here', async () => {
    renderAt('/settings/erp/attention')
    expect(
      await screen.findByText(/No approved waiting time for the recipient's answer/),
    ).toBeTruthy()
    const before = reportCalls().length
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(reportCalls().length).toBe(before)
  })

  it('sends the label as the server names it, within a required window', async () => {
    renderAt('/settings/erp/attention')
    await screen.findByText('Nothing needs attention in this period.')
    fireEvent.click(await screen.findByRole('button', { name: 'Label' }))
    fireEvent.click(await screen.findByRole('option', { name: /^Tax report needs attention/ }))
    await waitFor(() => {
      const last = reportCalls().at(-1)!
      expect(query(last.url).get('label')).toBe('TAX_REPORT_ATTENTION')
      expect(query(last.url).get('from')).toBe('2026-09-04T20:00:00.000Z')
    })
  })
})

describe('extraction runs', () => {
  it('lists runs from every channel without a window by default', async () => {
    renderAt('/settings/erp/runs')
    const rows = await screen.findAllByRole('row')
    expect(rows.length).toBe(3)
    const list = reportCalls().find((call) => path(call.url) === '/api/v1/erp/extraction/runs')!
    expect(query(list.url).get('from')).toBeNull()
    expect(screen.getByText('Not applicable')).toBeTruthy()
    expect(screen.getByText('Managed pull')).toBeTruthy()
  })

  it('filters by run state as the server names it', async () => {
    renderAt('/settings/erp/runs')
    await screen.findAllByRole('row')
    await chooseOption('Run state', 'Completed with errors')
    await waitFor(() => {
      const last = reportCalls().at(-1)!
      expect(query(last.url).get('state')).toBe('COMPLETED_WITH_ERRORS')
    })
  })

  it('shows a run with its counters, its downstream now, and its documents by run_id', async () => {
    renderAt(`/settings/erp/runs/${RUN_ID}`)
    expect(await screen.findByText('Recorded by the run')).toBeTruthy()
    expect(screen.getByText('Its accepted invoices now')).toBeTruthy()
    expect(await screen.findByText('SO-1001')).toBeTruthy()
    const documents = reportCalls().find(
      (call) => path(call.url) === '/api/v1/erp/source-documents',
    )!
    expect(query(documents.url).get('run_id')).toBe(RUN_ID)
    // A run is already bounded: no window, and no summary request.
    expect(query(documents.url).get('from')).toBeNull()
    expect(reportCalls().some((call) => path(call.url).endsWith('/summary'))).toBe(false)
  })

  it('shows a run that is not the tenant’s as not found', async () => {
    routes[`/api/v1/erp/extraction/runs/${RUN_ID}`] = () => problem(404)
    renderAt(`/settings/erp/runs/${RUN_ID}`)
    expect(await screen.findByText(/not found/i)).toBeTruthy()
  })
})

describe('the per-connection addresses', () => {
  const CONNECTION = {
    id: CONNECTION_ID,
    name: 'Head office Odoo',
    sourceSystem: 'ODOO',
    sourceVersion: null,
    connectionMode: 'MANAGED_PULL',
    transportType: null,
    endpoint: null,
    configuration: null,
    state: 'ACTIVE',
    credentialConfigured: true,
    credentialType: null,
    credentialHint: null,
    credentialRotatedAt: null,
    lastTestedAt: null,
    lastTestOutcome: null,
    lastTestReasonCode: null,
    version: 1,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }

  it('keep the connection frame and narrow the documents to it', async () => {
    who = ADMIN
    routes[`/api/v1/erp/connections/${CONNECTION_ID}`] = () => json(200, CONNECTION)
    renderAt(`/settings/erp/connections/${CONNECTION_ID}/records`)
    expect(await screen.findByRole('heading', { name: 'Head office Odoo' })).toBeTruthy()
    const link = await screen.findByRole('link', { name: 'SO-1001' })
    expect(link.getAttribute('href')).toBe(
      `/settings/erp/connections/${CONNECTION_ID}/records/${RECORD_ID}`,
    )
    const list = reportCalls().find((call) => path(call.url) === '/api/v1/erp/source-documents')!
    expect(query(list.url).get('connection_id')).toBe(CONNECTION_ID)
    // The connection is fixed here, so it is not offered as a filter.
    expect(screen.queryByRole('button', { name: 'Connection' })).toBeNull()
  })

  it('keep the connection frame around one of its runs', async () => {
    who = ADMIN
    routes[`/api/v1/erp/connections/${CONNECTION_ID}`] = () => json(200, CONNECTION)
    renderAt(`/settings/erp/connections/${CONNECTION_ID}/runs/${RUN_ID}`)
    expect(await screen.findByText('Recorded by the run')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Head office Odoo' })).toBeTruthy()
  })

  it('open the reports narrowed to the connection, or the record itself', async () => {
    renderAt(`/settings/erp/connections/${CONNECTION_ID}/records`)
    await screen.findByText('SO-1001')
    const list = reportCalls().find((call) => path(call.url) === '/api/v1/erp/source-documents')!
    expect(query(list.url).get('connection_id')).toBe(CONNECTION_ID)
  })

  it('open a run from its old per-connection address', async () => {
    renderAt(`/settings/erp/connections/${CONNECTION_ID}/runs/${RUN_ID}`)
    expect(await screen.findByText('Recorded by the run')).toBeTruthy()
  })
})

describe('Arabic', () => {
  it('lays the report out right to left with identifiers kept left to right', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/settings/erp/documents')
    expect(await screen.findByRole('heading', { name: 'المستندات المصدرية' })).toBeTruthy()
    expect(screen.getByText('SO-1001').closest('[dir="ltr"]')).not.toBeNull()
  })
})
