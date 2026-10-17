/**
 * Console › Disconnections, in the shapes `src/lib/console/fawtirDisconnections.ts` reads
 * (`PlatformFawtirDisconnectionController`, V302): the queue, one request with its steps, a
 * company's requests, starting one, and recording a step.
 *
 * Three companies: one waiting for support to raise the portal request, one waiting for
 * the customer's approval, and one disconnected whose SMP removal is overdue.
 * Recording a step only appends it and moves the status where the server would; the server's own
 * rules are not re-checked here. Enough for screenshots and the responsive harness.
 */
const BASE = '/api/v1/platform/fawtir-disconnections'

const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()
const ahead = (days) => new Date(Date.now() + days * DAY).toISOString()

function request(id, tenantId, over) {
  return {
    id,
    tenantId,
    path: 'ASK_FAWTIR',
    status: 'REQUESTED',
    origin: 'CUSTOMER',
    requestedAt: ago(2),
    requestedBy: 'u-owner',
    askedByName: null,
    askedVia: null,
    askedAt: null,
    reason: null,
    confirmedCompanyName: null,
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

function step(id, kind, statusAfter, at, actorType = 'CUSTOMER') {
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
  't-muscat-print': 'Muscat Print House LLC',
  't-sohar-steel': 'Sohar Steel Trading',
  't-nizwa-dates': 'Nizwa Dates Company',
}

const REQUESTS = [
  {
    request: request('d-1', 't-muscat-print', {
      path: 'ASK_FAWTIR',
      requestedAt: ago(3),
      confirmedCompanyName: 'Muscat Print House LLC',
    }),
    steps: [step('s-1', 'REQUESTED', 'REQUESTED', ago(3))],
  },
  {
    request: request('d-2', 't-sohar-steel', {
      path: 'ASK_FAWTIR',
      status: 'WAITING_FOR_CUSTOMER_APPROVAL',
      origin: 'CONSOLE',
      requestedAt: ago(1.5),
      askedByName: 'Salim Al Kindi',
      askedVia: 'CALL',
      askedAt: ago(1.6),
      reason: 'Moving all invoicing to the group ERP provider.',
      portalRequestRaisedAt: ago(1),
      approvalDueAt: ahead(2),
    }),
    steps: [
      step('s-2', 'REQUESTED', 'REQUESTED', ago(1.5), 'OPERATOR'),
      step('s-3', 'PORTAL_REQUEST_RAISED', 'WAITING_FOR_CUSTOMER_APPROVAL', ago(1), 'OPERATOR'),
    ],
  },
  {
    request: request('d-3', 't-nizwa-dates', {
      path: 'ALREADY_DISCONNECTED',
      status: 'DISCONNECTED',
      requestedAt: ago(1),
      confirmedCompanyName: 'Nizwa Dates Company',
      disconnectedAt: ago(0.5),
      smpRemovalDueAt: ago(0.1),
      subscriptionEndsOn: ahead(20).slice(0, 10),
    }),
    steps: [
      step('s-4', 'REQUESTED', 'REQUESTED', ago(1)),
      step('s-5', 'PORTAL_DISCONNECTION_CONFIRMED', 'DISCONNECTED', ago(0.5), 'OPERATOR'),
    ],
  },
]

// With `MOCK_RECONNECTION_STATE` set, the console's sample company (the one the tenant page mock
// serves) has left Fawtir, so its card offers "Start a reconnection"
// (`platformFawtirReconnections.mjs`, which matches this request's id).
if (process.env.MOCK_RECONNECTION_STATE) {
  REQUESTS.push({
    request: request('d-company-left', '7a1c0b52-4f0e-4b8e-9d3a-2f6c1e0a9b11', {
      path: 'ALREADY_DISCONNECTED',
      status: 'DISCONNECTED',
      requestedAt: ago(40),
      disconnectedAt: ago(39),
      smpRemovalDueAt: ago(38),
      smpRemovedAt: ago(39),
      subscriptionEndsOn: ahead(20).slice(0, 10),
    }),
    steps: [
      step('s-left-1', 'REQUESTED', 'REQUESTED', ago(40)),
      step('s-left-2', 'PORTAL_DISCONNECTION_CONFIRMED', 'DISCONNECTED', ago(39), 'OPERATOR'),
      step('s-left-3', 'SMP_REMOVED', 'DISCONNECTED', ago(39), 'OPERATOR'),
    ],
  })
}

const live = (status) => status === 'REQUESTED' || status === 'WAITING_FOR_CUSTOMER_APPROVAL'

function nextAction(r) {
  switch (r.status) {
    case 'REQUESTED':
      return r.path === 'ASK_FAWTIR' ? 'RAISE_PORTAL_REQUEST' : 'CONFIRM_ON_PORTAL'
    case 'WAITING_FOR_CUSTOMER_APPROVAL':
      return 'AWAIT_CUSTOMER_APPROVAL'
    case 'DISCONNECTED':
      return r.smpRemovedAt ? 'NONE' : 'REMOVE_FROM_SMP'
    case 'WITHDRAWN':
      return r.portalRequestRaisedAt && !r.portalWithdrawnAt ? 'WITHDRAW_PORTAL_REQUEST' : 'NONE'
    default:
      return 'NONE'
  }
}

function dueAt(r) {
  const next = nextAction(r)
  if (next === 'CONFIRM_ON_PORTAL' || next === 'REMOVE_FROM_SMP') return r.smpRemovalDueAt
  if (next === 'AWAIT_CUSTOMER_APPROVAL') return r.approvalDueAt
  // The plan sets no deadline for raising the portal request (`nextActionDueAt`).
  return null
}

function view(entry) {
  const due = dueAt(entry.request)
  return {
    request: entry.request,
    nextAction: nextAction(entry.request),
    dueAt: due,
    overdue: due !== null && Date.now() > Date.parse(due),
    approvalExpired:
      entry.request.status === 'WAITING_FOR_CUSTOMER_APPROVAL' && Date.now() >= Date.parse(entry.request.approvalDueAt),
    steps: entry.steps,
  }
}

const STATUS_AFTER = {
  PORTAL_REQUEST_RAISED: 'WAITING_FOR_CUSTOMER_APPROVAL',
  CUSTOMER_APPROVED: 'DISCONNECTED',
  PORTAL_DISCONNECTION_CONFIRMED: 'DISCONNECTED',
  CUSTOMER_REJECTED: 'NOT_COMPLETED',
  REQUEST_EXPIRED: 'NOT_COMPLETED',
  PORTAL_NOT_DISCONNECTED: 'NOT_COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
}

let nextId = 100

export default [
  {
    match: BASE,
    reply: ({ query }) =>
      REQUESTS.filter((entry) => query.get('openOnly') === 'false' || live(entry.request.status) || nextAction(entry.request) !== 'NONE')
        .map((entry) => {
          const v = view(entry)
          return {
            id: entry.request.id,
            tenantId: entry.request.tenantId,
            companyName: COMPANIES[entry.request.tenantId] ?? null,
            path: entry.request.path,
            status: entry.request.status,
            origin: entry.request.origin,
            requestedAt: entry.request.requestedAt,
            nextAction: v.nextAction,
            dueAt: v.dueAt,
            overdue: v.overdue,
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
      if (STATUS_AFTER[body?.step]) r.status = STATUS_AFTER[body.step]
      if (body?.step === 'PORTAL_REQUEST_RAISED') {
        r.portalRequestRaisedAt = at
        r.approvalDueAt = new Date(Date.parse(at) + 3 * DAY).toISOString()
      }
      if (r.status === 'DISCONNECTED' && !r.disconnectedAt) {
        r.disconnectedAt = at
        r.smpRemovalDueAt = new Date(Date.parse(at) + DAY).toISOString()
      }
      if (body?.step === 'SMP_REMOVED') r.smpRemovedAt = at
      if (body?.step === 'PORTAL_REQUEST_WITHDRAWN') r.portalWithdrawnAt = at
      entry.request = r
      entry.steps = [
        ...entry.steps,
        { ...step(`s-${nextId++}`, body.step, r.status, at, 'OPERATOR'), recordedAt: new Date().toISOString(), reference: body.reference ?? null, note: body.note ?? null },
      ]
      return view(entry)
    },
  },
  {
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/fawtir-disconnections$/,
    reply: ({ params }) =>
      REQUESTS.filter((e) => e.request.tenantId === params[0])
        .sort((a, b) => b.request.requestedAt.localeCompare(a.request.requestedAt))
        .map(view),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/fawtir-disconnections$/,
    reply: ({ params, body }) => {
      const now = new Date().toISOString()
      const entry = {
        request: request(`d-${nextId++}`, params[0], {
          path: body.path,
          origin: 'CONSOLE',
          requestedAt: now,
          askedByName: body.askedByName,
          askedVia: body.askedVia,
          askedAt: body.askedAt,
          reason: body.reason,
          smpRemovalDueAt: body.path === 'ASK_FAWTIR' ? null : new Date(Date.now() + DAY).toISOString(),
        }),
        steps: [],
      }
      entry.steps.push(step(`s-${nextId++}`, 'REQUESTED', 'REQUESTED', now, 'OPERATOR'))
      REQUESTS.push(entry)
      return view(entry)
    },
  },
]
