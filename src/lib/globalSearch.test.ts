import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchEverywhere } from './globalSearch'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const row = (id: string, type: string, invoiceNumber: string) => ({
  id,
  type,
  version: 1,
  authoringState: 'ISSUED',
  deliveryState: 'NOT_SUBMITTED',
  customerId: 'c-1',
  currency: 'OMR',
  invoiceNumber,
  issueDate: '2026-10-01',
  dueDate: '2026-10-01',
  details: null,
  lines: [],
  totals: { totalAmount: 10 },
  customerName: 'Sohar Port Logistics',
  payment: null,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('global search', () => {
  it('opens a credit or debit note on its own page and an invoice on the invoice page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/v1/authored-invoices?')
          ? json(200, {
              content: [
                row('inv-1', 'INVOICE', 'INV-1'),
                row('cn-1', 'CREDIT_NOTE', 'CRN-1'),
                row('dn-1', 'DEBIT_NOTE', 'DBN-1'),
              ],
              page: 0,
              size: 4,
              totalElements: 3,
            })
          : json(404, { type: 'https://api.fawtir.om/problems/not-found' }),
      ),
    )
    const { hits } = await searchEverywhere('1', 'en')
    const to = Object.fromEntries(
      hits.filter((hit) => hit.kind === 'invoice').map((hit) => [hit.id, hit.to]),
    )
    expect(to).toEqual({
      'inv-1': '/invoices/inv-1',
      'cn-1': '/income/credit-notes/cn-1',
      'dn-1': '/income/debit-notes/dn-1',
    })
  })
})
