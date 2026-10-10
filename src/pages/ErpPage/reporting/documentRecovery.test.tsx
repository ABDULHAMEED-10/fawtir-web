import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import en from '../../../i18n/locales/en.json'
import ar from '../../../i18n/locales/ar.json'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { resetSharedRequests } from '../../../api'
import { ErpDocumentDetailPage } from './ErpDocumentDetailPage'
import { ErpAttentionPage } from './ErpAttentionPage'
import { ConnectionRecordsPage } from '../connections/ConnectionRecordsPage'

/**
 * Phase 10: recovering one exhausted Managed Pull document from its page. The backend decides
 * eligibility; these pin what the page offers, what it sends, and how each answer reads.
 */

const RECORD_ID = '5f1e2d3c-4b5a-4968-8776-655443322110'
const CONNECTION_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'
const DETAIL_URL = `/api/v1/erp/source-documents/${RECORD_ID}`
const RECOVERY_URL = `${DETAIL_URL}/recovery`

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'erp.connection.read', 'erp.document.recover'],
  scopes: [],
  featureFlags: {},
}
const OPERATOR: Entitlements = {
  ...ADMIN,
  permissions: ['invoice.read', 'erp.connection.read'],
}

const exhausted = (over: Record<string, unknown> = {}) => ({
  record_id: RECORD_ID,
  source_kind: 'MANAGED_PULL',
  connection_id: CONNECTION_ID,
  run_id: null,
  external_document_id: 'SO-2001',
  external_version: '3',
  processing_state: 'REJECTED',
  reason_code: 'ATTEMPTS_EXHAUSTED',
  stage: 'SOURCE',
  failure_class: 'PLATFORM',
  retryable: false,
  attempt_count: 5,
  invoice: null,
  delivery_state: null,
  display_status: 'REJECTED',
  received_at: '2026-10-01T06:00:00Z',
  settled_at: '2026-10-01T06:20:00Z',
  updated_at: '2026-10-01T06:20:00Z',
  ...over,
})

const accepted = () =>
  exhausted({
    processing_state: 'ACCEPTED',
    reason_code: null,
    stage: null,
    failure_class: null,
    invoice: {
      submission_id: 'invc_9',
      invoice_uuid: '7a2935a9-1cce-5260-bf9a-57f156f66867',
      invoice_number: 'INV-SO-2001',
      missing: false,
    },
    delivery_state: 'QUEUED',
    display_status: 'SUBMITTED',
  })

const detail = (document: Record<string, unknown>, timeline: unknown[] = []) => ({
  document,
  max_attempts: 5,
  delivery: null,
  tax_report: null,
  recipient_response: null,
  timeline: { items: timeline, truncated: false },
  validation_findings: { items: [], truncated: false },
})

const result = (over: Record<string, unknown> = {}) => ({
  record_id: RECORD_ID,
  outcome: 'SUCCEEDED',
  processing_state: 'ACCEPTED',
  reason_code: null,
  submission_id: 'invc_9',
  invoice_uuid: '7a2935a9-1cce-5260-bf9a-57f156f66867',
  recovery_count: 1,
  recovered_at: '2026-10-08T07:00:00Z',
  recoverable: false,
  ...over,
})

