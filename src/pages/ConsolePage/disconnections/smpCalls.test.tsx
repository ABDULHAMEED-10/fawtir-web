import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { muscatToday } from '../../../lib/console/fawtirDisconnections'
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

describe('Console › SMP step, option C (API first, recorded override)', () => {
  const OVERRIDES = `POST ${SMP}/overrides`

  function optionC(over: Record<string, unknown> = {}) {
    return {
      enabled: true,
      latest: null,
      overrideEnabled: true,
      callable: true,
      notCallableReason: null,
      actions: ['REMOVE'],
      registrationState: 'ACTIVE',
      notice: null,
      ...over,
    }
  }

  async function reconnectionPanel() {
    return within(
      await screen.findByRole('region', { name: i18n.t('console.reconnections.panelTitle') }),
    )
  }

  it('defect 1: a call the server says cannot be made is not offered, and the step stays recordable', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(
        200,
        optionC({
          overrideEnabled: false,
          callable: false,
          notCallableReason: 'SMP_MODULE_OFF',
          actions: [],
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(
      await panel.findByText(i18n.t('console.smpCall.notCallable.SMP_MODULE_OFF')),
    ).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
    expect(await stepOptions(panel, user)).toEqual([
      i18n.t('console.disconnections.record.SMP_REMOVED'),
    ])
  })

  it('defect 1: a call refused before it was queued leaves the step recordable by hand', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () => json(200, { enabled: true, latest: null })
    answers[`POST ${SMP}/removal`] = () =>
      json(409, {
        type: '/problems/conflict',
        status: 409,
        detail: 'Oman SMP integration is disabled',
      })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    const remove = await panel.findByRole('button', {
      name: i18n.t('console.smpCall.remove.action'),
    })
    expect(
      panel.queryByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    ).toBeNull()
    await user.click(remove)
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'notice')
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.remove.action') }))
    expect(await dialog.findByText(i18n.t('console.smpCall.refusal.conflict'))).toBeTruthy()
    await user.click(dialog.getByRole('button', { name: i18n.t('common.cancel') }))

    expect(
      await panel.findByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    ).toBeTruthy()
  })

  it('a call refused while the SMP still reads as callable offers Record it done by hand (a refused call is a failed call)', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () => json(200, optionC({ actions: ['REMOVE'] }))
    answers[`POST ${SMP}/removal`] = () =>
      json(409, { type: '/problems/conflict', status: 409, detail: 'refused' })
    const user = userEvent.setup({ delay: null })
    const { unmount } = renderAt('/console/disconnections?open=d-1')

    let panel = await removalPanel()
    const remove = await panel.findByRole('button', { name: i18n.t('console.smpCall.remove.action') })
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
    ).toBeNull()
    await user.click(remove)
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'notice')
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.remove.action') }))
    expect(await dialog.findByText(i18n.t('console.smpCall.refusal.conflict'))).toBeTruthy()
    await user.click(dialog.getByRole('button', { name: i18n.t('common.cancel') }))
    expect(
      await panel.findByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
    ).toBeTruthy()
    unmount()

    // The server's read says so too, after a reload.
    answers[REMOVAL_STATUS] = () =>
      json(200, optionC({ actions: ['REMOVE', 'RECORD_REMOVAL'], lastRefusedAt: '2026-10-22T05:00:00Z' }))
    renderAt('/console/disconnections?open=d-1')
    panel = await removalPanel()
    expect(
      await panel.findByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
    ).toBeTruthy()
  })

  it('records a removal done by hand: date, channel, required reason and evidence; never calls the SMP; one request', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    let recorded = false
    answers[REMOVAL_STATUS] = () =>
      json(
        200,
        recorded
          ? optionC({ callable: false, notCallableReason: 'SMP_MODULE_OFF', actions: [] })
          : optionC({
              callable: false,
              notCallableReason: 'SMP_MODULE_OFF',
              actions: ['RECORD_REMOVAL'],
            }),
      )
    let posts = 0
    answers[OVERRIDES] = () => {
      posts += 1
      recorded = true
      return json(200, optionC({ actions: [] }))
    }
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    const open = await panel.findByRole('button', {
      name: i18n.t('console.smpCall.record.REMOVED.action'),
    })
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    ).toBeNull()

    await user.click(open)
    const dialog = within(await screen.findByRole('dialog'))
    const confirm = dialog.getByRole('button', {
      name: i18n.t('console.smpCall.record.REMOVED.action'),
    })
    // Neither a channel nor a reason: nothing is sent.
    await user.click(confirm)
    expect(dialog.getByText(i18n.t('console.smpCall.record.channelRequired'))).toBeTruthy()
    expect(posts).toBe(0)

    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.record.channel') }))
    await user.click(
      screen.getByRole('option', {
        name: i18n.t('console.smpCall.record.channelOption.OTA_SUPPORT'),
      }),
    )
    await user.click(confirm)
    expect(posts).toBe(0)
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'OTA removed it, ticket 4471')
    // No evidence reference: nothing is sent.
    await user.click(confirm)
    expect(dialog.getByText(i18n.t('console.smpCall.record.referenceRequired'))).toBeTruthy()
    expect(posts).toBe(0)
    await user.type(
      dialog.getByRole('textbox', { name: new RegExp(i18n.t('console.smpCall.record.reference')) }),
      'OTA-4471',
    )
    await user.dblClick(confirm)

    await waitFor(() => expect(recorded).toBe(true))
    expect(posts).toBe(1)
    const [, init] = fetchMock.mock.calls.find(
      ([url, i]) => url === `${SMP}/overrides` && i?.method === 'POST',
    )!
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'REMOVED',
      disconnectionId: 'd-1',
      occurredOn: muscatToday(),
      channel: 'OTA_SUPPORT',
      reason: 'OTA removed it, ticket 4471',
      reference: 'OTA-4471',
    })
    expect(
      fetchMock.mock.calls.some(([url, i]) => url === `${SMP}/removal` && i?.method === 'POST'),
    ).toBe(false)
  })

  it('shows who recorded each step by name, and how support knew', async () => {
    answers[DISCONNECTION] = () =>
      json(200, {
        ...disconnection({ smpRemovedAt: '2026-10-15T09:00:00Z' }),
        steps: [
          STEP,
          {
            ...STEP,
            id: 's-2',
            step: 'SMP_REMOVED',
            statusAfter: 'DISCONNECTED',
            actorType: 'OPERATOR',
            actorName: 'Sara Al Balushi',
            smpChannel: 'OTA_SUPPORT',
            smpRecordKind: 'REMOVED',
            note: 'OTA removed it, ticket 4471',
          },
        ],
      })
    answers[REMOVAL_STATUS] = () => json(200, optionC({ actions: [] }))
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(
      await panel.findByText(
        `${i18n.t('console.disconnections.actor.OPERATOR')} · Sara Al Balushi`,
      ),
    ).toBeTruthy()
    expect(
      panel.getByText(
        i18n.t('console.smpCall.history.REMOVED', {
          channel: i18n.t('console.smpCall.record.channelOption.OTA_SUPPORT'),
        }),
      ),
    ).toBeTruthy()
  })

  it('defect 2: a company Fawtir accepted back is not offered Remove, by call or by hand', async () => {
    answers[DISCONNECTION] = () =>
      json(200, { ...disconnection(), nextAction: 'NONE', dueAt: null })
    answers[REMOVAL_STATUS] = () => json(200, optionC({ actions: [], notice: 'ACCEPTED_BACK' }))
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.notice.ACCEPTED_BACK'))).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.remove.action') }),
    ).toBeNull()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.disconnections.form.step') }),
    ).toBeNull()
  })

  it("defect 4: the SMP's 404 reads as already absent and is recorded, never asked again", async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(
        200,
        optionC({
          latest: call({ outcome: 'RECONCILIATION_REQUIRED' }),
          actions: ['RECORD_REMOVAL'],
          notice: 'ALREADY_ABSENT',
          registrationState: 'OFFBOARDING_PENDING',
        }),
      )
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.notice.ALREADY_ABSENT'))).toBeTruthy()
    expect(
      panel.getByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
    ).toBeTruthy()
    expect(panel.queryByRole('button', { name: i18n.t('console.smpCall.tryAgain') })).toBeNull()
  })

  it('defect 3: a company never removed is offered Confirm, not Add back', async () => {
    answers[RECONNECTION] = () => json(200, reconnection())
    answers[ADDITION_STATUS] = () =>
      json(
        200,
        optionC({
          callable: false,
          notCallableReason: 'NOT_REMOVED',
          actions: ['CONFIRM_REGISTRATION'],
          notice: 'NEVER_REMOVED',
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?view=reconnections&open=r-1')

    const panel = await reconnectionPanel()
    const confirm = await panel.findByRole('button', {
      name: i18n.t('console.smpCall.record.CONFIRMED.action'),
    })
    expect(panel.getByText(i18n.t('console.smpCall.confirm.title'))).toBeTruthy()
    expect(panel.getByText(i18n.t('console.smpCall.notice.NEVER_REMOVED'))).toBeTruthy()
    expect(panel.queryByRole('button', { name: i18n.t('console.smpCall.add.action') })).toBeNull()

    let body: unknown = null
    answers[OVERRIDES] = (init) => {
      body = JSON.parse(String(init?.body))
      return json(200, optionC({ actions: [] }))
    }
    await user.click(confirm)
    const dialog = within(await screen.findByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: i18n.t('console.smpCall.record.channel') }))
    await user.click(
      screen.getByRole('option', {
        name: i18n.t('console.smpCall.record.channelOption.FAWTARA_PORTAL'),
      }),
    )
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'Still listed on the portal')
    await user.type(
      dialog.getByRole('textbox', { name: new RegExp(i18n.t('console.smpCall.record.reference')) }),
      'EVID-portal-1',
    )
    await user.click(
      dialog.getByRole('button', { name: i18n.t('console.smpCall.record.CONFIRMED.action') }),
    )
    await waitFor(() => expect(body).not.toBeNull())
    expect(body).toMatchObject({
      kind: 'CONFIRMED',
      reconnectionId: 'r-1',
      channel: 'FAWTARA_PORTAL',
      reference: 'EVID-portal-1',
    })
  })

  it('a failed or unknown call offers Try again and Record it done by hand, never the problem-operations screen', async () => {
    for (const outcome of ['FAILED', 'RECONCILIATION_REQUIRED'] as const) {
      answers[DISCONNECTION] = () => json(200, disconnection())
      answers[REMOVAL_STATUS] = () =>
        json(
          200,
          optionC({
            latest: call({ outcome }),
            actions: outcome === 'FAILED' ? ['REMOVE', 'RECORD_REMOVAL'] : ['RECORD_REMOVAL'],
          }),
        )
      const { unmount } = renderAt('/console/disconnections?open=d-1')

      const panel = await removalPanel()
      expect(await panel.findByText(i18n.t(`console.smpCall.outcome.${outcome}`))).toBeTruthy()
      expect(i18n.t(`console.smpCall.outcome.${outcome}`)).toContain('do it by hand and record it')
      expect(i18n.t(`console.smpCall.outcome.${outcome}`)).not.toMatch(/problem/i)
      expect(
        panel.getByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
      ).toBeTruthy()
      expect(i18n.t('console.smpCall.record.REMOVED.action')).toBe('Record it done by hand')
      expect(Boolean(panel.queryByRole('button', { name: i18n.t('console.smpCall.tryAgain') }))).toBe(
        outcome === 'FAILED',
      )
      unmount()
    }
  })

  it('defect 3: a removed company is offered Add back, which makes the call', async () => {
    answers[RECONNECTION] = () => json(200, reconnection())
    answers[ADDITION_STATUS] = () =>
      json(200, optionC({ actions: ['ADD_BACK'], registrationState: 'OFFBOARDED' }))
    renderAt('/console/disconnections?view=reconnections&open=r-1')

    const panel = await reconnectionPanel()
    expect(
      await panel.findByRole('button', { name: i18n.t('console.smpCall.add.action') }),
    ).toBeTruthy()
    expect(i18n.t('console.smpCall.add.action')).toBe('Add back to SMP')
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.record.CONFIRMED.action') }),
    ).toBeNull()
  })

  it('with both switches off, nothing new shows: no SMP box, the bare step only', async () => {
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(200, optionC({ enabled: false, overrideEnabled: false, callable: false, actions: [] }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === REMOVAL_STATUS)).toBe(true),
    )
    expect(panel.queryByText(i18n.t('console.smpCall.remove.title'))).toBeNull()
    expect(await stepOptions(panel, user)).toEqual([
      i18n.t('console.disconnections.record.SMP_REMOVED'),
    ])
  })

  it('a reader sees the record offered but has nothing to press', async () => {
    who = READER
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(
        200,
        optionC({ callable: false, notCallableReason: 'CALLS_OFF', actions: ['RECORD_REMOVAL'] }),
      )
    renderAt('/console/disconnections?open=d-1')

    const panel = await removalPanel()
    expect(await panel.findByText(i18n.t('console.smpCall.notCallable.CALLS_OFF'))).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
    ).toBeNull()
  })

  it('the record dialog reads in Arabic with no key showing', async () => {
    await i18n.changeLanguage('ar')
    answers[DISCONNECTION] = () => json(200, disconnection())
    answers[REMOVAL_STATUS] = () =>
      json(
        200,
        optionC({
          callable: false,
          notCallableReason: 'SMP_MODULE_OFF',
          actions: ['RECORD_REMOVAL'],
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderAt('/console/disconnections?open=d-1')

    await user.click(
      await screen.findByRole('button', { name: i18n.t('console.smpCall.record.REMOVED.action') }),
    )
    await screen.findByRole('dialog')
    expect(screen.getByText(i18n.t('console.smpCall.record.REMOVED.body'))).toBeTruthy()
    expect(screen.queryByText(/console\.smpCall/)).toBeNull()
    for (const key of [
      'console.smpCall.record.date',
      'console.smpCall.record.channel',
      'console.smpCall.notCallable.SMP_MODULE_OFF',
    ]) {
      expect(i18n.t(key)).not.toContain('console.')
      expect(i18n.t(key)).not.toMatch(/\u2014/)
    }
  })
})
