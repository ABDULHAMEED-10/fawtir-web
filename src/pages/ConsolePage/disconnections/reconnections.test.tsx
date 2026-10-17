import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import {
  reconnectionStepsOffered,
  type PlatformReconnectionDto,
} from '../../../lib/console/fawtirReconnections'
import { ConsoleDisconnectionsPage } from './ConsoleDisconnectionsPage'
import { TenantDisconnectionCard } from './TenantDisconnectionCard'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const DISCONNECTION_QUEUE = '/api/v1/platform/fawtir-disconnections?openOnly=true'
const QUEUE_OPEN = '/api/v1/platform/fawtir-reconnections?openOnly=true'
const QUEUE_ALL = '/api/v1/platform/fawtir-reconnections?openOnly=false'
const DETAIL = '/api/v1/platform/fawtir-reconnections/r-1'
const STEPS = '/api/v1/platform/fawtir-reconnections/r-1/steps'
const COMPANY_DISCONNECTIONS = '/api/v1/platform/companies/t-1/fawtir-disconnections'
const COMPANY_RECONNECTIONS = '/api/v1/platform/companies/t-1/fawtir-reconnections'

const SUPPORT: Entitlements = {
  userId: 'u-support',
  username: 'support',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true }],
  permissions: ['platform.smp.operations.review', 'platform.smp.operations.manage'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...SUPPORT, permissions: ['platform.smp.operations.review'] }

function reconnection(over: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    tenantId: 't-1',
    disconnectionId: 'd-1',
    status: 'REQUESTED',
    origin: 'CUSTOMER',
    requestedAt: '2026-10-14T06:00:00Z',
    requestedBy: 'u-owner',
    askedByName: null,
    askedVia: null,
    askedAt: null,
    note: null,
    acceptedAt: null,
    effectiveFrom: null,
    connectedAt: null,
    smpAddDueAt: null,
    smpAddedAt: null,
    notCompletedReason: null,
    declineReason: null,
    closedAt: null,
    subscriptionResumed: false,
    version: 0,
    ...over,
  }
}

function detail(
  over: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): PlatformReconnectionDto {
  return {
    request: reconnection(over),
    nextAction: 'ACCEPT_ON_PORTAL',
    dueAt: null,
    overdue: false,
    effectiveDue: false,
    steps: [
      {
        id: 'rs-1',
        step: 'REQUESTED',
        statusAfter: 'REQUESTED',
        occurredAt: '2026-10-14T06:00:00Z',
        recordedAt: '2026-10-14T06:00:00Z',
        actorId: 'u-owner',
        actorType: 'CUSTOMER',
        reference: null,
        note: null,
      },
    ],
    ...extra,
  } as PlatformReconnectionDto
}

const ROW = {
  id: 'r-1',
  tenantId: 't-1',
  companyName: 'Salalah Ice Factory',
  status: 'CONNECTED',
  origin: 'CUSTOMER',
  requestedAt: '2026-10-10T06:00:00Z',
  nextAction: 'ADD_TO_SMP',
  dueAt: '2026-10-14T06:00:00Z',
  overdue: true,
  effectiveDue: false,
}

/** A completed disconnection of the company's, as the tenant card reads it. */
function left(over: Record<string, unknown> = {}) {
  return {
    request: {
      id: 'd-1',
      tenantId: 't-1',
      path: 'ALREADY_DISCONNECTED',
      status: 'DISCONNECTED',
      origin: 'CUSTOMER',
      requestedAt: '2026-09-01T06:00:00Z',
      requestedBy: 'u-owner',
      askedByName: null,
      askedVia: null,
      askedAt: null,
      reason: null,
      confirmedCompanyName: 'Salalah Ice Factory',
      portalRequestRaisedAt: null,
      approvalDueAt: null,
      disconnectedAt: '2026-09-02T06:00:00Z',
      smpRemovalDueAt: '2026-09-03T06:00:00Z',
      smpRemovedAt: '2026-09-02T08:00:00Z',
      notCompletedReason: null,
      closedAt: null,
      portalWithdrawnAt: null,
      subscriptionEndsOn: '2026-10-31',
      reconnectedAt: null,
      reconnectionId: null,
      subscriptionCancelled: true,
      version: 2,
      ...over,
    },
    nextAction: 'NONE',
    dueAt: null,
    overdue: false,
    approvalExpired: false,
    steps: [],
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  who = SUPPORT
  answers = {}
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderQueue(path = '/console/disconnections?view=reconnections') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/disconnections" element={<ConsoleDisconnectionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderCard() {
  return render(
    <MemoryRouter>
      <TenantDisconnectionCard tenantId="t-1" />
    </MemoryRouter>,
  )
}

function bodiesTo(url: string) {
  return fetchMock.mock.calls
    .filter(([called, init]) => called === url && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)))
}