type Call = { url: string; method: string; body: unknown }
let who: Entitlements
let calls: Call[]
let current: Record<string, unknown>
let timeline: unknown[]
let recoveryAnswer: () => Response | Promise<Response>

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A refusal as the backend writes it: a typed `code`, and prose that must never be shown. */
function refusal(status: number, code: string | null, slug?: string) {
  return new Response(
    JSON.stringify({
      type: `https://api.fawtir.om/problems/${slug ?? (code ?? 'x').toLowerCase().replace(/_/g, '-')}`,
      status,
      detail: 'SERVER-PROSE-MARKER cursor=2026-07-01T00:00:00Z sha256=abc123',
      ...(code ? { code } : {}),
      correlationId: 'corr-10',
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

const CONNECTION = {
  id: CONNECTION_ID,
  name: 'Odoo',
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

/** The recovery answer: the one live region that takes focus (the shell has others). */
async function answer(role: 'status' | 'alert') {
  const region = await waitFor(() => {
    const found = document.querySelector(
      '[tabindex="-1"][role="status"], [tabindex="-1"][role="alert"]',
    )
    if (!(found instanceof HTMLElement)) throw new Error('no answer yet')
    return found
  })
  expect(region.getAttribute('role')).toBe(role)
  return region
}

const posts = () => calls.filter((call) => call.method === 'POST')
const detailReads = () =>
  calls.filter(
    (call) => call.method === 'GET' && new URL(call.url, 'http://x').pathname === DETAIL_URL,
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  who = ADMIN
  calls = []
  current = exhausted()
  timeline = []
  recoveryAnswer = () => {
    current = accepted()
    return json(200, result())
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ?? null })
      if (url.startsWith('/api/v1/me/entitlements')) return json(200, who)
      const path = new URL(url, 'http://x').pathname
      if (path === RECOVERY_URL && method === 'POST') return recoveryAnswer()
      if (path === DETAIL_URL) return json(200, detail(current, timeline))
      if (path === `/api/v1/erp/connections/${CONNECTION_ID}`) return json(200, CONNECTION)
      if (path === '/api/v1/erp/connections') {
        return json(200, {
          connections: [{ id: CONNECTION_ID, name: 'Odoo' }],
          total: 1,
        })
      }
      if (path === '/api/v1/erp/source-documents/reconciliation') {
        return json(200, {
          items: [],
          page: 0,
          page_size: 20,
          has_more: false,
        })
      }
      return json(404)
    }),
  )
})

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/settings/erp/documents/:recordId" element={<ErpDocumentDetailPage />} />
        <Route path="/settings/erp/attention" element={<ErpAttentionPage />} />
        <Route
          path="/settings/erp/connections/:id/records/:recordId"
          element={<ConnectionRecordsPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function openDialog() {
  renderAt(`/settings/erp/documents/${RECORD_ID}`)
  const opener = await screen.findByRole('button', {
    name: 'Recover document',
  })
  opener.focus()
  fireEvent.click(opener)
  return screen.getByRole('dialog', { name: 'Recover this document?' })
}

async function recoverWith(answer: () => Response) {
  recoveryAnswer = answer
  const dialog = await openDialog()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Recover' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('who is offered recovery', () => {
  it('A: offers it on an exhausted managed pull document to a holder of erp.document.recover', async () => {
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByRole('button', { name: 'Recover document' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recovery' })).toBeTruthy()
    expect(posts()).toEqual([])
  })

  it('A: offers it on the same document inside its connection', async () => {
    renderAt(`/settings/erp/connections/${CONNECTION_ID}/records/${RECORD_ID}`)
    expect(await screen.findByRole('button', { name: 'Recover document' })).toBeTruthy()
  })

  it('B: offers no active action without the permission, and says who can', async () => {
    who = OPERATOR
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    expect(await screen.findByText(/Only someone allowed to recover documents/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /recover/i })).toBeNull()
  })

  it.each([
    ['an uploaded document', { source_kind: 'BRIDGE_UPLOAD', connection_id: null }],
    ['a pushed document', { source_kind: 'API_PUSH', connection_id: null }],
    ['a managed pull document refused for its content', { reason_code: 'MAPPING_FAILED' }],
    ['a managed pull document still being retried', { processing_state: 'FAILED' }],
  ])('C: offers nothing on %s', async (_name, over) => {
    current = exhausted(over)
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    await screen.findByRole('heading', { name: 'SO-2001' })
    expect(screen.queryByRole('heading', { name: 'Recovery' })).toBeNull()
    expect(screen.queryByRole('button', { name: /recover/i })).toBeNull()
  })

  it('C: offers nothing on an accepted document', async () => {
    current = accepted()
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    await screen.findByRole('heading', { name: 'SO-2001' })
    expect(screen.queryByRole('button', { name: /recover/i })).toBeNull()
  })
})

describe('asking', () => {
  it('D: asks for confirmation first, in plain words, and sends nothing on cancel', async () => {
    const dialog = await openDialog()
    expect(within(dialog).getByText(/page that originally contained this document/)).toBeTruthy()
    expect(within(dialog).getByText(/no other document on that page is processed/)).toBeTruthy()
    expect(within(dialog).getByText(/collection position where it is/)).toBeTruthy()
    expect(within(dialog).getByText(/exactly the same content/)).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/cursor|hash|sha|token|credential/i)
    expect(posts()).toEqual([])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts()).toEqual([])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Recover document' }))
  })

  it('E: sends one request however often it is confirmed, and holds the dialog while it runs', async () => {
    let answer!: (response: Response) => void
    recoveryAnswer = () => new Promise<Response>((resolve) => (answer = resolve))
    const dialog = await openDialog()
    const confirm = within(dialog).getByRole('button', { name: 'Recover' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Recovering…' })).toBeTruthy(),
    )
    const working = within(dialog).getByRole('button', {
      name: 'Recovering…',
    }) as HTMLButtonElement
    expect(working.disabled).toBe(true)
    expect(
      (
        within(dialog).getByRole('button', {
          name: 'Cancel',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.click(working)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(posts()).toHaveLength(1)

    current = accepted()
    answer(json(200, result()))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts()).toHaveLength(1)
  })

  it('F: posts no body, then reads the document again and shows the server state', async () => {
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Recover document' }))
    const readsBefore = detailReads().length
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Recover',
      }),
    )

    const status = await answer('status')
    expect(status.textContent).toMatch(/Recovery completed successfully\./)
    expect(status.textContent).toMatch(/an invoice was created/)
    expect(status.textContent).not.toMatch(/sent|delivered/i)
    await waitFor(() => expect(detailReads().length).toBe(readsBefore + 1))
    expect(await screen.findByText('INV-SO-2001')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Recover document' })).toBeNull()
    expect(document.activeElement).toBe(status)

    expect(posts()).toHaveLength(1)
    expect(new URL(posts()[0].url, 'http://x').pathname).toBe(RECOVERY_URL)
    expect(posts()[0].body).toBeNull()
  })

  it('F: never claims an invoice the answer does not name', async () => {
    await recoverWith(() => json(200, result({ invoice_uuid: null, submission_id: null })))
    const status = await answer('status')
    expect(status.textContent).toMatch(/The document was accepted\./)
    expect(status.textContent).not.toMatch(/invoice/i)
  })
})

describe('the answers', () => {
  it('G: reads DUPLICATE_NOOP as already recovered, never as a failure', async () => {
    await recoverWith(() => {
      current = accepted()
      return json(200, result({ outcome: 'DUPLICATE_NOOP' }))
    })
    const status = await answer('status')
    expect(status.textContent).toMatch(/This document has already been recovered\./)
    await waitFor(() => expect(detailReads().length).toBe(2))
  })

  it.each([
    [
      'H: context unavailable',
      422,
      'ERP_RECOVERY_CONTEXT_UNAVAILABLE',
      /Automatic recovery is not available for this record\.[\s\S]*processed before recovery information was captured/,
    ],
    [
      'I: replay unavailable',
      422,
      'ERP_RECOVERY_SOURCE_REPLAY_UNAVAILABLE',
      /can no longer repeat the original request/,
    ],
    [
      'J: target missing',
      422,
      'ERP_RECOVERY_SOURCE_DOCUMENT_MISSING',
      /answered the original request, but this document was no longer in it/,
    ],
    [
      'K: changed source',
      409,
      'ERP_RECOVERY_SOURCE_DOCUMENT_CHANGED',
      /now returns different content[\s\S]*did not process the changed document/,
    ],
  ])('%s is final, worded, and offers no retry', async (_name, status, code, words) => {
    await recoverWith(() => refusal(status, code))
    const alert = await answer('alert')
    expect(alert.textContent).toMatch(words)
    expect(alert.textContent).not.toMatch(/try (the recovery )?again|later/i)
    expect(alert.textContent).not.toMatch(/SERVER-PROSE-MARKER|cursor|sha256|ERP_RECOVERY/)
    expect(document.activeElement).toBe(alert)
  })

  it('K: suggests the normal flow, never forcing the changed document through', async () => {
    await recoverWith(() => refusal(409, 'ERP_RECOVERY_SOURCE_DOCUMENT_CHANGED'))
    const alert = await answer('alert')
    expect(alert.textContent).toMatch(/send it from the ERP as a new version/)
    expect(alert.textContent).not.toMatch(/force|override/i)
  })

  it('L: tells an ERP entitlement refusal apart from a missing permission', async () => {
    await recoverWith(() => refusal(403, null, 'erp-entitlement-required'))
    expect((await answer('alert')).textContent).toMatch(
      /ERP integration is not enabled for your organisation/,
    )
  })

  it('M: reads any other 403 as a missing permission', async () => {
    await recoverWith(() => refusal(403, null, 'forbidden'))
    expect((await answer('alert')).textContent).toMatch(
      /don't have permission to recover documents/,
    )
  })

  it('offers another try only where the answer could change: the ERP unreachable', async () => {
    await recoverWith(() => refusal(503, 'ERP_RECOVERY_SOURCE_UNAVAILABLE'))
    const alert = await answer('alert')
    expect(alert.textContent).toMatch(/could not be reached/)
    expect(alert.textContent).toMatch(/You can try the recovery again\./)
  })

  it('reads a processing failure by whether the server says it is recoverable', async () => {
    await recoverWith(() =>
      json(
        200,
        result({
          outcome: 'PROCESSING_FAILED',
          processing_state: 'REJECTED',
          reason_code: 'MAPPING_FAILED',
          invoice_uuid: null,
          submission_id: null,
          recovered_at: null,
        }),
      ),
    )
    const alert = await answer('alert')
    expect(alert.textContent).toMatch(/refused: Mapping failed|refused: /)
    expect(alert.textContent).not.toMatch(/try the recovery again/)
  })

  it('keeps a retryable processing failure open for another try', async () => {
    await recoverWith(() =>
      json(
        200,
        result({
          outcome: 'PROCESSING_FAILED',
          processing_state: 'REJECTED',
          reason_code: 'ATTEMPTS_EXHAUSTED',
          invoice_uuid: null,
          submission_id: null,
          recovered_at: null,
          recoverable: true,
        }),
      ),
    )
    const alert = await answer('alert')
    expect(alert.textContent).toMatch(/no invoice was produced this time/)
    expect(alert.textContent).toMatch(/You can try the recovery again\./)
    expect(await screen.findByRole('button', { name: 'Recover document' })).toBeTruthy()
  })
})

describe('the timeline (N)', () => {
  it('names a person’s recovery and its outcome in words, never by code', async () => {
    current = accepted()
    const item = (at: string, code: string) => ({
      at,
      type: 'OPERATOR_RECOVERY',
      origin: 'AUDIT_TRAIL',
      code,
      actor_type: 'USER',
    })
    timeline = [
      item('2026-10-08T07:00:00Z', 'REQUESTED'),
      item('2026-10-08T07:00:01Z', 'SUCCEEDED'),
      item('2026-10-08T07:05:00Z', 'SOURCE_CHANGED'),
    ]
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    const list = await screen.findByRole('list', { name: 'Timeline' })
    const text = list.textContent ?? ''
    expect(text).toMatch(/Manual recovery · requested/)
    expect(text).toMatch(/Manual recovery · completed/)
    expect(text).toMatch(/Manual recovery · the ERP returned different content/)
    expect(text).not.toMatch(/OPERATOR_RECOVERY|SOURCE_CHANGED|SUCCEEDED/)
  })
})

describe('needs attention', () => {
  it('lists exhausted documents under their own label, and keeps recovery on the document', async () => {
    renderAt('/settings/erp/attention')
    // The server labels an exhausted document ATTEMPTS_EXHAUSTED (pre-Phase-13 remediation), so the
    // page offers the label itself rather than a link to a narrowed Documents list.
    fireEvent.click(await screen.findByRole('button', { name: 'Label' }))
    expect(await screen.findByRole('option', { name: /^Every attempt was used/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Show those documents' })).toBeNull()
    expect(screen.queryByRole('button', { name: /recover/i })).toBeNull()
  })
})

describe('Arabic', () => {
  it('lays the recovery card and its dialog out right to left', async () => {
    await i18n.changeLanguage('ar')
    renderAt(`/settings/erp/documents/${RECORD_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'استعادة المستند' }))
    expect(screen.getByRole('dialog', { name: 'استعادة هذا المستند؟' })).toBeTruthy()
  })

  it('O: has every recovery string English has, and no other', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value !== null && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}.${key}`))
        : [prefix]
    const pick = (locale: typeof en) => [
      ...keys(locale.erp.reporting.recover, 'recover'),
      ...keys(locale.erp.reporting.operatorRecovery, 'operatorRecovery'),
      ...keys(locale.erp.reporting.timeline, 'timeline'),
      ...keys(locale.erp.reporting.attention, 'attention'),
      ...keys(locale.erp.access.capability, 'capability'),
    ]
    expect(pick(ar as unknown as typeof en).sort()).toEqual(pick(en).sort())
    // One word per ManagedPullRecoveryOutcome on the server, PLATFORM_UNAVAILABLE included.
    expect(Object.keys(en.erp.reporting.operatorRecovery)).toHaveLength(14)
  })
})
