/**
 * Settings › Plan and usage: self-service plan and billing-cycle changes (backend P2-2), in the
 * shapes `src/api/settings/planChanges.ts` reads. The company is on Business, monthly, paid to
 * 31 October; today is 11 October, so 21 days are left including today (PC-4).
 *
 * Off by default, as the server's `FAWTIR_SUBSCRIPTION_SELF_SERVICE_PLAN_CHANGE_ENABLED`: the list
 * answers `available: false` and the preview and the request 409 `plan-change-unavailable`, so
 * every other screenshot is unchanged. `MOCK_PLAN_CHANGE=on` opens it.
 * `MOCK_PLAN_CHANGE_STATE=pending` starts with an upgrade to Business Plus waiting for payment,
 * `=ending` refuses every move with `plan-change-while-ending`, `=keep` quotes keeping Business
 * after the Starter renewal was paid early (pair it with `MOCK_SUBSCRIPTION_STATE=downgradePaid`).
 *
 * A charged change issues a PLAN_CHANGE bill, listed on Bills and payment by `extraDocuments.mjs`
 * through {@link planChangeBillRows}; a downgrade is set as the subscription's scheduled change.
 */
import { setScheduledChange } from './settingsPeople.mjs'

const TODAY = '2026-10-11'
const PERIOD_END = '2026-10-31'
const YEAR_END = '2027-09-30'
const VAT_RATE = '0.05000'
const ON = process.env.MOCK_PLAN_CHANGE === 'on'
const MODE = process.env.MOCK_PLAN_CHANGE_STATE ?? ''

const PLANS = {
  STARTER: {
    name: 'Starter',
    monthly: '35.000',
    annual: '350.000',
    documents: 200,
    users: 2,
    branches: 1,
  },
  BUSINESS: {
    name: 'Business',
    monthly: '80.000',
    annual: '800.000',
    documents: 1000,
    users: 5,
    branches: 2,
  },
  BUSINESS_PLUS: {
    name: 'Business Plus',
    monthly: '150.000',
    annual: '1500.000',
    documents: 3000,
    users: 10,
    branches: null,
  },
}

const baisa = (text) => Math.round(Number(text) * 1000)
const omr = (value) => (value / 1000).toFixed(3)
const vatOf = (net) => Math.round(net * 0.05)

const problem = (status, slug, detail, extra = {}) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, title: slug, status, detail, ...extra },
})

const side = (code, cycle) => ({
  planCode: code,
  planName: PLANS[code].name,
  planVersionId: `pv-${code}`,
  cycle,
  periodPrice: cycle === 'ANNUAL' ? PLANS[code].annual : PLANS[code].monthly,
})

function charge({ periods = [], credit = 0, extras = [], net, start, end, days, newPaidThrough }) {
  const vat = vatOf(net)
  return {
    windowStartsOn: start,
    windowEndsOn: end,
    daysLeft: days,
    includesToday: start === TODAY,
    periods,
    credit: omr(credit),
    extras,
    subtotal: omr(net),
    vatRate: VAT_RATE,
    vatAmount: omr(vat),
    total: omr(net + vat),
    currency: 'OMR',
    newPaidThrough: newPaidThrough ?? null,
  }
}

