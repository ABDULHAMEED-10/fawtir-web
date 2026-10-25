import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { formatMoment, formatUtcMoment } from '../../lib/console/format'
import { muscatToday } from '../../lib/invoiceIssue'
import {
  forgetEntitlements,
  peekEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'
import type {
  ActionDecision,
  AllowedActions,
  BlockerOverviewEntry,
  BlockerType,
  BlockerVersionSummary,
  BlockerVersionView,
  DenialReason,
} from '../../lib/console/validationPolicies'
import { ValidationPoliciesPage } from './ValidationPoliciesPage'
import { ValidationPolicyPage } from './ValidationPolicyPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const OVERVIEW_URL = '/api/v1/platform/peppol/smp/data-blockers'
const PID = 'TAXPAYER_PID_CONTRACT'
const listUrl = (type: BlockerType = PID) => `${OVERVIEW_URL}/${type}/versions?page=0&size=20`
const versionUrl = (id: string, type: BlockerType = PID) => `${OVERVIEW_URL}/${type}/versions/${id}`
const stepUrl = (id: string, step: string) => `${versionUrl(id)}/${step}`
const CREATE_URL = `${OVERVIEW_URL}/${PID}/versions`
const CSRF = 'csrf-token-value'

const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const V3 = '33333333-3333-4333-8333-333333333333'
const OLD = '99999999-9999-4999-8999-999999999999'

const OPERATOR: Entitlements = {
  userId: 'u-me',
  username: 'ops.policy',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true }],
  permissions: ['platform.support'],
  scopes: [],
  featureFlags: {},
}

const allow: ActionDecision = { allowed: true, reason: null }
const deny = (reason: DenialReason): ActionDecision => ({ allowed: false, reason })
const actions = (overrides: Partial<AllowedActions> = {}): AllowedActions => ({
  editDraft: deny('INVALID_STATE'),
  submit: deny('INVALID_STATE'),
  review: deny('INVALID_STATE'),
  approve: deny('INVALID_STATE'),
  activate: deny('INVALID_STATE'),
  reject: deny('INVALID_STATE'),
  withdraw: deny('INVALID_STATE'),
  ...overrides,
})
const NO_PERMISSION = actions({
  editDraft: deny('MISSING_PERMISSION'),
  submit: deny('MISSING_PERMISSION'),
  review: deny('MISSING_PERMISSION'),
  approve: deny('MISSING_PERMISSION'),
  activate: deny('MISSING_PERMISSION'),
  reject: deny('MISSING_PERMISSION'),
  withdraw: deny('MISSING_PERMISSION'),
})

const DATA = {
  participantIdentifierScheme: '0248',
  valueSource: 'TENANT_VATIN',
  vatinRelationship: 'MUST_MATCH',
  normalization: 'TRIM_UPPERCASE',
  validationPattern: '^OM(11|12)\\d{8}$',
  minimumLength: 12,
  maximumLength: 12,
  caseSensitive: false,
  canonicalRepresentation: 'UPPERCASE_NO_SPACES',
  uniquenessRule: 'GLOBAL_ACROSS_TENANTS',
  positiveFixtures: ['OM1100000001'],
  negativeFixtures: ['om-short'],
}

const AISHA = { id: 'u-aisha', displayName: 'Aisha Author' }
const ME = { id: 'u-me', displayName: 'Omar Operator' }
const RASHID = { id: 'u-rashid', displayName: 'Rashid Reviewer' }

const version = (overrides: Partial<BlockerVersionView> = {}): BlockerVersionView => ({
  id: V3,
  blockerId: 'b-pid',
  type: PID,
  versionNumber: 3,
  status: 'DRAFT',
  forceState: null,
  data: DATA,
  contentHash: 'c0ffee'.repeat(10),
  evidenceReference: 'https://evidence.example.test/pid/3',
  testOnly: false,
  effectiveFrom: '2026-11-01T00:00:00Z',
  effectiveTo: null,
  reasonCode: null,
  createdBy: AISHA.id,
  submittedBy: null,
  reviewedBy: null,
  rejectedBy: null,
  approvedBy: null,
  activatedBy: null,
  endedBy: null,
  createdAt: '2026-10-01T08:00:00Z',
  submittedAt: null,
  reviewedAt: null,
  rejectedAt: null,
  approvedAt: null,
  activatedAt: null,
  endedAt: null,
  updatedAt: '2026-10-01T08:00:00Z',
  optimisticLockVersion: 4,
  actors: {
    createdBy: AISHA,
    submittedBy: null,
    reviewedBy: null,
    rejectedBy: null,
    approvedBy: null,
    activatedBy: null,
    endedBy: null,
  },
  allowedActions: actions(),
  ...overrides,
})

const summary = (overrides: Partial<BlockerVersionSummary> = {}): BlockerVersionSummary => ({
  id: V3,
  versionNumber: 3,
  status: 'DRAFT',
  forceState: null,
  testOnly: false,
  effectiveFrom: null,
  effectiveTo: null,
  updatedAt: '2026-10-01T08:00:00Z',
  optimisticLockVersion: 4,
  allowedActions: actions(),
  ...overrides,
})

const entry = (overrides: Partial<BlockerOverviewEntry> = {}): BlockerOverviewEntry => ({
  type: PID,
  canCreateDraft: false,
  latest: null,
  active: null,
  ...overrides,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string, code?: string) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    title: 'Refused',
    status,
    detail: 'Server prose that must not be shown.',
    correlationId: 'corr-7f3a',
    ...(code ? { code } : {}),
  })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

/** Answers each URL from its own handler; an unexpected URL fails the request loudly. */
function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([url, handler]) => [
      url,
      Array.isArray(handler) ? [...handler] : handler,
    ]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const queued = queues[url]
    const handler = Array.isArray(queued)
      ? queued.length > 1
        ? queued.shift()
        : queued[0]
      : queued
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const initOf = (url: string, index = 0) => callsTo(url)[index][1] as RequestInit
const bodyOf = (url: string) => JSON.parse(initOf(url).body as string) as Record<string, unknown>
const writes = () =>
  fetchMock.mock.calls.filter(([, init]) => {
    const method = (init as RequestInit | undefined)?.method
    return method !== undefined && method !== 'GET'
  })

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderAt(path: string, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/policies" element={<ValidationPoliciesPage />} />
        <Route path="/console/policies/:type" element={<ValidationPolicyPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  )
  // Opt-in: StrictMode rehearses effects twice, which the request-count assertions elsewhere
  // would see as extra reads.
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const t = (key: string, values?: Record<string, string | number>) => i18n.t(key, values)
const button = (key: string) => screen.getByRole('button', { name: t(key) }) as HTMLButtonElement
const noButton = (key: string) => expect(screen.queryByRole('button', { name: t(key) })).toBeNull()
const STEP_KEYS = [
  'console.policies.action.submit',
  'console.policies.action.review',
  'console.policies.action.approve',
  'console.policies.action.activate',
  'console.policies.action.reject',
  'console.policies.action.withdraw',
  'console.policies.action.edit',
]
const sectionOf = (key: string) =>
  within(screen.getByRole('heading', { level: 2, name: t(key) }).closest('section') as HTMLElement)

/**
 * Renders as the running app does in Arabic: `LanguageSwitcher` sets the document's direction
 * and `App` wraps every route in a `dir="rtl"` element.
 */
function renderRtlAt(path: string) {
  document.documentElement.lang = 'ar'
  document.documentElement.dir = 'rtl'
  return render(
    <div dir="rtl">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/console/policies" element={<ValidationPoliciesPage />} />
          <Route path="/console/policies/:type" element={<ValidationPolicyPage />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </div>,
  )
}

/** Opens the Participant ID policy with these versions, as an operator who may not author. */
async function openPolicy(
  versions: BlockerVersionView[],
  extra: Record<string, Handler | Handler[]> = {},
  { canCreateDraft = false, path = `/console/policies/${PID}`, strict = false } = {},
) {
  answer({
    [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
    [OVERVIEW_URL]: () => json(200, [entry({ canCreateDraft })]),
    [listUrl()]: () => json(200, versions),
    ...extra,
  })
  renderAt(path, { strict })
  await screen.findByRole('heading', {
    level: 2,
    name: t('console.policies.detail.section.details'),
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.documentElement.lang = 'en'
  document.documentElement.dir = 'ltr'
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Access', () => {
  it.each([
    ['the overview', '/console/policies'],
    ['a policy', `/console/policies/${PID}`],
  ])(
    'tells an operator without platform.support there is no access to %s, and asks for no data',
    async (_label, path) => {
      answer({
        [ENTITLEMENTS_URL]: () =>
          json(200, { ...OPERATOR, permissions: ['platform.tenants.manage'] }),
      })
      renderAt(path)

      expect(await screen.findByText(t('console.access.missingPermission'))).toBeTruthy()
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([ENTITLEMENTS_URL])
    },
  )

  it('answers an unknown policy type as not found without asking the backend', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt('/console/policies/NOT_A_POLICY')

    expect(await screen.findByText(t('console.policies.notFound'))).toBeTruthy()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([ENTITLEMENTS_URL])
  })

  it('shows a refused read as no access, never as an empty list', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => problem(403, 'insufficient-permission'),
    })
    renderAt('/console/policies')

    expect(await screen.findByText(t('console.access.missingPermission'))).toBeTruthy()
    expect(screen.queryByText(t('console.policies.empty'))).toBeNull()
  })

  it('sends a session that died to Login', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => problem(401, 'unauthenticated'),
    })
    renderAt('/console/policies')

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(peekEntitlements()).toBeNull()
  })
})

