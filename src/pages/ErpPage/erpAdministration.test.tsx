import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ErpHomePage } from './ErpHomePage'
import { ErpAccessPage } from './ErpAccessPage'
import { ErpConnectionsPage } from './ErpConnectionsPage'
import { ActivityLogPage } from '../SettingsPage/ActivityLogPage'
import { SettingsPage } from '../SettingsPage/SettingsPage'

const CONNECTION_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'

const base: Entitlements = {
  userId: 'u-1',
  username: 'someone',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
  featureFlags: {},
}
const ADMIN: Entitlements = {
  ...base,
  permissions: [
    'admin.settings.manage',
    'erp.connection.read',
    'erp.connection.manage',
    'invoice.read',
    'invoice.submit',
  ],
}
const OPERATOR: Entitlements = {
  ...base,
  permissions: ['erp.connection.read', 'erp.connection.test', 'invoice.read'],
}
const SUBMITTER: Entitlements = { ...base, permissions: ['invoice.submit', 'invoice.read'] }

const HEALTH = {
  connectionMode: 'MANAGED_PULL',
  extractionStatus: 'ENABLED',
  extractionReadable: true,
  extractionConfigured: true,
  extractionEnabled: true,
  nextRunAt: null,
  consecutiveFailures: 2,
  backoffUntil: null,
  lastRunId: null,
  lastRunState: null,
  lastRunStartedAt: null,
  lastRunCompletedAt: null,
  lastFailureReason: null,
  lastCompletedRunAt: '2026-10-03T05:00:00Z',
  lastFailedRunAt: null,
  lastTestedAt: null,
  lastTestOutcome: 'SUCCESS',
}

const DOWNSTREAM = {
  queued: 0,
  sending: 0,
  sent: 0,
  delivered: 0,
  delivered_unconfirmed: 0,
  undeliverable: 0,
  c4_unreachable: 0,
  without_invoice: 0,
  total: 0,
  delivery_failed: 0,
  off_network: 0,
}
const SUMMARY = {
  received: 4,
  accepted: 3,
  rejected: 1,
  duplicate: 0,
  waiting_for_mapping: 0,
  retryable: 0,
  processing: 0,
  downstream: DOWNSTREAM,
  events: { replays: 0, conflicts: 0, completeness: 'AUDIT_EVIDENCE_LOWER_BOUND' },
}

const OVERVIEW = {
  window: { from: '2026-09-04T20:00:00Z', to: '2026-10-04T20:00:00Z' },
  entitled: true,
  scheduler_globally_enabled: true,
  connections: {
    total: 1,
    by_state: { READY: 1 },
    by_mode: { MANAGED_PULL: 1 },
    by_extraction_status: { ENABLED: 1 },
    extraction_unreadable: 0,
  },
  channels: [
    { connection_id: CONNECTION_ID, name: 'Head office Odoo', state: 'READY', health: HEALTH },
  ],
  mapping: { active_json_profile: true, uncertified_channels: 2 },
  documents: SUMMARY,
  attention: {
    labels: { DELIVERY_FAILED: 7, TAX_REPORT_ATTENTION: 1 },
    unevaluated: ['RESPONSE_PENDING'],
    delivery_failed: 7,
    tax_report_attention: 1,
  },
  latest_runs: [],
  latest_failed_runs: [],
}

const CONNECTION = {
  id: CONNECTION_ID,
  name: 'Head office Odoo',
  sourceSystem: 'ODOO',
  transportType: 'HTTPS_JSON',
  connectionMode: 'MANAGED_PULL',
  state: 'READY',
  credentialConfigured: true,
  lastTestOutcome: 'SUCCESS',
  lastTestedAt: null,
  health: HEALTH,
}

const LOG_ENTRY = {
  id: 'e-1',
  sequence_no: 12,
  occurred_at: '2026-10-04T05:30:00Z',
  event_type: 'ErpConnectionCreated',
  actor_id: 'u-1',
  actor_type: 'USER',
  resource_type: 'ERP_CONNECTION',
  resource_id: CONNECTION_ID,
  outcome: 'SUCCESS',
  ip_address: '10.0.0.1',
  correlation_id: 'corr-1',
  metadata: { secretish: 'METADATA-MARKER' },
}

