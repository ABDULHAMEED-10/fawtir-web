/**
 * Console › Disconnections, Reconnections view, in the shapes `src/lib/console/fawtirReconnections.ts`
 * reads (`PlatformFawtirReconnectionController`, V385): the queue, one request with its steps, a
 * company's requests, starting one, and recording a step.
 *
 * Four companies coming back: one waiting for support to accept it on the Fawtara Portal, one
 * accepted with a future effective date, one connected whose SMP add is overdue, and one closed
 * because no connect request was found. Recording a step moves the status where the server would;
 * the server's own rules are not re-checked here. The SMP deadline is 3 calendar days here, not 3
 * Oman business days. Enough for screenshots and the responsive harness.
 */
const BASE = '/api/v1/platform/fawtir-reconnections'
const COMPANY_PATH = /^\/api\/v1\/platform\/companies\/([^/]+)\/fawtir-reconnections$/

const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()
const ahead = (days) => new Date(Date.now() + days * DAY).toISOString()

function request(id, tenantId, over) {
  return {
    id,
    tenantId,
    disconnectionId: `d-${id}`,
    status: 'REQUESTED',
    origin: 'CUSTOMER',
    requestedAt: ago(1),
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

function step(id, kind, statusAfter, at, actorType = 'OPERATOR') {
  return {
    id,
    step: kind,
    statusAfter,
    occurredAt: at,
    recordedAt: at,
    actorId: actorType === 'SYSTEM' ? null : 'u-1',
    actorType,
    reference: null,
    note: null,
  }
}

const COMPANIES = {
  't-sur-fish': 'Sur Fish Company',
  't-barka-builders': 'Barka Builders LLC',
  't-salalah-ice': 'Salalah Ice Factory',
  't-ibri-motors': 'Ibri Motors',
}

const REQUESTS = [
  {
    request: request('r-1', 't-sur-fish', { requestedAt: ago(1) }),
    steps: [step('rs-1', 'REQUESTED', 'REQUESTED', ago(1), 'CUSTOMER')],
  },
  {
    request: request('r-2', 't-barka-builders', {
      status: 'ACCEPTED',
      origin: 'CONSOLE',
      requestedAt: ago(2),
      askedByName: 'Huda Al Balushi',
      askedVia: 'CALL',
      askedAt: ago(2.1),
      acceptedAt: ago(0.5),
      effectiveFrom: ahead(2),
      smpAddDueAt: ahead(2.5),
    }),
    steps: [
      step('rs-2', 'REQUESTED', 'REQUESTED', ago(2)),
      step('rs-3', 'PORTAL_CONNECTION_ACCEPTED', 'ACCEPTED', ago(0.5)),
    ],
  },
  {
    request: request('r-3', 't-salalah-ice', {
      status: 'CONNECTED',
      requestedAt: ago(6),
      acceptedAt: ago(5),
      effectiveFrom: ago(5),
      connectedAt: ago(5),
      smpAddDueAt: ago(1),
      subscriptionResumed: true,
    }),
    steps: [
      step('rs-4', 'REQUESTED', 'REQUESTED', ago(6), 'CUSTOMER'),
      step('rs-5', 'PORTAL_CONNECTION_ACCEPTED', 'CONNECTED', ago(5)),
    ],
  },
  {
    request: request('r-4', 't-ibri-motors', {
      status: 'NOT_COMPLETED',
      requestedAt: ago(9),
      notCompletedReason: 'PORTAL_REQUEST_NOT_FOUND',
      closedAt: ago(8),
    }),
    steps: [
      step('rs-6', 'REQUESTED', 'REQUESTED', ago(9), 'CUSTOMER'),
      step('rs-7', 'PORTAL_REQUEST_NOT_FOUND', 'NOT_COMPLETED', ago(8)),
    ],
  },
]

const live = (status) => status === 'REQUESTED' || status === 'ACCEPTED'

function nextAction(r) {
  if (r.status === 'REQUESTED') return 'ACCEPT_ON_PORTAL'
  if (r.status === 'ACCEPTED' || r.status === 'CONNECTED')
    return r.smpAddedAt ? 'NONE' : 'ADD_TO_SMP'
  return 'NONE'
}

function view(entry) {
  const r = entry.request
  const due = nextAction(r) === 'ADD_TO_SMP' ? r.smpAddDueAt : null
  return {
    request: r,
    nextAction: nextAction(r),
    dueAt: due,
    overdue: due !== null && Date.now() > Date.parse(due),
    effectiveDue: r.status === 'ACCEPTED' && Date.now() >= Date.parse(r.effectiveFrom),
    steps: entry.steps,
  }
}

let nextId = 100

export default [
  {
    match: BASE,
    reply: ({ query }) =>
      REQUESTS.filter(
        (entry) =>
          query.get('openOnly') === 'false' ||
          live(entry.request.status) ||
          nextAction(entry.request) !== 'NONE',
      ).map((entry) => {
        const v = view(entry)
        return {
          id: entry.request.id,
          tenantId: entry.request.tenantId,
          companyName: COMPANIES[entry.request.tenantId] ?? null,
          status: entry.request.status,
          origin: entry.request.origin,
          requestedAt: entry.request.requestedAt,
          nextAction: v.nextAction,
          dueAt: v.dueAt,
          overdue: v.overdue,
          effectiveDue: v.effectiveDue,
        }
      }),
  },
  {
    match: new RegExp(`^${BASE}/([^/]+)$`),
    reply: ({ params }) => {
      const entry = REQUESTS.find((e) => e.request.id === params[0])
      return entry ? view(entry) : { status: 404 }
    },
  },
  {
    method: 'POST',
    match: new RegExp(`^${BASE}/([^/]+)/steps$`),
    reply: ({ params, body }) => {
      const entry = REQUESTS.find((e) => e.request.id === params[0])
      if (!entry) return { status: 404 }
      const at = body?.occurredAt ?? new Date().toISOString()
      const r = { ...entry.request, version: entry.request.version + 1 }
      switch (body?.step) {
        case 'PORTAL_CONNECTION_ACCEPTED': {
          const chosen = body.effectiveFrom ?? at
          const effective = Date.parse(chosen) < Date.parse(at) ? at : chosen
          r.acceptedAt = at
          r.effectiveFrom = effective
          r.smpAddDueAt = new Date(Date.parse(at) + 3 * DAY).toISOString()
          if (Date.now() >= Date.parse(effective)) {
            r.status = 'CONNECTED'
            r.connectedAt = effective
          } else r.status = 'ACCEPTED'
          break
        }
        case 'PORTAL_REQUEST_NOT_FOUND':
          Object.assign(r, {
            status: 'NOT_COMPLETED',
            notCompletedReason: 'PORTAL_REQUEST_NOT_FOUND',
            closedAt: at,
          })
          break
        case 'CONNECTION_DECLINED':
          if (!body.declineReason) return { status: 400 }
          Object.assign(r, {
            status: 'NOT_COMPLETED',
            notCompletedReason: 'DECLINED',
            declineReason: body.declineReason,
            closedAt: at,
          })
          break
        case 'WITHDRAWN':
          Object.assign(r, { status: 'WITHDRAWN', closedAt: at })
          break
        case 'SMP_ADDED':
          r.smpAddedAt = at
          break
        default:
          return {
            status: 409,
            body: { type: '/problems/reconnection-state-conflict', status: 409 },
          }
      }
      entry.request = r
      entry.steps = [
        ...entry.steps,
        {
          ...step(`rs-${nextId++}`, body.step, r.status, at),
          recordedAt: new Date().toISOString(),
          reference: body.reference ?? null,
          note: body.note ?? null,
        },
      ]
      return view(entry)
    },
  },
  {
    match: COMPANY_PATH,
    reply: ({ params }) =>
      REQUESTS.filter((e) => e.request.tenantId === params[0])
        .sort((a, b) => b.request.requestedAt.localeCompare(a.request.requestedAt))
        .map(view),
  },
  {
    method: 'POST',
    match: COMPANY_PATH,
    reply: ({ params, body }) => {
      const open = REQUESTS.find((e) => e.request.tenantId === params[0] && live(e.request.status))
      if (open) return view(open)
      const now = new Date().toISOString()
      const entry = {
        request: request(`r-${nextId++}`, params[0], {
          disconnectionId: 'd-company-left',
          origin: 'CONSOLE',
          requestedAt: now,
          askedByName: body.askedByName ?? null,
          askedVia: body.askedVia,
          askedAt: body.askedAt,
          note: body.note ?? null,
        }),
        steps: [step(`rs-${nextId++}`, 'REQUESTED', 'REQUESTED', now)],
      }
      REQUESTS.push(entry)
      return view(entry)
    },
  },
]