describe('Overview', () => {
  const ENTRIES: BlockerOverviewEntry[] = [
    entry({
      type: PID,
      latest: summary({
        versionNumber: 3,
        status: 'PENDING_REVIEW',
        allowedActions: actions({ approve: allow }),
      }),
      active: summary({ id: V2, versionNumber: 2, status: 'ACTIVE', forceState: 'IN_FORCE' }),
    }),
    entry({
      type: 'FAWTARA_POLICY',
      latest: summary({
        id: V1,
        versionNumber: 1,
        status: 'APPROVED',
        allowedActions: actions({ activate: deny('APPROVER_CANNOT_ACTIVATE') }),
      }),
    }),
    entry({ type: 'BUSINESS_CARD_POLICY' }),
  ]

  async function openOverview(
    entries: BlockerOverviewEntry[] = ENTRIES,
    path = '/console/policies',
  ) {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => json(200, entries),
    })
    renderAt(path)
    await screen.findByRole('heading', { level: 2, name: t('console.policies.title') })
  }
  const policyLink = (type: BlockerType) =>
    screen.getByRole('link', { name: t(`console.policies.type.${type}`) })
  const rowOf = (type: BlockerType) => within(policyLink(type).closest('tr') as HTMLElement)

  it('reads the overview once and lists each policy with what is in force and where the newest version stands', async () => {
    await openOverview()
    await screen.findByRole('table')

    expect(callsTo(OVERVIEW_URL)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const pid = rowOf(PID)
    expect(pid.getByText(t('console.policies.version', { number: '2' }))).toBeTruthy()
    expect(pid.getByText(t('console.policies.status.ACTIVE'))).toBeTruthy()
    expect(pid.getByText(t('console.policies.version', { number: '3' }))).toBeTruthy()
    expect(pid.getByText(t('console.policies.queue.pendingYourApproval'))).toBeTruthy()
    expect(policyLink(PID).getAttribute('href')).toBe(`/console/policies/${PID}`)

    const fawtara = rowOf('FAWTARA_POLICY')
    expect(fawtara.getByText(t('console.policies.noneInForce'))).toBeTruthy()
    expect(fawtara.getByText(t('console.policies.queue.approvedOtherOperator'))).toBeTruthy()

    const card = rowOf('BUSINESS_CARD_POLICY')
    expect(card.getByText(t('console.policies.noneInForce'))).toBeTruthy()
    expect(card.getAllByText(t('console.policies.noVersion'))).toHaveLength(2)

    expect(screen.getByText(t('console.policies.summary', { mine: '1', total: '3' }))).toBeTruthy()
  })

  it('shows a scheduled version by its status, and the in-force column from the server', async () => {
    await openOverview([
      entry({
        type: PID,
        latest: summary({
          versionNumber: 3,
          status: 'SCHEDULED',
          forceState: 'NOT_YET_EFFECTIVE',
          effectiveFrom: '2026-11-01T00:00:00Z',
        }),
        active: summary({ id: V2, versionNumber: 2, status: 'ACTIVE', forceState: 'IN_FORCE' }),
      }),
    ])
    await screen.findByRole('table')

    const pid = rowOf(PID)
    expect(pid.getByText(t('console.policies.status.SCHEDULED'))).toBeTruthy()
    expect(pid.getByText(t('console.policies.status.ACTIVE'))).toBeTruthy()
    expect(
      pid.getByText(
        t('console.policies.queue.scheduled', {
          date: formatUtcMoment('2026-11-01T00:00:00Z', 'en'),
        }),
      ),
    ).toBeTruthy()
  })

  it('narrows to the policies waiting for the reader, keeps that in the URL, and asks nothing more', async () => {
    await openOverview()
    await screen.findByRole('table')
    expect(button('console.policies.filter.all').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(button('console.policies.filter.mine'))

    expect(button('console.policies.filter.mine').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(policyLink(PID)).toBeTruthy()
    expect(
      screen.queryByRole('link', { name: t('console.policies.type.FAWTARA_POLICY') }),
    ).toBeNull()
    expect(callsTo(OVERVIEW_URL)).toHaveLength(1)
  })

  it('opens already filtered from the URL, and says so when nothing waits for the reader', async () => {
    await openOverview([ENTRIES[1], ENTRIES[2]], '/console/policies?filter=mine')

    expect(await screen.findByText(t('console.policies.emptyMine'))).toBeTruthy()
    expect(button('console.policies.filter.mine').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('explains an empty answer as no readable policy type', async () => {
    await openOverview([])

    expect(await screen.findByText(t('console.policies.empty'))).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('offers a retry when the read fails, then asks once more', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: [() => problem(500, 'internal-error'), () => json(200, ENTRIES)],
    })
    renderAt('/console/policies')

    fireEvent.click(await screen.findByRole('button', { name: t('console.access.retry') }))

    expect(await screen.findByRole('table')).toBeTruthy()
    expect(callsTo(OVERVIEW_URL)).toHaveLength(2)
    expect(document.body.textContent).not.toContain('Server prose')
  })
})

describe('Policy detail reads', () => {
  it('reads the version list and the overview once each, and selects the newest version', async () => {
    await openPolicy([
      version(),
      version({ id: V2, versionNumber: 2, status: 'ACTIVE', forceState: 'IN_FORCE' }),
    ])

    expect(callsTo(listUrl())).toHaveLength(1)
    expect(callsTo(OVERVIEW_URL)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(
      screen
        .getByRole('button', { name: t('console.policies.version', { number: '2' }) })
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      screen
        .getByRole('button', { name: t('console.policies.version', { number: '3' }) })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('shows the selected version in full: details, contents and the people trail', async () => {
    await openPolicy([
      version({
        status: 'SUBMITTED',
        testOnly: true,
        reasonCode: 'POLICY_SUBMITTED',
        submittedBy: ME.id,
        submittedAt: '2026-10-02T08:00:00Z',
        actors: {
          createdBy: { id: 'abcdef12-0000-4000-8000-000000000000', displayName: null },
          submittedBy: ME,
          reviewedBy: null,
          rejectedBy: null,
          approvedBy: null,
          activatedBy: null,
          endedBy: null,
        },
      }),
    ])

    const section = (key: string) =>
      within(
        screen.getByRole('heading', { level: 2, name: t(key) }).closest('section') as HTMLElement,
      )

    const details = section('console.policies.detail.section.details')
    expect(details.getByText('c0ffee'.repeat(10)).getAttribute('dir')).toBe('ltr')
    expect(details.getByText('POLICY_SUBMITTED')).toBeTruthy()
    expect(details.getByText('https://evidence.example.test/pid/3')).toBeTruthy()
    expect(details.getByText(t('console.policies.detail.field.lockVersion'))).toBeTruthy()
    expect(details.getByText(t('console.policies.detail.field.testOnly'))).toBeTruthy()

    const contents = section('console.policies.detail.section.contents')
    expect(contents.getByText('^OM(11|12)\\d{8}$').getAttribute('dir')).toBe('ltr')
    expect(contents.getByText(t('console.policies.pid.option.vatin.MUST_MATCH'))).toBeTruthy()
    expect(
      contents.getByText(t('console.policies.pid.option.normalization.TRIM_UPPERCASE')),
    ).toBeTruthy()
    expect(contents.getByText('GLOBAL_ACROSS_TENANTS')).toBeTruthy()
    expect(contents.getByText('OM1100000001')).toBeTruthy()
    expect(contents.getByText('om-short')).toBeTruthy()

    const trail = section('console.policies.detail.section.trail')
    // A name the server could not resolve: a neutral word and the start of the id, never the whole id.
    expect(trail.getByText('abcdef12').getAttribute('dir')).toBe('ltr')
    expect(trail.getByText('abcdef12').parentElement?.textContent).toContain(
      `${t('console.policies.actor.unnamed')} (${t('console.policies.actor.idLabel')} abcdef12)`,
    )
    expect(document.body.textContent).not.toContain('abcdef12-0000')
    expect(
      trail.getByText(`Omar Operator ${t('console.policies.actor.you')}`, { exact: false }),
    ).toBeTruthy()
    expect(trail.getByText(t('console.policies.trail.submitted'))).toBeTruthy()
    expect(trail.queryByText(t('console.policies.trail.approved'))).toBeNull()
  })

  it('selects a listed version from the URL without another read, and puts a selection in the URL', async () => {
    const versions = [
      version(),
      version({ id: V2, versionNumber: 2, status: 'ACTIVE', forceState: 'IN_FORCE' }),
    ]
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => json(200, [entry()]),
      [listUrl()]: () => json(200, versions),
    })
    render(
      <MemoryRouter initialEntries={[`/console/policies/${PID}?version=${V2}`]}>
        <Routes>
          <Route
            path="/console/policies/:type"
            element={
              <>
                <ValidationPolicyPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', {
      level: 2,
      name: t('console.policies.detail.section.details'),
    })

    expect(
      screen
        .getByRole('button', { name: t('console.policies.version', { number: '2' }) })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fireEvent.click(
      screen.getByRole('button', { name: t('console.policies.version', { number: '3' }) }),
    )

    expect(screen.getByTestId('location').textContent).toBe(
      `/console/policies/${PID}?version=${V3}`,
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reads a version older than the list on its own, once', async () => {
    await openPolicy(
      [version()],
      {
        [versionUrl(OLD)]: () =>
          json(200, version({ id: OLD, versionNumber: 1, status: 'SUPERSEDED' })),
      },
      { path: `/console/policies/${PID}?version=${OLD}` },
    )

    expect(await screen.findAllByText(t('console.policies.status.SUPERSEDED'))).not.toHaveLength(0)
    expect(callsTo(versionUrl(OLD))).toHaveLength(1)
    expect(callsTo(listUrl())).toHaveLength(1)
  })

  it('answers a version that does not exist, or an id that could not be one, as not found', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => json(200, [entry()]),
      [listUrl()]: () => json(200, [version()]),
      [versionUrl(OLD)]: () => problem(404, 'resource-not-found'),
    })
    const first = renderAt(`/console/policies/${PID}?version=${OLD}`)
    expect(await screen.findByText(t('console.policies.detail.versionNotFound'))).toBeTruthy()
    first.unmount()

    fetchMock.mockClear()
    renderAt(`/console/policies/${PID}?version=not-an-id`)
    expect(await screen.findByText(t('console.policies.detail.versionNotFound'))).toBeTruthy()
    expect(fetchMock.mock.calls.every(([url]) => !(url as string).includes('not-an-id'))).toBe(true)
  })

  it('lists the contents of the other policy types as stored, with no editor and no overview read', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [listUrl('FAWTARA_POLICY')]: () =>
        json(200, [
          version({
            type: 'FAWTARA_POLICY',
            data: { endpoint: 'staging', retries: 3, enabled: true, hosts: ['a', 'b'] },
            allowedActions: actions({ editDraft: allow, submit: allow }),
          }),
        ]),
    })
    renderAt('/console/policies/FAWTARA_POLICY')
    await screen.findByRole('heading', {
      level: 2,
      name: t('console.policies.detail.section.contents'),
    })

    expect(screen.getByText('endpoint')).toBeTruthy()
    expect(screen.getByText('staging')).toBeTruthy()
    expect(screen.getByText('["a","b"]').getAttribute('dir')).toBe('ltr')
    expect(screen.getByText(t('common.yes'))).toBeTruthy()
    // The server would let this operator edit the draft, but this console has no form for the type.
    noButton('console.policies.action.edit')
    noButton('console.policies.action.create')
    noButton('console.policies.action.newFrom')
    expect(button('console.policies.action.submit')).toBeTruthy()
    expect(callsTo(OVERVIEW_URL)).toHaveLength(0)
    // No editing form; the topbar's console search is a form of its own.
    expect(document.querySelector('form:not([role="search"])')).toBeNull()
  })
})

describe('Lifecycle buttons follow allowedActions', () => {
  it('DRAFT: an author sees Submit and Edit draft, and no Approve or Activate', async () => {
    await openPolicy([version({ allowedActions: actions({ editDraft: allow, submit: allow }) })])

    expect(button('console.policies.action.submit')).toBeTruthy()
    expect(button('console.policies.action.edit')).toBeTruthy()
    noButton('console.policies.action.review')
    noButton('console.policies.action.approve')
    noButton('console.policies.action.activate')
    expect(screen.getAllByText(t('console.policies.queue.draft')).length).toBeGreaterThan(0)
  })

  it('reads the overview again after a step, so "Create draft" follows the server', async () => {
    const draft = version({ allowedActions: actions({ submit: allow }) })
    await openPolicy([draft], {
      [OVERVIEW_URL]: [
        () => json(200, [entry({ canCreateDraft: true })]),
        () => json(200, [entry({ canCreateDraft: false })]),
      ],
      [stepUrl(V3, 'submit')]: () =>
        json(200, {
          ...draft,
          status: 'SUBMITTED',
          optimisticLockVersion: 5,
          allowedActions: actions(),
        }),
    })
    expect(
      await screen.findByRole('button', { name: t('console.policies.action.create') }),
    ).toBeTruthy()

    fireEvent.click(button('console.policies.action.submit'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.submit.confirm'),
      }),
    )

    await screen.findByText(t('console.policies.done.submit', { number: '3' }))
    await waitFor(() => expect(callsTo(OVERVIEW_URL)).toHaveLength(2))
    await waitFor(() => noButton('console.policies.action.create'))
  })

  it('puts focus on what happened once a step removes the button that opened its dialog', async () => {
    const draft = version({ allowedActions: actions({ submit: allow }) })
    const submitted = {
      ...draft,
      status: 'SUBMITTED' as const,
      optimisticLockVersion: 5,
      allowedActions: actions(),
    }
    await openPolicy(
      [draft],
      {
        [listUrl()]: [() => json(200, [draft]), () => json(200, [submitted])],
        [stepUrl(V3, 'submit')]: () => json(200, submitted),
      },
      { strict: true },
    )
    const opener = button('console.policies.action.submit')
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.submit.confirm'),
      }),
    )

    const notice = await screen.findByText(t('console.policies.done.submit', { number: '3' }))
    // The notice's own container, not the page: `<body>` contains the notice too.
    await waitFor(() => expect(document.activeElement).toBe(notice.parentElement))
    noButton('console.policies.action.submit')
  })

  it('SUBMITTED: a reviewer sees Start review, which sends the fixed code once', async () => {
    const submitted = version({ status: 'SUBMITTED', allowedActions: actions({ review: allow }) })
    await openPolicy([submitted], {
      [stepUrl(V3, 'review')]: () =>
        json(200, {
          ...submitted,
          status: 'PENDING_REVIEW',
          optimisticLockVersion: 5,
          allowedActions: actions(),
        }),
    })

    noButton('console.policies.action.submit')
    noButton('console.policies.action.approve')
    fireEvent.click(button('console.policies.action.review'))
    const dialog = screen.getByRole('dialog', { name: t('console.policies.confirm.review.title') })
    expect(within(dialog).getByText(t('console.policies.confirm.review.records'))).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', { name: t('console.policies.confirm.review.confirm') }),
    )

    expect(await screen.findByText(t('console.policies.done.review', { number: '3' }))).toBeTruthy()
    expect(callsTo(stepUrl(V3, 'review'))).toHaveLength(1)
    expect(bodyOf(stepUrl(V3, 'review'))).toEqual({
      expectedOptimisticLockVersion: 4,
      reasonCode: 'POLICY_REVIEW_STARTED',
    })
  })

  it('PENDING_REVIEW: an operator who took part sees no Approve, and why', async () => {
    await openPolicy([
      version({
        status: 'PENDING_REVIEW',
        allowedActions: actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED') }),
      }),
    ])

    noButton('console.policies.action.approve')
    for (const key of STEP_KEYS) noButton(key)
    expect(
      screen.getAllByText(t('console.policies.queue.awaitingIndependentApproval')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('note').textContent).toBe(
      'Approval requires another authorized platform operator because you took part in creating or reviewing this version.',
    )
    expect(document.body.textContent).not.toMatch(/developer tools/i)
  })

  it('PENDING_REVIEW: an independent operator approves with exactly the fixed code, once', async () => {
    const pending = version({
      status: 'PENDING_REVIEW',
      allowedActions: actions({ approve: allow }),
    })
    const approved = {
      ...pending,
      status: 'APPROVED' as const,
      optimisticLockVersion: 5,
      allowedActions: actions({ activate: deny('APPROVER_CANNOT_ACTIVATE') }),
    }
    let release: (response: Response) => void = () => {}
    await openPolicy([pending], {
      [listUrl()]: [() => json(200, [pending]), () => json(200, [approved])],
      [stepUrl(V3, 'approve')]: () => new Promise<Response>((resolve) => (release = resolve)),
    })

    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.click(button('console.policies.action.approve'))
    const dialog = screen.getByRole('dialog', { name: t('console.policies.confirm.approve.title') })
    expect(within(dialog).getByText(t(`console.policies.type.${PID}`))).toBeTruthy()
    expect(within(dialog).getByText('3')).toBeTruthy()
    expect(within(dialog).getByText(t('console.policies.status.PENDING_REVIEW'))).toBeTruthy()
    expect(
      within(dialog).getByText('This action records you as the approving operator.'),
    ).toBeTruthy()
    // Nothing to type: the reason is a fixed code, not the operator's words.
    expect(dialog.querySelector('input, textarea')).toBeNull()
    expect(writes()).toHaveLength(0)

    const confirm = within(dialog).getByRole('button', {
      name: t('console.policies.confirm.approve.confirm'),
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(callsTo(stepUrl(V3, 'approve'))).toHaveLength(1)
    expect(
      within(dialog).getByRole('button', { name: t('console.policies.confirm.approve.sending') }),
    ).toBeTruthy()

    await act(async () => release(json(200, approved)))

    expect(
      await screen.findByText(t('console.policies.done.approve', { number: '3' })),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(stepUrl(V3, 'approve'))).toHaveLength(1)
    expect(initOf(stepUrl(V3, 'approve')).method).toBe('POST')
    expect(bodyOf(stepUrl(V3, 'approve'))).toEqual({
      expectedOptimisticLockVersion: 4,
      reasonCode: 'POLICY_APPROVED',
    })
    expect((initOf(stepUrl(V3, 'approve')).headers as Record<string, string>)['X-CSRF-Token']).toBe(
      CSRF,
    )
    // The list is read again, and the approver is then told someone else must activate.
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(await screen.findByText(t('console.policies.separation.activate'))).toBeTruthy()
    noButton('console.policies.action.activate')
  })

  it('APPROVED: the approver sees no Activate, and why', async () => {
    await openPolicy([
      version({
        status: 'APPROVED',
        allowedActions: actions({ activate: deny('APPROVER_CANNOT_ACTIVATE') }),
      }),
    ])

    for (const key of STEP_KEYS) noButton(key)
    expect(
      screen.getAllByText(t('console.policies.queue.approvedOtherOperator')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('note').textContent).toBe(t('console.policies.separation.activate'))
  })

  it('APPROVED: another operator activates after reading the impact, with the fixed code, once', async () => {
    const approved = version({ status: 'APPROVED', allowedActions: actions({ activate: allow }) })
    const active = {
      ...approved,
      status: 'ACTIVE' as const,
      forceState: 'IN_FORCE' as const,
      optimisticLockVersion: 5,
      allowedActions: actions(),
    }
    await openPolicy([approved], {
      [listUrl()]: [() => json(200, [approved]), () => json(200, [active])],
      [stepUrl(V3, 'activate')]: () => json(200, active),
    })

    fireEvent.click(button('console.policies.action.activate'))
    const dialog = screen.getByRole('dialog', {
      name: t('console.policies.confirm.activate.title'),
    })
    expect(within(dialog).getByText(t('console.policies.confirm.activate.records'))).toBeTruthy()
    expect(within(dialog).getByText(t('console.policies.confirm.activate.replaces'))).toBeTruthy()
    expect(within(dialog).getByRole('note').textContent).toBe(
      t('console.policies.confirm.activate.pidImpact'),
    )
    expect(within(dialog).getByRole('note').textContent).toContain('Participant ID verification')
    expect(writes()).toHaveLength(0)

    fireEvent.click(
      within(dialog).getByRole('button', { name: t('console.policies.confirm.activate.confirm') }),
    )

    expect(
      await screen.findByText(t('console.policies.done.activate', { number: '3' })),
    ).toBeTruthy()
    expect(writes()).toHaveLength(1)
    expect(bodyOf(stepUrl(V3, 'activate'))).toEqual({
      expectedOptimisticLockVersion: 4,
      reasonCode: 'POLICY_ACTIVATED',
    })
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    await screen.findByRole('heading', {
      level: 2,
      name: t('console.policies.detail.section.details'),
    })
    for (const key of STEP_KEYS) noButton(key)
  })

  it('APPROVED with a future date: the notice says scheduled, because the server answered SCHEDULED', async () => {
    const approved = version({
      status: 'APPROVED',
      effectiveFrom: '2999-01-01T00:00:00Z',
      allowedActions: actions({ activate: allow }),
    })
    const scheduled = {
      ...approved,
      status: 'SCHEDULED' as const,
      forceState: 'NOT_YET_EFFECTIVE' as const,
      optimisticLockVersion: 5,
      allowedActions: actions(),
    }
    await openPolicy([approved], {
      [listUrl()]: [() => json(200, [approved]), () => json(200, [scheduled])],
      [stepUrl(V3, 'activate')]: () => json(200, scheduled),
    })

    fireEvent.click(button('console.policies.action.activate'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.activate.confirm'),
      }),
    )

    expect(
      await screen.findByText(t('console.policies.done.activateScheduled', { number: '3' })),
    ).toBeTruthy()
    expect(screen.queryByText(t('console.policies.done.activate', { number: '3' }))).toBeNull()
    expect(writes()).toHaveLength(1)
  })

  it('states only the replacement, not the Participant ID impact, for another policy type', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [listUrl('FAWTARA_POLICY')]: () =>
        json(200, [
          version({
            type: 'FAWTARA_POLICY',
            status: 'APPROVED',
            data: {},
            allowedActions: actions({ activate: allow }),
          }),
        ]),
    })
    renderAt('/console/policies/FAWTARA_POLICY')
    fireEvent.click(
      await screen.findByRole('button', { name: t('console.policies.action.activate') }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(t('console.policies.confirm.activate.replaces'))).toBeTruthy()
    expect(within(dialog).queryByRole('note')).toBeNull()
  })

  it('shows the effective-from date in the activation dialog, with wording the clock does not choose', async () => {
    const from = '2999-01-01T00:00:00Z'
    await openPolicy([
      version({
        status: 'APPROVED',
        effectiveFrom: from,
        allowedActions: actions({ activate: allow }),
      }),
    ])

    fireEvent.click(button('console.policies.action.activate'))
    const dialog = screen.getByRole('dialog', {
      name: t('console.policies.confirm.activate.title'),
    })
    expect(within(dialog).getByText(t('console.policies.detail.field.effectiveFrom'))).toBeTruthy()
    expect(within(dialog).getByText(formatUtcMoment(from, 'en'))).toBeTruthy()
    expect(within(dialog).getByText(t('console.policies.confirm.activate.scheduled'))).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('ACTIVE: no step is offered', async () => {
    await openPolicy([
      version({ status: 'ACTIVE', forceState: 'IN_FORCE', effectiveFrom: '2020-01-01T00:00:00Z' }),
    ])

    for (const key of STEP_KEYS) noButton(key)
    expect(screen.getByText(t('console.policies.action.none'))).toBeTruthy()
    expect(screen.getAllByText(t('console.policies.queue.inForce')).length).toBeGreaterThan(0)
  })

  it('ACTIVE but not yet effective: says so because the server says so', async () => {
    await openPolicy([
      version({
        status: 'ACTIVE',
        forceState: 'NOT_YET_EFFECTIVE',
        effectiveFrom: '2999-01-01T00:00:00Z',
      }),
    ])

    for (const key of STEP_KEYS) noButton(key)
    expect(
      screen.getAllByText(t('console.policies.queue.activeNotYetEffective')).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(t('console.policies.queue.inForce'))).toBeNull()
  })

  it('SCHEDULED: shows the status and when it takes effect, offers no step', async () => {
    const from = '2026-11-01T00:00:00Z'
    await openPolicy([
      version({ status: 'SCHEDULED', forceState: 'NOT_YET_EFFECTIVE', effectiveFrom: from }),
    ])

    for (const key of STEP_KEYS) noButton(key)
    expect(screen.getAllByText(t('console.policies.status.SCHEDULED')).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        t('console.policies.queue.scheduled', { date: formatUtcMoment(from, 'en') }),
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(t('console.policies.queue.inForce'))).toBeNull()
  })

  it.each([
    ['IN_FORCE', 'console.policies.queue.inForce'],
    ['ENDED', 'console.policies.queue.activeWindowEnded'],
    ['REPLACED', 'console.policies.queue.replaced'],
  ] as const)('a live version with forceState %s reads as %s', async (forceState, key) => {
    await openPolicy([version({ status: 'ACTIVE', forceState })])

    expect(screen.getAllByText(t(key)).length).toBeGreaterThan(0)
  })

  it('never lets the browser clock decide whether a version is in force', async () => {
    // By the dates and this clock the version would be in force; the server says another version
    // replaced it, and that is what the screen says.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
    try {
      await openPolicy([
        version({
          status: 'ACTIVE',
          forceState: 'REPLACED',
          effectiveFrom: '2026-10-01T00:00:00Z',
          effectiveTo: '2026-12-01T00:00:00Z',
        }),
      ])

      expect(screen.getAllByText(t('console.policies.queue.replaced')).length).toBeGreaterThan(0)
      expect(screen.queryByText(t('console.policies.queue.inForce'))).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('APPROVED while another replacement is scheduled: no Activate, and why', async () => {
    await openPolicy([
      version({
        status: 'APPROVED',
        allowedActions: actions({ activate: deny('SCHEDULED_REPLACEMENT_PENDING') }),
      }),
    ])

    noButton('console.policies.action.activate')
    expect(
      screen.getAllByText(t('console.policies.queue.approvedScheduledPending')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('note').textContent).toBe(t('console.policies.action.scheduledPending'))
    expect(writes()).toHaveLength(0)
  })

  it('renders no lifecycle button when every action is refused for a missing permission', async () => {
    await openPolicy([version({ status: 'PENDING_REVIEW', allowedActions: NO_PERMISSION })])

    for (const key of STEP_KEYS) noButton(key)
    noButton('console.policies.action.create')
    noButton('console.policies.action.newFrom')
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.getAllByText(t('console.policies.queue.pendingReview')).length).toBeGreaterThan(0)
  })

  it('says an approved version cannot be activated as it stands when the server says so', async () => {
    await openPolicy([
      version({
        status: 'APPROVED',
        allowedActions: actions({ activate: deny('ACTIVATION_PRECONDITION_FAILED') }),
      }),
    ])

    noButton('console.policies.action.activate')
    expect(screen.getByRole('note').textContent).toBe(
      t('console.policies.error.activationPrecondition'),
    )
  })
})

describe('Refused steps', () => {
  const pending = version({ status: 'PENDING_REVIEW', allowedActions: actions({ approve: allow }) })

  async function approveAnswering(respond: Handler, reread: BlockerVersionView = pending) {
    await openPolicy([pending], {
      [listUrl()]: [() => json(200, [pending]), () => json(200, [reread])],
      [stepUrl(V3, 'approve')]: respond,
    })
    fireEvent.click(button('console.policies.action.approve'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.approve.confirm'),
      }),
    )
  }

  it.each(['STALE_VERSION', 'INVALID_STATE'])(
    'on 409 %s says the policy changed, reloads it, and never sends the step again',
    async (code) => {
      const moved = version({
        status: 'APPROVED',
        optimisticLockVersion: 6,
        allowedActions: actions(),
      })
      await approveAnswering(() => problem(409, 'resource-conflict', code), moved)

      expect(
        await screen.findByText(
          'This policy changed since you opened it. The latest version has been loaded.',
        ),
      ).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
      // What the reload brought back is on screen, and the step is no longer offered.
      expect(
        (await screen.findAllByText(t('console.policies.status.APPROVED'))).length,
      ).toBeGreaterThan(0)
      noButton('console.policies.action.approve')
      expect(callsTo(stepUrl(V3, 'approve'))).toHaveLength(1)
      expect(writes()).toHaveLength(1)
      const alert = screen.getByRole('alert')
      expect(within(alert).getByText('corr-7f3a').getAttribute('dir')).toBe('ltr')
      expect(alert.textContent).toContain(t('console.policies.reference'))
      expect(document.body.textContent).not.toContain('Server prose')
    },
  )

  it('on 409 SELF_APPROVAL_NOT_ALLOWED explains the separation of duties and reloads', async () => {
    await approveAnswering(
      () => problem(409, 'resource-conflict', 'SELF_APPROVAL_NOT_ALLOWED'),
      version({
        status: 'PENDING_REVIEW',
        allowedActions: actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED') }),
      }),
    )

    expect(
      await within(await screen.findByRole('alert')).findByText(
        t('console.policies.separation.approve'),
      ),
    ).toBeTruthy()
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    await waitFor(() => noButton('console.policies.action.approve'))
    expect(callsTo(stepUrl(V3, 'approve'))).toHaveLength(1)
  })

  it('on 409 APPROVER_CANNOT_ACTIVATE explains the separation of duties and reloads', async () => {
    const approved = version({ status: 'APPROVED', allowedActions: actions({ activate: allow }) })
    await openPolicy([approved], {
      [stepUrl(V3, 'activate')]: () =>
        problem(409, 'resource-conflict', 'APPROVER_CANNOT_ACTIVATE'),
    })
    fireEvent.click(button('console.policies.action.activate'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.activate.confirm'),
      }),
    )

    expect(
      await within(await screen.findByRole('alert')).findByText(
        t('console.policies.separation.activate'),
      ),
    ).toBeTruthy()
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(callsTo(stepUrl(V3, 'activate'))).toHaveLength(1)
  })

  it('on 409 SCHEDULED_REPLACEMENT_PENDING says another replacement is scheduled, reloads, and never resends', async () => {
    const approved = version({ status: 'APPROVED', allowedActions: actions({ activate: allow }) })
    const reread = version({
      status: 'APPROVED',
      allowedActions: actions({ activate: deny('SCHEDULED_REPLACEMENT_PENDING') }),
    })
    await openPolicy([approved], {
      [listUrl()]: [() => json(200, [approved]), () => json(200, [reread])],
      [stepUrl(V3, 'activate')]: () =>
        problem(409, 'resource-conflict', 'SCHEDULED_REPLACEMENT_PENDING'),
    })
    fireEvent.click(button('console.policies.action.activate'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.activate.confirm'),
      }),
    )

    expect(
      await within(await screen.findByRole('alert')).findByText(
        t('console.policies.error.scheduledReplacementPending'),
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    await waitFor(() => noButton('console.policies.action.activate'))
    expect(callsTo(stepUrl(V3, 'activate'))).toHaveLength(1)
    expect(writes()).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('on 403 says the account lacks permission, keeps the dialog, and reloads nothing', async () => {
    await approveAnswering(() => problem(403, 'insufficient-permission'))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(t('console.policies.error.forbidden'))).toBeTruthy()
    expect(within(dialog).getByText('corr-7f3a')).toBeTruthy()
    expect(callsTo(listUrl())).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('on 400 ACTIVATION_PRECONDITION_FAILED says the version cannot be activated as it stands', async () => {
    const approved = version({ status: 'APPROVED', allowedActions: actions({ activate: allow }) })
    await openPolicy([approved], {
      [stepUrl(V3, 'activate')]: () =>
        problem(400, 'validation-failed', 'ACTIVATION_PRECONDITION_FAILED'),
    })
    fireEvent.click(button('console.policies.action.activate'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.activate.confirm'),
      }),
    )

    expect(
      await within(screen.getByRole('dialog')).findByText(
        t('console.policies.error.activationPrecondition'),
      ),
    ).toBeTruthy()
    expect(callsTo(stepUrl(V3, 'activate'))).toHaveLength(1)
  })

  it('sends a session that died mid-step to Login', async () => {
    await approveAnswering(() => problem(401, 'unauthenticated'))

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(peekEntitlements()).toBeNull()
  })

  it('can be cancelled without sending anything', async () => {
    await openPolicy([pending])
    fireEvent.click(button('console.policies.action.approve'))
    fireEvent.click(button('common.cancel'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes()).toHaveLength(0)
  })
})

describe('Rejecting a version under review', () => {
  const REJECT_URL = stepUrl(V3, 'reject')
  const pending = version({
    status: 'PENDING_REVIEW',
    reasonCode: 'POLICY_REVIEW_STARTED',
    submittedBy: AISHA.id,
    submittedAt: '2026-10-02T08:00:00Z',
    reviewedBy: RASHID.id,
    reviewedAt: '2026-10-03T08:00:00Z',
    updatedAt: '2026-10-03T08:00:00Z',
    actors: {
      createdBy: AISHA,
      submittedBy: AISHA,
      reviewedBy: RASHID,
      rejectedBy: null,
      approvedBy: null,
      activatedBy: null,
      endedBy: null,
    },
    allowedActions: actions({ approve: allow, reject: allow }),
  })
  // What the server answers: the reviewer is left as recorded and the rejecter is added beside it.
  const rejected: BlockerVersionView = {
    ...pending,
    status: 'REJECTED',
    reasonCode: 'POLICY_REJECTED',
    rejectedBy: ME.id,
    rejectedAt: '2026-10-04T09:15:00Z',
    updatedAt: '2026-10-04T09:15:00Z',
    optimisticLockVersion: 5,
    actors: { ...pending.actors, rejectedBy: ME },
    allowedActions: actions(),
  }
  const confirmReject = () =>
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.reject.confirm'),
      }),
    )
  const trailEntry = (key: string) =>
    within(
      sectionOf('console.policies.detail.section.trail')
        .getByText(t(key))
        .closest('li') as HTMLElement,
    )

  it('PENDING_REVIEW: offers Reject beside Approve, and rejects with exactly the fixed code, once', async () => {
    let release: (response: Response) => void = () => {}
    await openPolicy([pending], {
      [listUrl()]: [() => json(200, [pending]), () => json(200, [rejected])],
      [REJECT_URL]: () => new Promise<Response>((resolve) => (release = resolve)),
    })

    expect(button('console.policies.action.approve')).toBeTruthy()
    expect(button('console.policies.action.reject').textContent).toBe('Reject')
    expect(
      sectionOf('console.policies.detail.section.trail').queryByText(
        t('console.policies.trail.rejected'),
      ),
    ).toBeNull()

    fireEvent.click(button('console.policies.action.reject'))
    const dialog = screen.getByRole('dialog', { name: t('console.policies.confirm.reject.title') })
    expect(within(dialog).getByText(t(`console.policies.type.${PID}`))).toBeTruthy()
    expect(within(dialog).getByText('3')).toBeTruthy()
    expect(within(dialog).getByText(t('console.policies.status.PENDING_REVIEW'))).toBeTruthy()
    expect(
      within(dialog).getByText('This action records you as the rejecting operator.'),
    ).toBeTruthy()
    expect(
      within(dialog).getByText(
        'A rejected version cannot be approved or activated. To continue, prepare a new draft.',
      ),
    ).toBeTruthy()
    // Nothing to type: the reason is a fixed code, not the operator's words.
    expect(dialog.querySelector('input, textarea')).toBeNull()
    expect(writes()).toHaveLength(0)

    const confirm = within(dialog).getByRole('button', {
      name: t('console.policies.confirm.reject.confirm'),
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(callsTo(REJECT_URL)).toHaveLength(1)
    expect(
      within(dialog).getByRole('button', { name: t('console.policies.confirm.reject.sending') }),
    ).toBeTruthy()

    await act(async () => release(json(200, rejected)))

    const notice = await screen.findByText('Version 3 was rejected.')
    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.textContent).toBe(t('console.policies.done.reject', { number: '3' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(REJECT_URL)).toHaveLength(1)
    expect(writes()).toHaveLength(1)
    expect(initOf(REJECT_URL).method).toBe('POST')
    expect(bodyOf(REJECT_URL)).toEqual({
      expectedOptimisticLockVersion: 4,
      reasonCode: 'POLICY_REJECTED',
    })
    expect((initOf(REJECT_URL).headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)

    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    await screen.findByRole('heading', {
      level: 2,
      name: t('console.policies.detail.section.details'),
    })
    const details = sectionOf('console.policies.detail.section.details')
    expect(details.getByText(t('console.policies.status.REJECTED'))).toBeTruthy()
    expect(details.getByText('POLICY_REJECTED')).toBeTruthy()

    const offered = sectionOf('console.policies.detail.section.actions')
    expect(offered.getByText(t('console.policies.queue.rejected'))).toBeTruthy()
    expect(offered.getByText(t('console.policies.action.none'))).toBeTruthy()
    expect(offered.queryAllByRole('button')).toHaveLength(0)
    for (const key of STEP_KEYS) noButton(key)

    // The rejecter and the time, and the reviewer still the one who started the review.
    const rejection = trailEntry('console.policies.trail.rejected')
    expect(
      rejection.getByText(`Omar Operator ${t('console.policies.actor.you')}`, { exact: false }),
    ).toBeTruthy()
    expect(rejection.getByText(formatMoment('2026-10-04T09:15:00Z', 'en'))).toBeTruthy()
    const review = trailEntry('console.policies.trail.reviewed')
    expect(review.getByText('Rashid Reviewer')).toBeTruthy()
    expect(review.getByText(formatMoment('2026-10-03T08:00:00Z', 'en'))).toBeTruthy()
    expect(
      sectionOf('console.policies.detail.section.trail').queryByText(
        t('console.policies.trail.approved'),
      ),
    ).toBeNull()
  })

  it('REJECTED: offers nothing, reads "Rejected", and names the rejecter with the time', async () => {
    await openPolicy([rejected])

    for (const key of STEP_KEYS) noButton(key)
    const offered = sectionOf('console.policies.detail.section.actions')
    expect(offered.getByText('Rejected')).toBeTruthy()
    expect(offered.getByText(t('console.policies.action.none'))).toBeTruthy()
    expect(offered.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('note')).toBeNull()

    const steps = sectionOf('console.policies.detail.section.trail')
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent)
    expect(steps).toEqual([
      t('console.policies.trail.created'),
      t('console.policies.trail.submitted'),
      t('console.policies.trail.reviewed'),
      t('console.policies.trail.rejected'),
    ])
    const rejection = trailEntry('console.policies.trail.rejected')
    expect(rejection.getByText('Omar Operator', { exact: false })).toBeTruthy()
    expect(rejection.getByText(formatMoment('2026-10-04T09:15:00Z', 'en'))).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it.each(['MISSING_PERMISSION', 'INVALID_STATE'] as const)(
    'renders no Reject button when reject is refused for %s',
    async (reason) => {
      await openPolicy([
        {
          ...pending,
          allowedActions: actions({ approve: allow, reject: deny(reason) }),
        },
      ])

      // Approve is still drawn, so the absent Reject is the refusal and not an empty card.
      expect(button('console.policies.action.approve')).toBeTruthy()
      noButton('console.policies.action.reject')
      expect(writes()).toHaveLength(0)
    },
  )

  it('an author who may not approve their own version still sees why, and may reject it', async () => {
    await openPolicy([
      {
        ...pending,
        allowedActions: actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED'), reject: allow }),
      },
    ])

    expect(screen.getAllByText('Awaiting independent approval').length).toBeGreaterThan(0)
    expect(screen.getByRole('note').textContent).toBe(
      'Approval requires another authorized platform operator because you took part in creating or reviewing this version.',
    )
    noButton('console.policies.action.approve')
    expect(button('console.policies.action.reject')).toBeTruthy()
    expect(screen.queryByText(t('console.policies.action.none'))).toBeNull()

    fireEvent.click(button('console.policies.action.reject'))
    expect(
      screen.getByRole('dialog', { name: t('console.policies.confirm.reject.title') }),
    ).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it.each(['STALE_VERSION', 'INVALID_STATE'])(
    'on 409 %s says the policy changed, reloads it, and never sends the rejection again',
    async (code) => {
      const moved = {
        ...pending,
        status: 'APPROVED' as const,
        optimisticLockVersion: 6,
        allowedActions: actions(),
      }
      await openPolicy([pending], {
        [listUrl()]: [() => json(200, [pending]), () => json(200, [moved])],
        [REJECT_URL]: () => problem(409, 'resource-conflict', code),
      })
      fireEvent.click(button('console.policies.action.reject'))
      confirmReject()

      expect(
        await screen.findByText(
          'This policy changed since you opened it. The latest version has been loaded.',
        ),
      ).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
      expect(
        (await screen.findAllByText(t('console.policies.status.APPROVED'))).length,
      ).toBeGreaterThan(0)
      await waitFor(() => noButton('console.policies.action.reject'))
      expect(callsTo(REJECT_URL)).toHaveLength(1)
      expect(writes()).toHaveLength(1)
      expect(bodyOf(REJECT_URL)).toEqual({
        expectedOptimisticLockVersion: 4,
        reasonCode: 'POLICY_REJECTED',
      })
      const alert = screen.getByRole('alert')
      expect(within(alert).getByText('corr-7f3a').getAttribute('dir')).toBe('ltr')
      expect(alert.textContent).toContain(t('console.policies.reference'))
      expect(screen.queryByText(t('console.policies.done.reject', { number: '3' }))).toBeNull()
      expect(document.body.textContent).not.toContain('Server prose')
    },
  )

  it('on 403 says the account lacks permission, keeps the dialog, and reloads nothing', async () => {
    await openPolicy([pending], {
      [REJECT_URL]: () => problem(403, 'insufficient-permission'),
    })
    fireEvent.click(button('console.policies.action.reject'))
    confirmReject()

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(t('console.policies.error.forbidden'))).toBeTruthy()
    expect(within(dialog).getByText('corr-7f3a').getAttribute('dir')).toBe('ltr')
    expect(callsTo(listUrl())).toHaveLength(1)
    expect(callsTo(REJECT_URL)).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('can be cancelled without sending anything', async () => {
    await openPolicy([pending])
    fireEvent.click(button('console.policies.action.reject'))
    fireEvent.click(button('common.cancel'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes()).toHaveLength(0)
  })

  it('does not put a version in "Needs my action" for being rejectable, and lists a rejected one as Rejected', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () =>
        json(200, [
          entry({
            type: PID,
            latest: summary({
              status: 'PENDING_REVIEW',
              allowedActions: actions({
                approve: deny('SELF_APPROVAL_NOT_ALLOWED'),
                reject: allow,
              }),
            }),
          }),
          entry({
            type: 'FAWTARA_POLICY',
            latest: summary({ id: V1, versionNumber: 1, status: 'REJECTED' }),
          }),
        ]),
    })
    renderAt('/console/policies')
    await screen.findByRole('table')

    expect(screen.getByText(t('console.policies.summary', { mine: '0', total: '2' }))).toBeTruthy()
    const fawtara = within(
      screen
        .getByRole('link', { name: t('console.policies.type.FAWTARA_POLICY') })
        .closest('tr') as HTMLElement,
    )
    // Once as the status pill and once as the work-queue label.
    expect(fawtara.getAllByText('Rejected')).toHaveLength(2)

    fireEvent.click(button('console.policies.filter.mine'))
    expect(await screen.findByText(t('console.policies.emptyMine'))).toBeTruthy()
  })
})

describe('Withdrawing a scheduled version', () => {
  const REVOKE_URL = stepUrl(V3, 'revoke')
  const FROM = '2026-11-01T00:00:00Z'
  const inForce = version({
    id: V2,
    versionNumber: 2,
    status: 'ACTIVE',
    forceState: 'IN_FORCE',
    effectiveFrom: '2026-09-01T00:00:00Z',
    optimisticLockVersion: 7,
  })
  const scheduled = version({
    status: 'SCHEDULED',
    forceState: 'NOT_YET_EFFECTIVE',
    effectiveFrom: FROM,
    reasonCode: 'POLICY_ACTIVATED',
    approvedBy: RASHID.id,
    approvedAt: '2026-10-03T08:00:00Z',
    activatedBy: AISHA.id,
    activatedAt: '2026-10-04T08:00:00Z',
    actors: {
      createdBy: AISHA,
      submittedBy: null,
      reviewedBy: null,
      rejectedBy: null,
      approvedBy: RASHID,
      activatedBy: AISHA,
      endedBy: null,
    },
    allowedActions: actions({ withdraw: allow }),
  })
  // What the server answers: the version ends without taking effect, and the one in force stays.
  const withdrawn: BlockerVersionView = {
    ...scheduled,
    status: 'REVOKED',
    forceState: null,
    reasonCode: 'POLICY_SCHEDULE_WITHDRAWN',
    endedBy: ME.id,
    endedAt: '2026-10-05T10:30:00Z',
    updatedAt: '2026-10-05T10:30:00Z',
    optimisticLockVersion: 5,
    actors: { ...scheduled.actors, endedBy: ME },
    allowedActions: actions(),
  }
  const confirmWithdraw = () =>
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('console.policies.confirm.withdraw.confirm'),
      }),
    )

  it('SCHEDULED: offers Withdraw schedule only because the server allows it, as a secondary button', async () => {
    await openPolicy([scheduled, inForce])

    const withdraw = button('console.policies.action.withdraw')
    expect(withdraw.textContent).toBe('Withdraw schedule')
    // Drawn like Reject: the secondary button, never the primary fill of a forward step.
    expect(withdraw.className).toContain('border-border-default')
    expect(withdraw.className).not.toContain('bg-primary-700')
    expect(screen.queryByText(t('console.policies.action.none'))).toBeNull()
    for (const key of STEP_KEYS.filter((step) => step !== 'console.policies.action.withdraw')) {
      noButton(key)
    }
    expect(writes()).toHaveLength(0)
  })

  it.each(['MISSING_PERMISSION', 'INVALID_STATE'] as const)(
    'renders no Withdraw schedule button when withdraw is refused for %s',
    async (reason) => {
      await openPolicy([{ ...scheduled, allowedActions: actions({ withdraw: deny(reason) }) }])

      noButton('console.policies.action.withdraw')
      expect(screen.getByText(t('console.policies.action.none'))).toBeTruthy()
      expect(writes()).toHaveLength(0)
    },
  )

  it('never offers it from the status alone: a scheduled version the server does not offer has no button', async () => {
    // Scheduled, date ahead by the dates, yet the server says no: the button follows the server.
    await openPolicy([{ ...scheduled, allowedActions: actions() }])

    expect(screen.getAllByText(t('console.policies.status.SCHEDULED')).length).toBeGreaterThan(0)
    noButton('console.policies.action.withdraw')
  })

  it('reads a backend that does not send withdraw as not offered, and still renders the page', async () => {
    const older: AllowedActions = { ...scheduled.allowedActions }
    delete older.withdraw
    await openPolicy([{ ...scheduled, allowedActions: older }, inForce])

    expect(screen.getAllByText(t('console.policies.status.SCHEDULED')).length).toBeGreaterThan(0)
    noButton('console.policies.action.withdraw')
    expect(writes()).toHaveLength(0)
  })

  it('confirms with the date, the status and what stays in force, then sends exactly one revoke', async () => {
    let release: (response: Response) => void = () => {}
    await openPolicy([scheduled, inForce], {
      [listUrl()]: [() => json(200, [scheduled, inForce]), () => json(200, [withdrawn, inForce])],
      [REVOKE_URL]: () => new Promise<Response>((resolve) => (release = resolve)),
    })

    fireEvent.click(button('console.policies.action.withdraw'))
    const dialog = screen.getByRole('dialog', { name: 'Withdraw this scheduled version?' })
    expect(within(dialog).getByText(t(`console.policies.type.${PID}`))).toBeTruthy()
    expect(within(dialog).getByText('3')).toBeTruthy()
    expect(within(dialog).getByText(t('console.policies.status.SCHEDULED'))).toBeTruthy()
    const dateLine = within(dialog)
      .getByText(t('console.policies.detail.field.effectiveFrom'))
      .closest('div') as HTMLElement
    expect(within(dateLine).getByText(formatUtcMoment(FROM, 'en'))).toBeTruthy()
    expect(
      within(dialog).getByText(
        'The policy in force now stays in force, and this version will not take effect.',
      ),
    ).toBeTruthy()
    expect(
      within(dialog).getByText('This action records you as the operator who withdrew it.'),
    ).toBeTruthy()
    // Neither the activation's wording nor anything to type.
    expect(within(dialog).queryByText(t('console.policies.confirm.activate.replaces'))).toBeNull()
    expect(dialog.querySelector('input, textarea')).toBeNull()
    expect(dialog.textContent).not.toContain('—')
    expect(writes()).toHaveLength(0)

    const confirm = within(dialog).getByRole('button', { name: 'Withdraw schedule' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(callsTo(REVOKE_URL)).toHaveLength(1)
    expect(
      within(dialog).getByRole('button', { name: t('console.policies.confirm.withdraw.sending') }),
    ).toBeTruthy()

    await act(async () => release(json(200, withdrawn)))

    const notice = await screen.findByText('Version 3 was withdrawn.')
    expect(notice.getAttribute('role')).toBe('status')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes()).toHaveLength(1)
    expect(initOf(REVOKE_URL).method).toBe('POST')
    expect(bodyOf(REVOKE_URL)).toEqual({
      expectedOptimisticLockVersion: 4,
      reasonCode: 'POLICY_SCHEDULE_WITHDRAWN',
    })
    expect((initOf(REVOKE_URL).headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)

    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    const details = sectionOf('console.policies.detail.section.details')
    expect(details.getByText(t('console.policies.status.REVOKED'))).toBeTruthy()
    expect(details.getByText('POLICY_SCHEDULE_WITHDRAWN')).toBeTruthy()
    const offered = sectionOf('console.policies.detail.section.actions')
    expect(offered.getByText(t('console.policies.queue.revoked'))).toBeTruthy()
    expect(offered.queryAllByRole('button')).toHaveLength(0)
    noButton('console.policies.action.withdraw')

    // The withdrawer and the time, named "Revoked" like the status.
    const ended = within(
      sectionOf('console.policies.detail.section.trail')
        .getByText(t('console.policies.trail.revoked'))
        .closest('li') as HTMLElement,
    )
    expect(
      ended.getByText(`Omar Operator ${t('console.policies.actor.you')}`, { exact: false }),
    ).toBeTruthy()
    expect(ended.getByText(formatMoment('2026-10-05T10:30:00Z', 'en'))).toBeTruthy()
    expect(
      sectionOf('console.policies.detail.section.trail').queryByText(
        t('console.policies.trail.ended'),
      ),
    ).toBeNull()

    // The version in force is untouched.
    const rows = within(sectionOf('console.policies.detail.versions').getByRole('table'))
    const v2 = within(
      rows
        .getByRole('button', { name: t('console.policies.version', { number: '2' }) })
        .closest('tr') as HTMLElement,
    )
    expect(v2.getByText(t('console.policies.queue.inForce'))).toBeTruthy()
  })

  it('on 409 STALE_VERSION (the schedule took effect meanwhile) reloads once and never resends', async () => {
    const tookEffect: BlockerVersionView = {
      ...scheduled,
      forceState: 'IN_FORCE',
      optimisticLockVersion: 6,
      allowedActions: actions({ withdraw: deny('INVALID_STATE') }),
    }
    await openPolicy([scheduled, inForce], {
      [listUrl()]: [
        () => json(200, [scheduled, inForce]),
        () => json(200, [tookEffect, { ...inForce, forceState: 'REPLACED' }]),
      ],
      [REVOKE_URL]: () => problem(409, 'resource-conflict', 'STALE_VERSION'),
    })
    fireEvent.click(button('console.policies.action.withdraw'))
    confirmWithdraw()

    expect(
      await screen.findByText(
        'This policy changed since you opened it. The latest version has been loaded.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(
      (await screen.findAllByText(t('console.policies.queue.inForce'))).length,
    ).toBeGreaterThan(0)
    noButton('console.policies.action.withdraw')
    expect(callsTo(REVOKE_URL)).toHaveLength(1)
    expect(writes()).toHaveLength(1)
    expect(callsTo(listUrl())).toHaveLength(2)
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('corr-7f3a').getAttribute('dir')).toBe('ltr')
    expect(screen.queryByText('Version 3 was withdrawn.')).toBeNull()
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('on 409 INVALID_STATE says the policy changed and reloads without resending', async () => {
    await openPolicy([scheduled], {
      [listUrl()]: [() => json(200, [scheduled]), () => json(200, [withdrawn])],
      [REVOKE_URL]: () => problem(409, 'resource-conflict', 'INVALID_STATE'),
    })
    fireEvent.click(button('console.policies.action.withdraw'))
    confirmWithdraw()

    expect(
      await screen.findByText(
        'This policy changed since you opened it. The latest version has been loaded.',
      ),
    ).toBeTruthy()
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(callsTo(REVOKE_URL)).toHaveLength(1)
  })

  it('on 403 says the account lacks permission, keeps the dialog, and reloads nothing', async () => {
    await openPolicy([scheduled], {
      [REVOKE_URL]: () => problem(403, 'insufficient-permission'),
    })
    fireEvent.click(button('console.policies.action.withdraw'))
    confirmWithdraw()

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(t('console.policies.error.forbidden'))).toBeTruthy()
    expect(within(dialog).getByText('corr-7f3a').getAttribute('dir')).toBe('ltr')
    expect(callsTo(listUrl())).toHaveLength(1)
    expect(callsTo(REVOKE_URL)).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('can be cancelled without sending anything', async () => {
    await openPolicy([scheduled])
    fireEvent.click(button('console.policies.action.withdraw'))
    fireEvent.click(button('common.cancel'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes()).toHaveLength(0)
  })

  it('starts focus on Cancel and gives it back to the button that opened the dialog', async () => {
    await openPolicy([scheduled, inForce], {}, { strict: true })
    const opener = button('console.policies.action.withdraw')
    opener.focus()

    fireEvent.click(opener)
    expect(document.activeElement).toBe(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('common.cancel') }),
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button('console.policies.action.withdraw'))
    expect(writes()).toHaveLength(0)
  })

  it('does not put a withdrawable schedule in "Needs my action"', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () =>
        json(200, [
          entry({
            latest: summary({
              status: 'SCHEDULED',
              forceState: 'NOT_YET_EFFECTIVE',
              effectiveFrom: FROM,
              allowedActions: actions({ withdraw: allow }),
            }),
          }),
        ]),
    })
    renderAt('/console/policies')
    await screen.findByRole('table')

    expect(screen.getByText(t('console.policies.summary', { mine: '0', total: '1' }))).toBeTruthy()
  })
})

describe('Authoring the Participant ID policy', () => {
  const field = (name: string) =>
    document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!
  const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } })
  const labelOf = (name: string) => t(`console.policies.pid.field.${name}`)
  const save = () => fireEvent.click(button('console.policies.editor.save'))
  /** Picks today in a date field: the calendar's own shortcut, so the test names no day cell. */
  const pickToday = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: labelOf(name) }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  }
  const choose = (name: string, optionKey: string) => {
    fireEvent.click(screen.getByRole('button', { name: labelOf(name) }))
    fireEvent.click(screen.getByRole('option', { name: t(optionKey) }))
  }
  // The calendar's "Today" is Muscat's day, whatever the browser's zone.
  const today = () => `${muscatToday()}T00:00:00Z`

  it('offers Create draft only when the overview says the operator may author', async () => {
    await openPolicy([version({ status: 'ACTIVE', forceState: 'IN_FORCE' })])
    noButton('console.policies.action.create')
    noButton('console.policies.action.newFrom')
  })

  it('offers Create draft on a policy with no version yet', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => json(200, [entry({ canCreateDraft: true })]),
      [listUrl()]: () => json(200, []),
    })
    renderAt(`/console/policies/${PID}`)

    expect(await screen.findByText(t('console.policies.detail.noVersions'))).toBeTruthy()
    expect(
      await screen.findByRole('button', { name: t('console.policies.action.create') }),
    ).toBeTruthy()
  })

  it('starts empty, with no default standing in for a choice, and sends nothing until it is complete', async () => {
    await openPolicy(
      [version({ status: 'ACTIVE', forceState: 'IN_FORCE' })],
      {},
      { canCreateDraft: true },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: t('console.policies.action.create') }),
    )

    const dialog = screen.getByRole('dialog', { name: t('console.policies.editor.createTitle') })
    for (const name of [
      'valueSource',
      'canonicalRepresentation',
      'uniquenessRule',
      'participantIdentifierScheme',
    ]) {
      expect(field(name).value, name).toBe('')
    }
    expect(dialog.querySelector('select')).toBeNull()
    expect(dialog.querySelector('input[type="date"]')).toBeNull()

    save()

    expect(within(dialog).getAllByText(t('validation.required')).length).toBeGreaterThanOrEqual(11)
    expect(within(dialog).getAllByText(t('console.policies.validation.fixtures'))).toHaveLength(2)
    expect(document.activeElement).toBe(field('participantIdentifierScheme'))
    expect(writes()).toHaveLength(0)
  })

  describe('Escape with a dropdown or calendar open', () => {
    // StrictMode, as the application mounts: listeners are added, removed and added again.
    const openEditor = async () => {
      await openPolicy(
        [version({ status: 'ACTIVE', forceState: 'IN_FORCE' })],
        {},
        { canCreateDraft: true, strict: true },
      )
      fireEvent.click(
        await screen.findByRole('button', { name: t('console.policies.action.create') }),
      )
      return screen.getByRole('dialog', { name: t('console.policies.editor.createTitle') })
    }
    const trigger = (name: string) => screen.getByRole('button', { name: labelOf(name) })
    const escapeOn = (element: Element) => fireEvent.keyDown(element, { key: 'Escape' })
    const editorOpen = () =>
      screen.queryByRole('dialog', { name: t('console.policies.editor.createTitle') }) !== null

    it('closes the editor on Escape when nothing inside it is open', async () => {
      await openEditor()
      type('participantIdentifierScheme', '0248')

      escapeOn(field('participantIdentifierScheme'))

      await waitFor(() => expect(editorOpen()).toBe(false))
      expect(writes()).toHaveLength(0)
    })

    it('closes only the dropdown, keeps what was typed and the focus, then closes the editor', async () => {
      await openEditor()
      type('participantIdentifierScheme', '0248-TYPED')
      type('validationPattern', '^OM\\d{10}$')
      const normalization = trigger('normalization')
      normalization.focus()
      fireEvent.keyDown(normalization, { key: 'Enter' })
      expect(screen.getByRole('listbox')).toBeTruthy()

      escapeOn(normalization)

      expect(screen.queryByRole('listbox')).toBeNull()
      expect(editorOpen()).toBe(true)
      expect(field('participantIdentifierScheme').value).toBe('0248-TYPED')
      expect(field('validationPattern').value).toBe('^OM\\d{10}$')
      expect(document.activeElement).toBe(normalization)

      escapeOn(normalization)

      await waitFor(() => expect(editorOpen()).toBe(false))
      expect(writes()).toHaveLength(0)
    })

    it('closes only the calendar, gives focus back to its field, then closes the editor', async () => {
      await openEditor()
      type('participantIdentifierScheme', '0248-TYPED')
      fireEvent.click(trigger('effectiveFrom'))
      // Focus inside the calendar, which is portalled to the end of the body.
      const nextMonth = screen.getByRole('button', { name: 'Next month' })
      nextMonth.focus()

      escapeOn(nextMonth)

      expect(screen.queryByRole('button', { name: 'Next month' })).toBeNull()
      expect(editorOpen()).toBe(true)
      expect(field('participantIdentifierScheme').value).toBe('0248-TYPED')
      expect(document.activeElement).toBe(trigger('effectiveFrom'))

      escapeOn(trigger('effectiveFrom'))

      await waitFor(() => expect(editorOpen()).toBe(false))
      expect(writes()).toHaveLength(0)
    })

    it('marks an unanswered dropdown and calendar invalid and points them at their message', async () => {
      await openEditor()
      save()

      for (const name of ['normalization', 'caseSensitive', 'vatinRelationship', 'effectiveFrom']) {
        const control = trigger(name)
        expect(control.getAttribute('aria-invalid'), name).toBe('true')
        const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
        expect(
          ids.map((id) => document.getElementById(id)?.textContent),
          name,
        ).toEqual([t('validation.required')])
      }
      // An optional date with nothing wrong is not marked.
      expect(trigger('effectiveTo').getAttribute('aria-invalid')).toBeNull()
    })

    it('keeps the validation messages and the values when a dropdown is dismissed', async () => {
      const dialog = await openEditor()
      type('participantIdentifierScheme', '0248-TYPED')
      save()
      const messages = within(dialog).getAllByText(t('validation.required')).length
      expect(messages).toBeGreaterThan(0)
      fireEvent.click(trigger('caseSensitive'))
      expect(screen.getByRole('listbox')).toBeTruthy()

      escapeOn(trigger('caseSensitive'))

      expect(screen.queryByRole('listbox')).toBeNull()
      expect(editorOpen()).toBe(true)
      expect(within(dialog).getAllByText(t('validation.required'))).toHaveLength(messages)
      expect(field('participantIdentifierScheme').value).toBe('0248-TYPED')
      expect(writes()).toHaveLength(0)
    })
  })

  it('creates a draft from typed values with exactly the contract body', async () => {
    const created = version({ id: V1, versionNumber: 4, optimisticLockVersion: 0 })
    await openPolicy(
      [version({ status: 'ACTIVE', forceState: 'IN_FORCE' })],
      {
        [CREATE_URL]: () => json(201, created),
        [listUrl()]: [
          () => json(200, [version({ status: 'ACTIVE', forceState: 'IN_FORCE' })]),
          () => json(200, [created, version({ status: 'ACTIVE', forceState: 'IN_FORCE' })]),
        ],
      },
      { canCreateDraft: true },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: t('console.policies.action.create') }),
    )

    type('participantIdentifierScheme', '0248')
    type('valueSource', 'TENANT_VATIN')
    type('validationPattern', '^OM(11|12)\\d{8}$')
    type('minimumLength', '12')
    type('maximumLength', '12')
    choose('normalization', 'console.policies.pid.option.normalization.TRIM_UPPERCASE')
    choose('caseSensitive', 'common.no')
    choose('vatinRelationship', 'console.policies.pid.option.vatin.MUST_MATCH')
    type('canonicalRepresentation', 'UPPERCASE_NO_SPACES')
    type('uniquenessRule', 'GLOBAL_ACROSS_TENANTS')
    type('positiveFixtures', 'OM1100000001\nOM1200000009')
    type('negativeFixtures', 'om-short\n\n OM11 ')
    type('evidenceReference', 'https://evidence.example.test/pid/4')
    pickToday('effectiveFrom')
    // The same button twice: a double click must still be one request.
    const saveButton = button('console.policies.editor.save')
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)

    expect(
      await screen.findByText(t('console.policies.done.created', { number: '4' })),
    ).toBeTruthy()
    expect(callsTo(CREATE_URL)).toHaveLength(1)
    expect(initOf(CREATE_URL).method).toBe('POST')
    expect(bodyOf(CREATE_URL)).toEqual({
      data: {
        participantIdentifierScheme: '0248',
        valueSource: 'TENANT_VATIN',
        vatinRelationship: 'MUST_MATCH',
        normalization: 'TRIM_UPPERCASE',
        validationPattern: '^OM(11|12)\\d{8}$',
        minimumLength: 12,
        maximumLength: 12,
        caseSensitive: false,
        canonicalRepresentation: 'UPPERCASE_NO_SPACES',
        uniquenessRule: 'GLOBAL_ACROSS_TENANTS',
        positiveFixtures: ['OM1100000001', 'OM1200000009'],
        negativeFixtures: ['om-short', ' OM11 '],
      },
      evidenceReference: 'https://evidence.example.test/pid/4',
      testOnly: false,
      effectiveFrom: today(),
      effectiveTo: null,
    })
    // The new draft becomes the selected version without a read of its own.
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(callsTo(versionUrl(V1))).toHaveLength(0)
    expect(
      (
        await screen.findByRole('button', { name: t('console.policies.version', { number: '4' }) })
      ).getAttribute('aria-pressed'),
    ).toBe('true')
    // Fourteen fields typed through real inputs, three dropdowns and a calendar: the longest test
    // here, and the one the suite-wide 15 s ceiling cut off when the whole suite ran in parallel.
  }, 60_000)

  it('starts a new draft from a version with its contents, but not its evidence or dates', async () => {
    const active = version({ status: 'ACTIVE', forceState: 'IN_FORCE' })
    await openPolicy(
      [active],
      { [CREATE_URL]: () => json(201, version({ id: V1, versionNumber: 4 })) },
      { canCreateDraft: true },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: t('console.policies.action.newFrom') }),
    )

    expect(
      screen.getByRole('dialog', { name: t('console.policies.editor.fromTitle', { number: '3' }) }),
    ).toBeTruthy()
    expect(field('uniquenessRule').value).toBe('GLOBAL_ACROSS_TENANTS')
    expect(field('positiveFixtures').value).toBe('OM1100000001')
    expect(field('evidenceReference').value).toBe('')

    save()
    expect(writes()).toHaveLength(0)
    pickToday('effectiveFrom')
    save()

    await waitFor(() => expect(callsTo(CREATE_URL)).toHaveLength(1))
    expect(bodyOf(CREATE_URL)).toEqual({
      data: DATA,
      evidenceReference: null,
      testOnly: false,
      effectiveFrom: today(),
      effectiveTo: null,
    })
  })

  it('edits a draft with the lock version the server returned, never a typed one', async () => {
    const draft = version({ allowedActions: actions({ editDraft: allow, submit: allow }) })
    const saved = { ...draft, optimisticLockVersion: 5, data: { ...DATA, maximumLength: 14 } }
    await openPolicy([draft], { [versionUrl(V3)]: () => json(200, saved) })

    fireEvent.click(button('console.policies.action.edit'))
    expect(
      screen.getByRole('dialog', { name: t('console.policies.editor.editTitle', { number: '3' }) }),
    ).toBeTruthy()
    expect(field('evidenceReference').value).toBe('https://evidence.example.test/pid/3')
    type('maximumLength', '14')
    type('allowedCharactersPattern', '[A-Z0-9]+')
    save()

    expect(await screen.findByText(t('console.policies.done.saved', { number: '3' }))).toBeTruthy()
    expect(callsTo(versionUrl(V3))).toHaveLength(1)
    expect(initOf(versionUrl(V3)).method).toBe('PUT')
    expect(bodyOf(versionUrl(V3))).toEqual({
      expectedOptimisticLockVersion: 4,
      data: { ...DATA, maximumLength: 14, allowedCharactersPattern: '[A-Z0-9]+' },
      evidenceReference: 'https://evidence.example.test/pid/3',
      testOnly: false,
      effectiveFrom: '2026-11-01T00:00:00Z',
      effectiveTo: null,
    })
  })

  it('on a stale draft keeps what was typed, refuses to send it again, and reloads the page', async () => {
    const draft = version({ allowedActions: actions({ editDraft: allow }) })
    await openPolicy([draft], {
      [versionUrl(V3)]: () => problem(409, 'resource-conflict', 'STALE_VERSION'),
    })

    fireEvent.click(button('console.policies.action.edit'))
    type('uniquenessRule', 'PER_TENANT')
    save()

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText(t('console.policies.error.changed'))).toBeTruthy()
    expect(within(dialog).getByText('corr-7f3a')).toBeTruthy()
    expect(field('uniquenessRule').value).toBe('PER_TENANT')
    expect(button('console.policies.editor.save').disabled).toBe(true)
    save()
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(callsTo(versionUrl(V3))).toHaveLength(1)
  })

  it('E7: names the evidence reference and what is wrong with it before sending, and its hint gives the format', async () => {
    const draft = version({ allowedActions: actions({ editDraft: allow }) })
    await openPolicy([draft], {})

    fireEvent.click(button('console.policies.action.edit'))
    type('evidenceReference', 'Policy review 22 Oct')
    save()

    expect(await screen.findByText(t('console.policies.validation.evidenceFormat'))).toBeTruthy()
    expect(document.activeElement).toBe(field('evidenceReference'))
    expect(screen.queryByText(t('console.policies.error.rejectedContent'))).toBeNull()
    expect(callsTo(versionUrl(V3))).toHaveLength(0)

    type('evidenceReference', 'https://tickets.example.om/SUP-1200')
    expect(screen.getByText(t('console.policies.pid.hint.evidence'))).toBeTruthy()
    expect(t('console.policies.pid.hint.evidence')).toContain('No spaces')
  })

  it('marks the field a refused draft names, without the server’s sentence', async () => {
    const draft = version({ allowedActions: actions({ editDraft: allow }) })
    await openPolicy([draft], {
      [versionUrl(V3)]: () =>
        json(400, {
          type: 'https://api.fawtir.om/problems/validation-failed',
          detail: 'Server prose that must not be shown.',
          errors: [
            { field: 'data.validationPattern', message: 'Server prose that must not be shown.' },
          ],
        }),
    })

    fireEvent.click(button('console.policies.action.edit'))
    save()

    expect(await screen.findByText(t('console.policies.validation.server'))).toBeTruthy()
    expect(document.activeElement).toBe(field('validationPattern'))
    expect(document.body.textContent).not.toContain('Server prose')
  })
})

