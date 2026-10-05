import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { sessionSamples } from '../../lib/erp/sample'
import { ErpMappingGate } from './ErpMappingGate'
import { ErpOverviewPage } from './ErpOverviewPage'
import { ErpFieldsPage } from './ErpFieldsPage'
import { ErpPreviewPage } from './ErpPreviewPage'
import { ErpCertificationPage } from './ErpCertificationPage'
import { ErpHistoryPage } from './ErpHistoryPage'
import { ErpAdvancedPage } from './ErpAdvancedPage'

/**
 * The ERP mapping screens against the real endpoints.
 *
 * Every figure the fixtures carry is deliberately unlike anything in `lib/erpMapping.ts`, the
 * design mock these screens used to read: the mock's story is Odoo 17 with 41 of 43 fields mapped
 * and the Invoice route certified. These fixtures say ERPNEXT, 2 of 9, and nothing certified. So a
 * figure appearing on screen can only have come from the stubbed backend — which is the property
 * these tests exist to hold, not the rendering itself.
 */

const BASE = '/api/v1/peppol/mapping-profiles'
const TARGETS_URL = '/api/v1/peppol/mapping-targets'
const GUIDED_URL = `${BASE}/JSON/guided`
const VALIDATE_URL = `${BASE}/JSON/guided/validate`
const GUIDED_DRY_RUN_URL = `${BASE}/JSON/guided/dry-run`
const PROFILE_DRY_RUN_URL = `${BASE}/JSON/dry-run`
const PROFILES_URL = BASE
const HISTORY_URL = `${BASE}/JSON/certification/history?limit=50`
const CSRF = 'csrf-token-value'

const statusUrl = (kind: string, route: string, type: string) =>
  `${BASE}/JSON/certification?document_kind=${kind}&route=${route}&transaction_type=${type}`

const INVOICE_STATUS_URL = statusUrl('STANDARD_INVOICE', 'INVOICE', '1XXXXXXXXXXXXXXXXXXX')
const CREDIT_STATUS_URL = statusUrl('CREDIT_NOTE', 'CREDIT_NOTE', '1XXXXXXXXXXXXXXXXXXX')
const DEBIT_STATUS_URL = statusUrl('STANDARD_INVOICE', 'DEBIT_NOTE', '1XXXXXXXXXXXXXXXXXXX')
const SELF_STATUS_URL = statusUrl('SELF_BILLING_INVOICE', 'SELF_BILLING', 'XX1XXXXXXXXXXXXXXXXX')

/* ------------------------------------------------------------------ fixtures */

const READINESS = {
  valid: true,
  readyForActivation: false,
  requiredTenantMappedTargets: ['IBT-001', 'IBT-002', 'IBT-003', 'IBT-005', 'IBT-009', 'IBT-020', 'IBT-025', 'IBT-026', 'IBT-027'],
  mappedRequiredTargets: ['IBT-001', 'IBT-002'],
  missingRequiredTargets: ['IBT-003', 'IBT-005', 'IBT-009', 'IBT-020', 'IBT-025', 'IBT-026', 'IBT-027'],
  optionalMappedTargets: [],
  invalidMappings: [],
  warnings: ['A warning the server wrote, in its own words.'],
  coverageLimits: [
    {
      id: 'FOREIGN_CURRENCY',
      summary: 'Invoices in a currency other than OMR cannot be produced by guided mapping.',
      businessTermIds: ['BTOM-003'],
      guidance: 'Use the hand-written profile route.',
    },
  ],
  conditionalGaps: [],
}

const GUIDED = {
  format: 'JSON' as const,
  sourceSystem: 'ERPNEXT' as const,
  version: 7,
  mappings: [
    {
      businessTermId: 'IBT-001',
      sourcePath: 'name',
      transform: null,
      defaultValue: null,
      ordinal: 0,
      canonicalPath: 'document.number',
    },
    {
      businessTermId: 'IBT-002',
      sourcePath: 'posting_date',
      transform: null,
      defaultValue: null,
      ordinal: 1,
      canonicalPath: 'document.issueDate',
    },
  ],
  readiness: READINESS,
}

const PROFILE = {
  id: 'p-9001',
  format: 'JSON' as const,
  content: '{"document": {"number": name}}',
  contentHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  erpKey: 'ERPNEXT',
  active: true,
  version: 4,
  createdAt: '2026-09-18T08:00:00Z',
  updatedAt: '2026-09-18T08:00:00Z',
}

