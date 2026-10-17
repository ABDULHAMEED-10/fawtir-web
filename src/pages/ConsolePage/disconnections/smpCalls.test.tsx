import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { ConsoleDisconnectionsPage } from './ConsoleDisconnectionsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const DISCONNECTION_QUEUE = '/api/v1/platform/fawtir-disconnections?openOnly=true'
const RECONNECTION_QUEUE = '/api/v1/platform/fawtir-reconnections?openOnly=true'
const DISCONNECTION = '/api/v1/platform/fawtir-disconnections/d-1'
const RECONNECTION = '/api/v1/platform/fawtir-reconnections/r-1'
const SMP = '/api/v1/platform/peppol/smp/tenants/t-1/participant'
const REMOVAL_STATUS = `${SMP}/requests/latest?disconnectionId=d-1`
const ADDITION_STATUS = `${SMP}/requests/latest?reconnectionId=r-1`

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

const STEP = {
  id: 's-1',
  step: 'REQUESTED',
  statusAfter: 'REQUESTED',
  occurredAt: '2026-10-14T06:00:00Z',
  recordedAt: '2026-10-14T06:00:00Z',
  actorId: 'u-owner',
  actorType: 'CUSTOMER',
  reference: null,
  note: null,
}

function disconnection(over: Record<string, unknown> = {}) {
  const request = {
    id: 'd-1',
    tenantId: 't-1',
    path: 'ALREADY_DISCONNECTED',
    status: 'DISCONNECTED',
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
    disconnectedAt: '2026-10-14T07:00:00Z',
    smpRemovalDueAt: '2026-10-15T07:00:00Z',
    smpRemovedAt: null,
    notCompletedReason: null,
    closedAt: null,
    portalWithdrawnAt: null,
    subscriptionEndsOn: null,
    version: 1,
    ...over,
  }
  return {
    request,
    nextAction: request.smpRemovedAt ? 'NONE' : 'REMOVE_FROM_SMP',
    dueAt: request.smpRemovedAt ? null : '2026-10-15T07:00:00Z',
    overdue: false,
    approvalExpired: false,
    steps: [STEP],
  }
}

function reconnection(over: Record<string, unknown> = {}) {
  const request = {
    id: 'r-1',
    tenantId: 't-1',
    disconnectionId: 'd-1',
    status: 'CONNECTED',
    origin: 'CUSTOMER',
    requestedAt: '2026-10-14T06:00:00Z',
    requestedBy: 'u-owner',
    askedByName: null,
    askedVia: null,
    askedAt: null,
    note: null,
    acceptedAt: '2026-10-15T06:00:00Z',
    effectiveFrom: '2026-10-15T06:00:00Z',
    connectedAt: '2026-10-15T06:00:00Z',
    smpAddDueAt: '2026-10-18T06:00:00Z',
    smpAddedAt: null,
    notCompletedReason: null,
    declineReason: null,
    closedAt: null,
    subscriptionResumed: true,
    version: 1,
    ...over,
  }
  return {
    request,
    nextAction: request.smpAddedAt ? 'NONE' : 'ADD_TO_SMP',
    dueAt: request.smpAddedAt ? null : '2026-10-18T06:00:00Z',
    overdue: false,
    effectiveDue: false,
    steps: [STEP],
  }
}