/** The server's decision table for this one company, figures worked out as the server does. */
function preview(planCode, cycle) {
  const to = PLANS[planCode]
  if (!to) return null
  const base = {
    from: side('BUSINESS', 'MONTHLY'),
    to: side(planCode, cycle),
    cycleChangeOn: null,
    subscriptionDate: 1,
    lostFeatures: [],
    erpAddonStops: false,
    users: null,
    branches: null,
    blockers: MODE === 'ending' ? ['plan-change-while-ending'] : [],
  }
  const allowance = (after) => ({ now: 1000, used: 412, afterChange: after })
  if (planCode === 'BUSINESS' && cycle === 'MONTHLY') {
    if (MODE !== 'keep') {
      return {
        ...base,
        kind: 'NONE',
        applies: 'NOTHING',
        effectiveOn: null,
        charge: null,
        allowance: allowance(1000),
        blockers: [],
      }
    }
    // The whole November period, paid at the Starter price, re-priced back to Business.
    const net = baisa('80.000') - baisa('35.000')
    return {
      ...base,
      kind: 'KEEP_PLAN',
      applies: 'AT_ONCE_WHEN_PAID',
      effectiveOn: TODAY,
      charge: charge({
        periods: [
          {
            startsOn: '2026-11-01',
            endsOn: '2026-11-30',
            totalDays: 30,
            remainingDays: 30,
            fromPrice: '35.000',
            toPrice: '80.000',
            amount: omr(net),
          },
        ],
        net,
        start: '2026-11-01',
        end: '2026-11-30',
        days: 30,
      }),
      allowance: allowance(1000),
    }
  }
  const dearer = baisa(to.monthly) > baisa(PLANS.BUSINESS.monthly)
  if (cycle === 'ANNUAL' && planCode !== 'STARTER') {
    // PC-2: the year runs from 1 October; October's 80.000 is credited; the paid extra user moves
    // to 2.500 × 10 a year, less the 2.500 paid for October (PL-4).
    const credit = baisa('80.000')
    const planNet = baisa(to.annual) - credit
    const extra = {
      type: 'USER',
      count: 1,
      annualUnitPrice: '25.000',
      credit: '2.500',
      amount: '22.500',
      coversFrom: '2026-11-01',
      coversTo: YEAR_END,
    }
    return {
      ...base,
      kind: 'CYCLE_TO_ANNUAL',
      applies: 'AT_ONCE_WHEN_PAID',
      effectiveOn: TODAY,
      charge: charge({
        credit,
        extras: [extra],
        net: planNet + baisa(extra.amount),
        start: TODAY,
        end: YEAR_END,
        days: 355,
        newPaidThrough: YEAR_END,
      }),
      allowance: allowance(to.documents),
    }
  }
  if (dearer) {
    // 70.000 a month more for 21 of October's 31 days, today included, rounded once.
    const net = Math.round(((baisa(to.monthly) - baisa(PLANS.BUSINESS.monthly)) * 21) / 31)
    return {
      ...base,
      kind: 'UPGRADE',
      applies: 'AT_ONCE_WHEN_PAID',
      effectiveOn: TODAY,
      charge: charge({
        periods: [
          {
            startsOn: '2026-10-01',
            endsOn: PERIOD_END,
            totalDays: 31,
            remainingDays: 21,
            fromPrice: PLANS.BUSINESS.monthly,
            toPrice: to.monthly,
            amount: omr(net),
          },
        ],
        net,
        start: TODAY,
        end: PERIOD_END,
        days: 21,
      }),
      allowance: allowance(to.documents),
    }
  }
  // Starter, either cycle: a downgrade at the 1 November renewal (P2-2 Q2 for annual).
  return {
    ...base,
    kind: 'DOWNGRADE',
    applies: 'ON_DATE',
    effectiveOn: '2026-11-01',
    charge: null,
    allowance: allowance(to.documents),
    lostFeatures: ['approvals', 'stock', 'recurringBills'],
    users: { included: 2, inUse: 3, overBy: 1, defaultSwitchOff: ['u-aisha'] },
    branches: { included: 1, inUse: 2, overBy: 1, defaultSwitchOff: ['b-seeb'] },
  }
}

const state = { pending: null, payment: null, history: [] }

function bill(view, quote) {
  return {
    id: `b-plan-change-${view.toPlanCode}-${view.toCycle}`,
    number: 'FWT-SUB-2026-000061',
    planCode: view.toPlanCode,
    planName: PLANS[view.toPlanCode].name,
    billingCycle: view.toCycle,
    periodStartsOn: quote.charge.windowStartsOn,
    periodEndsOn: quote.charge.windowEndsOn,
    subtotal: quote.charge.subtotal,
    vatRate: VAT_RATE,
    vatAmount: quote.charge.vatAmount,
    total: quote.charge.total,
    currency: 'OMR',
    taxDocumentStatus: 'NOT_A_TAX_INVOICE',
    status: 'OPEN',
    dueOn: TODAY,
    issuedAt: `${TODAY}T08:00:00Z`,
    paidAt: null,
    appliedPaidThrough: null,
    voidReason: null,
    version: 0,
    seller: {
      legalNameEn: 'Thumb International SPC',
      legalNameAr: 'الإبهام العالمية ش ش و',
      crNumber: '1383315',
      taxIdentificationNumber: '1875504',
      vatNumber: null,
      addressEn: 'Al Khuwair, Bousher, Muscat',
      addressAr: null,
    },
  }
}

function view(quote, id) {
  const charged = ['UPGRADE', 'CYCLE_TO_ANNUAL', 'KEEP_PLAN'].includes(quote.kind)
  const result = {
    id: charged ? id : null,
    kind: quote.kind,
    status: charged ? 'PENDING_PAYMENT' : null,
    applies: quote.applies,
    effectiveOn: quote.effectiveOn,
    fromPlanCode: quote.from.planCode,
    fromCycle: quote.from.cycle,
    toPlanCode: quote.to.planCode,
    toPlanVersionId: quote.to.planVersionId,
    toCycle: quote.to.cycle,
    cycleChangeOn: quote.cycleChangeOn,
    windowStartsOn: quote.charge?.windowStartsOn ?? null,
    windowEndsOn: quote.charge?.windowEndsOn ?? null,
    daysLeft: quote.charge?.daysLeft ?? null,
    newPaidThrough: quote.charge?.newPaidThrough ?? null,
    credit: quote.charge?.credit ?? null,
    net: quote.charge?.subtotal ?? null,
    bill: null,
    requestedAt: charged ? `${TODAY}T08:00:00Z` : null,
    closedAt: null,
    closeReason: null,
  }
  if (charged) result.bill = bill(result, quote)
  return result
}

