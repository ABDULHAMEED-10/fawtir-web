import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ErpApiPushPage } from './ErpApiPushPage'
import { ErpGated } from '../../components/plan'
import type { ApiKeySummaryDto } from '../../api/settings/apiKeys'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const KEYS_URL = '/api/v1/apikeys'
const CERTIFICATION_URL = '/api/v1/peppol/mapping-profiles/'

const RAW_KEY = 'fawt_sk_11111111-2222-3333-4444-555555555555.abcdefghijkl.SECRET-PART-xyz-0123456789'
const ROTATED_KEY = 'fawt_sk_11111111-2222-3333-4444-555555555555.mnopqrstuvwx.ROTATED-SECRET-987654'
const NOW = Date.parse('2026-10-07T12:00:00Z')

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage', 'invoice.read'],
  scopes: [],
  featureFlags: {},
}

function key(overrides: Partial<ApiKeySummaryDto>): ApiKeySummaryDto {
  return {
    id: 'k-active',
    maskedKey: 'abcdefghijkl••••9Zx1',
    label: 'Odoo production',
    scopes: ['invoice.submit'],
    expiresAt: '2027-10-07T12:00:00Z',
    active: true,
    clientId: 'c-1',
    clientName: 'Odoo production',
    profile: 'ERP_INGESTION',
    status: 'ACTIVE',
    createdAt: '2026-09-01T08:00:00Z',
    lastUsedAt: null,
    supersededByKeyId: null,
    rotationGraceEndsAt: null,
    rotationCompletedAt: null,
    revokedAt: null,
    ...overrides,
  }
}

const ACTIVE = key({ lastUsedAt: '2026-10-07T11:58:00Z' })
const GRACE = key({
  id: 'k-old',
  clientName: 'Odoo staging',
  label: 'Odoo staging',
  status: 'ROTATION_GRACE',
  supersededByKeyId: 'k-new',
  rotationGraceEndsAt: '2026-10-08T12:00:00Z',
  lastUsedAt: '2026-10-07T09:00:00Z',
})
const REPLACEMENT = key({ id: 'k-new', clientName: 'Odoo staging (rotation)', label: 'Odoo staging (rotation)' })
const REVOKED = key({ id: 'k-revoked', clientName: 'Old Sage', label: 'Old Sage', status: 'REVOKED', active: false, revokedAt: '2026-10-01T00:00:00Z' })
const EXPIRED = key({ id: 'k-expired', clientName: 'Legacy', label: 'Legacy', status: 'EXPIRED', active: false, expiresAt: '2026-10-01T00:00:00Z' })
const GENERAL = key({ id: 'k-general', clientName: 'POS terminal', label: 'POS terminal', profile: 'GENERAL' })

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, type: string) {
  return new Response(
    JSON.stringify({
      type: `https://api.fawtir.om/problems/${type}`,
      status,
      detail: 'SERVER-PROSE-MARKER java.lang.IllegalStateException hash=abc123',
      correlationId: 'corr-9',
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> }

let who: Entitlements
let calls: Call[]
let listed: ApiKeySummaryDto[]
let answers: Record<string, (() => Response)[]>
let clipboard: string[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  who = ADMIN
  calls = []
  listed = [ACTIVE, GRACE, REPLACEMENT, REVOKED, EXPIRED, GENERAL]
  answers = {}
  clipboard = []
  localStorage.clear()
  sessionStorage.clear()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (text: string) => void clipboard.push(text)) },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      const method = init?.method ?? 'GET'
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null, headers })
      const queued = answers[`${method} ${url}`]?.shift()
      if (queued) return queued()
      if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
      if (url.startsWith(CERTIFICATION_URL)) {
        return json(200, { certified: true, format: 'JSON', document_kind: 'STANDARD_INVOICE', route: 'INVOICE', reason: null })
      }
      if (url === KEYS_URL && method === 'GET') return json(200, listed)
      if (url === KEYS_URL && method === 'POST') {
        return json(201, {
          id: 'k-created', key: RAW_KEY, prefix: 'abcdefghijkl', label: 'Odoo production',
          scopes: ['invoice.submit'], expiresAt: '2027-10-07T12:00:00Z', warning: null,
          profile: 'ERP_INGESTION', replacesKeyId: null, previousKeyGraceEndsAt: null,
        })
      }
      if (url.endsWith('/rotate') && method === 'POST') {
        return json(201, {
          id: 'k-rotated', key: ROTATED_KEY, prefix: 'mnopqrstuvwx', label: 'Odoo production (rotation)',
          scopes: ['invoice.submit'], expiresAt: '2027-10-07T12:00:00Z', warning: null,
          profile: 'ERP_INGESTION', replacesKeyId: 'k-active', previousKeyGraceEndsAt: '2026-10-08T12:00:00Z',
        })
      }
      if (url.endsWith('/rotation/complete') && method === 'POST') return json(204)
      if (method === 'DELETE') return json(204)
      return json(404)
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/erp/api-push']}>
      <Routes>
        <Route path="/settings/erp/api-push" element={<ErpApiPushPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const keyReads = () => calls.filter((call) => call.url === KEYS_URL && call.method === 'GET')
const writes = () => calls.filter((call) => call.method !== 'GET')

function storageHolds(text: string): boolean {
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const name = store.key(i) ?? ''
      if (name.includes(text) || (store.getItem(name) ?? '').includes(text)) return true
    }
  }
  return false
}