function call(over: Record<string, unknown> = {}) {
  return {
    requestId: 'q-1',
    kind: 'REMOVAL',
    disconnectionId: 'd-1',
    reconnectionId: null,
    attemptNumber: 1,
    reason: 'Portal notice of 14 Oct',
    requestedBy: 'u-support',
    requestedAt: '2026-10-14T08:00:00Z',
    operationId: 'op-1',
    operationState: 'READY',
    attemptCount: 0,
    nextAttemptAt: null,
    deadlineAt: null,
    outcome: 'PENDING',
    ...over,
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
  answers = {
    [DISCONNECTION_QUEUE]: () => json(200, []),
    [RECONNECTION_QUEUE]: () => json(200, []),
  }
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/disconnections" element={<ConsoleDisconnectionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function removalPanel() {
  return within(
    await screen.findByRole('region', {
      name: i18n.t('console.disconnections.path.ALREADY_DISCONNECTED'),
    }),
  )
}

async function stepOptions(
  panel: ReturnType<typeof within>,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(panel.getByRole('button', { name: i18n.t('console.disconnections.form.step') }))
  return screen.getAllByRole('option').map((option) => option.textContent)
}

describe('Console › SMP calls for a company (F14)', () => {
  it('while the server has the calls off, the removal stays a step recorded by hand', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () => json(200, { enabled: false, latest: null })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === REMOVAL_STATUS)).toBe(true),
    )
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
    expect(await stepOptions(panel, user)).toEqual([
      i18n.t('console.disconnections.record.SMP_REMOVED'),
    ])
  })

  it('an older server without the route also keeps the hand-recorded step', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(await stepOptions(panel, user)).toEqual([
      i18n.t('console.disconnections.record.SMP_REMOVED'),
    ])
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
  })

  it('with the calls on, removes from the SMP with a reason and both headers, then shows it pending', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    let asked = false
    answers[REMOVAL_STATUS] = () => json(200, { enabled: true, latest: asked ? call() : null })
    answers[`POST ${SMP}/removal`] = () => {
      asked = true
      return json(202, {
        requestId: 'q-1',
        operationId: 'op-1',
        operationState: 'READY',
        attemptNumber: 1,
        replayed: false,
      })
    }
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    const action = await panel.findByRole('button', {
      name: i18n.t('console.smpCall.remove.action'),
    })
    expect(panel.getByText(i18n.t('console.smpCall.remove.body'))).toBeTruthy()
    // The call replaces the hand-recorded step: nothing is left to record here.
    expect(
      panel.queryByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    ).toBeNull()

    await user.click(action)
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(i18n.t('console.smpCall.remove.confirm'))).toBeTruthy()
    // No reason, no call.
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.remove.action') }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'Portal notice of 14 Oct')
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.remove.action') }))

    await waitFor(() => expect(asked).toBe(true))
    const [, init] = fetchMock.mock.calls.find(
      ([url, i]) => url === `${SMP}/removal` && i?.method === 'POST',
    )!
    expect(JSON.parse(String(init.body))).toEqual({
      disconnectionId: 'd-1',
      reason: 'Portal notice of 14 Oct',
    })
    const headers = init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBeTruthy()
    expect(headers['X-Correlation-Id']).toBeTruthy()

    // The request and the call are read again; the panel is drawn afresh.
    const after = await removalPanel()
    expect(await after.findByText(i18n.t('console.smpCall.outcome.PENDING'))).toBeTruthy()
    expect(
      after.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
    expect(after.getByRole('button', { name: i18n.t('console.smpCall.checkAgain') })).toBeTruthy()
  })

  it('once the SMP confirmed, says so and the step reads as recorded by the system', async () => {
    answers[DISCONNECTION] = () =>
      json(200, {
        ...disconnection({ smpRemovedAt: '2026-10-14T09:00:00Z' }),
        steps: [
          STEP,
          {
            ...STEP,
            id: 's-2',
            step: 'SMP_REMOVED',
            statusAfter: 'DISCONNECTED',
            actorType: 'SYSTEM',
          },
        ],
      })
    answers[REMOVAL_STATUS] = () => json(200, { enabled: true, latest: call({ outcome: 'DONE' }) })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.outcome.DONE'))).toBeTruthy()
    expect(panel.getByText(i18n.t('console.disconnections.actor.SYSTEM'))).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
  })

  it('a refused call can be tried again; an unknown outcome cannot', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(200, { enabled: true, latest: call({ outcome: 'FAILED' }) })
    const first = renderAt('/console/disconnections?open=d-1')
    let panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.outcome.FAILED'))).toBeTruthy()
    expect(panel.getByRole('button', { name: i18n.t('console.smpCall.tryAgain') })).toBeTruthy()
    first.unmount()

    resetSharedRequests()
    answers[REMOVAL_STATUS] = () =>
      json(200, { enabled: true, latest: call({ outcome: 'RECONCILIATION_REQUIRED' }) })
    renderAt('/console/disconnections?open=d-1')
    panel = await removalPanel()
    expect(
      await panel.findByText(i18n.t('console.smpCall.outcome.RECONCILIATION_REQUIRED')),
    ).toBeTruthy()
    expect(panel.queryByRole('button', { name: i18n.t('console.smpCall.tryAgain') })).toBeNull()
  })

  it('when the SMP confirmed but the step is still open, reads the request again once and offers the step by hand', async () => {
    let reads = 0
    answers[DISCONNECTION] = () => {
      reads += 1
      return json(200, disconnection())
    }
    answers[REMOVAL_STATUS] = () =>
      json(200, { enabled: true, latest: call({ outcome: 'DONE', operationId: 'op-done-1' }) })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    expect(await screen.findByText(i18n.t('console.smpCall.outcome.DONE'))).toBeTruthy()
    await waitFor(() => expect(reads).toBe(2))
    const panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.outcome.DONE'))).toBeTruthy()
    expect(await stepOptions(panel, user)).toEqual([
      i18n.t('console.disconnections.record.SMP_REMOVED'),
    ])
    expect(reads).toBe(2)
  })

  it('a reader sees where the call stands but cannot make it', async () => {
    who = READER
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () => json(200, { enabled: true, latest: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.remove.body'))).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
  })

  it('says in our words why the server refused', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () => json(200, { enabled: true, latest: null })
    answers[`POST ${SMP}/removal`] = () =>
      json(409, {
        type: '/problems/disconnection-state-conflict',
        status: 409,
        detail: 'server words',
      })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    await user.click(
      await panel.findByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    )
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'notice')
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.remove.action') }))

    expect(
      await dialog.findByText(i18n.t('console.smpCall.refusal.disconnection-state-conflict')),
    ).toBeTruthy()
    expect(screen.queryByText('server words')).toBeNull()
  })

  it('adds a reconnected company back to the SMP in place of recording it outside the console', async () => {
    answers[RECONNECTION] = () => json(200, reconnection())
    let asked = false
    answers[ADDITION_STATUS] = () =>
      json(200, {
        enabled: true,
        latest: asked
          ? call({ kind: 'ADDITION', disconnectionId: null, reconnectionId: 'r-1' })
          : null,
      })
    answers[`POST ${SMP}/addition`] = () => {
      asked = true
      return json(202, {
        requestId: 'q-2',
        operationId: 'op-2',
        operationState: 'READY',
        attemptNumber: 1,
        replayed: false,
      })
    }
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?view=reconnections&open=r-1')

    const panel = within(
      await screen.findByRole('region', { name: i18n.t('console.reconnections.panelTitle') }),
    )
    const action = await panel.findByRole('button', { name: i18n.t('console.smpCall.add.action') })
    expect(panel.queryByText(i18n.t('console.reconnections.smpOutside'))).toBeNull()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    ).toBeNull()

    await user.click(action)
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'Connection accepted 7.5.1')
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.add.action') }))

    await waitFor(() => expect(asked).toBe(true))
    const [, init] = fetchMock.mock.calls.find(
      ([url, i]) => url === `${SMP}/addition` && i?.method === 'POST',
    )!
    expect(JSON.parse(String(init.body))).toEqual({
      reconnectionId: 'r-1',
      reason: 'Connection accepted 7.5.1',
    })
    expect(await screen.findByText(i18n.t('console.smpCall.outcome.PENDING'))).toBeTruthy()
  })

  it('reads in Arabic with no key showing', async () => {
    await i18n.changeLanguage('ar')
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(200, { enabled: true, latest: call({ outcome: 'FAILED' }) })
    renderAt('/console/disconnections?open=d-1')

    expect(await screen.findByText(i18n.t('console.smpCall.outcome.FAILED'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.smpCall.remove.title'))).toBeTruthy()
    expect(i18n.t('console.smpCall.outcome.FAILED')).not.toContain('console.')
    expect(screen.queryByText(/console\.smpCall/)).toBeNull()
  })
})
