import type { TFunction } from 'i18next'
import type { InvoiceLineWarningDto } from '../api/invoices/detail'

/**
 * Stock on invoice lines (STOCK-CONTRACT section 6): an invoice takes a counted product off the
 * shelf of its branch when it is issued. Stock never refuses the document; a line it cannot take
 * moves nothing and comes back as one of these warnings on the issue answer.
 */
export const STOCK_LINE_WARNINGS = [
  'STOCK_UNIT_MISMATCH',
  'STOCK_VARIANT_UNKNOWN',
  'STOCK_QUANTITY_NOT_WHOLE',
  'STOCK_QUANTITY_INVALID',
] as const

export type StockLineWarningCode = (typeof STOCK_LINE_WARNINGS)[number]

export const isStockLineWarning = (code: string): code is StockLineWarningCode =>
  (STOCK_LINE_WARNINGS as readonly string[]).includes(code)

/**
 * The issue answer's stock warnings in words, one sentence each, never the server's own text.
 * Other warnings (zero rating) are worded where they are shown.
 */
export function stockLineWarningTexts(
  t: TFunction,
  warnings: readonly InvoiceLineWarningDto[] | null | undefined,
): string[] {
  return (warnings ?? [])
    .filter((warning) => isStockLineWarning(warning.code))
    .map((warning) => {
      const text = t(`invoiceIssue.stockWarning.${warning.code}`)
      return warning.line ? t('invoiceIssue.stockWarning.line', { line: warning.line, text }) : text
    })
}

/**
 * The hint under a counted product's fixed unit, naming the unit as the line's list does
 * ("Counted in pieces, so the unit is fixed"). English reads the unit in the plural from its own
 * list, falling back to the unit's name; Arabic uses the unit's name.
 */
export function unitLockHint(t: TFunction, unitCode: string, language: string): string {
  const name = t(`createInvoice.units.${unitCode}`, {
    defaultValue: t(`reference.unitShort.${unitCode}`, { defaultValue: unitCode }),
  })
  // The plural list is English only: Arabic would otherwise fall back to it.
  const counted = language.startsWith('en')
    ? t(`invoiceForm.unitLock.unitName.${unitCode}`, {
        defaultValue: name.toLocaleLowerCase('en'),
      })
    : name
  return t('invoiceForm.unitLock.hint', { unit: counted })
}
