import type {
  PriceRuleDto,
  PriceRuleKind,
  PriceRuleTier,
  PriceRuleWindow,
} from '../api/catalog/priceRules'
import type { DiscountType } from './invoiceMath'

/**
 * Which price rule each line of a sale gets, worked out on the device the way the server's
 * `PriceRuleEvaluator` does (backend PR #795), so the till can show the saving before the sale is
 * sent and keep selling offline. The server works it out again at `soldAt`; online a difference
 * is refused (`POS_PRICE_RULE_MISMATCH`) and the till adopts the server's figure.
 *
 * - One rule per line, the one that saves most; a tie goes to the lower `priority`, then the
 *   smaller id.
 * - The product's own discount wins only when it saves strictly more.
 * - A hand-changed price gets no rule (it still counts toward a tier); an add-on line never does.
 * - Times are the sale's own, in Asia/Muscat (UTC+4, no daylight saving).
 * - Quantity is counted per invoice: across every covered line, or per product and size.
 *
 * Money is in baisa (thousandths of a rial), as the till holds it.
 */

export type RuleLineRole = 'ITEM' | 'BUNDLE' | 'BUNDLE_PART'

export type RuleLine = {
  ref: string
  productId: string | null
  variantId: string | null
  kindId: string | null
  groupId: string | null
  role: RuleLineRole
  quantity: number
  /** Before any discount, in baisa. */
  unitPrice: number
  priceChangedByHand: boolean
  /** The product's own catalogue discount (P.4); FIXED_AMOUNT values in rials. */
  productDefault: { type: DiscountType; value: number } | null
}

export type RuleSale = {
  branchId: string | null
  channel: 'TILL' | 'INVOICE'
  at: Date
  /** The chosen customer; null for a walk-in, which never gets a CUSTOMER rule. */
  buyer: { customerId: string; tags: string[] } | null
  lines: RuleLine[]
}

export type RuleOutcome = {
  ref: string
  source: 'RULE' | 'PRODUCT_DEFAULT' | 'NONE'
  ruleId: string | null
  ruleName: string | null
  ruleKind: PriceRuleKind | null
  showOnInvoice: boolean
  /** PERCENTAGE as a percentage, FIXED_AMOUNT in rials at three decimals. */
  discount: { type: DiscountType; value: number } | null
  /** What it takes off the line, in baisa. */
  saving: number
}

const MUSCAT_OFFSET_MS = 4 * 60 * 60 * 1000

/** The sale's Muscat day (`YYYY-MM-DD`), weekday (0 = Sunday) and minute of the day. */
export function muscatClock(at: Date): { day: string; weekday: number; minute: number } {
  const local = new Date(at.getTime() + MUSCAT_OFFSET_MS)
  return {
    day: local.toISOString().slice(0, 10),
    weekday: local.getUTCDay(),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  }
}

