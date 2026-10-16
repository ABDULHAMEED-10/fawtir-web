import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import {
  stepsOffered,
  type PlatformDisconnectionDto,
} from '../../../lib/console/fawtirDisconnections'
import { ConsoleDisconnectionsPage } from './ConsoleDisconnectionsPage'
import { TenantDisconnectionCard } from './TenantDisconnectionCard'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const QUEUE_OPEN = '/api/v1/platform/fawtir-disconnections?openOnly=true'
const QUEUE_ALL = '/api/v1/platform/fawtir-disconnections?openOnly=false'
const DETAIL = '/api/v1/platform/fawtir-disconnections/d-1'
const STEPS = '/api/v1/platform/fawtir-disconnections/d-1/steps'
const COMPANY = '/api/v1/platform/companies/t-1/fawtir-disconnections'

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

function request(over: Record<string, unknown> = {}) {
  return {
    id: 'd-1',
    tenantId: 't-1',
    path: 'ASK_FAWTIR',
    status: 'REQUESTED',
    origin: 'CUSTOMER',
    requestedAt: '2026-10-14T06:00:00Z',
    requestedBy: 'u-owner',
    askedByName: null,
    askedVia: null,
    askedAt: null,
    reason: null,
    confirmedCompanyName: 'Muscat Print House LLC',
    portalRequestRaisedAt: null,
    approvalDueAt: null,
    disconnectedAt: null,
    smpRemovalDueAt: null,
    smpRemovedAt: null,
    notCompletedReason: null,
    closedAt: null,
    portalWithdrawnAt: null,
    subscriptionEndsOn: null,
    version: 0,
    ...over,
  }
}

function detail(
  over: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): PlatformDisconnectionDto {
  return {
    request: request(over),
    nextAction: 'RAISE_PORTAL_REQUEST',
    dueAt: null,
    overdue: false,
    approvalExpired: false,
    steps: [
      {
        id: 's-1',
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
  } as PlatformDisconnectionDto
}

const ROW = {
  id: 'd-1',
  tenantId: 't-1',
  companyName: 'Muscat Print House LLC',
  path: 'ALREADY_DISCONNECTED',
  status: 'DISCONNECTED',
  origin: 'CUSTOMER',
  requestedAt: '2026-10-14T06:00:00Z',
  nextAction: 'REMOVE_FROM_SMP',
  dueAt: '2026-10-15T06:00:00Z',
  overdue: true,
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderQueue(path = '/console/disconnections') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/disconnections" element={<ConsoleDisconnectionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function bodiesTo(url: string) {
  return fetchMock.mock.calls
    .filter(([called, init]) => called === url && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)))
}

