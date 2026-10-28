/**
 * Point of sale: the till (Figma 143:18015 and its six siblings).
 *
 * Money is held in baisa, the thousandth of a rial, so that a 20% discount on 5.600 is an exact
 * 1.120 rather than a float that renders as 1.1199999. Every figure the till screens print is
 * derived from the sale modelled here, by the invoice's own engine, so the till and the invoice
 * it files cannot disagree.
 *
 * The till sells from the branch's catalogue (`GET /v1/products?branchId=`, guide section 9): a
 * line keeps what the invoice needs of its product (name, size or option, add-ons, unit, VAT
 * category and classification) so the sale, payment and receipt screens need nothing else.
 */

import { calculateInvoice, projectInvoice, type DiscountType } from './invoiceMath'
import type { DraftLine, ItemType } from './invoiceDraft'

/** A thousandth of a rial. All money below is an integer number of these. */
export const BAISA = 1000

/** Oman's standard rate. */
export const VAT_RATE = 0.05

/** Rials as the API sends them, in baisa. */
export const toBaisa = (rials: number | null | undefined): number =>
  Math.round(Number(rials ?? 0) * BAISA)

/** Baisa as the rials the API takes: three decimals, no float tail. */
export const toRials = (baisa: number): number => Math.round(baisa) / BAISA

/* --------------------------------------------------------------- the sale */

/** A priced or free add-on on a line (the product's `addOns`). */
export type SaleAddOn = { id: string; label: string; price: number }

export type SaleLine = {
  id: string
  productId: string
  /** The product's code, or the size or option's own code when one was chosen. */
  productCode: string
  /** The item's name as the reader sees it. */
  name: string
  /** The size and option chosen (the product's `variants`), when it is sold by them. */
  variant: { id: string; label: string } | null
  addOns: SaleAddOn[]
  qty: number
  /** One of the item, size and option included, before add-ons, in baisa (the branch's price). */
  price: number
  itemType: ItemType
  unit: string
  taxCode: string
  vatRate: string
  hsCode?: string
  serviceType?: string
  exemptionReasonCode?: string
  exemptionReason?: string
  /** The catalogue's own discount (P.4), which every invoice line starts with. */
  discountType: DiscountType
  discountValue: string
  /**
   * The price rule that caught the line, as a percentage off. TODO(backend): price rules at the
   * till are not served yet (the rules API is not merged); nothing sets it, so the rule's note
   * stays drawn and silent (INCOME.md row P.26).
   */
  rulePercent?: number
}

/** What one of these costs, once the size and the add-ons are counted. */
export function unitPrice(line: SaleLine): number {
  return line.price + line.addOns.reduce((sum, addOn) => sum + addOn.price, 0)
}

export function lineTotal(line: SaleLine): number {
  return unitPrice(line) * line.qty
}

/** "Large · Oat milk" under the name, or nothing for a one-size item. */
export function lineDetail(line: SaleLine): string | null {
  return line.variant?.label ?? null
}

/* ------------------------------------------------------- the price rule */

/**
 * The rule the till applied by itself (Figma 143:18015, the green note in the sale panel).
 *
 * TODO(backend): price rules come from Catalog › Price rules, whose API is not merged yet
 * (INCOME.md row P.26). The note and the totals row stay drawn for when a line carries
 * `rulePercent`; until then no line does.
 */
export const LULL = {
  id: 'afternoon-lull',
  percent: 20,
}

/** Whether a price rule caught this line. */
export function lullApplies(line: SaleLine): boolean {
  return (line.rulePercent ?? 0) > 0
}

export type SaleTotals = {
  /** Everything at shelf price, before any discount. */
  items: number
  /** What the line discounts (the catalogue's and a price rule's) took off. */
  discount: number
  /** What the discount on the whole sale took off, after the line discounts. */
  saleDiscount: number
  /** The VAT rates on the sale's lines, for the VAT row's label. */
  vatRates: number[]
  /** What VAT is worked out on. */
  beforeVat: number
  vat: number
  /** The sale itself: what counts as turnover. */
  sale: number
}

/* ------------------------------------------------------ as invoice lines */

/** A discount on the whole sale: the invoice's document discount (IBT-092). */
export type SaleDiscount = { type: DiscountType; value: string }

