/**
 * Settings › Company profile, danger zone: "Disconnect from Fawtir", in the shapes
 * `src/api/settings/fawtirDisconnection.ts` reads (`FawtirDisconnectionController`, V302).
 *
 * The company starts with no request. Answering opens one on its path (a typed name that is not
 * the company's is 400, as on the server), withdrawing closes it, and moving to another provider
 * records nothing. Enough for screenshots and the responsive harness; never used by a build.
 *
 * The danger zone shows only to an owner or an Administrator holding `admin.settings.manage`;
 * the session `agreements.mjs` answers `/me/entitlements` with is the owner and holds it.
 *
 * Coming back to Fawtir (`FawtirReconnectionController`, V385): `MOCK_RECONNECTION_STATE` starts
 * the company disconnected, with its request to come back in one state: `left` (none yet),
 * `requested`, `accepted` (effective in 3 days), `connected`, `connected-renew` (the paid period
 * ended while away), `not-found`, `declined`, `withdrawn`, or `off` (reconnecting switched off:
 * `canReconnect` false). Unset, the company starts connected as before.
 */
const PATH = '/api/v1/settings/fawtir-disconnection'
const COMPANY = { legalName: 'Al Bahja Coffee LLC', name: 'Al Bahja Coffee', legalNameAr: 'شركة البهجة للقهوة' }

const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()
const ahead = (days) => new Date(Date.now() + days * DAY).toISOString()

const STATE = process.env.MOCK_RECONNECTION_STATE ?? ''
const SWITCHED_ON = STATE !== 'off'

let request = null
let reconnection = null

const reconnectionStep = (kind, status, at, actorType = 'OPERATOR') => ({
  step: kind,
  statusAfter: status,
  occurredAt: at,
  recordedAt: at,
  actorType,
})

if (STATE) {
  request = {
    path: 'ALREADY_DISCONNECTED',
    status: 'DISCONNECTED',
    origin: 'CUSTOMER',
    askedVia: null,
    requestedAt: ago(40),
    portalRequestRaisedAt: null,
    approvalDueAt: null,
    approvalExpired: false,
    disconnectedAt: ago(39),
    smpRemovedAt: ago(39),
    notCompletedReason: null,
    closedAt: null,
    subscriptionEndsOn: (STATE === 'connected-renew' ? ago(9) : ahead(20)).slice(0, 10),
    steps: [
      { step: 'REQUESTED', statusAfter: 'REQUESTED', occurredAt: ago(40), recordedAt: ago(40), actorType: 'CUSTOMER' },
      { step: 'PORTAL_DISCONNECTION_CONFIRMED', statusAfter: 'DISCONNECTED', occurredAt: ago(39), recordedAt: ago(39), actorType: 'OPERATOR' },
      { step: 'SMP_REMOVED', statusAfter: 'DISCONNECTED', occurredAt: ago(39), recordedAt: ago(39), actorType: 'OPERATOR' },
    ],
  }
  const asked = reconnectionStep('REQUESTED', 'REQUESTED', ago(2), 'CUSTOMER')
  const base = {
    status: 'REQUESTED',
    origin: 'CUSTOMER',
    requestedAt: ago(2),
    acceptedAt: null,
    effectiveFrom: null,
    effectiveDue: false,
    connectedAt: null,
    smpAddedAt: null,
    notCompletedReason: null,
    closedAt: null,
    steps: [asked],
  }
  const accepted = reconnectionStep('PORTAL_CONNECTION_ACCEPTED', 'ACCEPTED', ago(1))
  reconnection = {
    requested: base,
    accepted: { ...base, status: 'ACCEPTED', acceptedAt: ago(1), effectiveFrom: ahead(3), steps: [asked, accepted] },
    connected: {
      ...base,
      status: 'CONNECTED',
      acceptedAt: ago(1),
      effectiveFrom: ago(1),
      connectedAt: ago(1),
      steps: [asked, { ...accepted, statusAfter: 'CONNECTED' }],
    },
    'not-found': {
      ...base,
      status: 'NOT_COMPLETED',
      notCompletedReason: 'PORTAL_REQUEST_NOT_FOUND',
      closedAt: ago(1),
      steps: [asked, reconnectionStep('PORTAL_REQUEST_NOT_FOUND', 'NOT_COMPLETED', ago(1))],
    },
    declined: {
      ...base,
      status: 'NOT_COMPLETED',
      notCompletedReason: 'DECLINED',
      closedAt: ago(1),
      steps: [asked, reconnectionStep('CONNECTION_DECLINED', 'NOT_COMPLETED', ago(1))],
    },
    withdrawn: {
      ...base,
      status: 'WITHDRAWN',
      closedAt: ago(1),
      steps: [asked, reconnectionStep('WITHDRAWN', 'WITHDRAWN', ago(1), 'CUSTOMER')],
    },
  }[STATE === 'connected-renew' ? 'connected' : STATE] ?? null
}

