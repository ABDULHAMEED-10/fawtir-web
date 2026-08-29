import { useMemo } from 'react'
import {
  calculateInvoice,
  formatAmount,
  parseAmount,
  projectInvoice,
  type DiscountType,
} from '../../lib/invoiceMath'

/**
 * The shape and the arithmetic behind `LineItemsTable`.
 *
 * Kept out of the component file so that one only exports components, which is what fast refresh
 * needs to reload a table without losing the form around it.
 */

export type LineItem = {
  id: string
  description: string
  unitPrice: string
  vatRate: string
  quantity: string
  unit: string
  discountType: DiscountType
  discountValue: string
}

/**
 * Moves every unit price between VAT-exclusive and VAT-inclusive.
 *
 * Exported because a page that owns its own lines needs it when the toggle flips.
 */
export function convertLinePrices<T extends LineItem>(lines: T[], toExclusive: boolean): T[] {
  return lines.map((line) => {
    const rate = parseAmount(line.vatRate)
    const price = parseAmount(line.unitPrice)
    if (rate === 0n || price === 0n) return line
    const hundred = parseAmount('100')
    const factor = hundred + rate
    const next = toExclusive
      ? (price * hundred) / factor // strip VAT out of an inclusive price
      : (price * factor) / hundred // add VAT onto an exclusive price
    return { ...line, unitPrice: formatAmount(next, 3) }
  })
}

/** A fresh empty line, so every screen adds the same shape. */
export const blankLine = (id: string): LineItem => ({
  id,
  description: '',
  unitPrice: '',
  vatRate: '5',
  quantity: '1',
  unit: 'EA',
  discountType: 'PERCENTAGE',
  discountValue: '0',
})

/**
 * Runs the lines through the engine.
 *
 * Prices are held in whatever mode the toggle is in, so they are converted back to exclusive
 * before costing — the engine only ever works in exclusive terms.
 */
export function useLineTotals(
  lines: LineItem[],
  exclVat: boolean,
  headerDiscount?: { type: DiscountType; value: string },
) {
  return useMemo(
    () =>
      projectInvoice(
        calculateInvoice(
          (exclVat ? lines : convertLinePrices(lines, true)).map((line, index) => ({
            id: line.id,
            lineNumber: index + 1,
            unitPrice: line.unitPrice || '0',
            quantity: line.quantity || '0',
            vatRate: line.vatRate || '0',
            discountType: line.discountType,
            discountValue: line.discountValue || '0',
          })),
          headerDiscount?.type ?? 'PERCENTAGE',
          headerDiscount?.value || '0',
        ),
      ),
    [lines, exclVat, headerDiscount?.type, headerDiscount?.value],
  )
}
