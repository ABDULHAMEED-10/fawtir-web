import type { ApiRead } from '../../hooks/useApiRead'
import type { Tile } from '../../api/reports/dashboard'
import { BUSINESS_TIME_ZONE, type Amount } from '../../lib/format'

/**
 * One tile as a card draws it. `unavailable` covers a tile the server marked UNAVAILABLE and a read
 * that failed or was refused: the card says "Not available yet" either way and never shows a
 * figure it does not have.
 */
export type TileView<T> = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ok'; data: T }

export function tileOf<D, T>(read: ApiRead<D>, pick: (data: D) => Tile<T>): TileView<T> {
  if (read.status === 'loading') return { kind: 'loading' }
  if (read.status === 'failed') return { kind: 'unavailable' }
  const tile = pick(read.data)
  return tile?.status === 'OK' && tile.data !== null ? { kind: 'ok', data: tile.data } : { kind: 'unavailable' }
}

/** A plain read (not a dashboard tile) in the same three states. */
export function viewOf<T>(read: ApiRead<T>): TileView<T> {
  if (read.status === 'loading') return { kind: 'loading' }
  if (read.status === 'failed') return { kind: 'unavailable' }
  return { kind: 'ok', data: read.data }
}

/**
 * The OMR row of a per-currency list. Fawtir invoices in OMR; a figure in another currency is not
 * added to it, and with no OMR row the figure is zero, since the server lists only currencies that
 * have something in them.
 */
export function omrRow<R extends { currency: string }>(rows: readonly R[]): R | undefined {
  return rows.find((row) => row.currency === 'OMR')
}

export const toNumber = (amount: Amount | null | undefined): number => {
  const value = typeof amount === 'string' ? Number(amount) : (amount ?? 0)
  return Number.isFinite(value) ? value : 0
}

/**
 * The OMR VAT of a VAT list, every row added. Unlike the receivables and cash lists, `/reports/vat`
 * lists output VAT once per category and rate, so taking the first OMR row showed the exempt row's
 * 0.000 while the standard-rated VAT sat in the next one (A-3, local E2E 2026-10-29). Rows of VAT
 * with no known rial figure are listed apart by the server and never added in.
 */
export function omrVatTotal(rows: readonly { side: string; currency: string; vatAmount: Amount }[]): number {
  return rows
    .filter((row) => row.currency === 'OMR' && row.side !== 'INPUT_WITHOUT_OMR_VAT')
    .reduce((sum, row) => sum + toNumber(row.vatAmount), 0)
}

/** Before noon is morning, before 17:00 afternoon, and later is evening, in the business's zone. */
export function partOfDay(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: BUSINESS_TIME_ZONE }).format(now),
  )
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}