const timeBox = (label: string) => ({
  name: i18n.t('console.disconnections.moment.time', { label }),
})

describe('Console › Disconnections › Reconnections', () => {
  it('switches to the reconnection queue and lists the SMP add with its overdue deadline (FC-1)', async () => {
    answers[DISCONNECTION_QUEUE] = () => json(200, [])
    answers[QUEUE_OPEN] = () => json(200, [ROW])
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections')

    expect(await screen.findByText(i18n.t('console.disconnections.emptyOpen'))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('console.reconnections.tab') }))

    expect(await screen.findByText('Salalah Ice Factory')).toBeTruthy()
    expect(screen.getByText(i18n.t('console.reconnections.status.CONNECTED'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.reconnections.next.ADD_TO_SMP'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.disconnections.overdue'))).toBeTruthy()
    expect(screen.queryByText('ADD_TO_SMP')).toBeNull()

    answers[QUEUE_ALL] = () => json(200, [])
    await user.click(screen.getByRole('button', { name: i18n.t('console.disconnections.tab.all') }))
    expect(await screen.findByText(i18n.t('console.reconnections.empty'))).toBeTruthy()
  })

  it('offers only the steps that can follow where the request stands', () => {
    expect(reconnectionStepsOffered(detail())).toEqual([
      'PORTAL_CONNECTION_ACCEPTED',
      'PORTAL_REQUEST_NOT_FOUND',
      'CONNECTION_DECLINED',
      'WITHDRAWN',
    ])
    expect(reconnectionStepsOffered(detail({ status: 'ACCEPTED' }))).toEqual(['SMP_ADDED'])
    expect(reconnectionStepsOffered(detail({ status: 'CONNECTED' }))).toEqual(['SMP_ADDED'])
    expect(
      reconnectionStepsOffered(detail({ status: 'CONNECTED', smpAddedAt: '2026-10-15T06:00:00Z' })),
    ).toEqual([])
    expect(reconnectionStepsOffered(detail({ status: 'NOT_COMPLETED' }))).toEqual([])
    expect(reconnectionStepsOffered(detail({ status: 'WITHDRAWN' }))).toEqual([])
  })

  it('records the acceptance with the effective date the company chose, in Oman time', async () => {
    answers[QUEUE_OPEN] = () => json(200, [])
    let accepted = false
    answers[DETAIL] = () =>
      json(
        200,
        accepted
          ? detail(
              {
                status: 'ACCEPTED',
                acceptedAt: '2026-10-15T05:00:00Z',
                effectiveFrom: '2026-10-20T04:00:00Z',
                smpAddDueAt: '2026-10-20T05:00:00Z',
                version: 1,
              },
              { nextAction: 'ADD_TO_SMP', dueAt: '2026-10-20T05:00:00Z' },
            )
          : detail(),
      )
    answers[`POST ${STEPS}`] = () => {
      accepted = true
      return json(200, detail({ status: 'ACCEPTED', version: 1 }))
    }
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections?view=reconnections&open=r-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.reconnections.panelTitle') }),
    )
    expect(panel.getByText(i18n.t('console.reconnections.next.ACCEPT_ON_PORTAL'))).toBeTruthy()
    expect(panel.getByText(i18n.t('console.reconnections.form.effectiveFrom'))).toBeTruthy()
    await user.type(
      panel.getByRole('textbox', timeBox(i18n.t('console.disconnections.form.occurredAt'))),
      '09:00',
    )
    // The effective date left empty: the acceptance takes effect at once.
    await user.click(
      panel.getByRole('button', { name: i18n.t('console.disconnections.form.record') }),
    )

    await waitFor(() => expect(bodiesTo(STEPS)).toHaveLength(1))
    const [sent] = bodiesTo(STEPS)
    expect(sent.step).toBe('PORTAL_CONNECTION_ACCEPTED')
    expect(sent.occurredAt).toMatch(/T05:00:00\.000Z$/)
    expect(sent.effectiveFrom).toBeUndefined()
    expect(sent.declineReason).toBeUndefined()
    expect(await screen.findByText(i18n.t('console.reconnections.next.ADD_TO_SMP'))).toBeTruthy()
    // The SMP add itself is not a console action: the screen says it only records it.
    expect(screen.getByText(i18n.t('console.reconnections.smpOutside'))).toBeTruthy()
  })

  it('needs a reason to decline, and sends it', async () => {
    answers[QUEUE_OPEN] = () => json(200, [])
    answers[DETAIL] = () => json(200, detail())
    answers[`POST ${STEPS}`] = () =>
      json(200, detail({ status: 'NOT_COMPLETED', notCompletedReason: 'DECLINED' }))
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections?view=reconnections&open=r-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.reconnections.panelTitle') }),
    )
    await user.click(
      panel.getByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    )
    await user.click(
      screen.getByRole('option', {
        name: i18n.t('console.reconnections.record.CONNECTION_DECLINED'),
      }),
    )
    await user.type(
      panel.getByRole('textbox', timeBox(i18n.t('console.disconnections.form.occurredAt'))),
      '10:15',
    )
    const record = panel.getByRole('button', { name: i18n.t('console.disconnections.form.record') })
    expect((record as HTMLButtonElement).disabled).toBe(true)
    await user.type(
      panel.getByLabelText(i18n.t('console.reconnections.form.declineReason')),
      'Fraud case 12',
    )
    await user.click(record)
    await waitFor(() => expect(bodiesTo(STEPS)).toHaveLength(1))
    expect(bodiesTo(STEPS)[0]).toMatchObject({
      step: 'CONNECTION_DECLINED',
      declineReason: 'Fraud case 12',
    })
  })

  it('says a refused step in our words', async () => {
    answers[QUEUE_OPEN] = () => json(200, [])
    answers[DETAIL] = () => json(200, detail())
    answers[`POST ${STEPS}`] = () =>
      json(409, {
        type: '/problems/reconnection-state-conflict',
        status: 409,
        detail: 'Only a reconnection request waiting for Fawtir can be accepted',
      })
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections?view=reconnections&open=r-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.reconnections.panelTitle') }),
    )
    await user.type(
      panel.getByRole('textbox', timeBox(i18n.t('console.disconnections.form.occurredAt'))),
      '08:00',
    )
    await user.click(
      panel.getByRole('button', { name: i18n.t('console.disconnections.form.record') }),
    )
    expect(
      await screen.findByText(i18n.t('console.reconnections.refusal.reconnection-state-conflict')),
    ).toBeTruthy()
    expect(screen.queryByText(/waiting for Fawtir can be accepted/)).toBeNull()
  })

  it('hides recording from a reader', async () => {
    who = READER
    answers[QUEUE_OPEN] = () => json(200, [])
    answers[DETAIL] = () => json(200, detail())
    renderQueue('/console/disconnections?view=reconnections&open=r-1')

    await screen.findByRole('region', { name: i18n.t('console.reconnections.panelTitle') })
    expect(screen.queryByText(i18n.t('console.disconnections.form.title'))).toBeNull()
  })
})