let who: Entitlements
let urls: string[]
let routes: Record<string, () => Response>

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const path = (url: string) => new URL(url, 'http://x').pathname
const query = (url: string) => new URL(url, 'http://x').searchParams
const requested = (fragment: string) => urls.filter((url) => path(url).includes(fragment))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T06:00:00Z'))
  who = ADMIN
  urls = []
  routes = {
    '/api/v1/erp/overview': () => json(200, OVERVIEW),
    '/api/v1/erp/connections': () =>
      json(200, { connections: [CONNECTION], total: 1, includesArchived: false }),
    '/api/v1/erp/source-documents/summary': () => json(200, SUMMARY),
    '/api/v1/apikeys': () => json(200, []),
    '/api/v1/settings/activity-log': () =>
      json(200, { items: [LOG_ENTRY], page: 0, page_size: 50, has_more: false }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      urls.push(url)
      if (url.startsWith('/api/v1/me/entitlements')) return json(200, who)
      if (path(url).startsWith('/api/v1/peppol/mapping-profiles/JSON/certification')) {
        return routes.certification
          ? routes.certification()
          : json(200, { certified: true, active_content_hash: 'h' })
      }
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/erp" element={<ErpHomePage />} />
        <Route path="/settings/erp/access" element={<ErpAccessPage />} />
        <Route path="/settings/erp/connections" element={<ErpConnectionsPage />} />
        <Route path="/settings/activity-log" element={<ActivityLogPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the ERP integration overview', () => {
  it('reads the overview once with a window, and never one status per connection', async () => {
    renderAt('/settings/erp')
    expect(await screen.findByText('Head office Odoo')).toBeTruthy()
    await waitFor(() => expect(requested('/erp/source-documents/summary')).toHaveLength(3))
    const overview = requested('/erp/overview')
    expect(overview).toHaveLength(1)
    expect(query(overview[0]).get('from')).toBeTruthy()
    expect(query(overview[0]).get('to')).toBeTruthy()
    expect(requested('/erp/connections')).toHaveLength(1)
    expect(
      urls.some((url) => path(url).startsWith(`/api/v1/erp/connections/${CONNECTION_ID}`)),
    ).toBe(false)
  })

  it('draws the server figures and links attention by label within the window', async () => {
    renderAt('/settings/erp')
    const tile = (await screen.findByText('Delivery failed', { selector: 'span' })).closest('a')!
    expect(within(tile).getByText('7')).toBeTruthy()
    expect(tile.getAttribute('href')).toMatch(
      /^\/settings\/erp\/attention\?label=DELIVERY_FAILED&from=.+&to=.+/,
    )
    expect(screen.getByText('2 failures in a row')).toBeTruthy()
    expect(screen.getByText('2 channels have no certified mapping.')).toBeTruthy()
    // RESPONSE_PENDING is never timed here (DEC-G): it is named as not checked.
    expect(screen.getByText(/^Not checked: /)).toBeTruthy()
  })

  it('builds the checklist from server reads, with no connection asked of upload or API push', async () => {
    const before = Object.keys(window.localStorage)
    renderAt('/settings/erp')
    const pull = await screen.findByRole('region', { name: 'Managed pull' })
    expect(within(pull).getByRole('link', { name: 'Add a connection' })).toBeTruthy()
    for (const name of ['Upload', 'API push']) {
      const region = screen.getByRole('region', { name })
      expect(within(region).queryByRole('link', { name: 'Add a connection' })).toBeNull()
      expect(within(region).getByText(/No connection is needed./)).toBeTruthy()
    }
    // The bridge upload counted 4 received in the window, so the upload step is done.
    await waitFor(() => {
      const upload = within(screen.getByRole('region', { name: 'Upload' }))
        .getByRole('link', { name: 'Upload a document' })
        .closest('li')!
      expect(within(upload).getByText('Done')).toBeTruthy()
    })
    expect(Object.keys(window.localStorage)).toEqual(before)
  })

  it('does not ask for API keys or certification of a reader who may not see them', async () => {
    who = OPERATOR
    renderAt('/settings/erp')
    expect(await screen.findByText('Head office Odoo')).toBeTruthy()
    await waitFor(() => expect(requested('/erp/source-documents/summary')).toHaveLength(3))
    expect(requested('/apikeys')).toEqual([])
    expect(requested('/mapping-profiles')).toEqual([])
  })

  it('says when ERP is not enabled for the organisation', async () => {
    routes['/api/v1/erp/overview'] = () => json(200, { ...OVERVIEW, entitled: false })
    renderAt('/settings/erp')
    expect(await screen.findByText('ERP integration is not enabled')).toBeTruthy()
  })

  it('asks nothing of a reader without both read permissions', async () => {
    who = SUBMITTER
    renderAt('/settings/erp')
    expect(
      await screen.findByText(/needs permission to read ERP connections and invoices/),
    ).toBeTruthy()
    expect(requested('/erp/')).toEqual([])
  })

  it('offers only the areas the reader may open', async () => {
    who = OPERATOR
    renderAt('/settings/erp')
    const nav = await screen.findByRole('navigation', { name: 'ERP integration areas' })
    const names = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(names).toEqual(['Overview', 'Connections', 'Activity', 'Access and history'])
    expect(within(nav).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })
})

describe('the connection list', () => {
  it('shows collection health from the list itself, with no per-connection read', async () => {
    renderAt('/settings/erp/connections')
    const row = (await screen.findByText('Head office Odoo')).closest('tr')!
    expect(within(row).getByText('2 failures in a row')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Collection' })).toBeTruthy()
    expect(
      urls.some((url) => path(url).startsWith(`/api/v1/erp/connections/${CONNECTION_ID}`)),
    ).toBe(false)
  })
})

describe('access and history', () => {
  it('shows an administrator the ERP history from the real log, narrowed by resource kind', async () => {
    renderAt('/settings/erp/access')
    expect(await screen.findByText('Connection added')).toBeTruthy()
    const call = requested('/settings/activity-log')[0]
    expect(query(call).get('resource_type')).toBe('ERP_CONNECTION')
    expect(screen.queryByText(/METADATA-MARKER/)).toBeNull()
    expect(screen.queryByText('10.0.0.1')).toBeNull()
  })

  it('does not ask for the log for anyone else, and says why', async () => {
    who = OPERATOR
    renderAt('/settings/erp/access')
    expect(await screen.findByText(/shown to administrators only/)).toBeTruthy()
    expect(requested('/settings/activity-log')).toEqual([])
  })

  it('sets each capability against the reader’s own permissions', async () => {
    who = OPERATOR
    renderAt('/settings/erp/access')
    const row = (await screen.findByText('Check a connection')).closest('tr')!
    expect(within(row).getByText('Yes')).toBeTruthy()
    const keys = screen.getByText('Manage API push keys').closest('tr')!
    expect(within(keys).getByText('No')).toBeTruthy()
  })
})

describe('the activity log', () => {
  it('lists only what the server holds, worded, never by a server code', async () => {
    routes['/api/v1/settings/activity-log'] = () =>
      json(200, {
        items: [LOG_ENTRY, { ...LOG_ENTRY, id: 'e-2', event_type: 'SomethingNew' }],
        page: 0,
        page_size: 50,
        has_more: false,
      })
    renderAt('/settings/activity-log')
    expect(await screen.findByText('Connection added')).toBeTruthy()
    // An event this build has no words for is named generically, never by its code.
    expect(screen.getByText('Recorded event')).toBeTruthy()
    expect(screen.queryByText(/SomethingNew/)).toBeNull()
    // The designed tiles and export are drawn, but no invented figure: the log returns no counts.
    expect(screen.getByText('Export as PDF')).toBeTruthy()
    expect(screen.getByText('This month')).toBeTruthy()
    expect(screen.getAllByText('Not available yet')).toHaveLength(3)
    expect(query(requested('/settings/activity-log')[0]).get('resource_type')).toBeNull()
  })

  it('sends a filter as the server names it and starts again at the first page', async () => {
    renderAt('/settings/activity-log')
    await screen.findByText('Connection added')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Refused' }))
    await waitFor(() => {
      const last = requested('/settings/activity-log').at(-1)!
      expect(query(last).get('outcome')).toBe('DENIED')
      expect(query(last).get('page')).toBe('0')
    })
  })

  it('narrows by tab and search within the page, and shows no actor code', async () => {
    routes['/api/v1/settings/activity-log'] = () =>
      json(200, {
        items: [
          LOG_ENTRY,
          {
            ...LOG_ENTRY,
            id: 'e-2',
            event_type: 'ApiKeyCreated',
            actor_type: 'API_KEY',
            resource_type: 'API_KEY',
          },
        ],
        page: 0,
        page_size: 50,
        has_more: false,
      })
    renderAt('/settings/activity-log')
    expect(await screen.findByText('Connection added')).toBeTruthy()
    expect(screen.queryByText('USR')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /By the API/ }))
    expect(screen.queryByText('Connection added')).toBeNull()
    expect(screen.getByText('API key created')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), {
      target: { value: 'connection' },
    })
    expect(screen.getByText('Connection added')).toBeTruthy()
    expect(screen.queryByText('API key created')).toBeNull()
    // Tabs and search never ask the server: it has no parameter for them.
    expect(requested('/settings/activity-log')).toHaveLength(1)
  })

  it('asks nothing of a reader without the permission', async () => {
    who = OPERATOR
    renderAt('/settings/activity-log')
    expect(await screen.findByText(/doesn't have access/i)).toBeTruthy()
    expect(requested('/settings/activity-log')).toEqual([])
  })
})

describe('the Settings mapping card', () => {
  const mappingCard = async () => (await screen.findByText('ERP mapping')).closest('a')!

  it('does not read the mapping for a reader the mapping routes refuse, and says "No access"', async () => {
    who = OPERATOR
    renderAt('/settings?group=integration')
    const card = await mappingCard()
    expect(requested('/mapping-profiles')).toEqual([])
    expect(within(card).getByText('No access')).toBeTruthy()
  })

  it('shows a refused mapping read as "No access", never "Not set up"', async () => {
    routes.certification = () => json(403, { status: 403 })
    renderAt('/settings?group=integration')
    await waitFor(() => expect(requested('/mapping-profiles').length).toBeGreaterThan(0))
    const card = await mappingCard()
    await waitFor(() => expect(within(card).getByText('No access')).toBeTruthy())
    expect(within(card).queryByText('Not set up')).toBeNull()
  })
})
