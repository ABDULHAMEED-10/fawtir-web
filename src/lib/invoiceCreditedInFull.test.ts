import { describe, expect, it } from 'vitest'
import { statusOf } from './invoiceDetail'
import { toInvoiceListItem } from './invoiceList'
import type { InvoiceDetailDto, InvoiceReceivableDto } from '../api/invoices/detail'
import type { InvoiceRowDto } from '../api/invoices/list'

/** A sale refunded in full is settled by its credit notes, with no money kept (stack check, 31 Oct). */
const row = (paidAmount: number, creditedAmount: number) =>
  ({
    id: 'i-1',
    type: 'INVOICE',
    authoringState: 'ISSUED',
    totals: null,
    payment: { state: 'PAID', overdue: false, paidAmount, creditedAmount },
  }) as unknown as InvoiceRowDto

const owed = (paidAmount: number, creditedAmount: number) =>
  ({ paymentState: 'PAID', overdue: false, paidAmount, creditedAmount }) as InvoiceReceivableDto
const issued = { authoringState: 'ISSUED' } as InvoiceDetailDto

describe('an invoice settled only by credit notes', () => {
  it('reads Credited in full on the list, and Paid when money was kept', () => {
    expect(toInvoiceListItem(row(0, 14.025)).payment).toBe('credited')
    expect(toInvoiceListItem(row(10, 4.025)).payment).toBe('paid')
    expect(toInvoiceListItem(row(14.025, 0)).payment).toBe('paid')
  })

  it('reads the same on its own page', () => {
    expect(statusOf(issued, owed(0, 14.025)).key).toBe('invoicesPage.payment.credited')
    expect(statusOf(issued, owed(10, 4.025)).key).toBe('invoicesPage.payment.paid')
  })
})
