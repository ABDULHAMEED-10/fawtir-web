import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import type { InvoiceDetailDto } from '../api/invoices/detail'
import { counterpartyKeys, isSelfBilled, lineTotals } from './invoiceDetail'

const key = (bundle: Record<string, unknown>, path: string) =>
  path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle)

describe('isSelfBilled', () => {
  it('covers both self-billed document types and nothing else', () => {
    expect(isSelfBilled('SELF_BILLED_INVOICE')).toBe(true)
    expect(isSelfBilled('SELF_BILLED_CREDIT_NOTE')).toBe(true)
    for (const type of ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']) {
      expect(isSelfBilled(type)).toBe(false)
    }
  })
})

describe('counterpartyKeys', () => {
  it('names the counterparty as the seller on a self-billed document', () => {
    // The tenant is the BUYER here and customerId names the SELLER. "Bill to Gulf Supplies" on a
    // document Gulf Supplies is billing YOU for states the wrong direction of a debt.
    const self = counterpartyKeys('SELF_BILLED_INVOICE')
    expect(key(en, self.section)).toBe('Billed by')
    expect(key(en, self.preposition)).toBe('From')
    expect(key(en, self.view)).toBe('View supplier')
  })

  it('leaves an ordinary invoice buyer-facing', () => {
    const ordinary = counterpartyKeys('INVOICE')
    expect(key(en, ordinary.section)).toBe('Bill to')
    expect(key(en, ordinary.preposition)).toBe('To')
    expect(key(en, ordinary.view)).toBe('View customer')
  })

  it('resolves every key it returns, in both languages', () => {
    // The helper hands back key PATHS, so a rename that leaves one dangling would render the raw
    // key on screen rather than failing anywhere.
    for (const type of ['INVOICE', 'CREDIT_NOTE', 'SELF_BILLED_INVOICE', 'SELF_BILLED_CREDIT_NOTE']) {
      for (const path of Object.values(counterpartyKeys(type))) {
        expect(key(en, path), `en ${path}`).toBeTypeOf('string')
        expect(key(ar, path), `ar ${path}`).toBeTypeOf('string')
      }
    }
  })
})

describe('lineTotals', () => {
  // RC5 browser E2E D-01: INV-2026-000001 as GET /authored-invoices/{id} serves it.
  const base = {
    productId: null,
    productCode: null,
    description: 'Item',
    unitCode: 'EA',
    taxCategoryCode: 'S5',
    en16931Category: 'S',
    taxRate: 5,
    exemptionReason: null,
  }
  const invoice = (withAmounts: boolean) =>
    ({
      currency: 'OMR',
      headerDiscount: { type: 'PERCENTAGE', value: 0 },
      lines: [
        {
          ...base,
          lineNumber: 1,
          quantity: 2,
          unitPrice: 125.5,
          discountType: 'PERCENTAGE',
          discountValue: 0,
          ...(withAmounts && {
            amounts: {
              lineNumber: 1, grossAmount: 251, lineDiscount: 0, allocatedHeaderDiscount: 0,
              taxableAmount: 250.999, vatAmount: 12.55, lineNetAmount: 263.549,
            },
          }),
        },
        {
          ...base,
          lineNumber: 2,
          quantity: 3,
          unitPrice: 10.125,
          discountType: 'PERCENTAGE',
          discountValue: 10,
          ...(withAmounts && {
            amounts: {
              lineNumber: 2, grossAmount: 30.375, lineDiscount: 3.038, allocatedHeaderDiscount: 0,
              taxableAmount: 27.338, vatAmount: 1.367, lineNetAmount: 28.705,
            },
          }),
        },
      ],
    }) as unknown as InvoiceDetailDto

  it("reads the server's line amounts, which foot to the net amount", () => {
    const totals = lineTotals(invoice(true))
    expect([...totals.values()]).toEqual([251, 27.337])
    expect(Math.round([...totals.values()].reduce((sum, value) => sum + value, 0) * 1000)).toBe(278337)
  })

  it('computes the same figures, as the server rounds them, from a server that sends no amounts', () => {
    expect([...lineTotals(invoice(false)).values()]).toEqual([251, 27.337])
  })

  it('shows the server figures, not its own projection, when the two differ', () => {
    // Amounts no projection of these parts produces, so only the server branch can yield them.
    const served = invoice(true)
    served.lines[0].amounts = { ...served.lines[0].amounts!, grossAmount: 300.125, lineDiscount: 0.124 }
    served.lines[1].amounts = { ...served.lines[1].amounts!, grossAmount: 40.5, lineDiscount: 1.25 }
    expect([...lineTotals(served).values()]).toEqual([300.001, 39.25])
  })
})
