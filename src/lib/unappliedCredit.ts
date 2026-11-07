import { minorUnitsOf, type Amount } from './format'

/**
 * D-30(a) (owner, 6 Nov 2026): what over-credited or overpaid invoices and debit notes hold for a
 * customer is its own (negative) figure, beside what is owed. It is shown as it comes: never
 * floored to zero, never set against an invoice, and never added into the outstanding figure
 * without a "net balance" line saying so. Nothing allocates it and no B2B refund exists in RC5.
 */

/** A server figure as a number, or null when it is absent (a server that predates the field). */
export function serverFigure(value: Amount | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(number) ? number : null
}

/** The credit held, or null when there is none to show (zero, or a server without the field). */
export function creditHeld(value: Amount | null | undefined): number | null {
  const figure = serverFigure(value)
  return figure === null || figure === 0 ? null : figure
}

/**
 * Outstanding plus the credit held, for a figure whose server sends no net of its own (the
 * dashboard row: "outstanding plus unappliedCredit is the net"). Summed in minor units, so
 * 0.1 + 0.2 style float residue never reaches a three-decimal rial figure. Can be below zero.
 */
export function netOf(outstanding: Amount, credit: number, currency: string): number {
  const scale = 10 ** minorUnitsOf(currency)
  const owed = serverFigure(outstanding) ?? 0
  return (Math.round(owed * scale) + Math.round(credit * scale)) / scale
}