export const NO_SALE_DISCOUNT: SaleDiscount = { type: 'PERCENTAGE', value: '0' }

/** Which catalogue thing an invoice line sells (`lineRefs` on `POST /v1/pos/sales`). */
export type LineRefRole = 'ITEM' | 'ADD_ON'

/** One line of the invoice the sale files, as the invoice composer holds a line. */
export type PosInvoiceLine = Omit<DraftLine, 'id'> & {
  id: string
  saleLineId: string
  ref: { role: LineRefRole; productId: string; variantId: string | null; addOnId: string | null }
}

const rial = (baisa: number) => (baisa / BAISA).toFixed(3)

/**
 * The sale as invoice lines (owner, 21 Oct 2026). The item and its size are one line ("Flat
 * White · Large"); every add-on with a price is a line of its own, with the item's VAT category
 * and classification; a free add-on is named on the item's line. A price rule is each caught
 * line's own discount, so the invoice shows what it took and from which line.
 */
export function invoiceLinesFor(lines: SaleLine[]): PosInvoiceLine[] {
  return lines.flatMap((line) => {
    const free = line.addOns.filter((a) => a.price === 0)
    const ruled = lullApplies(line)
    const common = {
      saleLineId: line.id,
      productId: line.productId,
      productCode: line.productCode,
      itemType: line.itemType,
      hsCode: line.hsCode,
      serviceType: line.serviceType,
      unit: line.unit,
      vatRate: line.vatRate,
      taxCode: line.taxCode,
      exemptionReason: line.exemptionReason ?? '',
      exemptionReasonCode: line.exemptionReasonCode,
      quantity: String(line.qty),
      discountType: ruled ? ('PERCENTAGE' as DiscountType) : line.discountType,
      discountValue: ruled ? String(line.rulePercent) : line.discountValue,
    }
    const name = [
      line.name,
      line.variant ? ` · ${line.variant.label}` : '',
      free.length ? ` (${free.map((a) => a.label).join(', ')})` : '',
    ].join('')
    return [
      {
        ...common,
        id: line.id,
        description: name,
        unitPrice: rial(line.price),
        ref: {
          role: 'ITEM' as const,
          productId: line.productId,
          variantId: line.variant?.id ?? null,
          addOnId: null,
        },
      },
      ...line.addOns
        .filter((a) => a.price !== 0)
        .map((a) => ({
          ...common,
          id: `${line.id}-${a.id}`,
          description: `${line.name}: + ${a.label}`,
          unitPrice: rial(a.price),
          ref: {
            role: 'ADD_ON' as const,
            productId: line.productId,
            variantId: null,
            addOnId: a.id,
          },
        })),
    ]
  })
}

/**
 * Every figure in the sale panel, from the lines, by the invoice's own engine (the same
 * arithmetic the server uses), so what the till shows is what the invoice will say.
 */
export function totalsFor(lines: SaleLine[], saleDiscount = NO_SALE_DISCOUNT): SaleTotals {
  const invoiceLines = invoiceLinesFor(lines)
  const projected = projectInvoice(
    calculateInvoice(
      invoiceLines.map((line, index) => ({ ...line, lineNumber: index + 1 })),
      saleDiscount.type,
      saleDiscount.value || '0',
    ),
  )
  const baisa = (value: bigint) => Number(value)
  const vatRates = [...new Set(invoiceLines.map((line) => Number(line.vatRate)))]
  return {
    items: baisa(projected.subtotal),
    discount: baisa(projected.itemDiscount),
    saleDiscount: baisa(projected.headerDiscount),
    beforeVat: baisa(projected.taxable),
    vat: baisa(projected.vat),
    vatRates,
    sale: baisa(projected.total),
  }
}

/* ---------------------------------------------------------------- money */

/** Baisa as rials, always to three places, as the rest of the app writes money. */
export function omr(baisa: number): string {
  return (baisa / BAISA).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

/** A signed amount, for the lines that take money off. */
export function omrSigned(baisa: number): string {
  return `${baisa < 0 ? '−' : ''}${omr(Math.abs(baisa))}`
}

/** A clock time in the company's zone (Muscat), as the till prints it. */
export function tillTime(iso: string | null | undefined, locale = 'en-GB'): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Muscat',
  })
}

/** Today's business date in Muscat, `YYYY-MM-DD`. */
export function muscatToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Muscat' })
}