const SUPERSEDED = {
  ...PROFILE,
  id: 'p-8000',
  contentHash: '1111111111111111111111111111111111111111111111111111111111111111',
  active: false,
  version: 3,
}

const uncertified = (kind: string, route: string, scope: string) => ({
  certified: false,
  format: 'JSON',
  document_kind: kind,
  route,
  transaction_scope: scope,
  active_content_hash: PROFILE.contentHash,
  certified_content_hash: null,
  certified_at: null,
  profile_id: PROFILE.id,
  reason: 'This mapping has not passed a test invoice for this document kind.',
})

const TARGETS = [
  {
    businessTermId: 'IBT-001',
    name: 'Invoice number',
    section: 'document',
    requirement: 'MANDATORY',
    cardinality: '1..1',
    ublPath: '/Invoice/cbc:ID',
    canonicalPath: 'document.number',
    origin: 'TENANT_MAPPED',
    mappable: true,
    repeatable: false,
    discriminator: null,
  },
]

/* ------------------------------------------------------------------- harness */

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const problem = (status: number, type: string, detail: string) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, detail })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([url, handler]) => [
      url,
      Array.isArray(handler) ? [...handler] : handler,
    ]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) {
      // Named loudly: a screen reaching for an endpoint the fixtures do not describe is a
      // contract change, and a silent 404 would show up as a rendering puzzle instead.
      console.error(`UNSTUBBED REQUEST: ${url}`)
      throw new Error(`unexpected request to ${url}`)
    }
    return handler()
  })
}

const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const bodyOf = (url: string, index = 0) =>
  JSON.parse((callsTo(url)[index][1] as RequestInit).body as string) as Record<string, unknown>
const putsTo = (url: string) =>
  callsTo(url).filter(([, init]) => (init as RequestInit)?.method === 'PUT')

/**
 * The Fields page's Save button, found by text rather than by role and name.
 *
 * `getByRole(..., { name })` builds the accessibility tree for the whole screen, and Fields draws
 * a row for every one of the catalogue's terms — in jsdom that query took tens of seconds and
 * failed the test as a timeout. A text query over the same button is the same assertion at a
 * fraction of the cost.
 */
const saveButton = () =>
  screen.getByText(i18n.t('erp.fields.save')).closest('button') as HTMLButtonElement

/**
 * The tenant whose permissions the settings frame checks. `admin.settings.manage` is the one gate
 * on every mapping endpoint, so without it the screens would refuse before reaching the API.
 */
const TENANT_ADMIN = {
  userId: 'u-admin',
  username: 'erp.admin',
  tenantId: 't-albahja',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage', 'invoice.read'],
  scopes: ['admin.settings.manage'],
  featureFlags: {},
}

/** The gate's eight reads plus the frame's entitlements, all answered with the fixtures above. */
const reads = (overrides: Record<string, Handler | Handler[]> = {}) => ({
  '/api/v1/me/entitlements': () => json(200, TENANT_ADMIN),
  [GUIDED_URL]: () => json(200, GUIDED),
  [PROFILES_URL]: () => json(200, [PROFILE, SUPERSEDED]),
  [HISTORY_URL]: () => json(200, []),
  [TARGETS_URL]: () => json(200, TARGETS),
  [INVOICE_STATUS_URL]: () =>
    json(200, uncertified('STANDARD_INVOICE', 'INVOICE', '100000000000000' + '00000')),
  [CREDIT_STATUS_URL]: () =>
    json(200, uncertified('CREDIT_NOTE', 'CREDIT_NOTE', '100000000000000' + '00000')),
  [DEBIT_STATUS_URL]: () =>
    json(200, uncertified('STANDARD_INVOICE', 'DEBIT_NOTE', '100000000000000' + '00000')),
  [SELF_STATUS_URL]: () =>
    json(200, uncertified('SELF_BILLING_INVOICE', 'SELF_BILLING', '001000000000000' + '00000')),
  ...overrides,
})

/**
 * Renders one mapping screen inside the gate.
 *
 * The entry may carry a query string; the route pattern is its path alone. A pattern carrying
 * "?route=INVOICE" matches nothing, so the screen never mounts — which read as "dialog not found"
 * rather than as a routing mistake.
 */