/** "14:00" as minutes; "24:00" is midnight at the end of the day. */
export function minutesOf(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

export function windowOpen(window: PriceRuleWindow, at: Date): boolean {
  const { weekday, minute } = muscatClock(at)
  const from = minutesOf(window.from)
  const to = minutesOf(window.to)
  if (to > from) return window.days.includes(weekday) && minute >= from && minute < to
  // Past midnight: the evening belongs to today's window, the small hours to yesterday's.
  const yesterday = (weekday + 6) % 7
  return (
    (window.days.includes(weekday) && minute >= from) ||
    (window.days.includes(yesterday) && minute < to)
  )
}

/** Switched on, not archived and not paused on that Muscat day. */
function onAt(rule: PriceRuleDto, day: string): boolean {
  if (rule.archived) return false
  if (rule.pausedUntil) return day >= rule.pausedUntil
  return rule.enabled
}

/** Whether the rule applies to this sale at all, before looking at its lines. */
export function ruleRuns(rule: PriceRuleDto, sale: RuleSale): boolean {
  const { day } = muscatClock(sale.at)
  if (!onAt(rule, day)) return false
  if (day < rule.validFrom || (rule.validTo !== null && day > rule.validTo)) return false
  if (rule.branchIds.length > 0 && (!sale.branchId || !rule.branchIds.includes(sale.branchId)))
    return false
  if (sale.channel === 'TILL' && !rule.atTheTill) return false
  if (rule.kind === 'TIME') return rule.windows.some((window) => windowOpen(window, sale.at))
  if (rule.kind === 'CUSTOMER') {
    const buyer = sale.buyer
    if (!buyer) return false
    if ((rule.customers?.customerIds ?? []).includes(buyer.customerId)) return true
    const tags = new Set(buyer.tags.map((tag) => tag.toLowerCase()))
    return (rule.customers?.tags ?? []).some((tag) => tags.has(tag.toLowerCase()))
  }
  return true
}

export function covers(rule: PriceRuleDto, line: RuleLine): boolean {
  if (line.productId === null || line.role === 'BUNDLE_PART') return false
  return rule.targets.some((target) => {
    switch (target.type) {
      case 'ALL':
        return line.role === 'ITEM'
      case 'GROUP':
        return line.role === 'ITEM' && target.id === line.groupId
      case 'KIND':
        return line.role === 'ITEM' && target.id === line.kindId
      case 'PRODUCT':
        return target.id === line.productId
      case 'VARIANT':
        return line.role === 'ITEM' && target.id === line.variantId
      default:
        return false
    }
  })
}

const priceable = (line: RuleLine) =>
  !line.priceChangedByHand && line.quantity > 0 && line.unitPrice > 0

/** Rounds a baisa figure to a whole baisa, half up (the server's HALF_UP at three decimals). */
const roundBaisa = (value: number) => Math.round(value + 1e-9)

/** The tier a counted quantity reaches: the last whose start it has passed. */
export function tierFor(tiers: PriceRuleTier[], quantity: number): PriceRuleTier {
  let reached = tiers[0]
  for (const tier of tiers) if (quantity >= tier.fromQty) reached = tier
  return reached
}

/** What one unit saves in a tier, in (unrounded) baisa. */
function unitSaving(tier: PriceRuleTier, unitPrice: number): number {
  if (tier.priceEach !== null && tier.priceEach !== undefined) {
    return Math.max(unitPrice - Math.round(tier.priceEach * 1000), 0)
  }
  return (unitPrice * (tier.percentOff ?? 0)) / 100
}

type Discount = { type: DiscountType; value: number }

const percentage = (percent: number): Discount => ({ type: 'PERCENTAGE', value: percent })
/** A fixed amount from baisa, as rials at three decimals. */
const fixed = (baisa: number): Discount => ({
  type: 'FIXED_AMOUNT',
  value: roundBaisa(baisa) / 1000,
})

/** What a discount takes off a line of this gross, in baisa, never more than the gross. */
export function savingOf(discount: Discount, gross: number): number {
  const amount =
    discount.type === 'PERCENTAGE' ? (gross * discount.value) / 100 : discount.value * 1000
  return roundBaisa(Math.min(amount, gross))
}

type Candidate = { index: number; rule: PriceRuleDto; discount: Discount; saving: number }

function better(a: Candidate, b: Candidate): boolean {
  if (a.saving !== b.saving) return a.saving > b.saving
  if (a.rule.priority !== b.rule.priority) return a.rule.priority < b.rule.priority
  return a.rule.id < b.rule.id
}

function candidates(rule: PriceRuleDto, lines: RuleLine[]): Candidate[] {
  const covered = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => covers(rule, line) && line.quantity > 0)
  if (covered.length === 0) return []
  const found: Candidate[] = []
  const add = (index: number, discount: Discount) => {
    const line = lines[index]
    const saving = savingOf(discount, line.quantity * line.unitPrice)
    if (saving > 0) found.push({ index, rule, discount, saving })
  }
  if (rule.kind !== 'VOLUME') {
    const offer = rule.offer
    if (!offer) return []
    for (const { line, index } of covered) {
      if (!priceable(line)) continue
      add(
        index,
        offer.percentOff !== null && offer.percentOff !== undefined
          ? percentage(offer.percentOff)
          : fixed(
              line.quantity *
                Math.max(line.unitPrice - Math.round((offer.priceEach ?? 0) * 1000), 0),
            ),
      )
    }
    return found
  }
  if (rule.tiers.length === 0) return []
  const groups = new Map<string, number[]>()
  for (const { line, index } of covered) {
    const key = rule.countedAs === 'PER_ITEM' ? `${line.productId}/${line.variantId}` : 'all'
    groups.set(key, [...(groups.get(key) ?? []), index])
  }
  for (const counted of groups.values()) {
    const total = counted.reduce((sum, index) => sum + lines[index].quantity, 0)
    if (!rule.extrasOnly) {
      const tier = tierFor(rule.tiers, total)
      for (const index of counted) {
        const line = lines[index]
        if (!priceable(line)) continue
        add(
          index,
          tier.percentOff !== null && tier.percentOff !== undefined
            ? percentage(tier.percentOff)
            : fixed(line.quantity * unitSaving(tier, line.unitPrice)),
        )
      }
      continue
    }
    // Extras only: the counted lines fill unit positions 1, 2, 3 ... in line order, and each unit
    // is priced by the tier its position falls in.
    let position = 0
    for (const index of counted) {
      const line = lines[index]
      const start = position
      const end = position + line.quantity
      position = end
      if (!priceable(line)) continue
      let amount = 0
      for (const tier of rule.tiers) {
        const low = Math.max(tier.fromQty - 1, start)
        const high = tier.toQty === null ? end : Math.min(tier.toQty, end)
        const overlap = Math.max(high - low, 0)
        if (overlap > 0) amount += overlap * unitSaving(tier, line.unitPrice)
      }
      add(index, fixed(amount))
    }
  }
  return found
}

/** One outcome per line, in the sale's line order. */
export function evaluateRules(sale: RuleSale, rules: PriceRuleDto[]): RuleOutcome[] {
  const best: (Candidate | undefined)[] = new Array(sale.lines.length)
  for (const rule of rules) {
    if (!ruleRuns(rule, sale)) continue
    for (const candidate of candidates(rule, sale.lines)) {
      const current = best[candidate.index]
      if (!current || better(candidate, current)) best[candidate.index] = candidate
    }
  }
  return sale.lines.map((line, index) => {
    const none: RuleOutcome = {
      ref: line.ref,
      source: 'NONE',
      ruleId: null,
      ruleName: null,
      ruleKind: null,
      showOnInvoice: false,
      discount: null,
      saving: 0,
    }
    if (line.role === 'BUNDLE_PART' || line.productId === null) return none
    const own = line.productDefault && line.productDefault.value !== 0 ? line.productDefault : null
    const ownSaving = own ? savingOf(own, line.quantity * line.unitPrice) : 0
    const winner = best[index]
    if (winner && winner.saving >= ownSaving) {
      return {
        ref: line.ref,
        source: 'RULE',
        ruleId: winner.rule.id,
        ruleName: winner.rule.name,
        ruleKind: winner.rule.kind,
        showOnInvoice: winner.rule.showOnInvoice,
        discount: winner.discount,
        saving: winner.saving,
      }
    }
    if (own && ownSaving > 0)
      return { ...none, source: 'PRODUCT_DEFAULT', discount: own, saving: ownSaving }
    return none
  })
}
