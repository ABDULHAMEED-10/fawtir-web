/**
 * Supplier documents waiting while the company may not open them (Business Rules AL-7), in the
 * shapes `src/api/expenditure/waitingDocuments.ts` reads: `GET /v1/inbound-invoices/waiting` (a
 * page, oldest receipt first) and `GET /v1/inbound-invoices/waiting/count` (the badge).
 *
 * Fourteen documents: twelve held because the month's documents are used up, two received while
 * the subscription was unpaid. One predates V310, so its supplier name and issue date are null.
 */
const SUPPLIERS = [
  ['Muscat Roastery LLC', '0248:om1100123456'],
  ['Nizwa Dairy SAOC', '0248:om1100456789'],
  ['Sohar Packaging Co.', '0248:om1100778899'],
  ['Al Batinah Water', '0248:om1100990011'],
]

const TYPES = ['INVOICE', 'INVOICE', 'INVOICE', 'CREDIT_NOTE', 'INVOICE', 'DEBIT_NOTE']

const WAITING = Array.from({ length: 14 }, (_, index) => {
  const [supplierName, supplierParticipantId] = SUPPLIERS[index % SUPPLIERS.length]
  const day = String(2 + index).padStart(2, '0')
  const legacy = index === 0
  return {
    id: `7a0c1f00-0000-4000-8000-0000000000${String(index + 10)}`,
    supplierName: legacy ? null : supplierName,
    supplierParticipantId,
    invoiceNumber: `INV-${2400 + index}`,
    issueDate: legacy ? null : `2026-10-${day}`,
    receivedAt: `2026-10-${day}T0${index % 9}:15:00Z`,
    documentType: TYPES[index % TYPES.length],
    reason: index < 2 ? 'SUBSCRIPTION_ENDED' : 'NO_DOCUMENTS_LEFT',
  }
})

function byReason() {
  const counts = { COMPANY_NOT_ACTIVE: 0, SUBSCRIPTION_ENDED: 0, NO_DOCUMENTS_LEFT: 0 }
  for (const item of WAITING) counts[item.reason] += 1
  return counts
}

export default [
  {
    match: '/api/v1/inbound-invoices/waiting/count',
    reply: () => ({ total: WAITING.length, byReason: byReason() }),
  },
  {
    match: '/api/v1/inbound-invoices/waiting',
    reply: ({ query }) => {
      const page = Math.max(0, Number(query.get('page') ?? 0) || 0)
      const pageSize = Math.min(200, Math.max(1, Number(query.get('page_size') ?? 50) || 50))
      const items = WAITING.slice(page * pageSize, (page + 1) * pageSize)
      return {
        items,
        page,
        pageSize,
        count: items.length,
        total: WAITING.length,
        byReason: byReason(),
      }
    },
  },
]
