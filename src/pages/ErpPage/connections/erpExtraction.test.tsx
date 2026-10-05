import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { resetSharedRequests } from '../../../api'
import { SAMPLE_LIMIT, sessionSamples } from '../../../lib/erp/sample'
import type { ErpConnectionDto } from '../../../api/erp/connections'
import type {
  ExtractionSampleDto,
  ExtractionSettingsDto,
  ExtractionStatusCode,
  ExtractionStatusDto,
} from '../../../api/erp/extraction'
import { ConnectionExtractionPage } from './ConnectionExtractionPage'

/**
 * The productized MANAGED_PULL operator screen, driven through the real API client against a stubbed
 * `fetch` — so the URLs, methods, bodies and refusal parsing asserted here are the ones a browser
 * would actually produce.
 *
 * What is deliberately NOT asserted is everything the backend owns: which pointers a cursor kind
 * requires, whether a mapping is certified, whether a channel may be activated, and above all the
 * status precedence. A frontend test that recomputed any of those would keep passing while the server
 * disagreed, which is the failure this screen was built to avoid.
 */

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const ID = 'c0000000-0000-0000-0000-000000000001'
const CONNECTION_URL = `/api/v1/erp/connections/${ID}`
const EXTRACTION_URL = `${CONNECTION_URL}/extraction`
const BITMAP = '1XXXXXXXXXXXXXXXXXXX'

const ALL: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'erp.connection.read',
    'erp.connection.manage',
    'erp.credential.replace',
    'erp.connection.test',
  ],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...ALL, permissions: ['erp.connection.read'] }
/** Manage without test: may configure and activate, may not make Fawtir call the tenant's ERP. */
const NO_TEST: Entitlements = {
  ...ALL,
  permissions: ['erp.connection.read', 'erp.connection.manage'],
}
const NOBODY: Entitlements = { ...ALL, permissions: ['invoice.read'] }