function renderScreen(entry: string, element: React.ReactNode) {
  const path = entry.split('?')[0]
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={<ErpMappingGate>{element}</ErpMappingGate>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionSamples.clear()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  // Every mapping screen reads under one key, so a read still settling when a test ends would
  // otherwise be joined by the next test and answered from the previous test's stubs.
  resetSharedRequests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  resetSharedRequests()
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* --------------------------------------------------------------- load states */

describe('Loading the mapping', () => {
  it('reads the guided mapping, profiles, targets, history and all four route statuses', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.overview.title') })

    for (const url of [
      GUIDED_URL,
      PROFILES_URL,
      HISTORY_URL,
      TARGETS_URL,
      INVOICE_STATUS_URL,
      CREDIT_STATUS_URL,
      DEBIT_STATUS_URL,
      SELF_STATUS_URL,
    ]) {
      expect(callsTo(url).length, url).toBeGreaterThan(0)
    }
  })

  it('shows the loading notice before the reads land, and no figures', async () => {
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    answer(
      reads({
        [GUIDED_URL]: async () => {
          await held
          return json(200, GUIDED)
        },
      }),
    )
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)

    expect(await screen.findByText(i18n.t('appAccess.loading'))).toBeTruthy()
    // The frame is up, but none of the figures are: the gate does not render a screen until the
    // reads land, so there is nothing on the page that could be a stale or half-loaded number.
    expect(screen.queryByText(i18n.t('erp.overview.kpi.route'))).toBeNull()
    expect(screen.queryByText(i18n.t('erp.overview.cert.title'))).toBeNull()

    await act(async () => {
      release?.()
      await held
    })
  })

  it('renders a permission refusal as no access, never as an empty mapping', async () => {
    answer(reads({ [GUIDED_URL]: () => problem(403, 'access-denied', 'Nope.') }))
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)

    expect(await screen.findByText(i18n.t('appAccess.missingPermission'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('erp.overview.empty.title'))).toBeNull()
  })

  it('offers a retry when a read fails for another reason', async () => {
    answer(reads({ [PROFILES_URL]: () => problem(500, 'internal', 'Boom.') }))
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)

    expect(await screen.findByRole('button', { name: i18n.t('appAccess.retry') })).toBeTruthy()
  })

  it('treats a 404 guided mapping as not started, not as a failure', async () => {
    answer(
      reads({
        [GUIDED_URL]: () => problem(404, 'not-found', 'No guided mapping.'),
        [PROFILES_URL]: () => json(200, []),
        [INVOICE_STATUS_URL]: () =>
          json(200, { ...uncertified('STANDARD_INVOICE', 'INVOICE', '10000000000000000000'), active_content_hash: null, profile_id: null }),
      }),
    )
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)

    expect(await screen.findByText(i18n.t('erp.overview.empty.title'))).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ overview */

describe('Overview', () => {
  it('shows the server readiness figures, not the mock story', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.overview.title') })

    // 2 of 9 from the fixture. The mock's story is 41 of 43, so neither figure could be its.
    const fieldsKpi = screen.getByText(i18n.t('erp.overview.kpi.fields')).parentElement
      ?.parentElement as HTMLElement
    expect(within(fieldsKpi).getByText('2')).toBeTruthy()
    expect(screen.getByText(i18n.t('erp.overview.kpi.ofRequired', { count: 9 }))).toBeTruthy()
    // The source system is the server's, and the mock's is ODOO.
    expect(screen.getByText(/ERPNext/i)).toBeTruthy()
  })

  it('renders the coverage limits the server sent, not a list held in the frontend', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.overview.title') })

    expect(screen.getByText(i18n.t('erp.coverage.FOREIGN_CURRENCY'))).toBeTruthy()
    // The mock named a third limit the backend reclassified; it must not appear.
    expect(screen.queryByText(i18n.t('erp.coverage.GOODS_CLASSIFICATION'))).toBeNull()
  })

  it('does not present an activity log, which has no endpoint', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping', <ErpOverviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.overview.title') })

    expect(screen.queryByText(i18n.t('erp.overview.activity.title'))).toBeNull()
  })
})

/* -------------------------------------------------------------------- fields */