describe('Language and privacy', () => {
  it('speaks Arabic on the overview', async () => {
    await i18n.changeLanguage('ar')
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () =>
        json(200, [
          entry({
            latest: summary({
              status: 'PENDING_REVIEW',
              allowedActions: actions({ approve: allow }),
            }),
          }),
        ]),
    })
    renderAt('/console/policies')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'سياسات التحقق من الصحة' }),
    ).toBeTruthy()
    expect(await screen.findByText('بانتظار اعتمادك')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'تنتظر إجرائي' })).toBeTruthy()
    expect(screen.getByText('لا يوجد إصدار سارٍ')).toBeTruthy()
    // The type code stays left to right inside the right-to-left row.
    expect(screen.getByText(PID).getAttribute('dir')).toBe('ltr')
  })

  it('speaks Arabic on a policy, its separation note and its activation dialog', async () => {
    await i18n.changeLanguage('ar')
    await openPolicy([
      version({ status: 'APPROVED', allowedActions: actions({ activate: allow }) }),
    ])

    expect(
      screen.getByRole('heading', { level: 1, name: 'سياسة التحقق من صحة معرّف المشارك للمكلّف' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'تفاصيل الإصدار' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }))
    const dialog = screen.getByRole('dialog', { name: 'تفعيل هذا الإصدار؟' })
    expect(within(dialog).getByRole('note').textContent).toContain('معرّف المشارك')
    expect(within(dialog).getByText('يسجّلك هذا الإجراء بصفتك المشغّل المفعِّل.')).toBeTruthy()
  })

  it('speaks Arabic in the reject dialog and on the rejected version', async () => {
    await i18n.changeLanguage('ar')
    const pending = version({
      status: 'PENDING_REVIEW',
      allowedActions: actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED'), reject: allow }),
    })
    const rejected: BlockerVersionView = {
      ...pending,
      status: 'REJECTED',
      reasonCode: 'POLICY_REJECTED',
      rejectedBy: ME.id,
      rejectedAt: '2026-10-04T09:15:00Z',
      optimisticLockVersion: 5,
      actors: { ...pending.actors, rejectedBy: ME },
      allowedActions: actions(),
    }
    await openPolicy([pending], {
      [listUrl()]: [() => json(200, [pending]), () => json(200, [rejected])],
      [stepUrl(V3, 'reject')]: () => json(200, rejected),
    })

    fireEvent.click(screen.getByRole('button', { name: 'رفض' }))
    const dialog = screen.getByRole('dialog', { name: 'رفض هذا الإصدار؟' })
    expect(within(dialog).getByText('يسجّلك هذا الإجراء بصفتك المشغّل الرافض.')).toBeTruthy()
    expect(
      within(dialog).getByText(
        'الإصدار المرفوض لا يمكن اعتماده أو تفعيله. للمتابعة، أعدّ مسودة جديدة.',
      ),
    ).toBeTruthy()
    // None of the English copy leaks into the Arabic dialog.
    expect(dialog.textContent).not.toMatch(/Reject|rejecting operator|new draft/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'رفض' }))

    const arabicThree = new Intl.NumberFormat('ar').format(3)
    expect(await screen.findByText(`تم رفض الإصدار ${arabicThree}.`)).toBeTruthy()
    expect(callsTo(stepUrl(V3, 'reject'))).toHaveLength(1)
    await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
    expect(
      await within(
        screen
          .getByRole('heading', { level: 2, name: 'الأشخاص والأوقات' })
          .closest('section') as HTMLElement,
      ).findByText('الرفض'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'رفض' })).toBeNull()
  })

  describe('right to left', () => {
    /**
     * Every element of the page that states a direction of its own. Read from the shell's
     * content region: the shell's logo sets its own direction and is not this feature's.
     */
    const islands = () => [...screen.getByRole('main').querySelectorAll<HTMLElement>('[dir]')]
    /** The direction `node` is laid out in: the nearest element that states one. */
    const directionOf = (node: Element) => node.closest('[dir]')?.getAttribute('dir')

    beforeEach(async () => {
      await i18n.changeLanguage('ar')
    })

    it('lays the overview out right to left and keeps every type code left to right', async () => {
      const types: BlockerType[] = [PID, 'FAWTARA_POLICY', 'MTLS_PKI_READINESS']
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [OVERVIEW_URL]: () =>
          json(200, [
            entry({
              type: PID,
              latest: summary({
                status: 'PENDING_REVIEW',
                allowedActions: actions({ approve: allow, reject: allow }),
              }),
              active: summary({
                id: V2,
                versionNumber: 2,
                status: 'ACTIVE',
                forceState: 'IN_FORCE',
              }),
            }),
            entry({
              type: 'FAWTARA_POLICY',
              latest: summary({ id: V1, versionNumber: 1, status: 'REJECTED' }),
            }),
            entry({ type: 'MTLS_PKI_READINESS' }),
          ]),
      })
      renderRtlAt('/console/policies')
      await screen.findByRole('table')

      expect(document.documentElement.dir).toBe('rtl')
      expect(document.documentElement.lang).toBe('ar')
      const heading = screen.getByRole('heading', { level: 2, name: 'سياسات التحقق من الصحة' })
      expect(directionOf(heading)).toBe('rtl')
      expect(screen.getByText('بانتظار اعتمادك')).toBeTruthy()
      expect(screen.getAllByText('مرفوض')).toHaveLength(2)
      expect(screen.getByRole('link', { name: 'جاهزية mTLS و PKI' })).toBeTruthy()
      for (const header of screen.getAllByRole('columnheader')) {
        expect(header.textContent).toMatch(/[\u0600-\u06FF]/)
        expect(header.textContent).not.toMatch(/[A-Za-z]/)
        expect(directionOf(header)).toBe('rtl')
      }

      for (const type of types) {
        expect(screen.getByText(type).getAttribute('dir'), type).toBe('ltr')
        // The Arabic name above it is not pulled into the island.
        expect(
          directionOf(screen.getByRole('link', { name: t(`console.policies.type.${type}`) })),
        ).toBe('rtl')
      }
      // Nothing on the page states a direction except the left-to-right islands.
      expect(islands()).toHaveLength(types.length)
      for (const island of islands()) expect(island.getAttribute('dir')).toBe('ltr')
    })

    it('lays a policy out right to left and keeps codes, ids, hashes and patterns left to right', async () => {
      const UNNAMED_ID = 'abcdef12-0000-4000-8000-000000000000'
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [OVERVIEW_URL]: () => json(200, [entry()]),
        [listUrl()]: () =>
          json(200, [
            version({
              status: 'REJECTED',
              reasonCode: 'POLICY_REJECTED',
              data: { ...DATA, allowedCharactersPattern: '^[A-Z0-9]+$' },
              submittedBy: AISHA.id,
              submittedAt: '2026-10-02T08:00:00Z',
              reviewedBy: RASHID.id,
              reviewedAt: '2026-10-03T08:00:00Z',
              rejectedBy: UNNAMED_ID,
              rejectedAt: '2026-10-04T09:15:00Z',
              actors: {
                createdBy: AISHA,
                submittedBy: AISHA,
                reviewedBy: RASHID,
                rejectedBy: { id: UNNAMED_ID, displayName: null },
                approvedBy: null,
                activatedBy: null,
                endedBy: null,
              },
            }),
          ]),
      })
      renderRtlAt(`/console/policies/${PID}`)
      await screen.findByRole('heading', { level: 2, name: 'تفاصيل الإصدار' })

      expect(document.documentElement.dir).toBe('rtl')
      const heading = screen.getByRole('heading', {
        level: 1,
        name: 'سياسة التحقق من صحة معرّف المشارك للمكلّف',
      })
      expect(directionOf(heading)).toBe('rtl')
      for (const title of screen.getAllByRole('heading', { level: 2 })) {
        expect(title.textContent).toMatch(/[\u0600-\u06FF]/)
        expect(directionOf(title)).toBe('rtl')
      }
      // Status pill, version table and work-queue label.
      expect(screen.getAllByText('مرفوض').length).toBeGreaterThanOrEqual(3)
      expect(screen.getByText(t('console.policies.action.none'))).toBeTruthy()
      expect(screen.queryAllByRole('button', { name: /^(Reject|Approve|Activate)$/ })).toHaveLength(
        0,
      )

      const ltr = (text: string) => {
        const node = screen.getByText(text)
        expect(directionOf(node), text).toBe('ltr')
        return node
      }
      // The type code, the hash, the evidence reference and the machine reason code.
      expect(ltr(PID).getAttribute('dir')).toBe('ltr')
      expect(ltr('c0ffee'.repeat(10)).getAttribute('dir')).toBe('ltr')
      expect(ltr('https://evidence.example.test/pid/3').getAttribute('dir')).toBe('ltr')
      expect(ltr('POLICY_REJECTED').getAttribute('dir')).toBe('ltr')
      // The scheme, both patterns and the fixtures.
      expect(ltr('0248').getAttribute('dir')).toBe('ltr')
      expect(ltr('^OM(11|12)\\d{8}$').getAttribute('dir')).toBe('ltr')
      expect(ltr('^[A-Z0-9]+$').getAttribute('dir')).toBe('ltr')
      ltr('OM1100000001')
      ltr('om-short')
      // The start of an unnamed operator's id, beside the Arabic word for the operator.
      const shortId = ltr('abcdef12')
      expect(shortId.getAttribute('dir')).toBe('ltr')
      expect(shortId.parentElement?.textContent).toContain('مشغّل')
      expect(document.body.textContent).not.toContain(UNNAMED_ID)

      // Each trail line isolates the person from the time, so neither reorders the other.
      const lines = within(
        screen
          .getByRole('heading', { level: 2, name: 'الأشخاص والأوقات' })
          .closest('section') as HTMLElement,
      ).getAllByRole('listitem')
      expect(lines.map((line) => line.querySelector('p')?.textContent)).toEqual([
        'الإنشاء',
        'التقديم',
        'بدء المراجعة',
        'الرفض',
      ])
      for (const line of lines) {
        expect(line.querySelectorAll('bdi')).toHaveLength(2)
        expect(directionOf(line)).toBe('rtl')
      }

      // Nothing on the page states a direction except the left-to-right islands.
      expect(islands().length).toBeGreaterThan(0)
      for (const island of islands()) expect(island.getAttribute('dir')).toBe('ltr')
    })

    it('keeps the reference of a refused rejection left to right inside the Arabic notice', async () => {
      const pending = version({
        status: 'PENDING_REVIEW',
        allowedActions: actions({ approve: allow, reject: allow }),
      })
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [OVERVIEW_URL]: () => json(200, [entry()]),
        [listUrl()]: () => json(200, [pending]),
        [stepUrl(V3, 'reject')]: () => problem(409, 'resource-conflict', 'STALE_VERSION'),
      })
      renderRtlAt(`/console/policies/${PID}`)
      fireEvent.click(await screen.findByRole('button', { name: 'رفض' }))
      const dialog = screen.getByRole('dialog', { name: 'رفض هذا الإصدار؟' })
      expect(directionOf(dialog)).toBe('rtl')
      fireEvent.click(within(dialog).getByRole('button', { name: 'رفض' }))

      const alert = await screen.findByRole('alert')
      expect(
        within(alert).getByText('تغيّرت هذه السياسة منذ فتحتها. تم تحميل أحدث إصدار.'),
      ).toBeTruthy()
      expect(directionOf(alert)).toBe('rtl')
      expect(within(alert).getByText('corr-7f3a').getAttribute('dir')).toBe('ltr')
      await waitFor(() => expect(callsTo(listUrl())).toHaveLength(2))
      expect(callsTo(stepUrl(V3, 'reject'))).toHaveLength(1)
    })

    it('lays the withdraw dialog out right to left, in Arabic, with its date and in-force sentence', async () => {
      const from = '2026-11-01T00:00:00Z'
      const scheduled = version({
        status: 'SCHEDULED',
        forceState: 'NOT_YET_EFFECTIVE',
        effectiveFrom: from,
        allowedActions: actions({ withdraw: allow }),
      })
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [OVERVIEW_URL]: () => json(200, [entry()]),
        [listUrl()]: () => json(200, [scheduled]),
      })
      renderRtlAt(`/console/policies/${PID}`)
      fireEvent.click(await screen.findByRole('button', { name: 'سحب الجدولة' }))

      const dialog = screen.getByRole('dialog', { name: 'سحب هذا الإصدار المجدول؟' })
      expect(directionOf(dialog)).toBe('rtl')
      expect(within(dialog).getByText('مجدول')).toBeTruthy()
      expect(within(dialog).getByText(formatUtcMoment(from, 'ar'))).toBeTruthy()
      expect(
        within(dialog).getByText('تبقى السياسة السارية الآن سارية، ولن يبدأ سريان هذا الإصدار.'),
      ).toBeTruthy()
      expect(within(dialog).getByText('يسجّلك هذا الإجراء بصفتك المشغّل الذي سحبه.')).toBeTruthy()
      // None of the English copy leaks into the Arabic dialog, and nothing in it sets a direction.
      expect(dialog.textContent).not.toMatch(/Withdraw|withdrew|in force/)
      expect(dialog.querySelectorAll('[dir]')).toHaveLength(0)
      expect(within(dialog).getByRole('button', { name: 'سحب الجدولة' })).toBeTruthy()
      expect(writes()).toHaveLength(0)
    })
  })

  it('has no em dash in any policy string, in either language', () => {
    for (const language of ['en', 'ar']) {
      const bundle = i18n.getResourceBundle(language, 'translation') as {
        console: {
          policies: unknown
          nav: { policies: string }
          verification: { participant: Record<string, unknown> }
        }
      }
      const text = JSON.stringify([
        bundle.console.policies,
        bundle.console.nav.policies,
        bundle.console.verification.participant.policyNotActive,
        bundle.console.verification.participant.candidateRejected,
        bundle.console.verification.participant.alreadyVerified,
        bundle.console.verification.participant.viewPolicy,
      ])
      expect(text, language).not.toContain('—')
    }
  })

  it('keeps policy contents out of storage and the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level),
    )
    await openPolicy([version()])

    const stored = JSON.stringify({ ...sessionStorage, ...localStorage })
    for (const value of ['c0ffee', 'GLOBAL_ACROSS_TENANTS', 'evidence.example.test']) {
      expect(stored).not.toContain(value)
      for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(value)
    }
  })
})