const back = () => reconnection?.status === 'CONNECTED'
const reconnectionLive = () => reconnection?.status === 'REQUESTED' || reconnection?.status === 'ACCEPTED'

const normalise = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

const live = () =>
  request !== null && (request.status === 'REQUESTED' || request.status === 'WAITING_FOR_CUSTOMER_APPROVAL')

function view() {
  const disconnected = request?.status === 'DISCONNECTED' && !back()
  return {
    companyName: COMPANY.legalName,
    connected: !disconnected,
    canRequest: !live() && !disconnected,
    canWithdraw: live(),
    canReconnect: SWITCHED_ON && disconnected && !reconnectionLive(),
    reconnection,
    request,
  }
}

const conflict = (slug) => ({ status: 409, body: { type: `/problems/${slug}`, status: 409 } })

function step(kind, status, at) {
  return { step: kind, statusAfter: status, occurredAt: at, recordedAt: at, actorType: 'CUSTOMER' }
}

export default [
  { match: PATH, reply: () => view() },
  {
    method: 'POST',
    match: PATH,
    reply: ({ body }) => {
      const answer = body?.answer
      if (answer === 'MOVING_TO_ANOTHER_PROVIDER') return { requestNeeded: false, disconnection: view() }
      if (answer !== 'ALREADY_DISCONNECTED' && answer !== 'ASK_FAWTIR') return { status: 400 }
      const typed = body.companyNameConfirmation ?? ''
      if (!Object.values(COMPANY).some((name) => normalise(name) === normalise(typed))) {
        return { status: 400, body: { type: 'about:blank', title: 'Bad Request', status: 400 } }
      }
      if (request?.status === 'DISCONNECTED' || (live() && request.path !== answer)) {
        return { status: 409, body: { type: '/problems/disconnection-state-conflict', status: 409 } }
      }
      if (request?.status === 'DISCONNECTED' && back()) request = null
      if (!live()) {
        const now = new Date().toISOString()
        request = {
          path: answer,
          status: 'REQUESTED',
          origin: 'CUSTOMER',
          askedVia: null,
          requestedAt: now,
          portalRequestRaisedAt: null,
          approvalDueAt: null,
          approvalExpired: false,
          disconnectedAt: null,
          smpRemovedAt: null,
          notCompletedReason: null,
          closedAt: null,
          subscriptionEndsOn: null,
          steps: [step('REQUESTED', 'REQUESTED', now)],
        }
      }
      return { requestNeeded: true, disconnection: view() }
    },
  },
  {
    method: 'POST',
    match: `${PATH}/withdrawal`,
    reply: () => {
      if (request?.status === 'WITHDRAWN') return view()
      if (!live()) {
        return { status: 409, body: { type: '/problems/disconnection-state-conflict', status: 409 } }
      }
      const now = new Date().toISOString()
      request = {
        ...request,
        status: 'WITHDRAWN',
        closedAt: now,
        steps: [...request.steps, step('WITHDRAWN', 'WITHDRAWN', now)],
      }
      return view()
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/fawtir-reconnection',
    reply: ({ body }) => {
      if (body?.confirmed !== true) return { status: 400 }
      if (request?.status !== 'DISCONNECTED' || back()) return conflict('disconnection-state-conflict')
      if (reconnectionLive()) return view()
      if (!SWITCHED_ON) return conflict('reconnection-not-open')
      const now = new Date().toISOString()
      reconnection = {
        status: 'REQUESTED',
        origin: 'CUSTOMER',
        requestedAt: now,
        acceptedAt: null,
        effectiveFrom: null,
        effectiveDue: false,
        connectedAt: null,
        smpAddedAt: null,
        notCompletedReason: null,
        closedAt: null,
        steps: [reconnectionStep('REQUESTED', 'REQUESTED', now, 'CUSTOMER')],
      }
      return view()
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/fawtir-reconnection/withdrawal',
    reply: () => {
      if (reconnection?.status === 'WITHDRAWN') return view()
      if (reconnection?.status !== 'REQUESTED') return conflict('reconnection-state-conflict')
      const now = new Date().toISOString()
      reconnection = {
        ...reconnection,
        status: 'WITHDRAWN',
        closedAt: now,
        steps: [...reconnection.steps, reconnectionStep('WITHDRAWN', 'WITHDRAWN', now, 'CUSTOMER')],
      }
      return view()
    },
  },
]
