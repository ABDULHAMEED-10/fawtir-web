/**
 * Settings › Plan and usage › Buy extra documents, and the bill it issues on Bills and payment, in
 * the shapes `src/api/settings/extraDocuments.ts` and `billing.ts` read (backend V301). The state
 * is kept here so an order shows as the bill to pay on the next read and a payment as waiting,
 * as the server does. Business's rate (0.060) and 5% VAT stand in for the console's settings.
 *
 * `MOCK_EXTRAS_STATE=order` starts with an unpaid order of 100, `=none` with no allowance left.
 */
const TODAY = '2026-10-11'
const PERIOD = { start: '2026-10-01', end: '2026-10-31' }
const RATE = '0.060'
const VAT_RATE = '0.05000'
const MIN = 10
const MAX = 10000

const baisa = (text) => Math.round(Number(text) * 1000)
const omr = (value) => (value / 1000).toFixed(3)

function priced(documents) {
  const net = baisa(RATE) * documents
  const vat = Math.round(net * Number(VAT_RATE))
  return { net: omr(net), vat: omr(vat), total: omr(net + vat) }
}

const state = { order: null, payment: null, credits: [] }

function grantCredit() {
  return {
    id: 'c-grant-1',
    source: 'GRANT',
    status: 'ACTIVE',
    documents: 20,
    unitPrice: null,
    netAmount: null,
    billId: null,
    startsOn: PERIOD.start,
    expiresOn: PERIOD.end,
    createdAt: '2026-10-05T07:00:00Z',
    activatedAt: '2026-10-05T07:00:00Z',
    cancelledAt: null,
  }
}
state.credits.push(grantCredit())

function placeOrder(documents) {
  const price = priced(documents)
  const id = `b-extras-${documents}`
  const bill = {
    id,
    number: 'FWT-SUB-2026-000042',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodStartsOn: PERIOD.start,
    periodEndsOn: PERIOD.end,
    subtotal: price.net,
    vatRate: VAT_RATE,
    vatAmount: price.vat,
    total: price.total,
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
  const credit = {
    id: `c-buy-${documents}`,
    source: 'PURCHASE',
    status: 'PENDING',
    documents,
    unitPrice: RATE,
    netAmount: price.net,
    billId: id,
    startsOn: null,
    expiresOn: null,
    createdAt: `${TODAY}T08:00:00Z`,
    activatedAt: null,
    cancelledAt: null,
  }
  // Another number replaces the unpaid order, as the server voids it and issues a new bill.
  state.credits = state.credits.filter((entry) => entry.status !== 'PENDING')
  state.credits.unshift(credit)
  state.order = { credit, bill }
  state.payment = null
  return state.order
}

if (process.env.MOCK_EXTRAS_STATE === 'order') placeOrder(100)

function allowance() {
  const extra = state.credits
    .filter((credit) => credit.status === 'ACTIVE')
    .reduce((sum, credit) => sum + credit.documents, 0)
  const planDocuments = 1000
  const used = process.env.MOCK_EXTRAS_STATE === 'none' ? planDocuments + extra : 412
  const total = planDocuments + extra
  return {
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
    resetsOn: '2026-11-01',
    planDocuments,
    extraDocuments: extra,
    totalAllowance: total,
    issued: used - 12,
    resubmissions: 3,
    received: 12,
    receivedHidden: process.env.MOCK_EXTRAS_STATE === 'none' ? 4 : 0,
    used,
    planUsed: Math.min(used, planDocuments),
    extraUsed: Math.max(0, used - planDocuments),
    left: Math.max(0, total - used),
    warningPercent: used >= total ? 100 : used / total >= 0.9 ? 90 : used / total >= 0.8 ? 80 : null,
    issuingAllowed: used < total,
    extrasExpireOn: PERIOD.end,
    byBranch: [],
  }
}

const problem = (status, slug, detail) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, title: slug, status, detail },
})

function payment(method) {
  return {
    id: `p-${method.toLowerCase()}`,
    billId: state.order.bill.id,
    method,
    status: 'SUBMITTED',
    amount: state.order.bill.total,
    submittedAt: `${TODAY}T08:05:00Z`,
    reference: method === 'BANK_TRANSFER' ? 'TRF-778812' : null,
    customerNote: null,
    proofContentType: method === 'BANK_TRANSFER' ? 'application/pdf' : null,
    receiptNumber: null,
    receivedAmount: null,
    receivedAt: null,
    rejectionReason: null,
    version: 0,
  }
}

export default [
  {
    match: '/api/v1/settings/plan/extra-documents',
    reply: () => ({
      planCode: 'BUSINESS',
      offered: true,
      unitPrice: RATE,
      minPerPurchase: MIN,
      maxPerPurchase: MAX,
      expiresOn: PERIOD.end,
      allowance: allowance(),
      outstanding: state.order,
      credits: state.credits,
    }),
  },
  {
    match: '/api/v1/settings/plan/extra-documents/quote',
    reply: ({ query }) => {
      const documents = Number(query.get('documents'))
      if (!Number.isInteger(documents) || documents < MIN || documents > MAX) {
        return problem(400, 'validation-failed', `Extra documents are bought ${MIN} to ${MAX} at a time`)
      }
      const price = priced(documents)
      return {
        planCode: 'BUSINESS',
        documents,
        unitPrice: RATE,
        netAmount: price.net,
        vatRate: VAT_RATE,
        vatAmount: price.vat,
        total: price.total,
        currency: 'OMR',
        expiresOn: PERIOD.end,
        minPerPurchase: MIN,
        maxPerPurchase: MAX,
        nextPlanCode: 'BUSINESS_PLUS',
        // Business to Business Plus is 70.000 a month more: from 1,167 documents they cost more.
        upgradeSuggested: baisa(price.net) > 70000,
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/plan/extra-documents/purchases',
    reply: ({ body }) => {
      const documents = Number(body?.documents)
      if (!Number.isInteger(documents) || documents < MIN || documents > MAX) {
        return problem(400, 'validation-failed', `Extra documents are bought ${MIN} to ${MAX} at a time`)
      }
      if (state.payment) {
        return problem(409, 'payment-state-conflict', 'A payment for extra documents is already being checked.')
      }
      if (state.order && state.order.credit.documents === documents) return { status: 201, body: state.order }
      return { status: 201, body: placeOrder(documents) }
    },
  },
  {
    match: '/api/v1/settings/billing',
    reply: () => ({
      bills: state.order
        ? [
            {
              bill: { ...state.order.bill, status: state.payment ? 'PENDING_VERIFICATION' : 'OPEN' },
              payments: state.payment ? [state.payment] : [],
              card: state.payment
                ? null
                : { available: true, purpose: 'EXTRA_DOCUMENTS', reason: null },
            },
          ]
        : [],
      nextBillsCursor: null,
      beneficiary: {
        legalName: 'Thumb International SPC',
        bankName: 'Bank Muscat',
        iban: 'OM810180000001299123456',
        swiftCode: 'BMUSOMMX',
      },
      methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true, card: true },
      proofMaximumBytes: 5000000,
      signupMethod: null,
      signupPayment: null,
    }),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/settings\/billing\/bills\/([^/]+)\/(bank-transfer|cash-request)$/,
    reply: ({ params }) => {
      if (!state.order || state.order.bill.id !== params[0]) return problem(409, 'bill-not-payable', 'No such bill.')
      state.payment = payment(params[1] === 'bank-transfer' ? 'BANK_TRANSFER' : 'CASH')
      return { status: 201, body: state.payment }
    },
  },
]
