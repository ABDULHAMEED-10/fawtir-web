/**
 * Payment reminders (I-14) — the ladder, the log of what fired, and one invoice's preview and
 * history. Shapes follow `src/api/invoices/reminders.ts`. September 2026, Al Bahja Coffee: the
 * invoices and customers are `periodic.mjs`'s, so the queue the page works out from them, the
 * ladder and this log is consistent. Note `invoices.mjs` also answers `/authored-invoices` and
 * loads first when every module is on; run this pair alone for the reminders screenshots.
 */
import { INVOICES } from './periodic.mjs'

let schedule = { offsets: [-3, 0, 7, 14], enabled: true }

const RECIPIENT = {
  'c-mgh': 'ap@muscatgrand.om',
  'c-bahla': 'ahmed@bahlafort.om',
  'c-sohar': 'finance@sohargrandmall.om',
  'c-qurum': 'ap@qurumbc.om',
  'c-nizwa': 'khalid@nizwasouq.om',
  'c-mouj': 'hello@almoujmarina.om',
  'c-seeb': 'orders@seebcorniche.om',
  'c-salalah': 'finance@salalahbeach.om',
}

const plusDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fired(invoiceId, daysFromDue, outcome = 'SENT', locale = 'EN') {
  const inv = INVOICES.find((i) => i.id === invoiceId)
  const firedOn = plusDays(inv.dueDate, daysFromDue)
  return {
    invoiceId,
    invoiceNumber: inv.invoiceNumber,
    daysFromDue,
    firedOn,
    recipient: RECIPIENT[inv.customerId],
    locale,
    outcome,
    failureReason:
      outcome === 'FAILED' ? 'MailAuthenticationException: 535 authentication failed' : null,
    createdAt: `${firedOn}T04:00:00Z`,
  }
}

/**
 * What has gone out, newest first. The rungs an invoice has spent decide which one is next in the
 * queue: inv-101 (due 10 Sep) has had -3, 0 and 7 so its 14 is next; inv-102 (due 3 Sep) has spent
 * the whole ladder; inv-104's 7 failed and still counts as spent.
 */
const LOG = [
  fired('inv-101', 7),
  fired('inv-102', 14),
  fired('inv-104', 14, 'SENT', 'AR'),
  fired('inv-101', 0),
  fired('inv-105', 7),
  fired('inv-104', 7, 'FAILED'),
  fired('inv-102', 7),
  fired('inv-101', -3),
  fired('inv-105', 0, 'SKIPPED'),
  fired('inv-104', 0),
  fired('inv-102', 0),
  fired('inv-108', 7),
  fired('inv-108', 0),
  fired('inv-102', -3, 'SENT', 'AR'),
  fired('inv-104', -3),
  fired('inv-105', -3),
  fired('inv-109', 14),
  fired('inv-109', 7),
  fired('inv-109', 0),
  fired('inv-108', -3),
  fired('inv-109', -3),
].sort((a, b) => b.firedOn.localeCompare(a.firedOn))

function previewFor(invoiceId, rung) {
  const inv = INVOICES.find((i) => i.id === invoiceId)
  if (!inv) return { status: 404 }
  const recipient = RECIPIENT[inv.customerId] ?? null
  const outstanding = inv.payment.outstandingAmount.toFixed(3)
  const verdict =
    inv.payment.state === 'PAID'
      ? 'SETTLED'
      : !schedule.enabled
        ? 'TENANT_DISABLED'
        : rung !== null &&
            LOG.some((row) => row.invoiceId === invoiceId && row.daysFromDue === rung)
          ? 'ALREADY_SENT'
          : rung !== null && schedule.offsets.includes(rung)
            ? 'SEND'
            : 'NO_RUNG_TODAY'
  const late = rung !== null && rung > 0
  return {
    invoiceId,
    invoiceNumber: inv.invoiceNumber,
    verdict,
    rung,
    recipient,
    language: 'EN',
    subject: late
      ? `Invoice ${inv.invoiceNumber} is now ${rung} days overdue`
      : `Invoice ${inv.invoiceNumber}: just a reminder`,
    body: `Dear ${inv.customerName},\n\nThis is a reminder that invoice ${inv.invoiceNumber} for OMR ${outstanding} ${late ? `was due on ${inv.dueDate} and is still showing as unpaid on our side.` : `is due on ${inv.dueDate}.`}\n\nIf it has already been paid, please ignore this note and accept our apologies. If there is a query on the invoice, just reply to this email and we will sort it out.\n\nKind regards,\nHafidh Saif\nAl Bahja Coffee`,
  }
}

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
    reply: ({ params, query }) =>
      previewFor(params[0], query.get('days_from_due') ? Number(query.get('days_from_due')) : null),
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
