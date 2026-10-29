import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { BillRowDto } from '../../api/expenditure/bills'
import { useNoteBill } from './noteBill'

function row(id: string, overrides: Partial<BillRowDto> = {}): BillRowDto {
  return {
    id,
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '380',
    supplierBillNumber: 'INV-A1',
    issueDate: '2026-09-01',
    dueDate: null,
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 100,
    vatAmount: 4.762,
    paidAmount: 0,
    outstandingAmount: 100,
    purchaseOrderReference: null,
    workflowState: 'APPROVED',
    readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
    match: null,
    hold: null,
    paymentRunReference: null,
    paidOnTheSpot: false,
    ...overrides,
  }
}

// The held copy is newer, so the server's newest-first list puts it ahead of the original.
const COPY = row('b-copy', {
  workflowState: 'ON_HOLD',
  hold: { reason: 'x', openedAt: '2026-10-28T08:00:00Z', duplicateOfBillId: 'b-original' },
  duplicateHold: {
    duplicateOfBillId: 'b-original',
    duplicateOfBillNumber: 'INV-A1',
    resolution: null,
    sameDocumentUuid: false,
  },
})
const ORIGINAL = row('b-original', { duplicateHold: null })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/v1/bills?'))
      return new Response(
        JSON.stringify({ items: [COPY, ORIGINAL], page: 0, pageSize: 10, count: 2, total: 2 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

describe('the bill a held credit note corrects, found by its number', () => {
  it('is the original, not its newer held copy with the same number', async () => {
    const { result } = renderHook(
      () => useNoteBill({ billId: null, billNumber: 'INV-A1', supplierId: 's-1' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.bill).not.toBeNull())
    expect(result.current.bill?.id).toBe('b-original')
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=INV-A1')
  })
})