function connection(overrides: Partial<ErpConnectionDto> = {}): ErpConnectionDto {
  return {
    id: ID,
    name: 'Head office Odoo',
    sourceSystem: 'ODOO',
    sourceVersion: '17.0',
    connectionMode: 'MANAGED_PULL',
    transportType: 'REST',
    endpoint: 'https://erp.example.om/api',
    configuration: '{}',
    state: 'READY',
    credentialConfigured: true,
    credentialType: 'BASIC_AUTH',
    credentialHint: 'erp-svc',
    credentialRotatedAt: null,
    lastTestedAt: null,
    lastTestOutcome: null,
    lastTestReasonCode: null,
    version: 7,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

function settings(overrides: Partial<ExtractionSettingsDto> = {}): ExtractionSettingsDto {
  return {
    configured: true,
    enabled: false,
    // Asked for one minute; the scheduler clamps to five. Both values are carried deliberately.
    configuredInterval: 'PT1M',
    effectiveCadence: 'PT5M',
    documentsPointer: '/data',
    documentIdPointer: '/id',
    documentVersionPointer: null,
    cursorKind: 'TIMESTAMP',
    cursorParameter: 'since',
    nextCursorPointer: null,
    documentCursorPointer: '/updated_at',
    pageSizeParameter: 'limit',
    initialCursor: '2026-01-01T00:00:00Z',
    transactionType: BITMAP,
    documentIssueTimePointer: '/issued_at',
    supportsResume: true,
    version: 7,
    ...overrides,
  }
}

const UNCONFIGURED: ExtractionSettingsDto = settings({
  configured: false,
  configuredInterval: null,
  effectiveCadence: 'PT15M',
  documentsPointer: null,
  documentIdPointer: null,
  cursorKind: null,
  cursorParameter: null,
  documentCursorPointer: null,
  pageSizeParameter: null,
  initialCursor: null,
  transactionType: null,
  documentIssueTimePointer: null,
  supportsResume: false,
})

function status(
  code: ExtractionStatusCode,
  overrides: Partial<ExtractionStatusDto> = {},
): ExtractionStatusDto {
  return {
    status: code,
    schedulerGloballyEnabled: true,
    configured: true,
    enabled: false,
    connectionState: 'READY',
    effectiveCadence: 'PT5M',
    nextRunAt: '2026-09-30T11:00:00Z',
    consecutiveFailures: 0,
    backoffUntil: null,
    lastRunId: null,
    lastRunState: null,
    lastRunStartedAt: null,
    lastRunCompletedAt: null,
    lastRunDiscovered: 0,
    lastRunAccepted: 0,
    lastRunRejected: 0,
    lastRunDuplicates: 0,
    lastFailureReason: null,
    lastFailureStage: null,
    lastFailureRetryable: null,
    ...overrides,
  }
}

/**
 * Deliberately awkward: a decimal whose trailing digits a JSON round-trip could rewrite, a key order
 * a re-serialisation would sort, and non-ASCII text. If the screen ever parses the payload, this is
 * what changes.
 */
const PAYLOAD = '{"total":19.1625,"id":"INV-1","note":"ünïcode"}'

const SAMPLE: ExtractionSampleDto = {
  externalDocumentId: 'INV-1',
  externalVersion: '3',
  mediaType: 'application/json',
  cursorCandidate: '2026-02-01T00:00:00Z',
  payload: PAYLOAD,
  payloadBytes: 51,
  latencyMs: 120,
  fetchedAt: '2026-09-30T10:00:00Z',
}

function json(httpStatus: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(httpStatus: number, code: string) {
  return new Response(
    JSON.stringify({
      status: httpStatus,
      code,
      type: `https://api.fawtir.om/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      detail: 'refused',
    }),
    { status: httpStatus, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

type Call = { url: string; method: string; body: unknown }

let who: Entitlements
let row: ErpConnectionDto
let stored: ExtractionSettingsDto
let reported: ExtractionStatusDto
let calls: Call[]
/** Set to refuse one write, by URL suffix, the way the backend would. */
let refuse: { on: string; status: number; code: string } | null
/** Set when the source returns something the mapping preview cannot walk, such as CSV. */
let notJson: boolean

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  localStorage.clear()
  sessionStorage.clear()
  who = ALL
  row = connection()
  stored = settings()
  reported = status('DISABLED_BY_OPERATOR')
  calls = []
  refuse = null
  notJson = false
  // Module-level by design, so it survives between tests unless emptied.
  sessionSamples.clear()

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : null
      calls.push({ url, method, body })

      if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
      if (refuse !== null && url.endsWith(refuse.on) && method !== 'GET') {
        return problem(refuse.status, refuse.code)
      }
      if (url === `${EXTRACTION_URL}/status`) return json(200, reported)
      if (url === `${EXTRACTION_URL}/sample`) {
        return json(200, notJson ? { ...SAMPLE, mediaType: 'text/csv', payload: 'id,total\n1,5' } : SAMPLE)
      }
      if (url === `${EXTRACTION_URL}/enablement`) {
        return json(200, { ...stored, enabled: Boolean((body as { enabled: boolean }).enabled) })
      }
      if (url === EXTRACTION_URL) return json(200, stored)
      if (url === CONNECTION_URL) return json(200, row)
      return json(404)
    }),
  )
})

/**
 * Which permission set the session cache currently holds.
 *
 * The entitlements cache is module-level and survives between tests, and `useErpAccess` reads it
 * synchronously through `peekEntitlements` — so a warm cache starts `ready` true and skips an async
 * settle and a render pass. Dropping it in `beforeEach` paid that cost 46 times for the 41 tests
 * that all sign in as the same operator. It is dropped only when `who` actually changes, which
 * halved this file's time in a suite where it was the slowest of 99.
 *
 * `coldEntitlements()` is for the one test that asserts the not-yet-known state, which a warm cache
 * would skip straight past.
 */
let cachedFor: Entitlements | null = null

function coldEntitlements() {
  forgetEntitlements()
  cachedFor = null
}

function renderPage() {
  if (cachedFor !== who) {
    forgetEntitlements()
    cachedFor = who
  }
  return render(
    <MemoryRouter initialEntries={[`/settings/erp/connections/${ID}/extraction`]}>
      <Routes>
        <Route
          path="/settings/erp/connections/:id/extraction"
          element={<ConnectionExtractionPage />}
        />
        {/* Stands in for the real mapping preview, so the handover's destination is asserted rather
            than assumed. A navigate to a path this router does not know renders nothing and passes. */}
        <Route path="/settings/erp-mapping/preview" element={<p>mapping preview</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const writes = () => calls.filter((call) => call.method !== 'GET')
const to = (suffix: string) => writes().filter((call) => call.url.endsWith(suffix))

const saveButton = () => screen.getByRole('button', { name: 'Save settings' })
const sampleButton = () => screen.getByRole('button', { name: 'Fetch sample' })
const enableButton = () => screen.getByRole('button', { name: 'Enable production collection' })
const disableButton = () => screen.getByRole('button', { name: 'Disable production collection' })

/**
 * The form renders before the settings read lands, so every assertion about a field's value has to
 * wait for the server's answer to be in it. Asserting straight after the label appears passes
 * against an empty form, which is how a contract break would slip through unseen.
 */
async function seededForm() {
  await screen.findByLabelText('Documents pointer')
  await waitFor(() =>
    expect((screen.getByLabelText('Transaction type') as HTMLInputElement).value).not.toBe(''),
  )
}

/**
 * Both server answers are in: the settings in the form and the status pill on screen. Enable is held
 * disabled until then, so a click made earlier would test the loading state rather than the action.
 */
async function serverAnswered() {
  await seededForm()
  await screen.findByText(i18n.t(`erp.extraction.state.${reported.status}`))
}

/** The value beside a status label, scoped so a stray match elsewhere on the page cannot pass. */
function fact(label: string): string {
  const term = screen.getByText(label)
  return term.parentElement?.querySelector('dd')?.textContent ?? ''
}

/* ============================================================ configuration */

describe('extraction configuration', () => {
  it('reads the real endpoint and renders what is configured', async () => {
    renderPage()
    await seededForm()

    expect(calls.some((call) => call.url === EXTRACTION_URL && call.method === 'GET')).toBe(true)
    expect((screen.getByLabelText('Documents pointer') as HTMLInputElement).value).toBe('/data')
    expect((screen.getByLabelText('Document id pointer') as HTMLInputElement).value).toBe('/id')
    expect((screen.getByLabelText('Transaction type') as HTMLInputElement).value).toBe(BITMAP)
  })

  it('shows the requested cadence AND the effective one', async () => {
    // Showing only the request would confirm something untrue, because the scheduler clamped PT1M to
    // PT5M; showing only the effective value would look like the request was discarded.
    renderPage()
    await seededForm()

    expect((screen.getByLabelText('How often to collect') as HTMLInputElement).value).toBe('PT1M')
    expect(screen.getByText(/Effective: every 5 minutes/)).toBeTruthy()
    // People read the cadence in words; the code stays in the field, where it is typed.
    expect(await screen.findByText('Every 5 minutes')).toBeTruthy()
  })

  it('sends the typed settings request with the connection version', async () => {
    renderPage()
    await seededForm()
    fireEvent.click(saveButton())

    await waitFor(() => expect(to('/extraction').length).toBe(1))
    const write = to('/extraction')[0]
    expect(write.method).toBe('PUT')
    const body = write.body as Record<string, unknown>
    expect(body.expectedVersion).toBe(7)
    expect(body.documentsPointer).toBe('/data')
    expect(body.transactionType).toBe(BITMAP)
    expect(body.cursorKind).toBe('TIMESTAMP')
  })

  it('sends an emptied optional field as null, not as an empty string', async () => {
    renderPage()
    await seededForm()
    fireEvent.change(screen.getByLabelText('How often to collect'), { target: { value: '  ' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(to('/extraction').length).toBe(1))
    // The backend reads null as "use the platform default"; "" is not a valid ISO-8601 duration.
    expect((to('/extraction')[0].body as Record<string, unknown>).interval).toBeNull()
  })

  it('a save never changes the enabled flag', async () => {
    // Configuration and activation are separate decisions. A save that carried a different enabled
    // value would let an operator switch production on by pressing Save.
    stored = settings({ enabled: true })
    reported = status('WAITING', { enabled: true })
    renderPage()
    await seededForm()
    fireEvent.click(saveButton())

    await waitFor(() => expect(to('/extraction').length).toBe(1))
    expect((to('/extraction')[0].body as Record<string, unknown>).enabled).toBe(true)
  })

  it('renders a not-configured connection without inventing values', async () => {
    stored = UNCONFIGURED
    reported = status('NOT_CONFIGURED', { configured: false })
    renderPage()
    // The status pill proves the read landed; an empty field asserted before it would pass for the
    // wrong reason.
    await screen.findByText('Not configured')

    expect((screen.getByLabelText('Documents pointer') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Transaction type') as HTMLInputElement).value).toBe('')
  })

  it('does not claim a save happened when the backend refuses one', async () => {
    refuse = { on: '/extraction', status: 400, code: 'EXTRACTION_SOURCE_SETTINGS_INVALID' }
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(saveButton())

    await waitFor(() => expect(to('/extraction').length).toBe(1))
    expect(screen.queryByText('Extraction settings saved.')).toBeNull()
  })

  it('re-reads all three resources after a successful save', async () => {
    // Every write on this resource consumes the connection's version, so a stale copy would 409 next
    // time for something the operator did not do.
    renderPage()
    await screen.findByLabelText('Documents pointer')
    const before = calls.filter((call) => call.method === 'GET').length
    fireEvent.click(saveButton())

    await screen.findByText('Extraction settings saved.')
    await waitFor(() =>
      expect(calls.filter((call) => call.method === 'GET').length).toBeGreaterThanOrEqual(
        before + 3,
      ),
    )
  })
})

/* =================================================================== sample */

describe('sample fetch', () => {
  it('calls nothing until the operator asks, then POSTs the real endpoint', async () => {
    renderPage()
    await screen.findByLabelText('Documents pointer')

    // It costs the tenant's ERP a real request, so nothing here may be automatic.
    expect(to('/extraction/sample')).toHaveLength(0)

    fireEvent.click(sampleButton())
    await waitFor(() => expect(to('/extraction/sample').length).toBe(1))
    expect(to('/extraction/sample')[0].method).toBe('POST')
  })

  it('renders the payload byte-for-byte, unparsed and read-only', async () => {
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())

    const box = (await screen.findByLabelText(
      'Source document, exactly as received',
    )) as HTMLTextAreaElement
    // Exactly the bytes the server sent: 19.1625 must not be rewritten, the key order must hold and
    // the accents must survive. The mapping is the only thing that should interpret this document.
    expect(box.value).toBe(PAYLOAD)
    expect(box.readOnly).toBe(true)
  })

  it('shows the metadata an operator needs', async () => {
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())

    expect(await screen.findByText('INV-1')).toBeTruthy()
    expect(screen.getByText('51 bytes')).toBeTruthy()
    expect(screen.getByText('120 ms')).toBeTruthy()
  })

  it('hands the fetched document to the mapping preview', async () => {
    // The end of the operator flow: the document the ERP actually returned becomes the sample the
    // mapping runs against, rather than something the operator retypes.
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Open mapping' }))

    // Lands on the mapping preview, which is where the sample is usable.
    expect(await screen.findByText('mapping preview')).toBeTruthy()

    await waitFor(() => expect(sessionSamples.snapshot()).toHaveLength(1))
    const handed = sessionSamples.snapshot()[0]
    // Parsed, because the preview walks a structure to offer source paths — and equal to the source
    // bytes, so the preview sees what production would feed the mapping.
    expect(handed.payload).toEqual(JSON.parse(PAYLOAD))
    expect(handed.label).toContain('INV-1')
  })

  it('refuses the handover for a document that is not JSON, without crashing', async () => {
    // A CSV or XML source is legitimate, and the preview cannot walk one.
    notJson = true
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())

    const button = (await screen.findByRole('button', {
      name: 'Open mapping',
    })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/needs a JSON document/)).toBeTruthy()
    expect(sessionSamples.snapshot()).toHaveLength(0)
  })

  it('refuses the handover when this visit is already holding the maximum', async () => {
    // Otherwise this screen fills a picker the Samples screen reports as full.
    for (let i = 0; i < SAMPLE_LIMIT; i += 1) sessionSamples.add(`held ${i}`, { i })
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())

    const button = (await screen.findByRole('button', {
      name: 'Open mapping',
    })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/are full/)).toBeTruthy()
    expect(sessionSamples.snapshot()).toHaveLength(SAMPLE_LIMIT)
  })

  it('does not persist the handed-over document either', async () => {
    // The sample store is in memory by design. This is the assertion that keeps it that way.
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Open mapping' }))
    await waitFor(() => expect(sessionSamples.snapshot()).toHaveLength(1))

    const persisted = [localStorage, sessionStorage]
      .flatMap((store) => Object.keys(store).map((key) => store.getItem(key) ?? ''))
      .join(' ')
    expect(persisted).not.toContain('INV-1')
    expect(persisted).not.toContain('19.1625')
  })

  it('works while production is off and platform automation is off', async () => {
    // Sampling exists to be used BEFORE activation. Gating it on either would invert the workflow it
    // serves, and the backend gates it on neither.
    stored = settings({ enabled: false })
    reported = status('GLOBALLY_DISABLED', { schedulerGloballyEnabled: false })
    renderPage()
    await screen.findByLabelText('Documents pointer')

    expect((sampleButton() as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(sampleButton())
    await waitFor(() => expect(to('/extraction/sample').length).toBe(1))
  })

  it('never puts the document in browser storage', async () => {
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())
    await screen.findByText('INV-1')

    // A tenant's invoice must not outlive the component. Both stores, because either would survive a
    // reload and neither is ever the right home for this.
    const persisted = [localStorage, sessionStorage]
      .flatMap((store) => Object.keys(store).map((key) => store.getItem(key) ?? ''))
      .join(' ')
    expect(persisted).not.toContain('INV-1')
    expect(persisted).not.toContain('19.1625')
  })

  it('never puts the document in a URL', async () => {
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())
    await screen.findByText('INV-1')

    expect(window.location.search).toBe('')
    for (const call of calls) expect(call.url).not.toContain('INV-1')
  })

  it('reports a refused sample without claiming one was fetched', async () => {
    refuse = { on: '/extraction/sample', status: 400, code: 'EXTRACTION_SAMPLE_NO_DOCUMENTS' }
    renderPage()
    await screen.findByLabelText('Documents pointer')
    fireEvent.click(sampleButton())

    await waitFor(() => expect(to('/extraction/sample').length).toBe(1))
    expect(screen.queryByLabelText('Source document, exactly as received')).toBeNull()
    expect(screen.queryByText('Sample fetched.')).toBeNull()
  })
})

/* =================================================================== status */

const EVERY_STATUS: [ExtractionStatusCode, string][] = [
  ['GLOBALLY_DISABLED', 'Automation off'],
  ['NOT_CONFIGURED', 'Not configured'],
  ['CONNECTION_NOT_READY', 'Connection not ready'],
  ['DISABLED_BY_OPERATOR', 'Production off'],
  ['MAPPING_NOT_CERTIFIED', 'Mapping not certified'],
  ['RUNNING', 'Running'],
  ['BACKOFF', 'Retry backoff'],
  ['FAILED_LAST_RUN', 'Last run failed'],
  ['WAITING', 'Ready, waiting'],
]

describe('status', () => {
  it.each(EVERY_STATUS)('renders %s with its own label and guidance', async (code, label) => {
    reported = status(code)
    renderPage()
    // Every one of the nine is named, and told apart by words rather than by a colour.
    expect(await screen.findByText(label)).toBeTruthy()
    expect(screen.getByText(i18n.t(`erp.extraction.stateHelp.${code}`))).toBeTruthy()
  })

  it('takes the status from the server and never recomputes it', async () => {
    // A configured, READY, enabled channel that the server calls MAPPING_NOT_CERTIFIED must be shown
    // as MAPPING_NOT_CERTIFIED. Local inference would say "Ready, waiting" here.
    stored = settings({ enabled: true })
    reported = status('MAPPING_NOT_CERTIFIED', { enabled: true, connectionState: 'READY' })
    renderPage()

    expect(await screen.findByText('Mapping not certified')).toBeTruthy()
    expect(screen.queryByText('Ready, waiting')).toBeNull()
  })

  it('reports the platform switch beside the headline', async () => {
    // So a channel on a platform with automation off cannot be mistaken for one about to run.
    reported = status('GLOBALLY_DISABLED', { schedulerGloballyEnabled: false })
    renderPage()
    await screen.findByText('Platform automation')
    expect(screen.getByText('Off')).toBeTruthy()
  })

  it('shows the classified failure reason and whether it will retry', async () => {
    reported = status('BACKOFF', {
      consecutiveFailures: 2,
      backoffUntil: '2026-09-30T11:30:00Z',
      lastRunState: 'FAILED',
      lastFailureReason: 'SOURCE_TIMEOUT',
      lastFailureStage: 'SOURCE',
      lastFailureRetryable: true,
    })
    renderPage()

    // The classified code and stage in words, never the raw codes.
    expect(await screen.findByText(/Your ERP did not answer in time/)).toBeTruthy()
    expect(screen.getByText(/Stage: your ERP/)).toBeTruthy()
    expect(screen.queryByText(/SOURCE_TIMEOUT/)).toBeNull()
    expect(screen.getByText(/will retry/)).toBeTruthy()
    expect(fact('Consecutive failures')).toBe('2')
  })

  it('says the next run is not scheduled rather than showing a blank', async () => {
    reported = status('WAITING', { nextRunAt: null })
    renderPage()
    expect(await screen.findByText('Not scheduled yet')).toBeTruthy()
  })

  it('reports the last run counts from the server only', async () => {
    reported = status('FAILED_LAST_RUN', {
      lastRunState: 'COMPLETED_WITH_ERRORS',
      lastRunDiscovered: 9,
      lastRunAccepted: 7,
      lastRunRejected: 2,
      lastRunDuplicates: 0,
    })
    renderPage()
    expect(await screen.findByText(/9 found, 7 accepted, 2 rejected/)).toBeTruthy()
  })
})

/* =============================================================== enablement */

describe('production enablement', () => {
  it('uses the dedicated enablement endpoint, not the connection update', async () => {
    renderPage()
    await serverAnswered()
    fireEvent.click(enableButton())

    await waitFor(() => expect(to('/extraction/enablement').length).toBe(1))
    const write = to('/extraction/enablement')[0]
    expect(write.method).toBe('PUT')
    // The flag and the version, and nothing else: activation must not carry a settings document that
    // could revert an edit made a moment earlier.
    expect(write.body).toEqual({ enabled: true, expectedVersion: 7 })
    expect(to(`/erp/connections/${ID}`)).toHaveLength(0)
  })

  it('offers disable, not enable, once the channel is on', async () => {
    stored = settings({ enabled: true })
    reported = status('WAITING', { enabled: true })
    renderPage()

    await screen.findByRole('button', { name: 'Disable production collection' })
    expect(screen.queryByRole('button', { name: 'Enable production collection' })).toBeNull()
    expect(screen.getByText(/Collection is on/)).toBeTruthy()
  })

  it('sends enabled false when switching production off', async () => {
    stored = settings({ enabled: true })
    reported = status('WAITING', { enabled: true })
    renderPage()
    // The settings read is what says the channel is on; extraction reads now start only once the
    // connection is known to be MANAGED_PULL, so the form's label alone is too early to act on.
    await seededForm()
    fireEvent.click(disableButton())

    await waitFor(() => expect(to('/extraction/enablement').length).toBe(1))
    expect(to('/extraction/enablement')[0].body).toEqual({ enabled: false, expectedVersion: 7 })
  })

  it('keeps disable available when the mapping is no longer certified', async () => {
    // A tenant must never be trapped with a running channel they cannot switch off, and the backend
    // deliberately does not gate disabling on certification.
    stored = settings({ enabled: true })
    reported = status('MAPPING_NOT_CERTIFIED', { enabled: true })
    renderPage()

    const button = (await screen.findByRole('button', {
      name: 'Disable production collection',
    })) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('lists the prerequisites from the server status', async () => {
    row = connection({ state: 'DRAFT' })
    stored = UNCONFIGURED
    reported = status('CONNECTION_NOT_READY', { connectionState: 'DRAFT', configured: false })
    renderPage()

    await screen.findByText('Connection marked ready')
    // The status pill proves the server's answer is in, so the disabled button below is explained by
    // the prerequisites and not merely by reads still in flight.
    await screen.findByText(i18n.t('erp.extraction.state.CONNECTION_NOT_READY'))
    expect(screen.getByText('Extraction settings saved')).toBeTruthy()
    expect(screen.getByText('Mapping certified for this transaction type')).toBeTruthy()
    // Pre-disabled as a courtesy; the backend refuses it regardless.
    expect((enableButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('leaves enable pressable when only certification is outstanding', async () => {
    // Certification is the backend's judgement on a six-value tuple. Refusing locally would be a
    // second implementation of its rule, and would block an operator the server would have allowed.
    reported = status('MAPPING_NOT_CERTIFIED')
    renderPage()
    await seededForm()

    // Disabled while either read is in flight, then pressable once the server's answers are in.
    await waitFor(() => expect((enableButton() as HTMLButtonElement).disabled).toBe(false))
  })

  it('does not activate production when the backend refuses', async () => {
    refuse = {
      on: '/extraction/enablement',
      status: 400,
      code: 'EXTRACTION_MAPPING_NOT_CERTIFIED',
    }
    reported = status('MAPPING_NOT_CERTIFIED')
    renderPage()
    await serverAnswered()
    fireEvent.click(enableButton())

    await waitFor(() => expect(to('/extraction/enablement').length).toBe(1))
    expect(screen.queryByText('Production collection enabled.')).toBeNull()
  })

  it('does not retry a version conflict behind the operator back', async () => {
    refuse = { on: '/extraction/enablement', status: 409, code: 'CONNECTION_VERSION_CONFLICT' }
    renderPage()
    await serverAnswered()
    fireEvent.click(enableButton())

    await waitFor(() => expect(to('/extraction/enablement').length).toBe(1))
    // One attempt. A silent second one with a refreshed version would activate production off the
    // back of a click the operator was told had failed.
    expect(screen.queryByText('Production collection enabled.')).toBeNull()
    expect(to('/extraction/enablement')).toHaveLength(1)
  })
})

/* ============================================================== permissions */

describe('permissions', () => {
  it('shows a reader the facts and none of the controls', async () => {
    who = READER
    renderPage()
    await screen.findByText('You do not have permission to change these settings.')

    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
    expect(screen.queryByLabelText('Documents pointer')).toBeNull()
    expect(screen.getByText('You do not have permission to change these settings.')).toBeTruthy()
    // Still informed: the configured values are shown as facts.
    expect(screen.getByText('/data')).toBeTruthy()
  })

  it('a reader cannot activate production', async () => {
    who = READER
    renderPage()
    await screen.findByText('Collection status')
    expect((enableButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('manage without erp.connection.test cannot fetch a sample', async () => {
    who = NO_TEST
    renderPage()
    await screen.findByLabelText('Documents pointer')

    expect((sampleButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('You do not have permission to fetch a sample.')).toBeTruthy()
    // Can still configure and activate: the three permissions are genuinely separate.
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows nothing of the screen without erp.connection.read', async () => {
    who = NOBODY
    renderPage()

    await waitFor(() => expect(screen.queryByText('Collection status')).toBeNull())
    expect(screen.queryByLabelText('Documents pointer')).toBeNull()
    expect(to('/extraction/sample')).toHaveLength(0)
  })

  it('offers no control while the entitlements are still unknown', async () => {
    // Fails closed: nothing is offered until permission is known, rather than shown then withdrawn.
    // The cache has to be dropped for this one: warm, `useErpAccess` reads it synchronously and the
    // not-yet-known state this test is about never exists.
    who = ALL
    coldEntitlements()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fetch sample' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enable production collection' })).toBeNull()

    await screen.findByLabelText('Documents pointer')
  })
})

/* ============================================================ issue time (Phase 5) */

const ISSUE_TIME_LABEL = 'Issue time pointer'
const issueTimeField = () => screen.getByLabelText(ISSUE_TIME_LABEL) as HTMLInputElement

/** A channel saved before the issue-time pointer existed and left enabled: the server's legacy case. */
function legacyChannel() {
  stored = settings({ enabled: true, documentIssueTimePointer: null })
  reported = status('NOT_CONFIGURED', { enabled: true })
}

describe('issue time pointer', () => {
  it('shows the stored pointer for a connection Fawtir collects from', async () => {
    renderPage()
    await seededForm()

    expect(issueTimeField().value).toBe('/issued_at')
  })

  it('saves the typed pointer, trimmed, in the documented field', async () => {
    renderPage()
    await seededForm()
    fireEvent.change(issueTimeField(), { target: { value: '  /invoice/issueTime ' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(to('/extraction').length).toBe(1))
    expect((to('/extraction')[0].body as Record<string, unknown>).documentIssueTimePointer).toBe(
      '/invoice/issueTime',
    )
  })

  it('sends an emptied pointer as an empty string, which is how the server clears it', async () => {
    // Not null: the server reads an omitted or null field as "keep the stored value", so null would
    // leave the old pointer in place while the screen showed the field empty.
    renderPage()
    await seededForm()
    fireEvent.change(issueTimeField(), { target: { value: '' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(to('/extraction').length).toBe(1))
    expect((to('/extraction')[0].body as Record<string, unknown>).documentIssueTimePointer).toBe('')
  })

  it('explains a legacy channel instead of calling it failed, and blocks enabling', async () => {
    stored = settings({ enabled: false, documentIssueTimePointer: null })
    reported = status('NOT_CONFIGURED')
    renderPage()
    await screen.findByText('Not configured')

    expect(
      screen.getByText(
        'The invoice issue time pointer is required before production collection can be enabled. Set it in the extraction settings below.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Collection is paused until the invoice issue time pointer is set. Nothing has failed.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Failed')).toBeNull()
    expect((enableButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Issue time pointer set').previousElementSibling?.textContent).toBe(
      'Outstanding',
    )
  })

  it('takes the operator straight to the field from the notice', async () => {
    legacyChannel()
    renderPage()
    await screen.findByText('Not configured')
    fireEvent.click(screen.getByRole('button', { name: 'Set the issue time pointer' }))

    expect(document.activeElement).toBe(issueTimeField())
  })

  it('tells a reader who to ask, and offers no edit action', async () => {
    who = READER
    legacyChannel()
    renderPage()
    await screen.findByText('Not configured')

    expect(
      screen.getByText(
        'The invoice issue time pointer is required before production collection can be enabled. Ask someone who can manage this connection to set it.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set the issue time pointer' })).toBeNull()
    // The reader's facts name the missing value rather than skipping it.
    expect(fact(ISSUE_TIME_LABEL)).toBe('—')
  })

  it('keeps the generic explanation for a channel with no settings at all', async () => {
    stored = UNCONFIGURED
    reported = status('NOT_CONFIGURED', { configured: false })
    renderPage()
    await screen.findByText('Not configured')

    expect(screen.getByText('Add the extraction settings below before anything can run.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set the issue time pointer' })).toBeNull()
  })

  it('renders the server refusal in the banner and beside the field', async () => {
    // The pre-disabled button is a courtesy; the server still has the last word, so a stale screen
    // that lets Enable through must say exactly what is missing.
    reported = status('DISABLED_BY_OPERATOR')
    refuse = {
      on: '/extraction/enablement',
      status: 400,
      code: 'EXTRACTION_ISSUE_TIME_POINTER_REQUIRED',
    }
    renderPage()
    await seededForm()
    fireEvent.click(enableButton())

    const message =
      'Production collection needs the invoice issue time pointer. Set it in the extraction settings and save, then enable collection.'
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2))
    expect(issueTimeField().getAttribute('aria-invalid')).toBe('true')
  })

  it('has the Arabic copy for every new string', async () => {
    legacyChannel()
    await i18n.changeLanguage('ar')
    renderPage()

    await screen.findByText(
      'يلزم تحديد مؤشر وقت إصدار الفاتورة قبل تفعيل الجمع الإنتاجي. حدّده في إعدادات الاستخراج أدناه.',
    )
    expect(screen.getByLabelText('مؤشر وقت الإصدار')).toBeTruthy()
    expect(
      screen.getByText('الجمع متوقف مؤقتًا إلى أن يُحدَّد مؤشر وقت إصدار الفاتورة. لم يفشل أي شيء.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'تحديد مؤشر وقت الإصدار' })).toBeTruthy()
  })
})

/* ============================================================ mode gate (Phase 5) */

describe('connection mode', () => {
  it.each(['BRIDGE_UPLOAD', 'API_PUSH'] as const)(
    'a %s connection shows no extraction settings and requests none',
    async (mode) => {
      row = connection({ connectionMode: mode })
      renderPage()

      await screen.findByText('Nothing to collect here')
      expect(screen.queryByLabelText('Documents pointer')).toBeNull()
      expect(screen.queryByLabelText(ISSUE_TIME_LABEL)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Enable production collection' })).toBeNull()
      // The server would refuse these with EXTRACTION_CONNECTION_MODE_UNSUPPORTED; they are not sent.
      expect(calls.some((call) => call.url.startsWith(EXTRACTION_URL))).toBe(false)
    },
  )
})

describe('read sequencing', () => {
  it('requests nothing about the connection without erp.connection.read', async () => {
    who = NOBODY
    renderPage()

    await waitFor(() =>
      expect(calls.some((call) => call.url.startsWith(ENTITLEMENTS_URL))).toBe(true),
    )
    await waitFor(() => expect(screen.queryByText('Collection status')).toBeNull())
    expect(calls.some((call) => call.url.startsWith(CONNECTION_URL))).toBe(false)
  })

  it('reads extraction only after the connection is known to be one Fawtir collects from', async () => {
    renderPage()
    await seededForm()

    const firstConnection = calls.findIndex((call) => call.url === CONNECTION_URL)
    const firstExtraction = calls.findIndex((call) => call.url.startsWith(EXTRACTION_URL))
    expect(firstConnection).toBeGreaterThanOrEqual(0)
    expect(firstExtraction).toBeGreaterThan(firstConnection)
  })
})