describe('Fields', () => {
  it('loads the stored entries into the editor', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    const path = document.getElementById('erp-term-IBT-001-path') as HTMLInputElement
    expect(path.value).toBe('name')
  })

  it('saves an incomplete but structurally valid draft, sending the version it read', async () => {
    // The save answers with the same readiness: valid, not ready for activation.
    answer(
      reads({
        [VALIDATE_URL]: () => json(200, READINESS),
        [GUIDED_URL]: [() => json(200, GUIDED), () => json(200, READINESS), () => json(200, GUIDED)],
      }),
    )
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    await act(async () => {
      fireEvent.click(saveButton())
    })

    const puts = callsTo(GUIDED_URL).filter(
      ([, init]) => (init as RequestInit)?.method === 'PUT',
    )
    expect(puts.length).toBe(1)
    const sent = JSON.parse((puts[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(sent.expectedVersion).toBe(7)
    expect(sent.sourceSystem).toBe('ERPNEXT')
    expect(Array.isArray(sent.mappings)).toBe(true)
    // It saved despite seven required fields being unmapped.
    expect(await screen.findByText(new RegExp(i18n.t('erp.fields.saveDraft', { count: 7 })))).toBeTruthy()
  })

  it('shows the server sentence when a save is refused as structurally invalid', async () => {
    answer(
      reads({
        [VALIDATE_URL]: () => json(200, READINESS),
        [GUIDED_URL]: [
          () => json(200, GUIDED),
          () => problem(400, 'validation-failed', 'MALFORMED_SOURCE_PATH for IBT-003: expression syntax is not accepted here.'),
        ],
      }),
    )
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    await act(async () => {
      fireEvent.click(saveButton())
    })

    expect(
      await screen.findByText(/MALFORMED_SOURCE_PATH for IBT-003/),
    ).toBeTruthy()
  })

  it('offers a reload rather than overwriting when the save loses a race', async () => {
    answer(
      reads({
        [VALIDATE_URL]: () => json(200, READINESS),
        [GUIDED_URL]: [
          () => json(200, GUIDED),
          () => problem(409, 'resource-conflict', 'Someone else saved first.'),
        ],
      }),
    )
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    await act(async () => {
      fireEvent.click(saveButton())
    })

    expect(await screen.findByText(i18n.t('erp.fields.staleTitle'))).toBeTruthy()
    // By text, not by role and name — see saveButton above for why that query is too slow here.
    expect(screen.getByText(i18n.t('erp.fields.reload')).closest('button')).toBeTruthy()
    // Nothing was overwritten: exactly the one refused PUT was sent.
    expect(putsTo(GUIDED_URL).length).toBe(1)
  })

  it('renders the validator refusals the server reported, keyed on its codes', async () => {
    const invalid = {
      ...READINESS,
      valid: false,
      invalidMappings: [
        {
          businessTermId: 'IBT-001',
          sourcePath: 'name(',
          errorCode: 'MALFORMED_SOURCE_PATH',
          message: 'A source path is a dotted field walk.',
        },
      ],
    }
    answer(reads({ [GUIDED_URL]: () => json(200, { ...GUIDED, readiness: invalid }) }))
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    expect(screen.getAllByText(i18n.t('erp.error.MALFORMED_SOURCE_PATH')).length).toBeGreaterThan(0)
  })

  it('falls back to the server message for an error code with no translation', async () => {
    const invalid = {
      ...READINESS,
      valid: false,
      invalidMappings: [
        {
          businessTermId: 'IBT-001',
          sourcePath: 'lines[].x',
          errorCode: 'A_CODE_THE_UI_HAS_NEVER_HEARD_OF',
          message: 'The server explained it in a sentence.',
        },
      ],
    }
    answer(reads({ [GUIDED_URL]: () => json(200, { ...GUIDED, readiness: invalid }) }))
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    expect(screen.getAllByText('The server explained it in a sentence.').length).toBeGreaterThan(0)
  })

  it('offers no value-map editor, because the compiler has no field for one', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping/fields', <ErpFieldsPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.fields.title') })

    expect(screen.queryByText(i18n.t('erp.fields.valueMap'), { exact: true })).toBeNull()
  })
})

/* ------------------------------------------------------------------- preview */

