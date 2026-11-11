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
  /** The product's kind and its group, which a price rule may name (`GROUP`, `KIND` targets). */
  kindId?: string | null
  groupId?: string | null
  /** A bundle sold as one line: only a rule naming that bundle product covers it. */
  bundle?: boolean
  /**
   * The price rule that caught the line (`GET /v1/price-rules/active`, worked out on the till by
   * `posPriceRules`). Its saving is the item line's own discount and its id goes in
   * `lineRefs[].priceRuleIds`; the unit price stays the catalogue's. Add-on lines never get one.
   */
  priceRule?: SalePriceRule | null
  /**
   * What the cashier typed on this line. It replaces the price rule and the catalogue's discount
   * on it (price rules design §2 step 4) and is held to the cashier's limit. Blank or zero is no
   * discount typed, and the rule or the catalogue's discount comes back.
   */
  lineDiscount?: { type: DiscountType; value: string }
}

/** The cashier's own discount on the line, when there is one that takes anything off. */
export function typedDiscount(line: SaleLine): { type: DiscountType; value: string } | null {
  return line.lineDiscount && Number(line.lineDiscount.value) > 0 ? line.lineDiscount : null
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

/** The rule on a line, as the till applied it (or as the server said it should be). */
export type SalePriceRule = {
  id: string
  name: string
  discountType: DiscountType
  /** A percentage, or the amount off the whole line in rials. */
  discountValue: string
  /** What it takes off the item line, in baisa. */
  saving: number
}

/** The rule that prices this line: none once the cashier typed a discount, which replaces it. */
function ruleInForce(line: SaleLine): SalePriceRule | null {
  return typedDiscount(line) ? null : (line.priceRule ?? null)
}

/** Whether a price rule caught this line. */
export function ruleApplies(line: SaleLine): boolean {
  return Boolean(ruleInForce(line))
}

/** The names of the rules on the sale, each once, for the panel's note and the totals row. */
export function ruleNames(lines: SaleLine[]): string {
  return [...new Set(lines.flatMap((line) => ruleInForce(line)?.name ?? []))].join(', ')
}

/**
 * Whether the discount row can carry the rules' names: not when a typed discount is in the same
 * amount, which the row would then credit to a rule.
 */
export function discountRowNamesRules(lines: SaleLine[]): boolean {
  return lines.some(ruleApplies) && !lines.some((line) => typedDiscount(line))
}

/** What the rules took off the sale, in baisa. */
export function ruleSaving(lines: SaleLine[]): number {
  return lines.reduce((sum, line) => sum + (ruleInForce(line)?.saving ?? 0), 0)
}

export type SaleTotals = {
  /** Everything at shelf price, before any discount. */
  items: number
  /** What the line discounts (the catalogue's and the price rules') took off. */
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
  ref: {
    role: LineRefRole
    productId: string
    variantId: string | null
    addOnId: string | null
    /** The rule the item line's discount comes from; never on an add-on line. */
    priceRuleId: string | null
  }
}

const rial = (baisa: number) => (baisa / BAISA).toFixed(3)

/**
 * The sale as invoice lines (owner, 21 Oct 2026). The item and its size are one line ("Flat
 * White · Large"); every add-on with a price is a line of its own, with the item's VAT category
 * and classification; a free add-on is named on the item's line. A price rule is the caught item
 * line's own discount (replacing the catalogue's), so the invoice shows what it took and from
 * which line; add-on lines keep the catalogue's discount.
 */
export function invoiceLinesFor(lines: SaleLine[]): PosInvoiceLine[] {
  return lines.flatMap((line) => {
    const free = line.addOns.filter((a) => a.price === 0)
    const typed = typedDiscount(line)
    const rule = ruleInForce(line)
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
      discountType: typed ? typed.type : line.discountType,
      discountValue: typed ? typed.value : line.discountValue,
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
        ...(rule
          ? {
              discountType: rule.discountType,
              discountValue: rule.discountValue,
            }
          : {}),
        ref: {
          role: 'ITEM' as const,
          productId: line.productId,
          variantId: line.variant?.id ?? null,
          addOnId: null,
          priceRuleId: rule?.id ?? null,
        },
      },
      ...line.addOns
        .filter((a) => a.price !== 0)
        .map((a) => ({
          ...common,
          id: `${line.id}-${a.id}`,
          description: `${line.name}: + ${a.label}`,
          unitPrice: rial(a.price),
          // A typed amount comes off the item once; a percentage runs through its add-ons too.
          ...(typed?.type === 'FIXED_AMOUNT'
            ? { discountType: 'PERCENTAGE' as DiscountType, discountValue: '0' }
            : {}),
          ref: {
            role: 'ADD_ON' as const,
            productId: line.productId,
            variantId: null,
            addOnId: a.id,
            priceRuleId: null,
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

/**
 * Rials as the server wrote them. A reprint row's amount comes already rounded HALF_UP to three
 * places (backend PosSaleResponse.Line), the rounding the till's own row gets, so it is printed as
 * written and never rounded a second time on the way through baisa (FU2R-4, review QW5R-3).
 */
export function omrOfRials(rials: number): string {
  return rials.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

/** A signed amount, for the lines that take money off. */
export function omrSigned(baisa: number): string {
  return `${baisa < 0 ? '−' : ''}${omr(Math.abs(baisa))}`
}

/**
 * The day and time on a till receipt, in Muscat. One function for the receipt and its reprint, so
 * the reprint states the same moment in the same words (QR E-5).
 */
export function receiptStamp(iso: string, locale = 'en-GB'): string {
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Muscat',
  })
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