async function openRowMenu(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
}

async function createKey(name = 'Odoo production') {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Create key' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: name } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
}

describe('access', () => {
  it('shows nothing and reads nothing without admin.settings.manage', async () => {
    who = { ...ADMIN, permissions: ['invoice.read'] }
    renderPage()
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull()
    expect(keyReads()).toHaveLength(0)
  })
})

describe('D: the list holds metadata only, ERP keys only', () => {
  it('shows name, status, dates and last use, never a key, and no GENERAL key', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('Odoo production').length).toBeGreaterThan(0)
    expect(within(table).queryByText('POS terminal')).toBeNull()
    expect(within(table).getAllByText('Active')).toHaveLength(2)
    expect(within(table).getByText('Being replaced')).toBeTruthy()
    expect(within(table).getByText('Revoked')).toBeTruthy()
    expect(within(table).getByText('Expired')).toBeTruthy()
    expect(within(table).getAllByText('abcdefghijkl••••9Zx1').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('SECRET-PART')
    expect(keyReads()).toHaveLength(1)
  })

  it('J: words last use for an eventually consistent value', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Recently used')).toBeTruthy()
    expect(within(table).getByText('About 3 hours ago')).toBeTruthy()
    expect(within(table).getAllByText('Not used yet').length).toBeGreaterThan(0)
    expect(screen.getByText(/updated about once a minute/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/just now/i)
  })

  it('K: shows the grace end and the replacement on a key being replaced', async () => {
    renderPage()
    const row = (await screen.findByText('Being replaced')).closest('tr') as HTMLElement
    expect(within(row).getByText(/Still works until/)).toBeTruthy()
    expect(within(row).getByText('Replaced by Odoo staging (rotation)')).toBeTruthy()
  })

  it('K: offers no action on a revoked key, and only rotation on an expired one', async () => {
    renderPage()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Actions for Old Sage' })).toBeNull()
    await openRowMenu('Legacy')
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Rotate key' })).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: 'Revoke key' })).toBeNull()
  })
})

describe('A/B/C: creating a key shows its secret once', () => {
  it('sends a whitelisted ERP_INGESTION request with an Idempotency-Key and no expiry by default', async () => {
    await createKey()
    await screen.findByText('Your new key')
    const post = writes().find((call) => call.url === KEYS_URL)
    expect(post?.body).toEqual({ label: 'Odoo production', scopes: ['invoice.submit'], profile: 'ERP_INGESTION' })
    expect(post?.headers['Idempotency-Key']).toMatch(/^api-key-create-[0-9a-f-]{36}$/)
  })

  it('shows the raw key, copies it, and keeps it nowhere once the dialog closes', async () => {
    await createKey()
    const dialog = await screen.findByRole('dialog', { name: 'Your new key' })
    expect(within(dialog).getByText(RAW_KEY)).toBeTruthy()
    expect(within(dialog).getByText(/shown only once/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy key' }))
    await within(dialog).findByText('Copied')
    expect(clipboard).toEqual([RAW_KEY])
    expect(storageHolds('SECRET-PART')).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: 'I have copied the key' }))
    await waitFor(() => expect(screen.queryByText(RAW_KEY)).toBeNull())
    expect(document.body.innerHTML).not.toContain('SECRET-PART')
    expect(storageHolds('SECRET-PART')).toBe(false)
    expect(window.location.href).not.toContain('SECRET-PART')
    // The list is read again from the server after the creation.
    await waitFor(() => expect(keyReads().length).toBeGreaterThanOrEqual(2))
  })

  it('a double click sends one request', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create key' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Odoo' } })
    const submit = within(dialog).getByRole('button', { name: 'Create key' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await screen.findByText('Your new key')
    expect(writes().filter((call) => call.url === KEYS_URL)).toHaveLength(1)
  })
})

