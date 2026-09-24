/**
 * Payment reminders (I-14) — the ladder, the log of what fired, and one invoice's preview and
 * history. Shapes follow `src/api/invoices/reminders.ts`. September 2026, Al Bahja Coffee.
 */

let schedule = { offsets: [-3, 0, 7, 14], enabled: true }

const CUSTOMERS = [
  ['inv-101', 'INV-2026-000401', 'accounts@muscatgrandhotel.om'],
  ['inv-102', 'INV-2026-000398', 'billing@bahlafort.om'],
  ['inv-103', 'INV-2026-000377', 'finance@sohargrandmall.om'],
  ['inv-104', 'INV-2026-000351', 'ap@qurumbc.om'],
  ['inv-105', 'INV-2026-000290', 'owner@nizwasouqcafe.om'],
  ['inv-106', 'INV-2026-000441', 'hello@almoujmarina.om'],
  ['inv-107', 'INV-2026-000455', 'orders@seebcorniche.om'],
  ['inv-108', 'INV-2026-000301', 'accounts@salalahbeach.om'],
]

const OUTCOMES = ['SENT', 'SENT', 'SENT', 'FAILED', 'SENT', 'SKIPPED', 'SENT', 'SENT']
const RUNGS = [-3, 0, 7, 14]

/** 26 rows, newest first, spread over September so the date filter has something to bite on. */
const LOG = Array.from({ length: 26 }, (_, i) => {
  const [invoiceId, invoiceNumber, recipient] = CUSTOMERS[i % CUSTOMERS.length]
  const outcome = OUTCOMES[i % OUTCOMES.length]
  const day = 24 - Math.floor(i * 0.9)
  const firedOn = `2026-09-${String(Math.max(1, day)).padStart(2, '0')}`
  return {
    invoiceId,
    invoiceNumber,
    daysFromDue: RUNGS[i % RUNGS.length],
    firedOn,
    recipient,
    locale: i % 5 === 0 ? 'AR' : 'EN',
    outcome,
    failureReason:
      outcome === 'FAILED' ? 'MailAuthenticationException: 535 authentication failed' : null,
    createdAt: `${firedOn}T04:00:00Z`,
  }
})

export default [
  { match: '/api/v1/payment-reminders/schedule', reply: () => schedule },
  {
    method: 'PUT',
    match: '/api/v1/payment-reminders/schedule',
    reply: ({ body }) => {
      schedule = {
        offsets: [...new Set(body.offsets)].sort((a, b) => a - b),
        enabled: body.enabled,
      }
      return schedule
    },
  },
  {
    match: '/api/v1/payment-reminders/log',
    reply: ({ query }) => {
      const page = Number(query.get('page') ?? 0)
      const size = Number(query.get('page_size') ?? 20)
      const outcome = query.get('outcome')
      const from = query.get('from')
      const to = query.get('to')
      const invoiceId = query.get('invoice_id')
      const rows = LOG.filter(
        (row) =>
          (!outcome || row.outcome === outcome) &&
          (!from || row.firedOn >= from) &&
          (!to || row.firedOn <= to) &&
          (!invoiceId || row.invoiceId === invoiceId),
      )
      return rows.slice(page * size, page * size + size)
    },
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/reminders$/,
    reply: ({ params }) => LOG.filter((row) => row.invoiceId === params[0]),
  },
  {
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/reminders\/preview$/,
    reply: ({ params, query }) => {
      const found = CUSTOMERS.find(([id]) => id === params[0]) ?? [
        '',
        'INV-2026-000000',
        'accounts@example.om',
      ]
      const rung = query.get('days_from_due') ? Number(query.get('days_from_due')) : null
      return {
        invoiceId: params[0],
        invoiceNumber: found[1],
        verdict: rung !== null && RUNGS.includes(rung) ? 'SEND' : 'NO_RUNG_TODAY',
        rung,
        recipient: found[2],
        language: 'EN',
        subject: `Invoice ${found[1]} — payment reminder`,
        body: `Dear customer,\n\nOMR 58.590 for invoice ${found[1]} is due. Please settle by bank transfer using the invoice reference.`,
      }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/authored-invoices\/([^/]+)\/reminders\/send$/,
    reply: () => ({
      status: 503,
      body: {
        type: 'https://api.fawtir.om/problems/reminder-delivery-unavailable',
        code: 'REMINDER_DELIVERY_UNAVAILABLE',
        title: 'No mail sender',
        status: 503,
      },
    }),
  },
]