describe('Preview', () => {
  const SAMPLE = { name: 'SINV-00042', posting_date: '2026-09-20' }

  it('renders the canonical invoice the engine returned', async () => {
    sessionSamples.add('ERPNext sales invoice', SAMPLE)
    answer(
      reads({
        [GUIDED_DRY_RUN_URL]: () =>
          json(200, {
            canonical_invoice: { document: { number: 'SINV-00042' } },
            content_hash: PROFILE.contentHash,
            mapping_source: 'STORED',
          }),
      }),
    )
    renderScreen('/settings/erp-mapping/preview', <ErpPreviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.preview.title') })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: i18n.t('erp.preview.run') }))
    })

    expect(callsTo(GUIDED_DRY_RUN_URL).length).toBe(1)
    expect(bodyOf(GUIDED_DRY_RUN_URL).document).toEqual(SAMPLE)
    // The value can only have come from the stubbed response.
    expect((await screen.findAllByText(/SINV-00042/)).length).toBeGreaterThan(0)
  })

  it('reports an incomplete guided mapping distinctly from a failure', async () => {
    sessionSamples.add('ERPNext sales invoice', SAMPLE)
    answer(
      reads({
        [GUIDED_DRY_RUN_URL]: () =>
          problem(409, 'resource-conflict', 'The guided mapping is incomplete.'),
      }),
    )
    renderScreen('/settings/erp-mapping/preview', <ErpPreviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.preview.title') })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: i18n.t('erp.preview.run') }))
    })

    expect(await screen.findByText(i18n.t('erp.preview.incomplete'))).toBeTruthy()
  })

  it('shows the engine message when the mapping refuses the payload', async () => {
    sessionSamples.add('ERPNext sales invoice', SAMPLE)
    answer(
      reads({
        [GUIDED_DRY_RUN_URL]: () =>
          problem(
            400,
            'validation-failed',
            'canonical output does not satisfy PINT-OM requirements: issueDate is required',
          ),
      }),
    )
    renderScreen('/settings/erp-mapping/preview', <ErpPreviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.preview.title') })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: i18n.t('erp.preview.run') }))
    })

    expect(await screen.findByText(/issueDate is required/)).toBeTruthy()
  })

  it('cannot run without a sample', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping/preview', <ErpPreviewPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.preview.title') })

    expect(
      (screen.getByRole('button', { name: i18n.t('erp.preview.run') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(callsTo(GUIDED_DRY_RUN_URL).length).toBe(0)
  })
})

/* ------------------------------------------------------------- certification */

describe('Certification', () => {
  it('shows the gate answer and both hashes from the server', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping/certification', <ErpCertificationPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.certification.title') })

    // Four route cards, none certified, each saying why in our words, not the server's prose.
    expect(screen.getAllByText(i18n.t('erp.routeState.NOT_CERTIFIED')).length).toBe(4)
    expect(screen.getAllByText(i18n.t('erp.certification.why.NOT_CERTIFIED')).length).toBe(4)
    expect(screen.queryByText(/has not passed a test invoice for this document kind/)).toBeNull()
    // The active hash is the server's, shortened.
    expect(screen.getAllByText('abcdef01').length).toBeGreaterThan(0)
  })

  it('sends the run in the X alphabet and renders the report the server answered with', async () => {
    sessionSamples.add('ERPNext sales invoice', { name: 'SINV-1' })
    const RUN_URL = `${BASE}/JSON/certification?route=INVOICE`
    answer(
      reads({
        [RUN_URL]: () =>
          json(200, {
            passed: false,
            stage: 'VALIDATION',
            failed_at: 'L5_PINT_OM',
            error_count: 1,
            warning_count: 0,
            errors: [
              {
                severity: 'ERROR',
                layer: 'L5_PINT_OM',
                rule_id: 'PINT-OM-R001',
                field_id: 'IBT-031',
                xpath: '/Invoice/cac:AccountingSupplierParty',
                message: 'Seller VAT identifier is required.',
              },
            ],
            warnings: [],
            message: null,
            content_hash: PROFILE.contentHash,
            profile_id: PROFILE.id,
          }),
      }),
    )
    renderScreen('/settings/erp-mapping/certification?route=INVOICE', <ErpCertificationPage />)
    await screen.findByRole('dialog')

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: i18n.t('erp.certification.runNow'),
        }),
      )
    })

    expect(callsTo(RUN_URL).length).toBe(1)
    const sent = bodyOf(RUN_URL) as { supplement: Record<string, unknown> }
    // ^[X1]{20}$ — a '0' here would be refused outright by the server.
    expect(sent.supplement.transaction_type).toBe('1XXXXXXXXXXXXXXXXXXX')
    expect(String(sent.supplement.transaction_type)).toMatch(/^[X1]{20}$/)

    // A failing run is a report, not an error: the rule id is shown verbatim.
    expect(await screen.findByText('PINT-OM-R001')).toBeTruthy()
    expect(screen.getByText('Seller VAT identifier is required.')).toBeTruthy()
  })

  it('will not start a credit-note run until the predecessor is named', async () => {
    sessionSamples.add('ERPNext credit note', { name: 'CN-1' })
    answer(reads())
    renderScreen(
      '/settings/erp-mapping/certification?route=CREDIT_NOTE',
      <ErpCertificationPage />,
    )
    await screen.findByRole('dialog')

    const runNow = within(screen.getByRole('dialog')).getByRole('button', {
      name: i18n.t('erp.certification.runNow'),
    }) as HTMLButtonElement
    expect(runNow.disabled).toBe(true)
    expect(screen.getByText(i18n.t('erp.certification.correction'))).toBeTruthy()
  })
})

