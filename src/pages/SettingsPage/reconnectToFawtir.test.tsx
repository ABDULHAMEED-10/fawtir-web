import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { renewalNeeded } from '../../lib/fawtirDisconnection'
import { DisconnectFromFawtirSection } from './DisconnectFromFawtirSection'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}

const PATH = '/api/v1/settings/fawtir-disconnection'
const RECONNECT = '/api/v1/settings/fawtir-reconnection'
const WITHDRAWAL = `${RECONNECT}/withdrawal`

/** A completed disconnection on 13 Oct; the paid period runs to 8 Nov. */
const DISCONNECTION = {
  path: 'ALREADY_DISCONNECTED',
  status: 'DISCONNECTED',
  origin: 'CUSTOMER',
  askedVia: null,
  requestedAt: '2026-10-12T06:00:00Z',
  portalRequestRaisedAt: null,
  approvalDueAt: null,
  approvalExpired: false,
  disconnectedAt: '2026-10-13T09:00:00Z',
  smpRemovedAt: '2026-10-13T10:00:00Z',
  notCompletedReason: null,
  closedAt: null,
  subscriptionEndsOn: '2099-11-08',
  steps: [
    {
      step: 'REQUESTED',
      statusAfter: 'REQUESTED',
      occurredAt: '2026-10-12T06:00:00Z',
      recordedAt: '2026-10-12T06:00:00Z',
      actorType: 'CUSTOMER',
    },
    {
      step: 'PORTAL_DISCONNECTION_CONFIRMED',
      statusAfter: 'DISCONNECTED',
      occurredAt: '2026-10-13T09:00:00Z',
      recordedAt: '2026-10-13T09:00:00Z',
      actorType: 'OPERATOR',
    },
  ],
}

const LEFT = {
  companyName: 'Real Trading LLC',
  connected: false,
  canRequest: false,
  canWithdraw: false,
  canReconnect: true,
  reconnection: null,
  request: DISCONNECTION,
}

const reconnection = (extra: Record<string, unknown> = {}) => ({
  status: 'REQUESTED',
  origin: 'CUSTOMER',
  requestedAt: '2026-10-15T06:00:00Z',
  acceptedAt: null,
  effectiveFrom: null,
  effectiveDue: false,
  connectedAt: null,
  smpAddedAt: null,
  notCompletedReason: null,
  closedAt: null,
  steps: [
    {
      step: 'REQUESTED',
      statusAfter: 'REQUESTED',
      occurredAt: '2026-10-15T06:00:00Z',
      recordedAt: '2026-10-15T06:00:00Z',
      actorType: 'CUSTOMER',
    },
  ],
  ...extra,
})

const REQUESTED = { ...LEFT, canReconnect: false, reconnection: reconnection() }

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  answers = { [PATH]: () => json(200, LEFT) }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSection() {
  return render(
    <MemoryRouter>
      <DisconnectFromFawtirSection />
    </MemoryRouter>,
  )
}

function zone() {
  return screen.getByRole('region', { name: i18n.t('fawtirDisconnection.dangerZone') })
}

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
}

