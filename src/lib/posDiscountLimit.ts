import { invoiceLinesFor, typedDiscount, type SaleDiscount, type SaleLine } from './pos'

/**
 * The cashier's discount limit (`pos.sell` with a percentage), worked out as the server's
 * `ManualDiscountCeiling` does so the till refuses what the server would: every line, the whole
 * sale, and the two together. A price rule's or the catalogue's own discount is not the cashier's:
 * it does not count against the limit, though it stays in what the percentage is taken of.
 */
export type DiscountBreach =
  | { kind: 'tooMuch'; lineId: string }
  | { kind: 'line'; lineId: string; percent: number }
  | { kind: 'sale'; percent: number }
  | { kind: 'total'; percent: number }

const rounded = (value: number) => Math.round(value * 100) / 100
/** Floating point must not turn exactly 10% into a refusal. */
const over = (rate: number, limit: number) => rate > limit + 1e-9

function amountOff(type: string, value: string, base: number): number {
  const number = Number(value) || 0
  return type === 'PERCENTAGE' ? (base * number) / 100 : number * 1000
}

export function discountBreach(
  lines: SaleLine[],
  saleDiscount: SaleDiscount,
  limit: number | null | undefined,
): DiscountBreach | null {
  let base = 0
  let linesTaken = 0
  let typedTaken = 0
  let lineBreach: DiscountBreach | null = null
  for (const line of lines) {
    const typed = typedDiscount(line)
    for (const invoiceLine of invoiceLinesFor([line])) {
      const gross = Number(invoiceLine.quantity) * Math.round(Number(invoiceLine.unitPrice) * 1000)
      const taken = amountOff(invoiceLine.discountType, invoiceLine.discountValue, gross)
      base += gross
      linesTaken += taken
      if (!typed) continue
      if (taken > gross + 1e-9) return { kind: 'tooMuch', lineId: line.id }
      typedTaken += taken
      const rate = gross > 0 ? (taken * 100) / gross : 0
      if (limit != null && !lineBreach && over(rate, limit)) {
        lineBreach = { kind: 'line', lineId: line.id, percent: rounded(rate) }
      }
    }
  }
  if (lineBreach || limit == null) return lineBreach
  const afterLines = base - linesTaken
  const header = amountOff(saleDiscount.type, saleDiscount.value || '0', afterLines)
  const headerRate = afterLines > 0 ? (header * 100) / afterLines : 0
  if (over(headerRate, limit)) return { kind: 'sale', percent: rounded(headerRate) }
  const totalRate = base > 0 ? ((typedTaken + header) * 100) / base : 0
  if (over(totalRate, limit)) return { kind: 'total', percent: rounded(totalRate) }
  return null
}