if (ON && MODE === 'pending') state.pending = view(preview('BUSINESS_PLUS', 'MONTHLY'), 'pc-1')

/** The open plan-change bill as Bills and payment lists it (read by `extraDocuments.mjs`). */
export function planChangeBillRows() {
  if (!state.pending?.bill) return []
  return [
    {
      bill: { ...state.pending.bill, status: state.payment ? 'PENDING_VERIFICATION' : 'OPEN' },
      payments: state.payment ? [state.payment] : [],
      card: state.payment
        ? null
        : { available: true, purpose: 'SUBSCRIPTION_UPGRADE', reason: null },
      kind: 'PLAN_CHANGE',
    },
  ]
}

/** A bank transfer or cash request for the open plan-change bill; null when it is not that bill. */
export function payPlanChangeBill(billId, method) {
  if (!state.pending?.bill || state.pending.bill.id !== billId) return null
  state.payment = {
    id: `p-plan-change-${method.toLowerCase()}`,
    billId,
    method,
    status: 'SUBMITTED',
    amount: state.pending.bill.total,
    submittedAt: `${TODAY}T08:05:00Z`,
    reference: method === 'BANK_TRANSFER' ? 'TRF-778820' : null,
    customerNote: null,
    proofContentType: method === 'BANK_TRANSFER' ? 'application/pdf' : null,
    receiptNumber: null,
    receivedAmount: null,
    receivedAt: null,
    rejectionReason: null,
    version: 0,
  }
  return state.payment
}

const UNAVAILABLE = () =>
  problem(409, 'plan-change-unavailable', 'Self-service plan changes are not open.')

export default [
  {
    match: '/api/v1/settings/plan/changes',
    reply: () => ({
      available: ON,
      pending: ON ? state.pending : null,
      history: ON ? state.history : [],
    }),
  },
  {
    match: '/api/v1/settings/plan/changes/preview',
    reply: ({ query }) => {
      if (!ON) return UNAVAILABLE()
      const quote = preview(
        String(query.get('planCode') ?? ''),
        query.get('billingCycle') ?? 'MONTHLY',
      )
      if (!quote) return problem(404, 'not-found', 'No such plan.')
      if (state.pending && quote.kind !== 'NONE')
        quote.blockers = [...quote.blockers, 'plan-change-already-pending']
      return quote
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/plan/changes',
    reply: ({ body }) => {
      if (!ON) return UNAVAILABLE()
      const quote = preview(String(body?.planCode ?? ''), body?.billingCycle ?? 'MONTHLY')
      if (!quote) return problem(404, 'not-found', 'No such plan.')
      if (quote.blockers.length > 0) return problem(409, quote.blockers[0], 'Refused.')
      if (state.pending)
        return problem(409, 'plan-change-already-pending', 'Pay or withdraw it first.')
      if (quote.kind === 'NONE') return { status: 200, body: view(quote, null) }
      if (quote.charge && quote.charge.total !== body?.expectedTotal) {
        return problem(409, 'plan-change-quote-changed', 'The price changed.', { preview: quote })
      }
      const made = view(quote, `pc-${state.history.length + 2}`)
      if (made.status === 'PENDING_PAYMENT') state.pending = made
      if (quote.applies === 'ON_DATE') {
        setScheduledChange({
          planCode: quote.to.planCode,
          planName: quote.to.planName,
          billingCycle: quote.to.cycle,
          periodPrice: quote.to.periodPrice,
          effectiveOn: quote.effectiveOn,
        })
      }
      return { status: 201, body: made }
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/settings\/plan\/changes\/([^/]+)$/,
    reply: ({ params }) => {
      if (!state.pending || state.pending.id !== params[0])
        return problem(404, 'not-found', 'No such change.')
      if (state.payment) return problem(409, 'plan-change-already-paid', 'A payment was sent.')
      const withdrawn = {
        ...state.pending,
        status: 'WITHDRAWN',
        closedAt: `${TODAY}T09:00:00Z`,
        closeReason: 'CUSTOMER',
        bill: { ...state.pending.bill, status: 'VOID', voidReason: 'Withdrawn by the customer' },
      }
      state.history = [withdrawn, ...state.history]
      state.pending = null
      return withdrawn
    },
  },
]
