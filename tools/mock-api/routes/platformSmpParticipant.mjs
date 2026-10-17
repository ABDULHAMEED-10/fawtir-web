/**
 * Console › Disconnections and Reconnections: the Oman SMP call for one company, in the shapes
 * `src/lib/console/platformSmpParticipant.ts` reads (`PlatformSmpParticipantController`, F14):
 * remove after a disconnection, add back after a reconnection, and the latest call's status.
 *
 * The switch reads as on, so the screens show the call; start the mock with
 * `MOCK_PLATFORM_SMP_PARTICIPANT=off` to see the hand-recorded step instead. A call stays PENDING
 * for two seconds and then succeeds, marking SMP_REMOVED or SMP_ADDED on the request the way the
 * server's listener does. A reason containing "refuse" fails for good (FAILED), so asking again
 * is attempt 2. The server's own guards are not re-checked here.
 */
import { markSmpRemoved } from './platformFawtirDisconnections.mjs'
import { markSmpAdded } from './platformFawtirReconnections.mjs'

const BASE = /^\/api\/v1\/platform\/peppol\/smp\/tenants\/([^/]+)\/participant/
const PENDING_MS = 2000
const enabled = () => process.env.MOCK_PLATFORM_SMP_PARTICIPANT !== 'off'

/** Every call made, newest last. */
const CALLS = []
let nextId = 1

function settle(call) {
  if (call.outcome !== 'PENDING' || Date.now() - Date.parse(call.requestedAt) < PENDING_MS) return
  if (call.refuse) {
    call.outcome = 'FAILED'
    call.operationState = 'FAILED_PERMANENT'
    return
  }
  call.outcome = 'DONE'
  call.operationState = 'SUCCEEDED'
  const at = new Date().toISOString()
  if (call.kind === 'REMOVAL') markSmpRemoved(call.disconnectionId, at, call.operationId)
  else markSmpAdded(call.reconnectionId, at, call.operationId)
}

function latest(kind, linkId) {
  const mine = CALLS.filter(
    (c) =>
      c.kind === kind && (kind === 'REMOVAL' ? c.disconnectionId : c.reconnectionId) === linkId,
  )
  const last = mine[mine.length - 1] ?? null
  if (last) settle(last)
  return last
}

function view(call) {
  if (!call) return null
  const { refuse: _refuse, ...shown } = call
  return shown
}

function call(kind) {
  return ({ body }) => {
    if (!enabled()) {
      return {
        status: 409,
        body: { type: '/problems/platform-smp-participant-not-open', status: 409 },
      }
    }
    const linkId = kind === 'REMOVAL' ? body?.disconnectionId : body?.reconnectionId
    if (!linkId || !body?.reason?.trim()) return { status: 400, body: { status: 400 } }
    const previous = latest(kind, linkId)
    if (previous && previous.outcome !== 'FAILED') {
      return {
        status: 202,
        body: {
          requestId: previous.requestId,
          operationId: previous.operationId,
          operationState: previous.operationState,
          attemptNumber: previous.attemptNumber,
          replayed: true,
        },
      }
    }
    const n = nextId++
    const made = {
      requestId: `smp-req-${n}`,
      kind,
      disconnectionId: kind === 'REMOVAL' ? linkId : null,
      reconnectionId: kind === 'ADDITION' ? linkId : null,
      attemptNumber: (previous?.attemptNumber ?? 0) + 1,
      reason: body.reason.trim(),
      requestedBy: 'u-support',
      requestedAt: new Date().toISOString(),
      operationId: `smp-op-${n}`,
      operationState: 'READY',
      attemptCount: 0,
      nextAttemptAt: null,
      deadlineAt: null,
      outcome: 'PENDING',
      refuse: /refuse/i.test(body.reason),
    }
    CALLS.push(made)
    return {
      status: 202,
      body: {
        requestId: made.requestId,
        operationId: made.operationId,
        operationState: made.operationState,
        attemptNumber: made.attemptNumber,
        replayed: false,
      },
    }
  }
}

export default [
  {
    match: new RegExp(`${BASE.source}/requests/latest$`),
    reply: ({ query }) => {
      const disconnectionId = query.get('disconnectionId')
      const reconnectionId = query.get('reconnectionId')
      if (!disconnectionId === !reconnectionId) return { status: 400 }
      return {
        enabled: enabled(),
        latest: view(
          disconnectionId ? latest('REMOVAL', disconnectionId) : latest('ADDITION', reconnectionId),
        ),
      }
    },
  },
  { method: 'POST', match: new RegExp(`${BASE.source}/removal$`), reply: call('REMOVAL') },
  { method: 'POST', match: new RegExp(`${BASE.source}/addition$`), reply: call('ADDITION') },
]
