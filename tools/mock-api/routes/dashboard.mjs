/**
 * `GET /v1/dashboard` (`src/api/reports/dashboard.ts`): a believable month for the sample company,
 * Al Bahja Coffee, for the dashboard screen and the public site's screenshots. Dates follow today in
 * Muscat, so the tiles read as current whenever the mock is started. `DASHBOARD_EMPTY=1` answers
 * every tile UNAVAILABLE, as a new company would see it.
 */

const pad = (n) => String(n).padStart(2, '0')
const muscatToday = () => {
  const now = new Date(Date.now() + 4 * 60 * 60 * 1000)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const plusDays = (d, n) => new Date(d.getTime() + n * 86400000)
const monthStart = (d, back) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1))

const ok = (data) => ({ status: 'OK', data })
const unavailable = () => ({ status: 'UNAVAILABLE', data: null })

/** Twelve months of invoiced sales, rising into the cooler season, in rials. */
const TREND = [
  [182, 9840.25],
  [176, 9412.6],
  [168, 8977.4],
  [171, 9204.15],
  [158, 8605.3],
  [149, 8120.9],
  [163, 8890.45],
  [188, 10215.7],
  [204, 11480.35],
  [219, 12360.8],
  [236, 13725.4],
  [61, 3842.15],
]

const RECENT = [
  ['INV-2026-0418', 'Muscat Grand Hotel LLC', 1, 486.15, 'DISPATCHED', 'DELIVERED', 'AP'],
  ['INV-2026-0417', 'Ministry of Heritage & Tourism', 1, 1260.0, 'DISPATCHED', 'SENT', null],
  ['INV-2026-0416', 'Qurum Business Center', 2, 318.5, 'DISPATCHED', 'DELIVERED', 'AB'],
  ['INV-2026-0415', 'Salalah Beach Resort', 3, 742.8, 'DISPATCHED', 'DELIVERED', 'AP'],
  ['INV-2026-0414', 'Nizwa Souq Café', 4, 94.5, 'PENDING', null, null],
  ['INV-2026-0413', 'Sohar Grand Mall', 5, 215.25, 'DISPATCHED', 'DELIVERED', 'AP'],
]

function dashboard() {
  const today = muscatToday()
  if (process.env.DASHBOARD_EMPTY) {
    return {
      asOf: iso(today),
      timeZone: 'Asia/Muscat',
      branchId: null,
      receivables: unavailable(),
      cash: unavailable(),
      vat: unavailable(),
      volumeTrend: unavailable(),
      compliance: unavailable(),
      recentInvoices: unavailable(),
      alerts: unavailable(),
    }
  }
  const quarterStart = monthStart(today, today.getUTCMonth() % 3)
  return {
    asOf: iso(today),
    timeZone: 'Asia/Muscat',
    branchId: null,
    receivables: ok([
      {
        currency: 'OMR',
        outstanding: 14320.45,
        overdue: 2186.3,
        overdueCount: 3,
        openCount: 12,
        dueThisMonth: 6840.2,
      },
    ]),
    cash: ok({
      from: iso(today),
      to: iso(today),
      previousFrom: iso(plusDays(today, -1)),
      previousTo: iso(plusDays(today, -1)),
      byCurrency: [{ currency: 'OMR', received: 1240.85, previousReceived: 1034.2 }],
    }),
    vat: ok({
      from: iso(quarterStart),
      to: iso(plusDays(monthStart(today, -(3 - (today.getUTCMonth() % 3))), -1)),
      branchScoped: false,
      output: [{ side: 'OUTPUT', currency: 'OMR', vatAmount: 1846.72 }],
      input: [{ side: 'INPUT', currency: 'OMR', vatAmount: 612.38 }],
      net: [{ side: 'NET', currency: 'OMR', vatAmount: 1234.34 }],
    }),
    volumeTrend: ok({
      from: iso(monthStart(today, 11)),
      to: iso(today),
      months: TREND.map(([documents, totalAmount], index) => {
        const start = monthStart(today, 11 - index)
        return {
          period: iso(start).slice(0, 7),
          periodStart: iso(start),
          currency: 'OMR',
          documents,
          totalAmount,
        }
      }),
    }),
    compliance: ok({
      from: `${iso(monthStart(today, 0))}T00:00:00Z`,
      to: `${iso(today)}T00:00:00Z`,
      scope: 'TENANT',
      documents: 412,
      outboundInvoiceAck: { ap: 398, ab: 8, re: 2, none: 4 },
      deliverySuccessRate: 0.987,
      deadLettered: 0,
      attention: 2,
    }),
    recentInvoices: ok(
      RECENT.map(([number, customer, daysAgo, total, dispatch, transport, ack], index) => ({
        id: `dash-inv-${index + 1}`,
        invoiceNumber: number,
        invoiceType: 'INVOICE',
        state: 'ISSUED',
        issueDate: iso(plusDays(today, -daysAgo)),
        customerName: customer,
        currency: 'OMR',
        total,
        dispatch,
        transportState: transport,
        invoiceAck: ack,
      })),
    ),
    alerts: ok([
      { code: 'OVERDUE_INVOICES', severity: 'WARNING', count: 3 },
      { code: 'NEEDS_ATTENTION', severity: 'WARNING', count: 2 },
    ]),
  }
}

export default [{ match: '/api/v1/dashboard', reply: () => dashboard() }]