describe('Console › Disconnections', () => {
  it('lists each request in words, with what support does next and the overdue deadline (FC-1)', async () => {
    answers[QUEUE_OPEN] = () => json(200, [ROW])
    renderQueue()

    expect(await screen.findByText('Muscat Print House LLC')).toBeTruthy()
    expect(
      screen.getByText(i18n.t('console.disconnections.path.ALREADY_DISCONNECTED')),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('console.disconnections.next.REMOVE_FROM_SMP'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.disconnections.overdue'))).toBeTruthy()
    expect(screen.queryByText('REMOVE_FROM_SMP')).toBeNull()

    answers[QUEUE_ALL] = () => json(200, [])
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('console.disconnections.tab.all') }))
    expect(await screen.findByText(i18n.t('console.disconnections.empty'))).toBeTruthy()
  })

  it('records the step support took, at the Oman time typed, and reads the request again (LV-3, LV-7)', async () => {
    answers[QUEUE_OPEN] = () =>
      json(200, [
        {
          ...ROW,
          path: 'ASK_FAWTIR',
          status: 'REQUESTED',
          nextAction: 'RAISE_PORTAL_REQUEST',
          dueAt: null,
          overdue: false,
        },
      ])
    let raised = false
    answers[DETAIL] = () =>
      json(
        200,
        raised
          ? detail(
              {
                status: 'WAITING_FOR_CUSTOMER_APPROVAL',
                portalRequestRaisedAt: '2026-10-14T05:30:00Z',
                approvalDueAt: '2026-10-17T05:30:00Z',
                version: 1,
              },
              { nextAction: 'AWAIT_CUSTOMER_APPROVAL', dueAt: '2026-10-17T05:30:00Z' },
            )
          : detail(),
      )
    answers[`POST ${STEPS}`] = () => {
      raised = true
      return json(200, detail({ status: 'WAITING_FOR_CUSTOMER_APPROVAL', version: 1 }))
    }
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections?open=d-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.disconnections.path.ASK_FAWTIR') }),
    )
    expect(panel.getByText(i18n.t('console.disconnections.next.RAISE_PORTAL_REQUEST'))).toBeTruthy()
    // Only what can follow a request support has not raised yet.
    await user.click(
      panel.getByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    )
    const offered = screen.getAllByRole('option').map((option) => option.textContent)
    expect(offered).toEqual([
      i18n.t('console.disconnections.record.PORTAL_REQUEST_RAISED'),
      i18n.t('console.disconnections.record.WITHDRAWN'),
    ])
    await user.click(
      screen.getByRole('option', {
        name: i18n.t('console.disconnections.record.PORTAL_REQUEST_RAISED'),
      }),
    )

    const record = panel.getByRole('button', { name: i18n.t('console.disconnections.form.record') })
    expect((record as HTMLButtonElement).disabled).toBe(true)
    await user.type(
      panel.getByRole('textbox', {
        name: i18n.t('console.disconnections.moment.time', {
          label: i18n.t('console.disconnections.form.occurredAt'),
        }),
      }),
      '09:30',
    )
    await user.type(
      panel.getByLabelText(i18n.t('console.disconnections.form.reference')),
      'FTR-DIS-77',
    )
    await user.click(record)

    await waitFor(() => expect(bodiesTo(STEPS)).toHaveLength(1))
    const [sent] = bodiesTo(STEPS)
    expect(sent.step).toBe('PORTAL_REQUEST_RAISED')
    expect(sent.reference).toBe('FTR-DIS-77')
    expect(sent.note).toBeNull()
    // 09:30 in Muscat is 05:30 UTC, whatever zone the browser runs in.
    expect(sent.occurredAt).toMatch(/T05:30:00\.000Z$/)
    expect(
      await screen.findByText(
        i18n.t('console.disconnections.recorded', {
          step: i18n.t('console.disconnections.step.PORTAL_REQUEST_RAISED'),
        }),
      ),
    ).toBeTruthy()
    expect(
      await screen.findByText(i18n.t('console.disconnections.next.AWAIT_CUSTOMER_APPROVAL')),
    ).toBeTruthy()
  })

  it("offers only the expiry once the customer's 3 days have run out (FC-4)", async () => {
    answers[QUEUE_OPEN] = () => json(200, [])
    answers[DETAIL] = () =>
      json(
        200,
        detail(
          {
            status: 'WAITING_FOR_CUSTOMER_APPROVAL',
            portalRequestRaisedAt: '2026-10-10T05:00:00Z',
            approvalDueAt: '2026-10-13T05:00:00Z',
          },
          {
            nextAction: 'AWAIT_CUSTOMER_APPROVAL',
            dueAt: '2026-10-13T05:00:00Z',
            overdue: true,
            approvalExpired: true,
          },
        ),
      )
    answers[`POST ${STEPS}`] = () =>
      json(
        200,
        detail({ status: 'NOT_COMPLETED', notCompletedReason: 'EXPIRED' }, { nextAction: 'NONE' }),
      )
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections?open=d-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.disconnections.path.ASK_FAWTIR') }),
    )
    expect(panel.getByText(i18n.t('console.disconnections.approvalLapsed'))).toBeTruthy()
    // An expiry carries no date of its own: no time to type, the button is ready.
    expect(panel.queryByText(i18n.t('console.disconnections.form.occurredAt'))).toBeNull()
    await user.click(
      panel.getByRole('button', { name: i18n.t('console.disconnections.form.record') }),
    )
    await waitFor(() => expect(bodiesTo(STEPS)).toHaveLength(1))
    expect(bodiesTo(STEPS)[0].step).toBe('REQUEST_EXPIRED')
  })

  it('says a refused step in our words and shows the request as it now stands', async () => {
    answers[QUEUE_OPEN] = () => json(200, [])
    answers[DETAIL] = () =>
      json(200, detail({ path: 'ALREADY_DISCONNECTED' }, { nextAction: 'CONFIRM_ON_PORTAL' }))
    answers[`POST ${STEPS}`] = () =>
      json(409, {
        type: '/problems/disconnection-state-conflict',
        status: 409,
        detail: 'Only a company that said it had already left can be found still connected',
      })
    const user = userEvent.setup({ delay: null })
    renderQueue('/console/disconnections?open=d-1')

    const panel = within(
      await screen.findByRole('region', {
        name: i18n.t('console.disconnections.path.ALREADY_DISCONNECTED'),
      }),
    )
    await user.type(
      panel.getByRole('textbox', {
        name: i18n.t('console.disconnections.moment.time', {
          label: i18n.t('console.disconnections.form.occurredAt'),
        }),
      }),
      '08:00',
    )
    await user.click(
      panel.getByRole('button', { name: i18n.t('console.disconnections.form.record') }),
    )

    expect(
      await screen.findByText(
        i18n.t('console.disconnections.refusal.disconnection-state-conflict'),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/can be found still connected/)).toBeNull()
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === DETAIL).length).toBeGreaterThan(1),
    )
  })

  it('shows a reader the request and its steps, and no form', async () => {
    who = READER
    answers[QUEUE_OPEN] = () => json(200, [])
    answers[DETAIL] = () => json(200, detail())
    renderQueue('/console/disconnections?open=d-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.disconnections.path.ASK_FAWTIR') }),
    )
    const history = within(panel.getByRole('list'))
    expect(history.getByText(i18n.t('console.disconnections.step.REQUESTED'))).toBeTruthy()
    expect(history.getByText(i18n.t('console.disconnections.actor.CUSTOMER'))).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.disconnections.form.record') }),
    ).toBeNull()
  })
})