/* ------------------------------------------------------------------- history */

describe('History', () => {
  it('lists the real profile revisions and says draft revisions are not stored', async () => {
    answer(reads())
    renderScreen('/settings/erp-mapping/history', <ErpHistoryPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.history.title') })

    expect(screen.getByText(i18n.t('erp.history.revisionsNote'))).toBeTruthy()
    expect(screen.getByText(i18n.t('erp.history.profiles.active'))).toBeTruthy()
    expect(screen.getByText(i18n.t('erp.history.profiles.superseded'))).toBeTruthy()
    expect(screen.getByText('abcdef01')).toBeTruthy()
    expect(screen.getByText('11111111')).toBeTruthy()
  })

  it('deactivates the live expression through the API', async () => {
    answer(reads({ [`${BASE}/JSON`]: () => json(204) }))
    renderScreen('/settings/erp-mapping/history', <ErpHistoryPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.history.title') })

    fireEvent.click(screen.getByRole('button', { name: i18n.t('erp.history.profiles.deactivate') }))
    await screen.findByText(i18n.t('erp.history.profiles.deactivateTitle'))

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: i18n.t('erp.history.profiles.deactivate'),
        }),
      )
    })

    await waitFor(() => {
      const deletes = callsTo(`${BASE}/JSON`).filter(
        ([, init]) => (init as RequestInit)?.method === 'DELETE',
      )
      expect(deletes.length).toBe(1)
    })
  })
})

/* ------------------------------------------------------------------ advanced */

describe('Advanced', () => {
  it('dry-runs the unsaved text as a supplied expression, and stores it through the profile route', async () => {
    sessionSamples.add('ERPNext sales invoice', { name: 'SINV-7' })
    answer(
      reads({
        [PROFILE_DRY_RUN_URL]: () =>
          json(200, {
            canonical_invoice: { document: { number: 'SINV-7' } },
            content_hash: '2222222222222222222222222222222222222222222222222222222222222222',
            mapping_source: 'SUPPLIED',
          }),
        [`${BASE}/JSON`]: () => json(200, { ...PROFILE, version: 5 }),
      }),
    )
    renderScreen('/settings/erp-mapping/advanced', <ErpAdvancedPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.advanced.title') })

    await act(async () => {
      fireEvent.click(screen.getByText(i18n.t('erp.advanced.dryRun')).closest('button')!)
    })

    // The unsaved text goes up as `content`, which is what makes it a SUPPLIED run.
    expect(callsTo(PROFILE_DRY_RUN_URL).length).toBe(1)
    expect(typeof bodyOf(PROFILE_DRY_RUN_URL).content).toBe('string')
    expect(await screen.findByText(/22222222/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText(i18n.t('erp.advanced.save')).closest('button')!)
    })

    expect(putsTo(`${BASE}/JSON`).length).toBe(1)
    expect(bodyOf(`${BASE}/JSON`, putsTo(`${BASE}/JSON`).length - 1).content).toBeTruthy()
  })

  it('shows the engine refusal when the expression does not compile', async () => {
    answer(
      reads({
        [`${BASE}/JSON`]: () =>
          problem(
            400,
            'validation-failed',
            'mapping profile is not a valid JSONata expression',
          ),
      }),
    )
    renderScreen('/settings/erp-mapping/advanced', <ErpAdvancedPage />)
    await screen.findByRole('heading', { name: i18n.t('erp.advanced.title') })

    await act(async () => {
      fireEvent.click(screen.getByText(i18n.t('erp.advanced.save')).closest('button')!)
    })

    expect(await screen.findByText(/not a valid JSONata expression/)).toBeTruthy()
  })
})
