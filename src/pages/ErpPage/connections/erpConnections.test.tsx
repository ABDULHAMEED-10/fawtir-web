import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { resetSharedRequests } from '../../../api'
import type { ErpConnectionDto } from '../../../api/erp/connections'
import { ErpConnectionsPage } from '../ErpConnectionsPage'
import { ErpConnectPage } from '../ErpConnectPage'
import { ConnectionOverviewPage } from './ConnectionOverviewPage'
import { ConnectionSettingsPage } from './ConnectionSettingsPage'
import { ConnectionWriteBackPage } from './ConnectionWriteBackPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const CONNECTIONS_URL = '/api/v1/erp/connections'
const ID = 'c0000000-0000-0000-0000-000000000001'

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
const MANAGER: Entitlements = {
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
    state: 'DRAFT',
    credentialConfigured: false,
    credentialType: null,
    credentialHint: null,
    credentialRotatedAt: null,
    lastTestedAt: null,
    lastTestOutcome: null,
    lastTestReasonCode: null,
    version: 3,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, code: string) {
  return new Response(
    JSON.stringify({
      status,
      code,
      type: `https://api.fawtir.om/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      detail: 'refused',
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

type Call = { url: string; method: string; body: unknown }

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let rows: ErpConnectionDto[]
let calls: Call[]
let refuse: { on: string; status: number; code: string } | null
let testAnswer: unknown

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  who = ALL
  rows = [connection()]
  calls = []
  refuse = null
  testAnswer = { success: true, outcome: 'SUCCESS', reasonCode: 'SUCCESS', latencyMs: 42, verdictPersisted: true }

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, method, body })

    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    if (!url.startsWith(CONNECTIONS_URL)) return json(404)

    if (refuse !== null && url.includes(refuse.on) && method !== 'GET') {
      return problem(refuse.status, refuse.code)
    }
    if (url.endsWith('/test') && method === 'POST') return json(200, testAnswer)
    if (url.endsWith('/credential') && method === 'PUT') {
      return json(200, {
        id: 'cred-1',
        credentialType: body.credentialType,
        hint: body.hint,
        rotatedAt: null,
        createdAt: '2026-09-02T10:00:00Z',
        updatedAt: '2026-09-02T10:00:00Z',
      })
    }
    if (method === 'POST' && url === `${CONNECTIONS_URL}`) {
      return json(201, connection({ id: 'new-id', name: body.name, version: 0 }))
    }
    if (method === 'POST' || method === 'PUT') return json(200, rows[0])
    if (url.includes(`${CONNECTIONS_URL}/`)) return json(200, rows[0])
    return json(200, { connections: rows, total: rows.length, includesArchived: false })
  })
  vi.stubGlobal('fetch', fetchMock)
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/erp/connections" element={<ErpConnectionsPage />} />
        <Route path="/settings/erp/connections/new" element={<ErpConnectPage />} />
        <Route path="/settings/erp/connections/:id" element={<ConnectionOverviewPage />} />
        <Route path="/settings/erp/connections/:id/settings" element={<ConnectionSettingsPage />} />
        <Route path="/settings/erp/connections/:id/write-back" element={<ConnectionWriteBackPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const mutations = () => calls.filter((call) => call.method !== 'GET')

/* ==================================================================== the list */

describe('connection list', () => {
  it('renders the real rows from the API', async () => {
    rows = [
      connection(),
      connection({ id: 'c-2', name: 'Salalah ERPNext', sourceSystem: 'ERPNEXT', state: 'READY' }),
    ]
    renderAt('/settings/erp/connections')

    expect(await screen.findByText('Head office Odoo')).toBeTruthy()
    expect(screen.getByText('Salalah ERPNext')).toBeTruthy()
    expect(screen.getByText('ODOO')).toBeTruthy()
  })

  it('shows no invented run, sync or volume figures', async () => {
    rows = [connection({ state: 'READY', credentialConfigured: true })]
    const { container } = renderAt('/settings/erp/connections')
    await screen.findByText('Head office Odoo')

    // The mock list carried last-run times, collected and rejected counts, watermark ages and a
    // sync-health badge. None of those has a backend field, so none may appear.
    const text = container.textContent ?? ''
    for (const leak of ['collected', 'rejected', 'Last run', 'watermark', 'needs attention', 'ERROR']) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })

  it('offers Add only with erp.connection.manage', async () => {
    who = READER
    renderAt('/settings/erp/connections')
    await screen.findByText('Head office Odoo')
    expect(screen.queryByText('Add a connection')).toBeNull()
    expect(screen.getByText(/view these connections but not change them/i)).toBeTruthy()
  })

  it('shows the list to a reader rather than pretending it is empty', async () => {
    who = READER
    renderAt('/settings/erp/connections')
    expect(await screen.findByText('Head office Odoo')).toBeTruthy()
    expect(screen.queryByText(/No connections yet/i)).toBeNull()
  })

  it('refuses the whole list without erp.connection.read', async () => {
    who = NOBODY
    renderAt('/settings/erp/connections')
    await waitFor(() => expect(screen.getByText(/no access|permission/i)).toBeTruthy())
    expect(calls.some((call) => call.url.startsWith(CONNECTIONS_URL))).toBe(false)
  })

  it('renders the empty state, and a retry on failure', async () => {
    rows = []
    const empty = renderAt('/settings/erp/connections')
    expect(await screen.findByText(/No connections yet/i)).toBeTruthy()
    empty.unmount()

    resetSharedRequests()
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url)
      if (url.startsWith(ENTITLEMENTS_URL)) return json(200, ALL)
      return json(500)
    })
    renderAt('/settings/erp/connections')
    // getAllBy: the Settings shell around the card carries its own retry affordance.
    await waitFor(() => expect(screen.getAllByText(/try again|retry/i).length).toBeGreaterThan(0))
  })
})

/* ================================================================ create / edit */

describe('create', () => {
  it('posts the Phase 2 fields and nothing else', async () => {
    renderAt('/settings/erp/connections/new')
    const name = await screen.findByLabelText(/^Name/i)
    fireEvent.change(name, { target: { value: 'New Odoo' } })
    fireEvent.click(screen.getByText('Save as draft'))

    await waitFor(() => expect(mutations().length).toBe(1))
    const created = mutations()[0]
    expect(created.method).toBe('POST')
    expect(created.url).toBe(CONNECTIONS_URL)
    const body = created.body as Record<string, unknown>
    expect(body.name).toBe('New Odoo')
    expect(Object.keys(body).sort()).toEqual(
      ['configuration', 'connectionMode', 'endpoint', 'name', 'sourceSystem', 'sourceVersion', 'transportType'].sort(),
    )
    // No schedule, frequency, run-now or checkpoint field exists to send.
    for (const forbidden of ['schedule', 'frequency', 'cron', 'checkpoint', 'state', 'secret']) {
      expect(body[forbidden]).toBeUndefined()
    }
  })

  it('never asks for a secret on the create form', async () => {
    const { container } = renderAt('/settings/erp/connections/new')
    await screen.findByLabelText(/^Name/i)
    expect(container.querySelectorAll('input[type="password"]').length).toBe(0)
  })

  it('is refused without manage', async () => {
    who = READER
    renderAt('/settings/erp/connections/new')
    await waitFor(() => expect(screen.getByText(/no access|permission/i)).toBeTruthy())
  })
})

describe('edit', () => {
  it('sends the version it read and shows the immutable fields as facts', async () => {
    renderAt(`/settings/erp/connections/${ID}/settings`)
    const name = await screen.findByLabelText(/^Name/i)
    fireEvent.change(name, { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => expect(mutations().length).toBeGreaterThan(0))
    const saved = mutations()[0]
    expect(saved.method).toBe('PUT')
    expect((saved.body as Record<string, unknown>).expectedVersion).toBe(3)
    // sourceSystem and connectionMode are not sendable: the request type has no field for them.
    expect((saved.body as Record<string, unknown>).sourceSystem).toBeUndefined()
    expect((saved.body as Record<string, unknown>).connectionMode).toBeUndefined()
  })

  it('keeps the typed value and offers a reload on a stale version', async () => {
    refuse = { on: `${CONNECTIONS_URL}/${ID}`, status: 409, code: 'CONNECTION_VERSION_CONFLICT' }
    renderAt(`/settings/erp/connections/${ID}/settings`)
    const name = await screen.findByLabelText(/^Name/i)
    fireEvent.change(name, { target: { value: 'My edit' } })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => expect(screen.getByText(/Somebody else changed this connection/i)).toBeTruthy())
    expect(screen.getByText('Reload')).toBeTruthy()
    // The edit survives the refusal: losing it to report somebody else's change would be its own bug.
    expect((await screen.findByLabelText(/^Name/i)).getAttribute('value')).toBe('My edit')
  })

  it('names a duplicate name as such, with no reload advice', async () => {
    refuse = { on: `${CONNECTIONS_URL}/${ID}`, status: 409, code: 'CONNECTION_NAME_DUPLICATE' }
    renderAt(`/settings/erp/connections/${ID}/settings`)
    fireEvent.click(await screen.findByText('Save changes'))

    await waitFor(() => expect(screen.getByText(/already uses this name/i)).toBeTruthy())
    expect(screen.queryByText('Reload')).toBeNull()
  })
})

/* =================================================================== transport */

/**
 * Which transports may be chosen, and what happens to one that is already stored.
 *
 * REST is the only transport the extraction runtime implements, so it is the only one offered. The
 * backend's enum holds three values and no more — there is no FILE and no SOAP, and offering either
 * would let an operator store a transport nothing can read.
 */
describe('transport', () => {
  const transportSelect = () => screen.getByLabelText('How Fawtir connects') as HTMLSelectElement
  const offered = () => Array.from(transportSelect().options).map((option) => option.value)

  it('offers only REST on a connection that stores REST', async () => {
    rows = [connection({ transportType: 'REST' })]
    renderAt(`/settings/erp/connections/${ID}/settings`)
    await screen.findByLabelText('How Fawtir connects')

    expect(offered()).toEqual(['REST'])
  })

  it('never offers FILE or SOAP, which the backend enum does not have', async () => {
    renderAt(`/settings/erp/connections/${ID}/settings`)
    await screen.findByLabelText('How Fawtir connects')

    // Named rather than inferred from the list's length: both were offered by the design mock, and a
    // value the enum cannot accept is a 400 the operator can do nothing about.
    expect(offered()).not.toContain('FILE')
    expect(offered()).not.toContain('SOAP')
  })

  it.each(['JDBC', 'SFTP'] as const)(
    'keeps a stored %s in the list rather than rewriting it',
    async (stored) => {
      // The select's value must be one of its options or the browser reports "", and saving any other
      // field would then post transportType: null — silently changing a transport the operator never
      // touched. So a stored value the runtime cannot use is still shown, and still saved back.
      rows = [connection({ transportType: stored })]
      renderAt(`/settings/erp/connections/${ID}/settings`)
      await screen.findByLabelText('How Fawtir connects')

      expect(offered()).toContain(stored)
      expect(transportSelect().value).toBe(stored)

      fireEvent.click(screen.getByText('Save changes'))
      await waitFor(() => expect(mutations().length).toBeGreaterThan(0))
      expect((mutations()[0].body as Record<string, unknown>).transportType).toBe(stored)
    },
  )

  it('offers only REST when creating a connection', async () => {
    renderAt('/settings/erp/connections/new')
    await screen.findByLabelText('How Fawtir connects')

    expect(offered()).toEqual(['REST'])
  })
})

/* =================================================================== lifecycle */

describe('lifecycle', () => {
  it('offers only the transitions the state machine draws', async () => {
    rows = [connection({ state: 'DRAFT' })]
    const draft = renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    expect(screen.getByText('Mark ready')).toBeTruthy()
    // DRAFT -> DISABLED is not an arrow, so Pause must not be offered.
    expect(screen.queryByText('Pause')).toBeNull()
    expect(screen.getByText('Retire')).toBeTruthy()
    draft.unmount()

    resetSharedRequests()
    rows = [connection({ state: 'READY', credentialConfigured: true, credentialType: 'BASIC_AUTH' })]
    renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    expect(screen.getByText('Pause')).toBeTruthy()
    expect(screen.queryByText('Mark ready')).toBeNull()
  })

  it('renders an archived connection read-only', async () => {
    rows = [connection({ state: 'ARCHIVED' })]
    renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    for (const label of ['Mark ready', 'Pause', 'Retire']) {
      expect(screen.queryByText(label)).toBeNull()
    }
    // 'Settings' also names a shell nav item, so the absence of the EDIT button is asserted by
    // there being no lifecycle card at all rather than by the word.
    expect(screen.queryByText('Save changes')).toBeNull()
  })

  it('sends the version with a transition', async () => {
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Mark ready'))
    await waitFor(() => expect(mutations().length).toBe(1))
    expect(mutations()[0].url).toBe(`${CONNECTIONS_URL}/${ID}/ready`)
    expect((mutations()[0].body as Record<string, unknown>).expectedVersion).toBe(3)
  })

  it('renders the backend refusal when READY is not earned', async () => {
    refuse = { on: '/ready', status: 400, code: 'CONNECTION_NOT_READY_COMPLETE' }
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Mark ready'))
    await waitFor(() => expect(screen.getByText(/Not ready yet/i)).toBeTruthy())
  })
})

/* ================================================================== credential */

describe('credential', () => {
  const configured = () =>
    connection({
      credentialConfigured: true,
      credentialType: 'BASIC_AUTH',
      credentialHint: 'erp-user',
      credentialRotatedAt: '2026-09-05T08:00:00Z',
    })

  it('never renders a saved secret, and offers no way to reveal one', async () => {
    rows = [configured()]
    const { container } = renderAt(`/settings/erp/connections/${ID}/settings`)
    await screen.findByText('erp-user')

    expect(screen.queryByText(/show.*(password|secret)/i)).toBeNull()
    // Nothing on screen holds secret material; the response has no field that could carry it.
    expect(container.textContent).not.toContain('hunter2')
    expect(container.querySelectorAll('input[type="password"]').length).toBe(0)
  })

  it('sends the secret once and clears the field afterwards', async () => {
    rows = [connection()]
    const { container } = renderAt(`/settings/erp/connections/${ID}/settings`)
    fireEvent.click(await screen.findByText('Add sign-in details'))

    const secret = container.querySelector('input[type="password"]') as HTMLInputElement
    expect(secret).toBeTruthy()
    fireEvent.change(secret, { target: { value: 'user:hunter2' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(mutations().length).toBe(1))
    const put = mutations()[0]
    expect(put.method).toBe('PUT')
    expect(put.url).toBe(`${CONNECTIONS_URL}/${ID}/credential`)
    expect((put.body as Record<string, unknown>).secret).toBe('user:hunter2')
    expect((put.body as Record<string, unknown>).expectedVersion).toBe(3)

    // The form closes and the field is gone, so the plaintext is not sitting in a live input.
    await waitFor(() =>
      expect(container.querySelectorAll('input[type="password"]').length).toBe(0),
    )
  })

  it('never puts the secret in the URL, storage or a GET', async () => {
    rows = [connection()]
    const { container } = renderAt(`/settings/erp/connections/${ID}/settings`)
    fireEvent.click(await screen.findByText('Add sign-in details'))
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'user:hunter2' },
    })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mutations().length).toBe(1))

    for (const call of calls) expect(call.url).not.toContain('hunter2')
    expect(JSON.stringify(window.localStorage)).not.toContain('hunter2')
    expect(JSON.stringify(window.sessionStorage)).not.toContain('hunter2')
    expect(calls.filter((call) => call.method === 'GET').some((call) => call.url.includes('hunter2'))).toBe(false)
  })

  it('warns that saving replaces the credential in force', async () => {
    rows = [configured()]
    renderAt(`/settings/erp/connections/${ID}/settings`)
    fireEvent.click(await screen.findByText('Replace sign-in details'))
    expect(screen.getByText(/replaces the one in use now/i)).toBeTruthy()
  })

  it('hides the write form from a manage-only user', async () => {
    who = MANAGER
    rows = [configured()]
    renderAt(`/settings/erp/connections/${ID}/settings`)
    await screen.findByText('erp-user')

    expect(screen.queryByText('Replace sign-in details')).toBeNull()
    expect(screen.getByText(/do not have permission to change sign-in details/i)).toBeTruthy()
    // The metadata is still shown: manage may read what kind is configured.
    expect(screen.getByText('Username and password')).toBeTruthy()
  })
})

/* =============================================================== test connection */

describe('test connection', () => {
  const testable = () =>
    connection({ credentialConfigured: true, credentialType: 'BASIC_AUTH', state: 'READY' })

  it('posts only to the Fawtir route and never to the ERP endpoint', async () => {
    rows = [testable()]
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Check connection'))

    await waitFor(() => expect(mutations().length).toBe(1))
    expect(mutations()[0].url).toBe(`${CONNECTIONS_URL}/${ID}/test`)
    expect(mutations()[0].body).toBeNull()
    // The browser must never contact the tenant's ERP: that would bypass the server's destination
    // policy and run from the operator's own network.
    for (const call of calls) {
      expect(call.url).not.toContain('erp.example.om')
      expect(call.url.startsWith('/api/')).toBe(true)
    }
  })

  it('renders a success without claiming the connection is now on', async () => {
    rows = [testable()]
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Check connection'))

    await waitFor(() => expect(screen.getByText(/accepted the sign-in details/i)).toBeTruthy())
    expect(screen.getByText(/Took 42 ms/i)).toBeTruthy()
    expect(screen.getByText(/does not turn the connection on/i)).toBeTruthy()
    // No transition was requested by the check.
    expect(mutations().every((call) => call.url.endsWith('/test'))).toBe(true)
  })

  it.each([
    ['ENDPOINT_NOT_ALLOWED', /not one Fawtir may contact/i],
    ['DNS_FAILURE', /could not be looked up/i],
    ['CONNECTION_TIMEOUT', /did not answer in time/i],
    ['TLS_FAILURE', /secure connection could not be established/i],
    ['AUTHENTICATION_REJECTED', /refused the sign-in details/i],
    ['REMOTE_UNAVAILABLE', /answered that it is unavailable/i],
    ['UNSUPPORTED_RESPONSE', /answer Fawtir cannot accept/i],
    ['INVALID_CONFIGURATION', /not configured well enough/i],
    ['CREDENTIAL_UNAVAILABLE', /no usable sign-in details/i],
  ])('renders %s as its own sentence', async (reasonCode, expected) => {
    rows = [testable()]
    testAnswer = { success: false, outcome: 'FAILURE', reasonCode, latencyMs: 7, verdictPersisted: true }
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Check connection'))
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy())
  })

  it('falls back safely on a reason code it has never heard of', async () => {
    rows = [testable()]
    testAnswer = {
      success: false,
      outcome: 'FAILURE',
      reasonCode: 'SOMETHING_ADDED_LATER',
      latencyMs: 9,
      verdictPersisted: true,
    }
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Check connection'))

    await waitFor(() => expect(screen.getByText(/The check did not succeed/i)).toBeTruthy())
    // The fallback is a sentence, not a blank or a raw key.
    expect(screen.queryByText(/erp\.connections\.test\.reason/)).toBeNull()
  })

  it('says so when the verdict was not stored', async () => {
    rows = [testable()]
    testAnswer = { success: true, outcome: 'SUCCESS', reasonCode: 'SUCCESS', latencyMs: 12, verdictPersisted: false }
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Check connection'))
    await waitFor(() =>
      expect(screen.getByText(/changed while the check was running/i)).toBeTruthy(),
    )
  })

  it('keeps the result visible across the refresh that follows', async () => {
    rows = [testable()]
    renderAt(`/settings/erp/connections/${ID}`)
    fireEvent.click(await screen.findByText('Check connection'))
    await waitFor(() => expect(screen.getByText(/accepted the sign-in details/i)).toBeTruthy())

    // The reload after a check must not discard the verdict — the defect the mapping screens had.
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1))
    expect(screen.getByText(/accepted the sign-in details/i)).toBeTruthy()
  })

  it('hides the action without erp.connection.test and explains why', async () => {
    who = MANAGER
    rows = [testable()]
    renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    expect(screen.queryByText('Check connection')).toBeNull()
    expect(screen.getByText(/do not have permission to check connections/i)).toBeTruthy()
  })

  it('explains rather than offers when there is no credential to test with', async () => {
    rows = [connection({ credentialConfigured: false })]
    renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    expect(screen.queryByText('Check connection')).toBeNull()
    expect(screen.getByText(/Add sign-in details before checking/i)).toBeTruthy()
  })

  it('explains that an unprobeable credential kind cannot be checked', async () => {
    rows = [
      connection({ credentialConfigured: true, credentialType: 'SSH_PRIVATE_KEY', state: 'READY' }),
    ]
    renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    expect(screen.queryByText('Check connection')).toBeNull()
    expect(screen.getByText(/cannot be checked automatically yet/i)).toBeTruthy()
  })

  it('cannot be reached at all by a user with no ERP permission', async () => {
    who = NOBODY
    renderAt(`/settings/erp/connections/${ID}`)
    await waitFor(() => expect(screen.getByText(/no access|permission/i)).toBeTruthy())
    expect(mutations().length).toBe(0)
  })
})

/* =============================================================== extraction gone */

describe('extraction screens', () => {
  // Runs and records now have a backend and open the ERP activity reports (erpReporting.test);
  // write-back still has none.
  it('say write-back is unavailable instead of inventing an outbox', async () => {
    const { container } = renderAt(`/settings/erp/connections/${ID}/write-back`)
    expect(await screen.findByText(/Not available yet/i)).toBeTruthy()
    const text = (container.textContent ?? '').toLowerCase()
    for (const leak of ['collected', 'rejected', 'watermark', 'succeeded', 'partial']) {
      expect(text).not.toContain(leak)
    }
  })

  it('are not advertised on the tab strip', async () => {
    rows = [connection()]
    renderAt(`/settings/erp/connections/${ID}`)
    await screen.findByText('Head office Odoo')
    const tabs = screen.getByRole('navigation', { name: /ERP|connection/i })
    for (const gone of ['Runs', 'Records', 'Write-back']) {
      expect(within(tabs).queryByText(gone)).toBeNull()
    }
    expect(within(tabs).getByText('Overview')).toBeTruthy()
  })
})