describe('Console › Tenant: coming back to Fawtir', () => {
  it('starts a reconnection from a connect request seen on the portal, with no name needed', async () => {
    answers[COMPANY_DISCONNECTIONS] = () => json(200, [left()])
    let started = false
    answers[COMPANY_RECONNECTIONS] = () =>
      json(200, started ? [detail({ origin: 'CONSOLE', askedVia: 'PORTAL_NOTICE' })] : [])
    answers[`POST ${COMPANY_RECONNECTIONS}`] = () => {
      started = true
      return json(200, detail({ origin: 'CONSOLE', askedVia: 'PORTAL_NOTICE' }))
    }
    const user = userEvent.setup({ delay: null })
    renderCard()

    expect(await screen.findByText(i18n.t('console.reconnections.card.none'))).toBeTruthy()
    // The company has left: it cannot be asked to leave again.
    expect(
      screen.queryByRole('button', { name: i18n.t('console.disconnections.card.start') }),
    ).toBeNull()
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.reconnections.card.start') }),
    )
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.reconnections.start.via') }),
    )
    await user.click(
      screen.getByRole('option', { name: i18n.t('console.reconnections.via.PORTAL_NOTICE') }),
    )
    await user.type(
      screen.getByRole('textbox', timeBox(i18n.t('console.reconnections.start.seenAt'))),
      '11:00',
    )
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.reconnections.start.submit') }),
    )

    await waitFor(() => expect(bodiesTo(COMPANY_RECONNECTIONS)).toHaveLength(1))
    const [sent] = bodiesTo(COMPANY_RECONNECTIONS)
    expect(sent).toMatchObject({ askedVia: 'PORTAL_NOTICE', askedByName: null, note: null })
    expect(sent.askedAt).toMatch(/T07:00:00\.000Z$/)
    expect(await screen.findByText(i18n.t('console.reconnections.card.started'))).toBeTruthy()
    expect(
      await screen.findByText(i18n.t('console.reconnections.next.ACCEPT_ON_PORTAL')),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('console.reconnections.card.start') }),
    ).toBeNull()
  })

  it('says when reconnecting is switched off', async () => {
    answers[COMPANY_DISCONNECTIONS] = () => json(200, [left()])
    answers[COMPANY_RECONNECTIONS] = () => json(200, [])
    answers[`POST ${COMPANY_RECONNECTIONS}`] = () =>
      json(409, { type: '/problems/reconnection-not-open', status: 409 })
    const user = userEvent.setup({ delay: null })
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: i18n.t('console.reconnections.card.start') }),
    )
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.reconnections.start.via') }),
    )
    await user.click(screen.getByRole('option', { name: i18n.t('console.reconnections.via.CALL') }))
    await user.type(screen.getByLabelText(i18n.t('console.disconnections.start.askedBy')), 'Huda')
    await user.type(
      screen.getByRole('textbox', timeBox(i18n.t('console.disconnections.start.askedAt'))),
      '11:00',
    )
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.reconnections.start.submit') }),
    )
    expect(
      await screen.findByText(i18n.t('console.reconnections.refusal.reconnection-not-open')),
    ).toBeTruthy()
  })

  it('once reconnected, offers a new disconnection and shows the reconnection of this departure only', async () => {
    answers[COMPANY_DISCONNECTIONS] = () =>
      json(200, [left({ reconnectedAt: '2026-10-15T05:00:00Z', reconnectionId: 'r-1' })])
    answers[COMPANY_RECONNECTIONS] = () =>
      json(200, [
        detail(
          {
            status: 'CONNECTED',
            connectedAt: '2026-10-15T05:00:00Z',
            smpAddedAt: '2026-10-15T07:00:00Z',
          },
          { nextAction: 'NONE' },
        ),
        detail({ id: 'r-0', disconnectionId: 'd-0', status: 'WITHDRAWN' }, { nextAction: 'NONE' }),
      ])
    renderCard()

    expect(await screen.findByText(i18n.t('console.reconnections.status.CONNECTED'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.reconnections.status.WITHDRAWN'))).toBeNull()
    expect(
      screen.getByRole('button', { name: i18n.t('console.disconnections.card.start') }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('console.reconnections.card.start') }),
    ).toBeNull()
  })

  it('hides starting from a reader', async () => {
    who = READER
    answers[COMPANY_DISCONNECTIONS] = () => json(200, [left()])
    answers[COMPANY_RECONNECTIONS] = () => json(200, [])
    renderCard()

    expect(await screen.findByText(i18n.t('console.reconnections.card.none'))).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('console.reconnections.card.start') }),
    ).toBeNull()
  })
})
