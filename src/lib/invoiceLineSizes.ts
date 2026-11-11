import type { ProductDto } from '../api/catalog/products'
import type { DraftLine, LineSize } from './invoiceDraft'
import { formatAmount, parseAmount, toExclusivePrice } from './invoiceMath'
import { choicesOf } from './posShelf'
import { toBaisa } from './pos'

/**
 * Sizes and options on an invoice line. The catalogue prices each one (`choicesOf`, the server's own
 * rule); the line names it to the server by its `productCode`, and `variantId` asks
 * `POST /v1/price-rules/evaluate` about that size: without it every size reads as changed by hand
 * and never gets a rule (E2E 30 Oct 2026, M-2).
 */

export function lineSizes(product: ProductDto, ar: boolean): LineSize[] {
  const base = toBaisa(product.effectivePrice ?? product.defaultUnitPrice)
  return choicesOf(product, base, ar).sizes.map(({ id, code, label, price }) => ({
    id,
    code,
    label,
    price,
  }))
}

/** What the line's price box shows for a price in baisa before VAT: inclusive when it is in that mode. */
function shownPrice(baisa: number, exclVat: boolean, vatRate: string): string {
  const price = parseAmount(String(baisa / 1000))
  const hundred = parseAmount('100')
  const shown = exclVat ? price : (price * (hundred + parseAmount(vatRate))) / hundred
  return formatAmount(shown, 3).replace(/,/g, '')
}

/** The size a just-picked product starts on: the one at the line's price, else the first priced. */
export function firstSize(
  sizes: LineSize[],
  unitPrice: string,
  exclVat: boolean,
  vatRate: string,
): LineSize {
  const before = exclVat ? unitPrice : toExclusivePrice(unitPrice || '0', vatRate)
  return (
    sizes.find((size) => size.price > 0 && size.price === toBaisa(Number(before))) ??
    sizes.find((size) => size.price > 0) ??
    sizes[0]
  )
}

/** A description naming a size, less that size; null when it does not name it (the person's text). */
export function stripSize(description: string, size: LineSize): string | null {
  const tail = ` · ${size.label}`
  return description.endsWith(tail) ? description.slice(0, -tail.length) : null
}

/** The line's fields for a size. `description`: the item's name to follow, null to leave it. */
export function sizeOnLine(
  item: { description: string | null },
  size: LineSize,
  exclVat: boolean,
  vatRate: string,
): Partial<DraftLine> {
  return {
    variantId: size.id,
    productCode: size.code,
    unitPrice: shownPrice(size.price, exclVat, vatRate),
    ...(item.description === null ? {} : { description: `${item.description} · ${size.label}` }),
  }
}
