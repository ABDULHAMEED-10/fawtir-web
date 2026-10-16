/**
 * Settings › Company profile, danger zone: "Disconnect from Fawtir", in the shapes
 * `src/api/settings/fawtirDisconnection.ts` reads (`FawtirDisconnectionController`, V302).
 *
 * The company starts with no request. Answering opens one on its path (a typed name that is not
 * the company's is 400, as on the server), withdrawing closes it, and moving to another provider
 * records nothing. Enough for screenshots and the responsive harness; never used by a build.
 *
 * The danger zone shows only to an owner or an Administrator holding `admin.settings.manage`;
 * `agreements.mjs` answers `/me/entitlements` first and holds neither, so check this screen with a
 * copy of `server.mjs` that loads this module and gives the session those (handbook section 4).
 */
const PATH = '/api/v1/settings/fawtir-disconnection'
const COMPANY = { legalName: 'Al Bahja Coffee LLC', name: 'Al Bahja Coffee', legalNameAr: 'شركة البهجة للقهوة' }

let request = null

const normalise = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

const live = () =>
  request !== null && (request.status === 'REQUESTED' || request.status === 'WAITING_FOR_CUSTOMER_APPROVAL')

function view() {
  const disconnected = request?.status === 'DISCONNECTED'
  return {
    companyName: COMPANY.legalName,
    connected: !disconnected,
    canRequest: !live() && !disconnected,
    canWithdraw: live(),
    request,
  }
}

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
]
