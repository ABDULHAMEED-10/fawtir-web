/**
 * Screenshot and development tooling only; never loaded by the application build.
 *
 * Sales approval (RL-6): the company rule (`/settings/sales-approval-rule`) and each draft's
 * approval (`/invoice-drafts/{id}/approval`). Shapes follow `src/api/invoices/salesApproval.ts`.
 * The rule is on for invoices and credit notes, two approvers, nothing needed below OMR 100.
 * Draft `draft-2045` waits for approval with one of two given, and the mock user (who did not
 * prepare it) may decide; `draft-2046` has not been sent yet. Any other draft needs none. The
 * steps change the in-memory state, so a click shows the next state.
 */
const RULE_PATH = '/api/v1/settings/sales-approval-rule'
const ID = '([^/]+)'

let rule = {
  version: 3,
  enabled: true,
  covers: { invoice: true, creditNote: true, debitNote: false, selfBilled: false },
  requiredApprovals: 2,
  autoApproveBelow: 100,
  reason: null,
  updatedBy: 'u-nasser',
  updatedAt: '2026-10-15T09:00:00Z',
  approverCount: 3,
}

const SARA = '5f0c2b1e-7a44-4c1d-9b55-0d0f6a1c2e31'

const approvals = {
  'draft-2045': {
    status: 'PENDING',
    requiredApprovals: 2,
    distinctApprovals: 1,
    draftVersion: 3,
    payableAmount: 409.5,
    currency: 'OMR',
    requestedBy: SARA,
    requestedAt: '2026-10-16T07:30:00Z',
    lastDecision: null,
    callerMayRequest: false,
    callerMayDecide: true,
  },
  'draft-2046': {
    status: 'NOT_REQUESTED',
    requiredApprovals: 2,
    distinctApprovals: 0,
    draftVersion: 3,
    payableAmount: 157.5,
    currency: 'OMR',
    requestedBy: null,
    requestedAt: null,
    lastDecision: null,
    callerMayRequest: true,
    callerMayDecide: false,
  },
}

/** The list's `approvalState` for a draft, read by `invoices.mjs`. */
export function approvalStateOf(id) {
  const status = approvals[id]?.status
  return status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' ? status : null
}

const notRequired = () => ({
  status: 'NOT_REQUIRED',
  requiredApprovals: rule.requiredApprovals,
  distinctApprovals: 0,
  draftVersion: 3,
  payableAmount: null,
  currency: 'OMR',
  requestedBy: null,
  requestedAt: null,
  lastDecision: null,
  callerMayRequest: false,
  callerMayDecide: false,
})

function step(id, command, body) {
  const current = approvals[id]
  if (!current) return { status: 409, body: { code: 'SALES_APPROVAL_NOT_REQUIRED' } }
  const now = new Date().toISOString()
  if (command === 'request') {
    Object.assign(current, {
      status: 'PENDING',
      distinctApprovals: 0,
      requestedBy: 'u-nasser',
      requestedAt: now,
      lastDecision: null,
      callerMayRequest: false,
      callerMayDecide: false,
    })
  } else if (command === 'withdraw') {
    Object.assign(current, {
      status: 'NOT_REQUESTED',
      distinctApprovals: 0,
      requestedBy: null,
      requestedAt: null,
      lastDecision: null,
      callerMayRequest: true,
      callerMayDecide: false,
    })
  } else if (command === 'approve') {
    const given = current.distinctApprovals + 1
    Object.assign(current, {
      distinctApprovals: given,
      status: given >= current.requiredApprovals ? 'APPROVED' : 'PENDING',
      lastDecision: { kind: 'APPROVED', by: 'u-nasser', at: now, reason: null },
      callerMayDecide: false,
    })
  } else if (command === 'reject') {
    if (!body?.text) return { status: 400, body: { code: 'SALES_APPROVAL_REASON_REQUIRED' } }
    Object.assign(current, {
      status: 'REJECTED',
      distinctApprovals: 0,
      lastDecision: { kind: 'REJECTED', by: 'u-nasser', at: now, reason: body.text },
      callerMayRequest: false,
      callerMayDecide: false,
    })
  }
  return current
}

export default [
  { match: RULE_PATH, reply: () => rule },
  {
    method: 'PUT',
    match: RULE_PATH,
    reply: ({ body }) => {
      if (body?.expectedVersion !== rule.version) {
        return { status: 409, body: { code: 'SALES_APPROVAL_RULE_VERSION_CONFLICT' } }
      }
      rule = {
        ...rule,
        ...body,
        version: rule.version + 1,
        updatedAt: new Date().toISOString(),
      }
      delete rule.expectedVersion
      return rule
    },
  },
  {
    match: new RegExp(`^/api/v1/invoice-drafts/${ID}/approval$`),
    reply: ({ params }) => approvals[params[0]] ?? notRequired(),
  },
  {
    method: 'POST',
    match: new RegExp(`^/api/v1/invoice-drafts/${ID}/approval/(request|withdraw|approve|reject)$`),
    reply: ({ params, body }) => step(params[0], params[1], body),
  },
]