describe('Console › Company page: Disconnect from Fawtir', () => {
  function renderCard() {
    return render(
      <MemoryRouter>
        <TenantDisconnectionCard tenantId="t-1" />
      </MemoryRouter>,
    )
  }

  it("starts one only on a customer's request, with who asked, how, when and why (LV-2)", async () => {
    let started = false
    answers[COMPANY] = () => json(200, started ? [detail({ origin: 'CONSOLE' })] : [])
    answers[`POST ${COMPANY}`] = () => {
      started = true
      return json(200, detail({ origin: 'CONSOLE' }))
    }
    const user = userEvent.setup({ delay: null })
    renderCard()

    expect(await screen.findByText(i18n.t('console.disconnections.card.none'))).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.disconnections.card.start') }),
    )
    expect(screen.getByText(i18n.t('console.disconnections.start.note'))).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: i18n.t('console.disconnections.start.path') }),
    )
    await user.click(
      screen.getByRole('option', { name: i18n.t('console.disconnections.path.ASK_FAWTIR') }),
    )
    // A Tax Authority notice says a company has left; it is never a request to leave.
    await user.click(
      screen.getByRole('button', { name: i18n.t('console.disconnections.start.via') }),
    )
    expect(
      screen.queryByRole('option', {
        name: i18n.t('console.disconnections.via.TAX_AUTHORITY_NOTICE'),
      }),
    ).toBeNull()
    await user.click(
      screen.getByRole('option', { name: i18n.t('console.disconnections.via.CALL') }),
    )

    const submit = screen.getByRole('button', {
      name: i18n.t('console.disconnections.start.submit'),
    })
    await user.type(
      screen.getByLabelText(i18n.t('console.disconnections.start.askedBy')),
      'Salim Al Kindi',
    )
    await user.type(
      screen.getByRole('textbox', {
        name: i18n.t('console.disconnections.moment.time', {
          label: i18n.t('console.disconnections.start.askedAt'),
        }),
      }),
      '10:15',
    )
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    await user.type(
      screen.getByLabelText(i18n.t('console.disconnections.start.reason')),
      'Moving to the group provider',
    )
    await user.click(submit)

    await waitFor(() => expect(bodiesTo(COMPANY)).toHaveLength(1))
    const [sent] = bodiesTo(COMPANY)
    expect(sent).toMatchObject({
      path: 'ASK_FAWTIR',
      askedVia: 'CALL',
      askedByName: 'Salim Al Kindi',
      reason: 'Moving to the group provider',
    })
    expect(sent.askedAt).toMatch(/T06:15:00\.000Z$/)
    expect(await screen.findByText(i18n.t('console.disconnections.card.started'))).toBeTruthy()
    // One live request per company: nothing more to start.
    expect(
      screen.queryByRole('button', { name: i18n.t('console.disconnections.card.start') }),
    ).toBeNull()
  })

  it('links a live request into the queue and offers no second one', async () => {
    answers[COMPANY] = () => json(200, [detail()])
    renderCard()

    const link = await screen.findByRole('link', {
      name: i18n.t('console.disconnections.card.openInQueue'),
    })
    expect(link.getAttribute('href')).toBe('/console/disconnections?open=d-1')
    expect(
      screen.queryByRole('button', { name: i18n.t('console.disconnections.card.start') }),
    ).toBeNull()
  })
})

describe('stepsOffered', () => {
  const view = (over: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    detail(over, extra)

  it("follows the server's order of steps", () => {
    expect(stepsOffered(view({ path: 'ALREADY_DISCONNECTED' }))).toEqual([
      'PORTAL_DISCONNECTION_CONFIRMED',
      'PORTAL_NOT_DISCONNECTED',
      'WITHDRAWN',
    ])
    expect(stepsOffered(view({ path: 'MOVED_TO_ANOTHER_PROVIDER' }))).toEqual([
      'PORTAL_DISCONNECTION_CONFIRMED',
      'PORTAL_NOT_DISCONNECTED',
      'WITHDRAWN',
    ])
    expect(stepsOffered(view({ status: 'WAITING_FOR_CUSTOMER_APPROVAL' }))).toEqual([
      'CUSTOMER_APPROVED',
      'CUSTOMER_REJECTED',
      'WITHDRAWN',
    ])
    expect(stepsOffered(view({ status: 'DISCONNECTED' }))).toEqual(['SMP_REMOVED'])
    expect(
      stepsOffered(view({ status: 'DISCONNECTED', smpRemovedAt: '2026-10-15T06:00:00Z' })),
    ).toEqual([])
    // FC-4: a request that did not complete leaves the company on the SMP; nothing follows.
    expect(stepsOffered(view({ status: 'NOT_COMPLETED' }))).toEqual([])
    expect(stepsOffered(view({ status: 'WITHDRAWN' }))).toEqual([])
    expect(
      stepsOffered(view({ status: 'WITHDRAWN', portalRequestRaisedAt: '2026-10-14T06:00:00Z' })),
    ).toEqual(['PORTAL_REQUEST_WITHDRAWN'])
  })
})