describe('Settings › Company profile: coming back to Fawtir', () => {
  it('shows nothing about coming back while reconnecting is switched off', async () => {
    answers[PATH] = () => json(200, { ...LEFT, canReconnect: false })
    renderSection()
    expect(
      await screen.findByText(
        i18n.t('fawtirDisconnection.line.disconnected', { date: '13 Oct 2026' }),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(i18n.t('fawtirReconnection.title'))).toBeNull()
    expect(within(zone()).queryAllByRole('button')).toHaveLength(0)
  })

  it('gives the three steps and sends the confirmation only once ticked', async () => {
    answers[`POST ${RECONNECT}`] = () => json(200, REQUESTED)
    const user = userEvent.setup()
    renderSection()

    expect(await screen.findByText(i18n.t('fawtirReconnection.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtirReconnection.how.portal'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtirReconnection.how.tellUs'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtirReconnection.how.accept'))).toBeTruthy()
    const tell = screen.getByRole('button', {
      name: i18n.t('fawtirReconnection.tell'),
    }) as HTMLButtonElement
    expect(tell.disabled).toBe(true)
    await user.click(screen.getByRole('checkbox', { name: i18n.t('fawtirReconnection.confirm') }))
    await user.click(tell)

    await waitFor(() => expect(writes()).toHaveLength(1))
    const [url, init] = writes()[0]
    expect(url).toBe(RECONNECT)
    expect(JSON.parse(String(init?.body))).toEqual({ confirmed: true })
    expect(await screen.findByText(i18n.t('fawtirReconnection.status.REQUESTED'))).toBeTruthy()
    expect(
      screen.getByText(i18n.t('fawtirReconnection.line.requested', { date: '15 Oct 2026' })),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('fawtirReconnection.tell') })).toBeNull()
  })

  it('withdraws a request Fawtir has not accepted yet', async () => {
    answers[PATH] = () => json(200, REQUESTED)
    answers[`POST ${WITHDRAWAL}`] = () =>
      json(200, {
        ...LEFT,
        reconnection: reconnection({ status: 'WITHDRAWN', closedAt: '2026-10-16T06:00:00Z' }),
      })
    const user = userEvent.setup()
    renderSection()

    await user.click(
      await screen.findByRole('button', { name: i18n.t('fawtirReconnection.withdraw') }),
    )
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0][0]).toBe(WITHDRAWAL)
    expect(
      await screen.findByText(i18n.t('fawtirReconnection.line.withdrawn', { date: '16 Oct 2026' })),
    ).toBeTruthy()
    // Withdrawn, the company may tell Fawtir again.
    expect(
      screen.getByRole('button', { name: i18n.t('fawtirReconnection.tellAgain') }),
    ).toBeTruthy()
  })

  it('shows the effective date once accepted, and offers no withdrawal', async () => {
    answers[PATH] = () =>
      json(200, {
        ...REQUESTED,
        reconnection: reconnection({
          status: 'ACCEPTED',
          acceptedAt: '2026-10-16T06:00:00Z',
          effectiveFrom: '2026-10-20T06:00:00Z',
        }),
      })
    renderSection()
    expect(
      await screen.findByText(i18n.t('fawtirReconnection.line.accepted', { date: '20 Oct 2026' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtirReconnection.acceptedNote'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('fawtirReconnection.withdraw') })).toBeNull()
  })

  it('reads an accepted connection whose date has come as connected', async () => {
    answers[PATH] = () =>
      json(200, {
        ...REQUESTED,
        reconnection: reconnection({
          status: 'ACCEPTED',
          acceptedAt: '2026-10-16T06:00:00Z',
          effectiveFrom: '2026-10-16T06:00:00Z',
          effectiveDue: true,
        }),
      })
    renderSection()
    expect(
      await screen.findByText(i18n.t('fawtirReconnection.line.connected', { date: '16 Oct 2026' })),
    ).toBeTruthy()
  })

  it('once connected again, keeps the disconnection as history and offers to disconnect again (CA-6)', async () => {
    answers[PATH] = () =>
      json(200, {
        ...LEFT,
        connected: true,
        canRequest: true,
        canReconnect: false,
        reconnection: reconnection({
          status: 'CONNECTED',
          acceptedAt: '2026-10-16T06:00:00Z',
          effectiveFrom: '2026-10-16T06:00:00Z',
          connectedAt: '2026-10-16T06:00:00Z',
        }),
      })
    renderSection()
    expect(
      await screen.findByText(i18n.t('fawtirReconnection.line.connected', { date: '16 Oct 2026' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtirReconnection.carriesOn'))).toBeTruthy()
    // "Nothing is sent any more" is no longer true once back.
    expect(screen.queryByText(i18n.t('fawtirDisconnection.after.nothingSent'))).toBeNull()
    expect(
      screen.getByRole('button', { name: i18n.t('fawtirDisconnection.requestAgain') }),
    ).toBeTruthy()
  })

  it('after the paid period ended, points to Plan to renew', async () => {
    answers[PATH] = () =>
      json(200, {
        ...LEFT,
        connected: true,
        canRequest: true,
        canReconnect: false,
        request: { ...DISCONNECTION, subscriptionEndsOn: '2026-10-01' },
        reconnection: reconnection({ status: 'CONNECTED', connectedAt: '2026-10-16T06:00:00Z' }),
      })
    renderSection()
    const link = await screen.findByRole('link', { name: i18n.t('fawtirReconnection.renewLink') })
    expect(link.getAttribute('href')).toBe('/settings/plan')
  })

  it('words why a request was not completed, without the operator reason', async () => {
    answers[PATH] = () =>
      json(200, {
        ...LEFT,
        reconnection: reconnection({
          status: 'NOT_COMPLETED',
          notCompletedReason: 'DECLINED',
          closedAt: '2026-10-16T06:00:00Z',
        }),
      })
    renderSection()
    expect(
      await screen.findByText(i18n.t('fawtirReconnection.line.declined', { date: '16 Oct 2026' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtirReconnection.step.REQUESTED'))).toBeTruthy()
    expect(
      screen.getByRole('button', { name: i18n.t('fawtirReconnection.tellAgain') }),
    ).toBeTruthy()
  })

  it('ignores a reconnection from an earlier departure', async () => {
    answers[PATH] = () =>
      json(200, {
        ...LEFT,
        reconnection: reconnection({
          status: 'CONNECTED',
          requestedAt: '2026-08-01T06:00:00Z',
          connectedAt: '2026-08-02T06:00:00Z',
        }),
      })
    renderSection()
    expect(await screen.findByText(i18n.t('fawtirReconnection.title'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('fawtirReconnection.status.CONNECTED'))).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('fawtirReconnection.tell') })).toBeTruthy()
  })

  it('words a refusal instead of showing the server text, and reads the status again', async () => {
    let reads = 0
    answers[PATH] = () => {
      reads += 1
      return json(200, reads > 1 ? { ...LEFT, canReconnect: false } : LEFT)
    }
    answers[`POST ${RECONNECT}`] = () =>
      json(409, {
        type: '/problems/reconnection-not-open',
        status: 409,
        detail: 'Reconnecting is switched off',
      })
    const user = userEvent.setup()
    renderSection()

    await user.click(
      await screen.findByRole('checkbox', { name: i18n.t('fawtirReconnection.confirm') }),
    )
    await user.click(screen.getByRole('button', { name: i18n.t('fawtirReconnection.tell') }))
    await waitFor(() => expect(reads).toBe(2))
    expect(await screen.findByText(i18n.t('fawtirReconnection.error.notOpen'))).toBeTruthy()
    expect(screen.queryByText(/switched off/)).toBeNull()
  })

  it('knows when the paid period has run out, in Muscat', () => {
    const request = { ...DISCONNECTION, subscriptionEndsOn: '2026-10-16' } as Parameters<
      typeof renewalNeeded
    >[0]
    expect(renewalNeeded(request, new Date('2026-10-16T19:00:00Z'))).toBe(false)
    // 20:00 UTC is already 17 Oct in Muscat.
    expect(renewalNeeded(request, new Date('2026-10-16T20:00:00Z'))).toBe(true)
  })

  it('has every string in Arabic', async () => {
    await i18n.changeLanguage('ar')
    answers[PATH] = () => json(200, REQUESTED)
    renderSection()
    expect(await screen.findByText(i18n.t('fawtirReconnection.status.REQUESTED'))).toBeTruthy()
    expect(zone().textContent).not.toMatch(/fawtirReconnection\.|[A-Z]{2,}_[A-Z]/)
    expect(zone().textContent).toMatch(/العودة إلى فوتر/)
  })
})