describe('H/I: server refusals in our words', () => {
  it('H: ERP not enabled', async () => {
    answers[`POST ${KEYS_URL}`] = [() => problem(403, 'erp-entitlement-required')]
    await createKey()
    expect(await screen.findByText(/ERP is not enabled for your organisation/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('SERVER-PROSE-MARKER')
    expect(screen.queryByText('Your new key')).toBeNull()
  })

  it('I: the plan has no API access', async () => {
    answers[`POST ${KEYS_URL}`] = [() => problem(409, 'plan-limit-reached')]
    await createKey()
    expect(await screen.findByText(/Your plan does not include API access/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('SERVER-PROSE-MARKER')
  })
})

describe('E/F/G: rotation, completion and revocation', () => {
  it('E: rotation is confirmed, shows the new key once with its grace, and the old key never', async () => {
    renderPage()
    await openRowMenu('Odoo production')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rotate key' }))
    const confirm = await screen.findByRole('dialog', { name: 'Rotate Odoo production?' })
    expect(writes()).toHaveLength(0)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rotate key' }))

    const secret = await screen.findByRole('dialog', { name: 'Your replacement key' })
    expect(within(secret).getByText(ROTATED_KEY)).toBeTruthy()
    expect(within(secret).getByText(/previous key keeps working until/)).toBeTruthy()
    const rotate = writes().find((call) => call.url.endsWith('/k-active/rotate'))
    expect(rotate?.headers['Idempotency-Key']).toMatch(/^api-key-rotate-/)

    fireEvent.click(within(secret).getByRole('button', { name: 'I have copied the key' }))
    await waitFor(() => expect(screen.queryByText(ROTATED_KEY)).toBeNull())
    expect(storageHolds('ROTATED-SECRET')).toBe(false)
  })

  it('a rotation refused as a conflict says so and reloads the list', async () => {
    answers['POST /api/v1/apikeys/k-active/rotate'] = [() => problem(409, 'resource-conflict')]
    renderPage()
    await openRowMenu('Odoo production')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rotate key' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rotate key' }))
    expect(await screen.findByText(/already rotated or revoked/)).toBeTruthy()
    await waitFor(() => expect(keyReads().length).toBeGreaterThanOrEqual(2))
  })

  it('a rotation refused by a read-only subscription says so, not "already rotated or revoked"', async () => {
    answers['POST /api/v1/apikeys/k-active/rotate'] = [() => problem(409, 'subscription-restricted')]
    renderPage()
    await openRowMenu('Odoo production')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rotate key' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rotate key' }))
    expect(await screen.findByText(/Your subscription is read-only/)).toBeTruthy()
    expect(screen.queryByText(/already rotated or revoked/)).toBeNull()
    expect(screen.queryByText(/SERVER-PROSE-MARKER/)).toBeNull()
  })

  it('G: completing a rotation is confirmed, explains the old key stops now, and reloads', async () => {
    renderPage()
    await openRowMenu('Odoo staging')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Complete rotation' }))
    const confirm = await screen.findByRole('dialog', { name: 'Complete the rotation of Odoo staging?' })
    expect(within(confirm).getByText(/stops working now/)).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Complete rotation' }))
    await waitFor(() =>
      expect(writes().some((call) => call.url === '/api/v1/apikeys/k-old/rotation/complete')).toBe(true),
    )
    await waitFor(() => expect(keyReads().length).toBeGreaterThanOrEqual(2))
  })

  it('F: revocation is confirmed, says it cannot be undone, and cancelling sends nothing', async () => {
    renderPage()
    await openRowMenu('Odoo production')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke key' }))
    const confirm = await screen.findByRole('dialog', { name: 'Revoke Odoo production?' })
    expect(within(confirm).getByText(/cannot be restored/)).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes()).toHaveLength(0)

    await openRowMenu('Odoo production')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke key' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke key' }))
    await waitFor(() =>
      expect(writes().some((call) => call.method === 'DELETE' && call.url === '/api/v1/apikeys/k-active')).toBe(true),
    )
  })
})

describe('integration guide', () => {
  it('documents the headers with a valid Idempotency-Key and links to API push activity', async () => {
    renderPage()
    expect(await screen.findByText('How your ERP calls the API')).toBeTruthy()
    const sample = document.querySelector('pre')?.textContent ?? ''
    const idempotency = /Idempotency-Key: (\S+)/.exec(sample)?.[1] ?? ''
    expect(idempotency.length).toBeGreaterThanOrEqual(16)
    expect(idempotency).toMatch(/^[A-Za-z0-9._:-]+$/)
    expect(sample).toContain('X-API-Key: <your ERP ingestion key>')
    expect(sample).toContain('"external_document_id"')
    expect(sample).not.toContain('fawt_sk_')
    const activity = screen.getByRole('link', { name: 'See API push activity' })
    expect(activity.getAttribute('href')).toBe('/settings/erp/documents?channel=API_PUSH')
  })
})

describe('Arabic', () => {
  it('renders the screen in Arabic with the key identifiers left to right', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('مفاتيح استقبال ERP')).toBeTruthy()
    const masked = screen.getAllByText('abcdefghijkl••••9Zx1')[0]
    expect(masked.closest('[dir="ltr"]')).not.toBeNull()
  })
})

describe('F3: behind the company switch', () => {
  const renderGated = () =>
    render(
      <MemoryRouter initialEntries={['/settings/erp/api-push']}>
        <Routes>
          <Route path="/settings/erp/api-push" element={<ErpGated><ErpApiPushPage /></ErpGated>} />
        </Routes>
      </MemoryRouter>,
    )

  it('ERP on: the keys are listed with no ERP connection asked for', async () => {
    who = { ...ADMIN, erpEntitled: true }
    renderGated()
    expect(await screen.findByRole('table')).toBeTruthy()
    expect(calls.some((call) => call.url.includes('/erp/connections'))).toBe(false)
  })

  it('ERP off: not enabled, no key read and no Create key', async () => {
    who = { ...ADMIN, erpEntitled: false }
    renderGated()
    expect(await screen.findByText('ERP integration is not enabled')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull()
    expect(keyReads()).toHaveLength(0)
  })
})
